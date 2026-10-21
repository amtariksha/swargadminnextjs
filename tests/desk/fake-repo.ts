// In-memory DeskRepo for the engine tests. It behaves like the database where the engine relies on
// it: a unique index on unresolved tickets per conversation, the resolved/resolved_at CHECK, exact
// string pins on timestamps, and the three install states (migration 015a / 015b / service key).
// Not a test file: vitest only collects *.test.ts.

import type { ResolvedVia } from '@/lib/desk/constants';
import { attachInbound, type AttachResult, type ConversationContext, type EngineContext } from '@/lib/desk/engine';
import { readDeskSettings } from '@/lib/desk/settings';
import { EMPTY_INTERNAL_MATCHER, type InternalMatcher } from '@/lib/desk/internal-contacts';
import { phoneVariants } from '@/lib/desk/phone';
import {
    classifyDeskDbError,
    type ContactFlagRow, type ConversationRow, type ContactBrief, type DeskDb, type DeskRepo, type EngineCategory,
    type InternalTicketRow, type LatestResolvedRow,
    type MessageRow, type ResolvedTicketRow, type TicketClockRow, type UnresolvedTicketRow,
} from '@/lib/desk/repo';
import { DESK_SETTING_KEYS } from '@/lib/desk/constants';
import type { Ticket } from '@/lib/desk/types';

export const NOW = new Date('2026-10-12T06:30:00.000Z');
export const GO_LIVE = '2026-10-12T05:00:00+05:30';

/** A timestamp N seconds before NOW, written the way PostgREST returns a timestamptz (microseconds). */
export function ts(secondsAgo: number): string {
    const iso = new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
    return `${iso.slice(0, 19)}.123456+00:00`;
}
export const minutesAgo = (minutes: number): string => ts(minutes * 60);
export const hoursAgo = (hours: number): string => ts(hours * 3600);

export type InstallMode = 'ok' | 'no_015a' | 'no_015b' | 'no_service_key' | 'no_016';

export interface FakeConversation {
    id: string;
    contact_id: string | null;
    integrated_number: string | null;
    status: 'open' | 'resolved';
    last_incoming_timestamp: string | null;
    last_message: string | null;
    created_at: string;
    contacts: ContactBrief | null;
}

export interface FakeEvent {
    id: number;
    ticket_id: string;
    type: string;
    from_status: string | null;
    to_status: string | null;
    actor_id: string;
    actor_name: string;
    data: Record<string, unknown>;
}

export interface FakeSeed {
    messages?: Array<Partial<MessageRow>>;
    conversations?: Array<Partial<FakeConversation>>;
    tickets?: Array<Partial<Ticket>>;
    categories?: EngineCategory[];
    knownCustomers?: Array<{ phone: string; backend_user_id: number }>;
    settings?: Record<string, string>;
    flags?: ContactFlagRow[];
}

export interface FakeDeskRepo extends DeskRepo {
    messages: MessageRow[];
    conversations: FakeConversation[];
    tickets: Ticket[];
    events: FakeEvent[];
    categories: EngineCategory[];
    knownCustomers: Array<{ phone: string; backend_user_id: number }>;
    settings: Map<string, string>;
    flags: ContactFlagRow[];
    /** Keys passed to writeTickSetting that changed a row, in order. */
    settingWrites: string[];
    writes: Array<{ table: string; columns: string[] }>;
    calls: Record<string, number>;
    failNext(method: keyof DeskRepo, code: string, times?: number): void;
    before(method: keyof DeskRepo, hook: () => void, times?: number): void;
    setInstall(mode: InstallMode): void;
}

// ── Fixtures ───────────────────────────────────────────────────────────────

let idCounter = 0;
const nextId = (prefix: string): string => `${prefix}-${String((idCounter += 1)).padStart(6, '0')}`;

export function makeMessage(partial: Partial<MessageRow> = {}): MessageRow {
    return {
        id: nextId('msg'), conversation_id: 'C1', direction: 'inbound', content_type: 'text', status: 'delivered',
        source: 'customer', template_name: null, is_internal_note: false, body: 'hello', media_url: null,
        created_at: minutesAgo(5), ticket_id: null, ...partial,
    };
}

