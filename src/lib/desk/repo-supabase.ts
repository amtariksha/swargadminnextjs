// The Supabase implementation of DeskRepo: one method per row of the repository table, each the
// exact call shape of the engine contract (conditional updates that end in .select(...), explicit
// limits, global settings rows only). It never throws: every error is classified by
// classifyDeskDbError and returned as an outcome. This is the only engine file that touches Supabase.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { lmsAdmin } from '@/lib/lms/supabase';
import { DESK_SETTING_KEYS } from './constants';
import { DESK_MESSAGE_COLUMNS } from './clock';
import { phoneVariants } from './phone';
import {
    DESK_QUERY_TIMEOUT_MS, DESK_TICKET_CLOCK_COLUMNS, classifyDeskDbError, reportNotInstalled,
    type ContactFlagRow, type ConversationRow, type DeskDb, type DeskRepo, type EngineCategory, type InternalTicketRow,
    type LatestResolvedRow,
    type MessageRow, type MirrorTicketRow, type OpenConversationRow, type ProbeTarget, type ResolvedTicketRow,
    type SettingRow, type TicketClockRow, type TicketStubRow, type UnresolvedTicketRow,
} from './repo';

interface PgResult { data: unknown; error: { code?: string | null; message?: string | null } | null }
type Exec = <T>(table: string, query: (signal: AbortSignal) => PromiseLike<PgResult>, pick: (data: unknown) => T) => Promise<DeskDb<T>>;

const rowsOf = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);
const countOf = (data: unknown): number => rowsOf<unknown>(data).length;
const oneOf = <T>(data: unknown): T | null => (data === null || data === undefined ? null : (data as T));
const idsOf = (column: string) => (data: unknown): string[] => (
    rowsOf<Record<string, unknown>>(data).map((row) => String(row[column]))
);
const distinct = (values: readonly string[]): string[] => [...new Set(values)];

/** PostgREST returns an embedded to-one relation as an object; supabase-js types it loosely. */
const embedded = <T>(value: unknown): T | null => (Array.isArray(value) ? ((value[0] as T) ?? null) : ((value as T) ?? null));

const CONVERSATION_COLUMNS = 'id, contact_id, integrated_number, contacts(id, name, phone)';
const RESOLVED_COLUMNS =
    'id, opened_at, resolved_at, resolved_by, resolved_by_name, resolution_code, resolution_note, resolved_via, lost_reason, reopen_count, last_outbound_at, origin';
const IN_CHUNK = 100;

/** PostgREST filter that keeps rows without a conversation and drops the listed conversations. */
const notInConversations = (ids: readonly string[]): string =>
    `conversation_id.is.null,conversation_id.not.in.(${ids.join(',')})`;

function chunked<T>(items: readonly T[]): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += IN_CHUNK) chunks.push(items.slice(index, index + IN_CHUNK));
    return chunks;
}

function createExec(runSignal?: AbortSignal): Exec {
    const signalFor = (): AbortSignal => (
        runSignal
            ? AbortSignal.any([AbortSignal.timeout(DESK_QUERY_TIMEOUT_MS), runSignal])
            : AbortSignal.timeout(DESK_QUERY_TIMEOUT_MS)
    );
    return async (table, query, pick) => {
        try {
            const { data, error } = await query(signalFor());
            const outcome = classifyDeskDbError(error);
            if (outcome === 'ok') return { outcome: 'ok', data: pick(data) };
            if (outcome === 'not_installed') reportNotInstalled(table, error?.code ?? '');
            return { outcome, data: null };
        } catch (thrown) {
            const outcome = classifyDeskDbError(thrown instanceof Error ? thrown : { message: String(thrown) });
            return { outcome: outcome === 'ok' ? 'error' : outcome, data: null };
        }
    };
}

// ── Settings and probes ────────────────────────────────────────────────────

