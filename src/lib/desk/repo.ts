// Desk engine repository: the interface the engine talks to, the row types, and the one place
// that decides what a database error means. No I/O and no Supabase import here: the Supabase
// implementation is repo-supabase.ts and the in-memory fake lives under tests/desk/.

import { SYSTEM_SET_STATUSES, TICKET_TYPES } from './constants';
import type { EventType, Origin, ReopenReason, ResolutionCode, ResolvedVia, TicketStatus, TicketType } from './constants';
import type { DeskMessageFacts, TicketClock } from './clock';
import { toWhatsAppPhone } from './phone';
import type { PreClassifyCategory, PreClassifyResult } from './rules';
import type { ContactFlag, DeskTickStepBase, EventDataMap, IsoDateTime, PriorResolution, StaffId, Ticket } from './types';

// ── Constants ──────────────────────────────────────────────────────────────

/** Page size for reading a conversation's messages. Never above PostgREST "Max rows" (default 1000). */
export const DESK_MESSAGE_PAGE = 1000;
export const DESK_QUERY_TIMEOUT_MS = 4000;

export const DESK_TICKET_CLOCK_COLUMNS =
    'id, conversation_id, origin, status, opened_at, last_reopened_at, last_inbound_at, last_outbound_at, awaiting_reply_since, first_response_at, first_response_message_id, first_response_source, is_ack_only';

// ── Outcomes and the error classifier ──────────────────────────────────────

export type DeskDbOutcome = 'ok' | 'conflict' | 'not_installed' | 'timeout' | 'error';

export type DeskDb<T> =
    | { outcome: 'ok'; data: T }
    | { outcome: Exclude<DeskDbOutcome, 'ok'>; data: null };

interface DeskDbErrorLike { code?: string | null; name?: string | null; message?: string | null }

const NOT_INSTALLED_CODES: readonly string[] = ['42P01', '42703', '42501', 'PGRST204', 'PGRST205'];
const TIMEOUT_NAMES: readonly string[] = ['AbortError', 'TimeoutError'];
const TIMEOUT_MESSAGE_PREFIXES: readonly string[] = ['AbortError:', 'TimeoutError:'];

/** supabase-js never throws on a database error and its error object has no class name: the name is a message prefix. */
export function classifyDeskDbError(error: DeskDbErrorLike | null | undefined): DeskDbOutcome {
    if (!error) return 'ok';
    const code = error.code ?? '';
    if (code === '23505') return 'conflict';
    if (NOT_INSTALLED_CODES.includes(code)) return 'not_installed';
    if (TIMEOUT_NAMES.includes(error.name ?? '')) return 'timeout';
    const message = error.message ?? '';
    if (TIMEOUT_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))) return 'timeout';
    return 'error';
}

const reportedNotInstalled = new Set<string>();

/** Log once per server instance per table and code. Never logs data. */
export function reportNotInstalled(table: string, code: string): void {
    const key = `${table}:${code}`;
    if (reportedNotInstalled.has(key)) return;
    reportedNotInstalled.add(key);
    console.warn('[desk] not installed', key);
}

// ── Row types ──────────────────────────────────────────────────────────────

export type MessageRow = DeskMessageFacts & { ticket_id: string | null };

export interface ContactBrief { id: string; name: string | null; phone: string | null }

export interface ConversationRow {
    id: string;
    contact_id: string | null;
    integrated_number: string | null;
    contacts: ContactBrief | null;
}

export type EngineCategory = PreClassifyCategory & {
    default_resolution_code: string | null;
    deadline_rule: string | null;
};

export interface SettingRow { key: string; value: string | null }
export type TickSettingKey = 'desk_last_tick_at' | 'desk_last_tick_stats' | 'desk_staff_phones';

export type UnresolvedTicketRow = Pick<Ticket,
    'id' | 'status' | 'last_inbound_at' | 'category_slug' | 'suggested_type' | 'priority' | 'origin'>;

export type LatestResolvedRow = Pick<Ticket,
    'id' | 'opened_at' | 'resolved_by' | 'resolved_by_name' | 'resolution_note' | 'lost_reason'
    | 'reopen_count' | 'last_outbound_at' | 'origin'>
    & { resolved_at: IsoDateTime; resolution_code: ResolutionCode | null; resolved_via: ResolvedVia | null };