export function makeConversation(partial: Partial<FakeConversation> = {}): FakeConversation {
    const id = partial.id ?? 'C1';
    return {
        id, contact_id: `contact-${id}`, integrated_number: id === 'C2' ? '917996196111' : '917090166111',
        status: 'open', last_incoming_timestamp: null, last_message: 'hello', created_at: hoursAgo(48),
        contacts: { id: `contact-${id}`, name: `Customer ${id}`, phone: '919900000011' }, ...partial,
    };
}

export function makeTicket(partial: Partial<Ticket> = {}): Ticket {
    const defaults: Ticket = {
        id: nextId('tkt'), ticket_no: 0, channel: 'whatsapp', conversation_id: 'C1', contact_id: null,
        integrated_number: null, origin: 'inbound', previous_ticket_id: null, duplicate_of_ticket_id: null,
        lead_id: null, customer_phone: null, customer_name: null, backend_user_id: null, customer_match: null,
        queue: 'care', type: null, category_slug: null, priority: 3, suggested_type: null, suggested_category: null,
        classification_source: null, classified_at: null, classified_by: null, status: 'open', assigned_to: null,
        assigned_name: null, assigned_at: null, opened_at: minutesAgo(30), last_inbound_at: null,
        last_outbound_at: null, awaiting_reply_since: null, first_response_at: null, first_response_message_id: null,
        first_response_by: null, first_response_source: null, follow_up_at: null, hold_reason: null, reopen_count: 0,
        last_reopened_at: null, is_ack_only: false, escalated_at: null, escalation_reason: null, resolved_at: null,
        resolved_by: null, resolved_by_name: null, resolution_code: null, resolution_note: null, resolved_via: null,
        lost_reason: null, prior_resolution: null, first_resolved_at: null, first_resolved_by: null,
        first_resolved_code: null, root_cause: null, preventive_action: null, address_id: null, apartment_name: null,
        flat_no: null, area: null, pincode: null, driver_user_id: null, driver_name: null, drop_point_id: null,
        drop_point_name: null, order_id: null, daytime_order_id: null, product_id: null, product_name: null,
        delivery_date: null, delivery_status: null, delivered_at: null, link_status: null, order_value: null,
        payment_status: null, reviewed_at: null, reviewed_by: null, review_note: null,
    };
    return { ...defaults, ...partial };
}

export const FIXTURE_CATEGORIES: EngineCategory[] = [
    { slug: 'late_delivery', type: 'complaint', priority: 2, sort_order: 1, active: true, keywords: ['late'], default_resolution_code: null, deadline_rule: null },
    { slug: 'general_enquiry', type: 'enquiry', priority: 3, sort_order: 2, active: true, keywords: [], default_resolution_code: 'answered', deadline_rule: null },
    { slug: 'new_app_subscription', type: 'sales', priority: 3, sort_order: 3, active: true, keywords: [], default_resolution_code: null, deadline_rule: null },
    { slug: 'cancel_subscription', type: 'request', priority: 3, sort_order: 4, active: true, keywords: ['cancel subscription'], default_resolution_code: null, deadline_rule: 'before_cutoff' },
];

/** The 17 desk_* rows as seeded by migrations 015a and 016, with the fixture go-live and the engine on. */
export function defaultSettings(overrides: Record<string, string> = {}): Record<string, string> {
    return {
        desk_engine_enabled: '1', desk_inline_hooks: '0', desk_ui_enabled: '0', desk_cutover_redirect: '0',
        desk_ack_suppress: 'shadow', desk_go_live_at: GO_LIVE, desk_stats_from: '',
        desk_reopen_window_hours: '2', desk_idle_close_hours: '24', desk_ack_autoclose_hours: '2',
        desk_reply_alert_mins: '15',
        desk_number_queues: '{"917090166111":"sales","917996196111":"care"}',
        desk_business_hours: '{"start":"05:30","end":"22:00","days":[0,1,2,3,4,5,6]}',
        desk_credit_max_agent: '200', desk_last_tick_at: '', desk_last_tick_stats: '', desk_staff_phones: '[]',
        ...overrides,
    };
}

// ── The fake ───────────────────────────────────────────────────────────────