const PROBE_COLUMN: Record<ProbeTarget, { table: string; column: string }> = {
    desk_categories: { table: 'desk_categories', column: 'slug' },
    desk_tickets: { table: 'desk_tickets', column: 'id' },
    desk_ticket_events: { table: 'desk_ticket_events', column: 'id' },
    desk_ticket_actions: { table: 'desk_ticket_actions', column: 'id' },
    desk_action_items: { table: 'desk_action_items', column: 'id' },
    'messages.ticket_id': { table: 'messages', column: 'ticket_id' },
    'messages.sent_by_user_id': { table: 'messages', column: 'sent_by_user_id' },
    'messages.sent_by_name': { table: 'messages', column: 'sent_by_name' },
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function settingsMethods(exec: Exec): Pick<DeskRepo, 'readSettingRows' | 'writeTickSetting' | 'probe' | 'probeWrite'> {
    return {
        readSettingRows: () => exec('app_settings', (signal) => supabaseAdmin
            .from('app_settings').select('key, value').in('key', [...DESK_SETTING_KEYS]).is('org_id', null)
            .limit(50).abortSignal(signal), (data) => rowsOf<SettingRow>(data)),
        writeTickSetting: (key, value) => exec('app_settings', (signal) => supabaseAdmin
            .from('app_settings').update({ value }).eq('key', key).is('org_id', null)
            .select('key').abortSignal(signal), countOf),
        probe: (target) => {
            const { table, column } = PROBE_COLUMN[target];
            return exec(table, (signal) => supabaseAdmin
                .from(table).select(column).limit(1).abortSignal(signal), () => true as const);
        },
        probeWrite: () => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').update({ review_note: null }).eq('id', NIL_UUID)
            .select('id').abortSignal(signal), () => true as const),
    };
}

// ── Reads the engine needs to attach a message ─────────────────────────────

function readMethods(exec: Exec): Pick<DeskRepo,
    'listUnticketedInbound' | 'getConversation' | 'listActiveCategories' | 'findKnownCustomer'
    | 'getUnresolvedTicket' | 'getLatestResolvedTicket' | 'listConversationMessages' | 'getTicketClock'> {
    return {
        listUnticketedInbound: (afterIso, beforeIso, limit, exclude) => exec('messages', (signal) => {
            const base = supabaseAdmin
                .from('messages').select(DESK_MESSAGE_COLUMNS).eq('direction', 'inbound').is('ticket_id', null)
                .gt('created_at', afterIso).lt('created_at', beforeIso);
            const kept = exclude.length === 0 ? base : base.or(notInConversations(exclude));
            return kept.order('created_at', { ascending: true }).limit(limit).abortSignal(signal);
        }, (data) => rowsOf<MessageRow>(data)),
        getConversation: (conversationId) => exec('conversations', (signal) => supabaseAdmin
            .from('conversations').select(CONVERSATION_COLUMNS).eq('id', conversationId)
            .limit(1).abortSignal(signal).maybeSingle(), (data): ConversationRow | null => {
            const row = oneOf<Record<string, unknown>>(data);
            return row === null ? null : { ...(row as unknown as ConversationRow), contacts: embedded(row.contacts) };
        }),
        listActiveCategories: () => exec('desk_categories', (signal) => supabaseAdmin
            .from('desk_categories')
            .select('slug, type, priority, sort_order, active, keywords, default_resolution_code, deadline_rule')
            .eq('active', true).limit(500).abortSignal(signal), (data) => rowsOf<EngineCategory>(data)),
        findKnownCustomer: async (phones) => {
            if (phones.length === 0) return { outcome: 'ok', data: null };
            return exec('lms_unified_customers', (signal) => lmsAdmin
                .from('lms_unified_customers').select('backend_user_id').in('phone', [...phones])
                .not('backend_user_id', 'is', null).limit(1).abortSignal(signal).maybeSingle(), (data) => {
                const row = oneOf<{ backend_user_id: unknown }>(data);
                return row === null ? null : { backend_user_id: Number(row.backend_user_id) };
            });
        },
        getUnresolvedTicket: (conversationId) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').select('id, status, last_inbound_at, category_slug, suggested_type, priority, origin')
            .eq('conversation_id', conversationId).neq('status', 'resolved')
            .limit(1).abortSignal(signal).maybeSingle(), (data) => oneOf<UnresolvedTicketRow>(data)),
        getLatestResolvedTicket: (conversationId) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').select(RESOLVED_COLUMNS).eq('conversation_id', conversationId).eq('status', 'resolved')
            .order('resolved_at', { ascending: false }).limit(1).abortSignal(signal).maybeSingle(),
        (data) => oneOf<LatestResolvedRow>(data)),
        listConversationMessages: (conversationId, fromIso, limit, offset) => exec('messages', (signal) => supabaseAdmin
            .from('messages').select(DESK_MESSAGE_COLUMNS).eq('conversation_id', conversationId).gte('created_at', fromIso)
            .order('created_at', { ascending: true }).order('id', { ascending: true })
            .range(offset, offset + limit - 1).abortSignal(signal), (data) => rowsOf<MessageRow>(data)),
        getTicketClock: (ticketId) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').select(DESK_TICKET_CLOCK_COLUMNS).eq('id', ticketId)
            .limit(1).abortSignal(signal).maybeSingle(), (data) => oneOf<TicketClockRow>(data)),
    };
}