export type TicketClockRow = Pick<Ticket,
    'id' | 'conversation_id' | 'origin' | 'status' | 'opened_at' | 'last_reopened_at' | 'last_inbound_at'
    | 'last_outbound_at' | 'awaiting_reply_since' | 'first_response_at' | 'first_response_message_id'
    | 'first_response_source' | 'is_ack_only'>;

export type MirrorTicketRow = Pick<Ticket,
    'id' | 'conversation_id' | 'status' | 'last_inbound_at' | 'category_slug' | 'awaiting_reply_since' | 'origin'>;

export type ResolvedTicketRow = Pick<Ticket,
    'id' | 'status' | 'resolved_by' | 'resolved_by_name' | 'resolution_note' | 'lost_reason' | 'reopen_count'
    | 'last_outbound_at' | 'is_ack_only' | 'customer_phone' | 'origin'>
    & { resolved_at: IsoDateTime; resolution_code: ResolutionCode | null; resolved_via: ResolvedVia | null };

export interface OpenConversationRow {
    id: string;
    contact_id: string | null;
    integrated_number: string | null;
    created_at: IsoDateTime;
    last_incoming_timestamp: IsoDateTime;
    last_message: string | null;
    contacts: ContactBrief | null;
}

export type TicketStubRow = Pick<Ticket, 'id' | 'conversation_id' | 'status' | 'opened_at'>;

export type NewTicketRow = Partial<Omit<Ticket, 'id' | 'ticket_no'>> & { origin: Origin; opened_at: IsoDateTime };

export interface ReopenPatch {
    status: 'open' | 'new';
    resolved_at: null;
    resolved_by: null;
    resolved_by_name: null;
    resolution_code: null;
    resolution_note: null;
    resolved_via: null;
    lost_reason: null;
    prior_resolution: PriorResolution;
    reopen_count: number;
    last_reopened_at: IsoDateTime;
    last_inbound_at: IsoDateTime;
    awaiting_reply_since: IsoDateTime;
}

export interface SystemResolvePatch {
    status: 'resolved';
    resolved_at: IsoDateTime;
    resolved_by: null;
    resolved_by_name: null;
    resolution_code: ResolutionCode;
    resolution_note: null;
    resolved_via: ResolvedVia;
    lost_reason: null;
    follow_up_at: null;
    hold_reason: null;
    awaiting_reply_since: null;
}

/** The internal close also classifies the ticket: category internal, type other (plan section 8). */
export interface InternalResolvePatch extends SystemResolvePatch {
    category_slug: 'internal';
    type: 'other';
    classified_at: IsoDateTime;
    classified_by: null;
    classification_source: null;
}

export type ResolveGuard =
    | { kind: 'idle'; idleCutoffIso: string }
    | { kind: 'ack'; ackCutoffIso: string }
    | { kind: 'mirror'; readLastInboundAt: string | null }
    | { kind: 'internal' };

/** An unresolved, non-manual ticket of an internal phone (tick step "internal"). */
export type InternalTicketRow = Pick<Ticket, 'id' | 'status' | 'customer_phone' | 'origin'>;
export type ContactFlagRow = Pick<ContactFlag, 'phone' | 'kind'>;

export interface FirstResolutionValues {
    first_resolved_at: IsoDateTime;
    first_resolved_by: StaffId | null;
    first_resolved_code: ResolutionCode;
}

export type DerivedPatch = Partial<Pick<Ticket,
    'last_inbound_at' | 'last_outbound_at' | 'awaiting_reply_since' | 'first_response_at'
    | 'first_response_message_id' | 'first_response_source' | 'first_response_by' | 'is_ack_only' | 'status'>>;

export interface NewEvent {
    ticket_id: string;
    type: EventType;
    from_status: TicketStatus | null;
    to_status: TicketStatus | null;
    actor_id: string;
    actor_name: string;
    data: EventDataMap[EventType];
}