type Kind = 'settings' | 'desk' | 'messagesNew' | 'plain';
const failed = (code: string, message = ''): DeskDb<never> => ({ outcome: classifyDeskDbError({ code, message }) as never, data: null });
const ok = <T>(data: T): DeskDb<T> => ({ outcome: 'ok', data });
const parse = (value: string): number => Date.parse(value);
const UNRESOLVED = (ticket: Ticket): boolean => ticket.status !== 'resolved';

export function createFakeDeskRepo(seed: FakeSeed = {}): FakeDeskRepo {
    const messages = (seed.messages ?? []).map(makeMessage);
    const conversations = (seed.conversations ?? []).map(makeConversation);
    const tickets = (seed.tickets ?? []).map(makeTicket);
    const categories = [...(seed.categories ?? FIXTURE_CATEGORIES)];
    const knownCustomers = [...(seed.knownCustomers ?? [])];
    const flags = [...(seed.flags ?? [])];
    const settingWrites: string[] = [];
    const settings = new Map(Object.entries(seed.settings ?? defaultSettings()));
    const events: FakeEvent[] = [];
    const writes: Array<{ table: string; columns: string[] }> = [];
    const calls: Record<string, number> = {};
    const failures = new Map<string, Array<{ code: string; times: number }>>();
    const hooks = new Map<string, Array<{ hook: () => void; times: number }>>();
    let install: InstallMode = 'ok';
    let ticketNo = 0;
    let eventId = 0;

    const take = <T extends { times: number }>(queue: T[] | undefined): T | null => {
        const entry = queue?.find((item) => item.times > 0);
        if (!entry) return null;
        entry.times -= 1;
        return entry;
    };

    const installFailure = (kind: Kind, name: string): DeskDb<never> | null => {
        if (install === 'ok') return null;
        if (install === 'no_service_key') return failed('42501');
        const reads = name === 'claimMessage' ? 'PGRST204' : '42703';
        if (install === 'no_015a') {
            if (kind === 'desk') return failed('PGRST205');
            if (kind === 'messagesNew') return failed(reads);
        }
        if (install === 'no_015b' && kind === 'messagesNew') return failed(reads);
        return null;
    };

    function wrap<A extends unknown[], T>(
        name: string, kind: Kind | ((...args: A) => Kind), impl: (...args: A) => DeskDb<T>,
    ): (...args: A) => Promise<DeskDb<T>> {
        calls[name] = 0;
        return async (...args: A) => {
            calls[name] += 1;
            take(hooks.get(name))?.hook();
            const forced = take(failures.get(name));
            if (forced) {
                return forced.code === 'TIMEOUT'
                    ? failed('', 'TimeoutError: The operation was aborted due to timeout')
                    : failed(forced.code);
            }
            return installFailure(typeof kind === 'function' ? kind(...args) : kind, name) ?? impl(...args);
        };
    }

    const record = (table: string, columns: string[]): void => { writes.push({ table, columns }); };

    /** The resolved/resolved_at CHECK: a patch that breaks it changes nothing and reports 23514. */
    function applyPatch(ticket: Ticket, patch: Partial<Ticket>): DeskDb<number> {
        const next = { ...ticket, ...patch };
        if ((next.status === 'resolved') !== (next.resolved_at !== null)) return failed('23514');
        Object.assign(ticket, patch);
        record('desk_tickets', Object.keys(patch));
        return ok(1);
    }

    const hasOtherUnresolved = (conversationId: string | null, exceptId: string | null): boolean => (
        conversationId !== null && tickets.some((t) => t.conversation_id === conversationId && UNRESOLVED(t) && t.id !== exceptId)
    );
    const findTicket = (id: string): Ticket | undefined => tickets.find((t) => t.id === id);
    const pinned = (stored: string | null, read: string | null): boolean => stored === read;
    const pick = <T extends object>(source: object, columns: string[]): T => (
        Object.fromEntries(columns.map((column) => [column, (source as Record<string, unknown>)[column]])) as T
    );
    const conversationRow = (c: FakeConversation): ConversationRow => (
        { id: c.id, contact_id: c.contact_id, integrated_number: c.integrated_number, contacts: c.contacts }
    );
    const idList = (rows: Array<{ id: string }>): DeskDb<string[]> => ok(rows.map((row) => row.id));
    /** PostgREST "conversation_id is null or not in (…)": a message without a conversation is never excluded. */
    const excluded = (m: MessageRow, ids: readonly string[]): boolean => typeof m.conversation_id === 'string' && ids.includes(m.conversation_id);
    const visibleSettingKeys = (): string[] => (install === 'no_015a' ? [] : [...settings.keys()].filter((k) => (DESK_SETTING_KEYS as readonly string[]).includes(k)));

    const repo: DeskRepo = {
        readSettingRows: wrap('readSettingRows', 'settings', () => ok(visibleSettingKeys().map((key) => ({ key, value: settings.get(key) ?? null })))),
        writeTickSetting: wrap('writeTickSetting', 'settings', (key, value) => {
            if (install === 'no_015a' || !settings.has(key)) return ok(0);
            settings.set(key, value);
            settingWrites.push(key);
            record('app_settings', ['value']);
            return ok(1);
        }),
        probe: wrap('probe', (target: string): Kind => (target.startsWith('messages.') ? 'messagesNew' : 'desk'), () => ok(true as const)),
        probeWrite: wrap('probeWrite', 'desk', () => ok(true as const)),

        listUnticketedInbound: wrap('listUnticketedInbound', 'messagesNew', (afterIso, beforeIso, limit, exclude) => ok(
            messages.filter((m) => m.direction === 'inbound' && m.ticket_id === null && !excluded(m, exclude)
                && parse(m.created_at) > parse(afterIso) && parse(m.created_at) < parse(beforeIso))
                .sort((a, b) => parse(a.created_at) - parse(b.created_at)).slice(0, limit).map((m) => ({ ...m })),
        )),
        getConversation: wrap('getConversation', 'plain', (id) => {
            const found = conversations.find((c) => c.id === id);
            return ok(found ? conversationRow(found) : null);
        }),
        listActiveCategories: wrap('listActiveCategories', 'desk', () => ok(categories.filter((c) => c.active !== false))),
        findKnownCustomer: wrap('findKnownCustomer', 'plain', (phones) => {
            const found = knownCustomers.find((k) => phones.includes(k.phone));
            return ok(found ? { backend_user_id: found.backend_user_id } : null);
        }),

        getUnresolvedTicket: wrap('getUnresolvedTicket', 'desk', (conversationId) => {
            const found = tickets.find((t) => t.conversation_id === conversationId && UNRESOLVED(t));
            return ok(found ? pick<UnresolvedTicketRow>(found, ['id', 'status', 'last_inbound_at', 'category_slug', 'suggested_type', 'priority', 'origin']) : null);
        }),
        getLatestResolvedTicket: wrap('getLatestResolvedTicket', 'desk', (conversationId) => {
            const found = tickets.filter((t) => t.conversation_id === conversationId && t.status === 'resolved')
                .sort((a, b) => parse(b.resolved_at as string) - parse(a.resolved_at as string))[0];
            return ok(found ? pick<LatestResolvedRow>(found, ['id', 'opened_at', 'resolved_at', 'resolved_by', 'resolved_by_name', 'resolution_code', 'resolution_note', 'resolved_via', 'lost_reason', 'reopen_count', 'last_outbound_at', 'origin']) : null);
        }),
        listConversationMessages: wrap('listConversationMessages', 'messagesNew', (conversationId, fromIso, limit, offset) => ok(
            messages.filter((m) => m.conversation_id === conversationId && parse(m.created_at) >= parse(fromIso))
                .sort((a, b) => parse(a.created_at) - parse(b.created_at) || (a.id < b.id ? -1 : 1))
                .slice(offset, offset + limit).map((m) => ({ ...m })),
        )),
        getTicketClock: wrap('getTicketClock', 'desk', (id) => {
            const found = findTicket(id);
            return ok(found ? pick<TicketClockRow>(found, ['id', 'conversation_id', 'origin', 'status', 'opened_at', 'last_reopened_at', 'last_inbound_at', 'last_outbound_at', 'awaiting_reply_since', 'first_response_at', 'first_response_message_id', 'first_response_source', 'first_response_by', 'is_ack_only']) : null);
        }),

        insertTicket: wrap('insertTicket', 'desk', (row) => {
            ticketNo += 1;
            if (!row.origin) return failed('23502');
            const status = row.status ?? 'new';
            if (status !== 'resolved' && hasOtherUnresolved(row.conversation_id ?? null, null)) return failed('23505');
            const ticket = makeTicket({ id: nextId('tkt'), reopen_count: 0, priority: 3, queue: 'care', ...row, status, ticket_no: ticketNo });
            if ((ticket.status === 'resolved') !== (ticket.resolved_at !== null)) return failed('23514');
            tickets.push(ticket);
            record('desk_tickets', Object.keys(row));
            return ok({ id: ticket.id, ticket_no: ticket.ticket_no });
        }),
        touchInbound: wrap('touchInbound', 'desk', (id, readLastInboundAt, next) => {
            const ticket = findTicket(id);
            if (!ticket || !UNRESOLVED(ticket) || !pinned(ticket.last_inbound_at, readLastInboundAt)) return ok(0);
            return applyPatch(ticket, { last_inbound_at: next });
        }),
        reopenTicket: wrap('reopenTicket', 'desk', (id, readResolvedAt, patch) => {
            const ticket = findTicket(id);
            if (!ticket || ticket.status !== 'resolved' || ticket.resolved_at !== readResolvedAt) return ok(0);
            if (hasOtherUnresolved(ticket.conversation_id, ticket.id)) return failed('23505');
            return applyPatch(ticket, patch as Partial<Ticket>);
        }),
        resolveSystem: wrap('resolveSystem', 'desk', (id, patch, guard) => {
            const t = findTicket(id);
            if (!t) return ok(0);
            const passes = guard.kind === 'internal'
                ? UNRESOLVED(t) && t.origin !== 'manual'
                : guard.kind === 'idle'
                ? t.status === 'waiting_customer' && t.awaiting_reply_since === null && t.last_outbound_at !== null && parse(t.last_outbound_at) <= parse(guard.idleCutoffIso)
                : guard.kind === 'ack'
                    ? t.is_ack_only && t.status !== 'resolved' && t.status !== 'on_hold' && t.last_inbound_at !== null && parse(t.last_inbound_at) <= parse(guard.ackCutoffIso)
                    : UNRESOLVED(t) && pinned(t.last_inbound_at, guard.readLastInboundAt);
            return passes ? applyPatch(t, patch as Partial<Ticket>) : ok(0);
        }),
        writeFirstResolution: wrap('writeFirstResolution', 'desk', (id, values) => {
            const ticket = findTicket(id);
            return ticket && ticket.first_resolved_at === null ? applyPatch(ticket, values) : ok(0);
        }),
        claimMessage: wrap('claimMessage', 'messagesNew', (messageId, ticketId) => {
            const message = messages.find((m) => m.id === messageId);
            if (!message || message.ticket_id !== null) return ok(0);
            message.ticket_id = ticketId;
            record('messages', ['ticket_id']);
            return ok(1);
        }),
        writeDerived: wrap('writeDerived', 'desk', (read, patch) => {
            const ticket = findTicket(read.id);
            if (!ticket || ticket.status !== read.status || !pinned(ticket.last_inbound_at, read.last_inbound_at)) return ok(0);
            return applyPatch(ticket, patch);
        }),
        insertEvent: wrap('insertEvent', 'desk', (event) => {
            eventId += 1;
            events.push({ id: eventId, ...event, data: { ...(event.data as Record<string, unknown>) } });
            record('desk_ticket_events', Object.keys(event));
            return ok(true as const);
        }),
        writeSuggestion: wrap('writeSuggestion', 'desk', (id, values) => {
            const ticket = findTicket(id);
            if (!ticket || ticket.category_slug !== null || ticket.suggested_type !== null) return ok(0);
            return applyPatch(ticket, values as Partial<Ticket>);
        }),
        raisePriority: wrap('raisePriority', 'desk', (id, priority) => {
            const ticket = findTicket(id);
            return ticket && ticket.category_slug === null && ticket.priority > priority ? applyPatch(ticket, { priority }) : ok(0);
        }),

        listActiveConversationIds: wrap('listActiveConversationIds', 'plain', (sinceIso, limit) => ok([...new Set(
            messages.filter((m) => parse(m.created_at) >= parse(sinceIso))
                .sort((a, b) => parse(b.created_at) - parse(a.created_at)).slice(0, limit).map((m) => m.conversation_id as string),
        )])),
        listFailedOutboundConversationIds: wrap('listFailedOutboundConversationIds', 'plain', (sinceIso, limit) => ok([...new Set(
            messages.filter((m) => m.direction === 'outbound' && m.status === 'failed' && parse(m.created_at) >= parse(sinceIso))
                .sort((a, b) => parse(b.created_at) - parse(a.created_at)).slice(0, limit).map((m) => m.conversation_id as string),
        )])),
        listUnresolvedTicketIds: wrap('listUnresolvedTicketIds', 'desk', (ids) => idList(
            tickets.filter((t) => UNRESOLVED(t) && t.conversation_id !== null && ids.includes(t.conversation_id)).slice(0, 100),
        )),
        listUnresolvedForMirror: wrap('listUnresolvedForMirror', 'desk', (limit) => ok(
            tickets.filter((t) => UNRESOLVED(t) && t.conversation_id !== null)
                .sort((a, b) => parse(a.opened_at) - parse(b.opened_at)).slice(0, limit)
                .map((t) => pick<Ticket>(t, ['id', 'conversation_id', 'status', 'last_inbound_at', 'category_slug', 'awaiting_reply_since', 'origin'])),
        )),
        listResolvedConversationIds: wrap('listResolvedConversationIds', 'plain', (ids) => idList(
            conversations.filter((c) => c.status === 'resolved' && ids.includes(c.id)).slice(0, 100),
        )),
        listTicketedInboundSince: wrap('listTicketedInboundSince', 'messagesNew', (sinceIso, limit) => ok(
            messages.filter((m) => m.direction === 'inbound' && m.ticket_id !== null && parse(m.created_at) >= parse(sinceIso))
                .sort((a, b) => parse(a.created_at) - parse(b.created_at)).slice(0, limit)
                .map((m) => ({ id: m.id, ticket_id: m.ticket_id as string, created_at: m.created_at })),
        )),
        listResolvedTicketsByIds: wrap('listResolvedTicketsByIds', 'desk', (ids) => ok(
            tickets.filter((t) => t.status === 'resolved' && ids.includes(t.id)).slice(0, 100)
                .map((t) => pick<ResolvedTicketRow>(t, ['id', 'status', 'resolved_at', 'resolved_by', 'resolved_by_name', 'resolution_code', 'resolution_note', 'resolved_via', 'lost_reason', 'reopen_count', 'last_outbound_at', 'is_ack_only', 'customer_phone', 'origin'])),
        )),
        listSuppressedAckMessageIds: wrap('listSuppressedAckMessageIds', 'desk', (ticketId) => ok(
            events.filter((e) => e.ticket_id === ticketId && e.type === 'ack_suppressed')
                .map((e) => e.data.message_id).filter((id): id is string => typeof id === 'string'),
        )),

        listOpenConversationsWithIncoming: wrap('listOpenConversationsWithIncoming', 'plain', (lowerIso, upperIso, limit, offset) => ok(
            conversations.filter((c) => c.status === 'open' && c.last_incoming_timestamp !== null
                && parse(c.last_incoming_timestamp) > parse(lowerIso) && parse(c.last_incoming_timestamp) < parse(upperIso))
                .sort((a, b) => parse(b.last_incoming_timestamp as string) - parse(a.last_incoming_timestamp as string))
                .slice(offset, offset + limit)
                .map((c) => ({
                    id: c.id, contact_id: c.contact_id, integrated_number: c.integrated_number, created_at: c.created_at,
                    last_incoming_timestamp: c.last_incoming_timestamp as string, last_message: c.last_message, contacts: c.contacts,
                })),
        )),
        listNewestInbound: wrap('listNewestInbound', 'plain', (ids, sinceIso, limit) => ok(
            messages.filter((m) => m.direction === 'inbound' && ids.includes(m.conversation_id as string) && parse(m.created_at) >= parse(sinceIso))
                .sort((a, b) => parse(b.created_at) - parse(a.created_at)).slice(0, limit)
                .map((m) => ({ conversation_id: m.conversation_id as string, created_at: m.created_at })),
        )),
        listTicketsForConversations: wrap('listTicketsForConversations', 'desk', (ids, limit) => ok(
            tickets.filter((t) => t.conversation_id !== null && ids.includes(t.conversation_id)).slice(0, limit)
                .map((t) => pick<Ticket>(t, ['id', 'conversation_id', 'status', 'opened_at'])),
        )),

        listDueFollowUpIds: wrap('listDueFollowUpIds', 'desk', (nowIso, limit) => idList(
            tickets.filter((t) => t.status === 'on_hold' && t.follow_up_at !== null && parse(t.follow_up_at) <= parse(nowIso)).slice(0, limit),
        )),
        listIdleCandidateIds: wrap('listIdleCandidateIds', 'desk', (cutoffIso, limit) => idList(
            tickets.filter((t) => t.status === 'waiting_customer' && t.awaiting_reply_since === null && t.last_outbound_at !== null && parse(t.last_outbound_at) <= parse(cutoffIso))
                .sort((a, b) => parse(a.last_outbound_at as string) - parse(b.last_outbound_at as string)).slice(0, limit),
        )),
        listAckLaneCandidateIds: wrap('listAckLaneCandidateIds', 'desk', (cutoffIso, limit) => idList(
            tickets.filter((t) => t.is_ack_only && ['new', 'open', 'waiting_customer'].includes(t.status) && t.last_inbound_at !== null && parse(t.last_inbound_at) <= parse(cutoffIso))
                .sort((a, b) => parse(a.last_inbound_at as string) - parse(b.last_inbound_at as string)).slice(0, limit),
        )),
        listCutoffWatchIds: wrap('listCutoffWatchIds', 'desk', (slugs, limit) => ok([...new Set([
            ...tickets.filter((t) => UNRESOLVED(t) && (t.awaiting_reply_since !== null || t.category_slug === null)).slice(0, limit).map((t) => t.id),
            ...(slugs.length === 0 ? [] : tickets.filter((t) => UNRESOLVED(t) && t.category_slug !== null && slugs.includes(t.category_slug)).slice(0, limit).map((t) => t.id)),
        ])])),

        listOrphans: wrap('listOrphans', 'messagesNew', (afterIso, beforeIso, limit, exclude) => ok(
            messages.filter((m) => m.direction === 'inbound' && m.ticket_id === null && !excluded(m, exclude) && parse(m.created_at) > parse(afterIso) && parse(m.created_at) < parse(beforeIso))
                .sort((a, b) => parse(a.created_at) - parse(b.created_at)).slice(0, limit).map((m) => ({ id: m.id, created_at: m.created_at })),
        )),
        listFailedPanelReplyIds: wrap('listFailedPanelReplyIds', 'plain', (sinceIso, limit) => idList(
            messages.filter((m) => m.direction === 'outbound' && m.status === 'failed' && m.source === 'webapp' && parse(m.created_at) >= parse(sinceIso)).slice(0, limit),
        )),

        readContactFlags: wrap('readContactFlags', 'plain', () => (install === 'no_016' ? failed('PGRST205') : ok(flags.map((f) => ({ ...f }))))),
        listInternalConversationIds: wrap('listInternalConversationIds', 'plain', (phones, sinceIso, limit) => {
            const forms = new Set(phones.flatMap((phone) => phoneVariants(phone)));
            return idList(conversations
                .filter((c) => c.contacts?.phone != null && forms.has(c.contacts.phone)
                    && c.last_incoming_timestamp !== null && parse(c.last_incoming_timestamp) > parse(sinceIso))
                .sort((a, b) => parse(b.last_incoming_timestamp as string) - parse(a.last_incoming_timestamp as string))
                .slice(0, limit));
        }),
        listUnresolvedTicketsForPhones: wrap('listUnresolvedTicketsForPhones', 'desk', (whatsAppPhones, limit) => ok(
            tickets.filter((t) => UNRESOLVED(t) && t.origin !== 'manual' && t.customer_phone !== null && whatsAppPhones.includes(t.customer_phone))
                .sort((a, b) => parse(a.opened_at) - parse(b.opened_at)).slice(0, limit)
                .map((t) => pick<InternalTicketRow>(t, ['id', 'status', 'customer_phone', 'origin'])),
        )),
    };

    return Object.assign(repo, {
        messages, conversations, tickets, events, categories, knownCustomers, settings, flags, settingWrites, writes, calls,
        failNext(method: keyof DeskRepo, code: string, times = 1): void {
            failures.set(method, [...(failures.get(method) ?? []), { code, times }]);
        },
        before(method: keyof DeskRepo, hook: () => void, times = 1): void {
            hooks.set(method, [...(hooks.get(method) ?? []), { hook, times }]);
        },
        setInstall(mode: InstallMode): void {
            install = mode;
        },
    });
}