// ── Writes: every one is conditional and ends in .select(...) ──────────────

function ticketTransitionMethods(exec: Exec): Pick<DeskRepo, 'insertTicket' | 'touchInbound' | 'reopenTicket' | 'resolveSystem'> {
    return {
        insertTicket: async (row) => {
            const inserted = await exec('desk_tickets', (signal) => supabaseAdmin
                .from('desk_tickets').insert(row).select('id, ticket_no').abortSignal(signal),
            (data) => rowsOf<{ id: string; ticket_no: number }>(data));
            if (inserted.outcome !== 'ok') return { outcome: inserted.outcome, data: null };
            return inserted.data.length === 1
                ? { outcome: 'ok', data: inserted.data[0] }
                : { outcome: 'error', data: null };
        },
        touchInbound: (id, readLastInboundAt, next) => exec('desk_tickets', (signal) => {
            const base = supabaseAdmin.from('desk_tickets').update({ last_inbound_at: next }).eq('id', id).neq('status', 'resolved');
            const pinned = readLastInboundAt === null ? base.is('last_inbound_at', null) : base.eq('last_inbound_at', readLastInboundAt);
            return pinned.select('id').abortSignal(signal);
        }, countOf),
        reopenTicket: (id, readResolvedAt, patch) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').update(patch).eq('id', id).eq('status', 'resolved').eq('resolved_at', readResolvedAt)
            .select('id').abortSignal(signal), countOf),
        resolveSystem: (id, patch, guard) => exec('desk_tickets', (signal) => {
            const base = supabaseAdmin.from('desk_tickets').update(patch).eq('id', id);
            if (guard.kind === 'internal') {
                return base.neq('status', 'resolved').neq('origin', 'manual').select('id').abortSignal(signal);
            }
            if (guard.kind === 'idle') {
                return base.eq('status', 'waiting_customer').is('awaiting_reply_since', null)
                    .lte('last_outbound_at', guard.idleCutoffIso).select('id').abortSignal(signal);
            }
            if (guard.kind === 'ack') {
                return base.eq('is_ack_only', true).in('status', ['new', 'open', 'waiting_customer'])
                    .lte('last_inbound_at', guard.ackCutoffIso).select('id').abortSignal(signal);
            }
            const open = base.neq('status', 'resolved');
            const pinned = guard.readLastInboundAt === null ? open.is('last_inbound_at', null) : open.eq('last_inbound_at', guard.readLastInboundAt);
            return pinned.select('id').abortSignal(signal);
        }, countOf),
    };
}

function ticketUpdateMethods(exec: Exec): Pick<DeskRepo, 'writeFirstResolution' | 'writeDerived' | 'writeSuggestion' | 'raisePriority'> {
    return {
        writeFirstResolution: (id, values) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').update(values).eq('id', id).is('first_resolved_at', null)
            .select('id').abortSignal(signal), countOf),
        writeDerived: (read, patch) => exec('desk_tickets', (signal) => {
            const base = supabaseAdmin.from('desk_tickets').update(patch).eq('id', read.id).eq('status', read.status);
            const pinned = read.last_inbound_at === null ? base.is('last_inbound_at', null) : base.eq('last_inbound_at', read.last_inbound_at);
            return pinned.select('id').abortSignal(signal);
        }, countOf),
        writeSuggestion: (id, values) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').update(values).eq('id', id).is('category_slug', null).is('suggested_type', null)
            .select('id').abortSignal(signal), countOf),
        raisePriority: (id, priority) => exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').update({ priority }).eq('id', id).is('category_slug', null).gt('priority', priority)
            .select('id').abortSignal(signal), countOf),
    };
}