export const PROBE_TARGETS = [
    'desk_categories', 'desk_tickets', 'desk_ticket_events', 'desk_ticket_actions', 'desk_action_items',
    'messages.ticket_id', 'messages.sent_by_user_id', 'messages.sent_by_name',
] as const;
export type ProbeTarget = (typeof PROBE_TARGETS)[number];

// ── The repository ─────────────────────────────────────────────────────────
// "rows" = the number of rows a write that ends in .select(...) returned. Every method resolves
// (never rejects) and classifies its error with classifyDeskDbError. There is deliberately no
// method that writes conversations, contacts, an app_lms table or a messages column other than
// ticket_id.

export interface DeskRepo {
    readSettingRows(): Promise<DeskDb<SettingRow[]>>;
    writeTickSetting(key: TickSettingKey, value: string): Promise<DeskDb<number>>;
    probe(target: ProbeTarget): Promise<DeskDb<true>>;
    probeWrite(): Promise<DeskDb<true>>;

    /** excludeConversationIds: internal conversations (risk R-E1); messages without a conversation stay included. */
    listUnticketedInbound(
        afterIso: string, beforeIso: string, limit: number, excludeConversationIds: readonly string[],
    ): Promise<DeskDb<MessageRow[]>>;
    getConversation(conversationId: string): Promise<DeskDb<ConversationRow | null>>;
    listActiveCategories(): Promise<DeskDb<EngineCategory[]>>;
    findKnownCustomer(phones: readonly string[]): Promise<DeskDb<{ backend_user_id: number } | null>>;

    getUnresolvedTicket(conversationId: string): Promise<DeskDb<UnresolvedTicketRow | null>>;
    getLatestResolvedTicket(conversationId: string): Promise<DeskDb<LatestResolvedRow | null>>;
    listConversationMessages(
        conversationId: string, fromIso: string, limit: number, offset: number,
    ): Promise<DeskDb<MessageRow[]>>;
    getTicketClock(ticketId: string): Promise<DeskDb<TicketClockRow | null>>;

    insertTicket(row: NewTicketRow): Promise<DeskDb<{ id: string; ticket_no: number }>>;
    touchInbound(id: string, readLastInboundAt: string | null, next: string): Promise<DeskDb<number>>;
    reopenTicket(id: string, readResolvedAt: string, patch: ReopenPatch): Promise<DeskDb<number>>;
    resolveSystem(id: string, patch: SystemResolvePatch | InternalResolvePatch, guard: ResolveGuard): Promise<DeskDb<number>>;
    writeFirstResolution(id: string, values: FirstResolutionValues): Promise<DeskDb<number>>;
    claimMessage(messageId: string, ticketId: string): Promise<DeskDb<number>>;
    writeDerived(
        read: { id: string; status: TicketStatus; last_inbound_at: string | null }, patch: DerivedPatch,
    ): Promise<DeskDb<number>>;
    insertEvent(event: NewEvent): Promise<DeskDb<true>>;
    writeSuggestion(
        id: string, values: { suggested_type: string | null; suggested_category: string | null },
    ): Promise<DeskDb<number>>;
    raisePriority(id: string, priority: number): Promise<DeskDb<number>>;

    listActiveConversationIds(sinceIso: string, limit: number): Promise<DeskDb<string[]>>;
    listFailedOutboundConversationIds(sinceIso: string, limit: number): Promise<DeskDb<string[]>>;
    listUnresolvedTicketIds(conversationIds: readonly string[]): Promise<DeskDb<string[]>>;

    listUnresolvedForMirror(limit: number): Promise<DeskDb<MirrorTicketRow[]>>;
    listResolvedConversationIds(conversationIds: readonly string[]): Promise<DeskDb<string[]>>;
    listTicketedInboundSince(
        sinceIso: string, limit: number,
    ): Promise<DeskDb<Array<{ id: string; ticket_id: string; created_at: string }>>>;
    listResolvedTicketsByIds(ids: readonly string[]): Promise<DeskDb<ResolvedTicketRow[]>>;
    listSuppressedAckMessageIds(ticketId: string): Promise<DeskDb<string[]>>;