// ── Harness for the engine and tick tests ──────────────────────────────────

export interface Harness {
    fake: FakeDeskRepo;
    ctx: EngineContext;
    conv: (id?: string, known?: { backend_user_id: number } | null) => ConversationContext;
}

export async function setup(
    seed: FakeSeed = {}, settingOverrides: Record<string, string> = {}, internal: InternalMatcher = EMPTY_INTERNAL_MATCHER,
): Promise<Harness> {
    const fake = createFakeDeskRepo({
        conversations: [{ id: 'C1' }, { id: 'C2' }],
        ...seed,
        settings: defaultSettings(settingOverrides),
    });
    const { settings } = await readDeskSettings(fake);
    const ctx: EngineContext = { repo: fake, now: NOW, settings, categories: async () => fake.categories, expired: () => false, internal };
    const conv: Harness['conv'] = (id = 'C1', known = null) => {
        const conversation = fake.conversations.find((c) => c.id === id);
        if (!conversation) throw new Error(`no conversation ${id}`);
        return {
            conversation: {
                id, contact_id: conversation.contact_id, integrated_number: conversation.integrated_number, contacts: conversation.contacts,
            },
            known: async () => known,
        };
    };
    return { fake, ctx, conv };
}

export function addMessage(fake: FakeDeskRepo, partial: Partial<MessageRow> = {}): MessageRow {
    const message = makeMessage(partial);
    fake.messages.push(message);
    return message;
}