function linkMethods(exec: Exec): Pick<DeskRepo, 'claimMessage' | 'insertEvent'> {
    return {
        claimMessage: (messageId, ticketId) => exec('messages', (signal) => supabaseAdmin
            .from('messages')
            .update({ ticket_id: ticketId }).eq('id', messageId).is('ticket_id', null)
            .select('id').abortSignal(signal), countOf),
        insertEvent: (event) => exec('desk_ticket_events', (signal) => supabaseAdmin
            .from('desk_ticket_events').insert(event).abortSignal(signal), () => true as const),
    };
}

// ── Candidate lists for derive, mirror, missing-message, lifecycle and health ──

function deriveAndMirrorLists(exec: Exec): Pick<DeskRepo,
    'listActiveConversationIds' | 'listFailedOutboundConversationIds' | 'listUnresolvedTicketIds' | 'listUnresolvedForMirror'
    | 'listResolvedConversationIds' | 'listTicketedInboundSince' | 'listResolvedTicketsByIds' | 'listSuppressedAckMessageIds'> {
    const tickets = () => supabaseAdmin.from('desk_tickets');
    return {
        listActiveConversationIds: (sinceIso, limit) => exec('messages', (signal) => supabaseAdmin
            .from('messages').select('conversation_id').gte('created_at', sinceIso)
            .order('created_at', { ascending: false }).limit(limit).abortSignal(signal),
        (data) => distinct(idsOf('conversation_id')(data))),
        listFailedOutboundConversationIds: (sinceIso, limit) => exec('messages', (signal) => supabaseAdmin
            .from('messages').select('conversation_id').eq('direction', 'outbound').eq('status', 'failed')
            .gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(limit).abortSignal(signal),
        (data) => distinct(idsOf('conversation_id')(data))),
        listUnresolvedTicketIds: (conversationIds) => exec('desk_tickets', (signal) => tickets()
            .select('id').in('conversation_id', [...conversationIds]).neq('status', 'resolved')
            .limit(100).abortSignal(signal), idsOf('id')),
        listUnresolvedForMirror: (limit) => exec('desk_tickets', (signal) => tickets()
            .select('id, conversation_id, status, last_inbound_at, category_slug, awaiting_reply_since, origin')
            .neq('status', 'resolved').not('conversation_id', 'is', null)
            .order('opened_at', { ascending: true }).limit(limit).abortSignal(signal), (data) => rowsOf<MirrorTicketRow>(data)),
        listResolvedConversationIds: (conversationIds) => exec('conversations', (signal) => supabaseAdmin
            .from('conversations').select('id').in('id', [...conversationIds]).eq('status', 'resolved')
            .limit(100).abortSignal(signal), idsOf('id')),
        listTicketedInboundSince: (sinceIso, limit) => exec('messages', (signal) => supabaseAdmin
            .from('messages').select('id, ticket_id, created_at').eq('direction', 'inbound').not('ticket_id', 'is', null)
            .gte('created_at', sinceIso).order('created_at', { ascending: true }).limit(limit).abortSignal(signal),
        (data) => rowsOf<{ id: string; ticket_id: string; created_at: string }>(data)),
        listResolvedTicketsByIds: (ids) => exec('desk_tickets', (signal) => tickets()
            .select('id, status, resolved_at, resolved_by, resolved_by_name, resolution_code, resolution_note, resolved_via, lost_reason, reopen_count, last_outbound_at, is_ack_only, customer_phone, origin')
            .in('id', [...ids]).eq('status', 'resolved').limit(100).abortSignal(signal), (data) => rowsOf<ResolvedTicketRow>(data)),
        listSuppressedAckMessageIds: (ticketId) => exec('desk_ticket_events', (signal) => supabaseAdmin
            .from('desk_ticket_events').select('data').eq('ticket_id', ticketId).eq('type', 'ack_suppressed')
            .limit(200).abortSignal(signal), (data) => rowsOf<{ data: { message_id?: unknown } | null }>(data)
            .map((row) => row.data?.message_id).filter((id): id is string => typeof id === 'string')),
    };
}