    listOpenConversationsWithIncoming(
        lowerIso: string, upperIso: string, limit: number, offset: number,
    ): Promise<DeskDb<OpenConversationRow[]>>;
    listNewestInbound(
        conversationIds: readonly string[], sinceIso: string, limit: number,
    ): Promise<DeskDb<Array<{ conversation_id: string; created_at: string }>>>;
    listTicketsForConversations(
        conversationIds: readonly string[], limit: number,
    ): Promise<DeskDb<TicketStubRow[]>>;

    listDueFollowUpIds(nowIso: string, limit: number): Promise<DeskDb<string[]>>;
    listIdleCandidateIds(idleCutoffIso: string, limit: number): Promise<DeskDb<string[]>>;
    listAckLaneCandidateIds(ackCutoffIso: string, limit: number): Promise<DeskDb<string[]>>;
    listCutoffWatchIds(beforeCutoffSlugs: readonly string[], limit: number): Promise<DeskDb<string[]>>;

    listOrphans(
        afterIso: string, beforeIso: string, limit: number, excludeConversationIds: readonly string[],
    ): Promise<DeskDb<Array<{ id: string; created_at: string }>>>;
    listFailedPanelReplyIds(sinceIso: string, limit: number): Promise<DeskDb<string[]>>;

    // Slice 2 · P1e — internal contacts
    /** Active rows of desk_contact_flags (removed_at IS NULL), at most 5000. */
    readContactFlags(): Promise<DeskDb<ContactFlagRow[]>>;
    /** Conversations whose contact phone is one of `phones` (10-digit, every stored form is asked for)
     *  with a customer message after `sinceIso`; newest first, at most `limit`. */
    listInternalConversationIds(phones: readonly string[], sinceIso: string, limit: number): Promise<DeskDb<string[]>>;
    /** Unresolved tickets with origin <> 'manual' whose customer_phone is one of `whatsAppPhones` (91 + 10 digits). */
    listUnresolvedTicketsForPhones(whatsAppPhones: readonly string[], limit: number): Promise<DeskDb<InternalTicketRow[]>>;
}

// ── Pure helpers shared by the engine, the lifecycle steps and the runner ─────

export function newStepBase(): DeskTickStepBase {
    return { ok: true, timed_out: false, errors: 0, not_installed: false };
}

export function markTimedOut(base: DeskTickStepBase): void {
    base.timed_out = true;
    base.ok = false;
}

/** Folds a call outcome into the step's counters. Returns false when the step must stop. */
export function trackOutcome(base: DeskTickStepBase, outcome: DeskDbOutcome): boolean {
    if (outcome === 'not_installed') {
        base.not_installed = true;
        base.ok = false;
        return false;
    }
    if (outcome === 'timeout') {
        base.errors += 1;
        markTimedOut(base);
    } else if (outcome === 'error') {
        base.errors += 1;
    }
    return true;
}

export const wholeSeconds = (fromIso: string, toMs: number): number =>
    Math.round((toMs - Date.parse(fromIso)) / 1000);

function digitsOrNull(value: string | null | undefined): string | null {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits === '' ? null : digits;
}

/** customer_phone / customer_name of a new ticket, from the conversation's contact. */
export function contactFields(
    contact: ConversationRow['contacts'],
): { customer_phone: string | null; customer_name: string | null } {
    return {
        customer_phone: toWhatsAppPhone(contact?.phone) ?? digitsOrNull(contact?.phone),
        customer_name: contact?.name ?? null,
    };
}

type ResolvedFields = Pick<LatestResolvedRow,
    'resolved_at' | 'resolved_by' | 'resolved_by_name' | 'resolution_code' | 'resolution_note' | 'resolved_via'
    | 'lost_reason' | 'reopen_count' | 'last_outbound_at'>;

/** The seven resolution columns are copied to prior_resolution before they are cleared. */
export function buildReopenPatch(resolved: ResolvedFields, atIso: IsoDateTime): ReopenPatch {
    const prior: PriorResolution = {
        resolved_at: resolved.resolved_at,
        resolved_by: resolved.resolved_by,
        resolved_by_name: resolved.resolved_by_name,
        resolution_code: resolved.resolution_code ?? 'closed_unclassified',
        resolution_note: resolved.resolution_note,
        resolved_via: resolved.resolved_via ?? 'migration',
        lost_reason: resolved.lost_reason,
    };
    return {
        status: resolved.last_outbound_at !== null ? 'open' : 'new',
        resolved_at: null, resolved_by: null, resolved_by_name: null, resolution_code: null,
        resolution_note: null, resolved_via: null, lost_reason: null,
        prior_resolution: prior,
        reopen_count: resolved.reopen_count + 1,
        last_reopened_at: atIso, last_inbound_at: atIso, awaiting_reply_since: atIso,
    };
}