export function addTicket(fake: FakeDeskRepo, partial: Partial<Ticket> = {}): Ticket {
    const ticket = makeTicket(partial);
    fake.tickets.push(ticket);
    return ticket;
}

export interface ResolvedOptions {
    resolvedMinutesAgo: number;
    via?: ResolvedVia;
    replyBody?: string | null;
    conversationId?: string;
}

/** A resolved ticket whose stored history is consistent: a customer message, then a reply, then the resolution. */
export function addResolvedTicket(fake: FakeDeskRepo, options: ResolvedOptions, partial: Partial<Ticket> = {}): Ticket {
    const conversationId = options.conversationId ?? 'C1';
    const inboundAt = minutesAgo(options.resolvedMinutesAgo + 20);
    const replyAt = minutesAgo(options.resolvedMinutesAgo + 10);
    const ticket = addTicket(fake, {
        conversation_id: conversationId, status: 'resolved', opened_at: inboundAt, last_inbound_at: inboundAt,
        resolved_at: minutesAgo(options.resolvedMinutesAgo), resolved_via: options.via ?? 'manual',
        resolution_code: 'answered', resolved_by: '7', resolved_by_name: 'Asha', ...partial,
    });
    addMessage(fake, { conversation_id: conversationId, created_at: inboundAt, ticket_id: ticket.id });
    if (options.replyBody !== null) {
        const reply = addMessage(fake, {
            conversation_id: conversationId, direction: 'outbound', source: 'webapp', status: 'sent',
            body: options.replyBody ?? 'All done for you', created_at: replyAt,
        });
        Object.assign(ticket, {
            last_outbound_at: replyAt, first_response_at: replyAt, first_response_message_id: reply.id, first_response_source: 'panel',
        });
    }
    return ticket;
}

export async function attach(h: Harness, partial: Partial<MessageRow> = {}, conversationId = 'C1'): Promise<{ message: MessageRow; result: AttachResult }> {
    const message = addMessage(h.fake, { conversation_id: conversationId, ...partial });
    return { message, result: await attachInbound(h.ctx, h.conv(conversationId), message) };
}

export const eventsOf = (fake: FakeDeskRepo, type: string) => fake.events.filter((event) => event.type === type);