function missingLifecycleAndHealthLists(exec: Exec): Pick<DeskRepo,
    'listOpenConversationsWithIncoming' | 'listNewestInbound' | 'listTicketsForConversations' | 'listDueFollowUpIds'
    | 'listIdleCandidateIds' | 'listAckLaneCandidateIds' | 'listCutoffWatchIds' | 'listOrphans' | 'listFailedPanelReplyIds'> {
    const tickets = () => supabaseAdmin.from('desk_tickets');
    return {
        listOpenConversationsWithIncoming: (lowerIso, upperIso, limit, offset) => exec('conversations', (signal) => supabaseAdmin
            .from('conversations')
            .select('id, contact_id, integrated_number, created_at, last_incoming_timestamp, last_message, contacts(id, name, phone)')
            .eq('status', 'open').gt('last_incoming_timestamp', lowerIso).lt('last_incoming_timestamp', upperIso)
            .order('last_incoming_timestamp', { ascending: false }).range(offset, offset + limit - 1).abortSignal(signal),
        (data) => rowsOf<Record<string, unknown>>(data).map((row) => (
            { ...(row as unknown as OpenConversationRow), contacts: embedded(row.contacts) }))),
        listNewestInbound: (conversationIds, sinceIso, limit) => exec('messages', (signal) => supabaseAdmin
            .from('messages').select('conversation_id, created_at').eq('direction', 'inbound')
            .in('conversation_id', [...conversationIds]).gte('created_at', sinceIso)
            .order('created_at', { ascending: false }).limit(limit).abortSignal(signal),
        (data) => rowsOf<{ conversation_id: string; created_at: string }>(data)),
        listTicketsForConversations: (conversationIds, limit) => exec('desk_tickets', (signal) => tickets()
            .select('id, conversation_id, status, opened_at').in('conversation_id', [...conversationIds])
            .limit(limit).abortSignal(signal), (data) => rowsOf<TicketStubRow>(data)),
        listDueFollowUpIds: (nowIso, limit) => exec('desk_tickets', (signal) => tickets()
            .select('id').eq('status', 'on_hold').lte('follow_up_at', nowIso).limit(limit).abortSignal(signal), idsOf('id')),
        listIdleCandidateIds: (idleCutoffIso, limit) => exec('desk_tickets', (signal) => tickets()
            .select('id').eq('status', 'waiting_customer').is('awaiting_reply_since', null).lte('last_outbound_at', idleCutoffIso)
            .order('last_outbound_at', { ascending: true }).limit(limit).abortSignal(signal), idsOf('id')),
        listAckLaneCandidateIds: (ackCutoffIso, limit) => exec('desk_tickets', (signal) => tickets()
            .select('id').eq('is_ack_only', true).in('status', ['new', 'open', 'waiting_customer']).lte('last_inbound_at', ackCutoffIso)
            .order('last_inbound_at', { ascending: true }).limit(limit).abortSignal(signal), idsOf('id')),
        listCutoffWatchIds: (beforeCutoffSlugs, limit) => listCutoffWatch(exec, beforeCutoffSlugs, limit),
        listOrphans: (afterIso, beforeIso, limit, exclude) => exec('messages', (signal) => {
            const base = supabaseAdmin
                .from('messages').select('id, created_at').eq('direction', 'inbound').is('ticket_id', null)
                .gt('created_at', afterIso).lt('created_at', beforeIso);
            const kept = exclude.length === 0 ? base : base.or(notInConversations(exclude));
            return kept.order('created_at', { ascending: true }).limit(limit).abortSignal(signal);
        }, (data) => rowsOf<{ id: string; created_at: string }>(data)),
        listFailedPanelReplyIds: (sinceIso, limit) => exec('messages', (signal) => supabaseAdmin
            .from('messages').select('id').eq('direction', 'outbound').eq('status', 'failed').eq('source', 'webapp')
            .gte('created_at', sinceIso).limit(limit).abortSignal(signal), idsOf('id')),
    };
}

/** Step 6d: awaiting a reply or unclassified, plus tickets of categories with a before-cutoff deadline. */
async function listCutoffWatch(exec: Exec, slugs: readonly string[], limit: number): Promise<DeskDb<string[]>> {
    const tickets = () => supabaseAdmin.from('desk_tickets');
    const waiting = await exec('desk_tickets', (signal) => tickets()
        .select('id').neq('status', 'resolved').or('awaiting_reply_since.not.is.null,category_slug.is.null')
        .limit(limit).abortSignal(signal), idsOf('id'));
    if (waiting.outcome !== 'ok' || slugs.length === 0) return waiting;
    const deadline = await exec('desk_tickets', (signal) => tickets()
        .select('id').neq('status', 'resolved').in('category_slug', [...slugs]).limit(limit).abortSignal(signal), idsOf('id'));
    if (deadline.outcome !== 'ok') return deadline;
    return { outcome: 'ok', data: distinct([...waiting.data, ...deadline.data]) };
}