const MS_PER_HOUR = 3_600_000;

export const sameInstant = (a: string | null, b: string | null): boolean =>
    a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

export const isLater = (candidate: string, than: string | null): boolean =>
    than === null || Date.parse(candidate) > Date.parse(than);

export function asTicketType(value: string | null): TicketType | null {
    return (TICKET_TYPES as readonly string[]).includes(value ?? '') ? (value as TicketType) : null;
}

export function isInsideWindow(messageAt: string, resolvedAt: string, windowHours: number): boolean {
    const elapsed = Date.parse(messageAt) - Date.parse(resolvedAt);
    return windowHours > 0 && Number.isFinite(elapsed) && elapsed <= windowHours * MS_PER_HOUR;
}

export function reopenReason(message: MessageRow, resolvedAt: string, isAck: boolean): ReopenReason {
    if (isAck) return 'ack';
    return Date.parse(message.created_at) <= Date.parse(resolvedAt) ? 'unseen_message' : 'customer_message';
}

/** Stands for the customer message that was never stored, so the ticket keeps an awaiting clock. */
export function syntheticInbound(openedAt: string): MessageRow {
    return {
        id: '', direction: 'inbound', content_type: 'text', status: null, source: null, template_name: null,
        is_internal_note: null, body: null, created_at: openedAt, ticket_id: null,
    };
}

/** Only the fields that differ from the stored row; status only when it is system-set. */
export function buildDerivedPatch(
    ticket: TicketClockRow, clock: TicketClock, ackOnly: boolean,
): DerivedPatch {
    const patch: DerivedPatch = {};
    if (!sameInstant(ticket.last_inbound_at, clock.last_inbound_at)) patch.last_inbound_at = clock.last_inbound_at;
    if (!sameInstant(ticket.last_outbound_at, clock.last_outbound_at)) patch.last_outbound_at = clock.last_outbound_at;
    if (!sameInstant(ticket.awaiting_reply_since, clock.awaiting_reply_since)) {
        patch.awaiting_reply_since = clock.awaiting_reply_since;
    }
    if (!sameInstant(ticket.first_response_at, clock.first_response_at)) patch.first_response_at = clock.first_response_at;
    if (ticket.first_response_message_id !== clock.first_response_message_id) {
        patch.first_response_message_id = clock.first_response_message_id;
        patch.first_response_by = null;
    }
    if (ticket.first_response_source !== clock.first_response_source) patch.first_response_source = clock.first_response_source;
    if (ticket.is_ack_only !== ackOnly) patch.is_ack_only = ackOnly;
    const systemSet = (SYSTEM_SET_STATUSES as readonly string[]).includes(ticket.status);
    if (systemSet && ticket.status !== clock.status) patch.status = clock.status;
    return patch;
}

/** The row for a ticket opened by a stored customer message. */
export function buildTicketRow(
    conversation: ConversationRow, message: MessageRow, isAck: boolean,
    result: Pick<PreClassifyResult, 'queue' | 'priority' | 'suggested_type' | 'suggested_category'>,
    previousTicketId: string | null, known: { backend_user_id: number } | null,
): NewTicketRow {
    return {
        channel: 'whatsapp',
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        integrated_number: conversation.integrated_number,
        origin: 'inbound',
        previous_ticket_id: previousTicketId,
        ...contactFields(conversation.contacts),
        queue: result.queue,
        priority: result.priority,
        suggested_type: asTicketType(result.suggested_type),
        suggested_category: result.suggested_category,
        is_ack_only: isAck,
        status: 'new',
        opened_at: message.created_at,
        last_inbound_at: message.created_at,
        awaiting_reply_since: message.created_at,
        ...(known ? { backend_user_id: known.backend_user_id, customer_match: 'exact' as const } : {}),
    };
}