// ── Slice 2 · P1e — internal contacts ───────────────────────────────────────

async function listInternalConversationIds(
    exec: Exec, phones: readonly string[], sinceIso: string, limit: number,
): Promise<DeskDb<string[]>> {
    const variants = [...new Set(phones.flatMap((phone) => phoneVariants(phone)))];
    const contactIds: string[] = [];
    for (const part of chunked(variants)) {
        const read = await exec('contacts', (signal) => supabaseAdmin
            .from('contacts').select('id').in('phone', part).limit(1000).abortSignal(signal), idsOf('id'));
        if (read.outcome !== 'ok') return read;
        contactIds.push(...read.data);
    }
    const found: Array<{ id: string; last_incoming_timestamp: string }> = [];
    for (const part of chunked(distinct(contactIds))) {
        const read = await exec('conversations', (signal) => supabaseAdmin
            .from('conversations').select('id, last_incoming_timestamp').in('contact_id', part)
            .gt('last_incoming_timestamp', sinceIso).order('last_incoming_timestamp', { ascending: false })
            .limit(limit).abortSignal(signal), (data) => rowsOf<{ id: string; last_incoming_timestamp: string }>(data));
        if (read.outcome !== 'ok') return { outcome: read.outcome, data: null };
        found.push(...read.data);
    }
    const newestFirst = found.sort((a, b) => Date.parse(b.last_incoming_timestamp) - Date.parse(a.last_incoming_timestamp));
    return { outcome: 'ok', data: distinct(newestFirst.map((row) => String(row.id))).slice(0, limit) };
}

async function listUnresolvedTicketsForPhones(
    exec: Exec, whatsAppPhones: readonly string[], limit: number,
): Promise<DeskDb<InternalTicketRow[]>> {
    const rows: InternalTicketRow[] = [];
    for (const part of chunked(distinct(whatsAppPhones))) {
        const read = await exec('desk_tickets', (signal) => supabaseAdmin
            .from('desk_tickets').select('id, status, customer_phone, origin').in('customer_phone', part)
            .neq('status', 'resolved').neq('origin', 'manual').order('opened_at', { ascending: true })
            .limit(limit).abortSignal(signal), (data) => rowsOf<InternalTicketRow>(data));
        if (read.outcome !== 'ok') return read;
        rows.push(...read.data);
    }
    return { outcome: 'ok', data: rows.slice(0, limit) };
}

function internalMethods(exec: Exec): Pick<DeskRepo, 'readContactFlags' | 'listInternalConversationIds' | 'listUnresolvedTicketsForPhones'> {
    return {
        readContactFlags: () => exec('desk_contact_flags', (signal) => supabaseAdmin
            .from('desk_contact_flags').select('phone, kind').is('removed_at', null)
            .limit(5000).abortSignal(signal), (data) => rowsOf<ContactFlagRow>(data)),
        listInternalConversationIds: (phones, sinceIso, limit) => (phones.length === 0
            ? Promise.resolve({ outcome: 'ok', data: [] })
            : listInternalConversationIds(exec, phones, sinceIso, limit)),
        listUnresolvedTicketsForPhones: (whatsAppPhones, limit) => (whatsAppPhones.length === 0
            ? Promise.resolve({ outcome: 'ok', data: [] })
            : listUnresolvedTicketsForPhones(exec, whatsAppPhones, limit)),
    };
}

export function createSupabaseDeskRepo(options: { runSignal?: AbortSignal } = {}): DeskRepo {
    const exec = createExec(options.runSignal);
    return {
        ...settingsMethods(exec),
        ...readMethods(exec),
        ...ticketTransitionMethods(exec),
        ...ticketUpdateMethods(exec),
        ...linkMethods(exec),
        ...deriveAndMirrorLists(exec),
        ...missingLifecycleAndHealthLists(exec),
        ...internalMethods(exec),
    };
}
