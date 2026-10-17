// Ticket clock: everything the queue needs to know about who is waiting for whom is derived
// from the stored messages of a conversation, never from counters. A missed hook, a failed
// send, a late delivery failure or a flipped echo therefore corrects itself on the next
// derivation. Timestamps are opaque strings: they are compared through Date.parse and returned
// exactly as received, because Postgres keeps microseconds and the callers use them as tokens.

import type { FirstResponseSource } from './constants';

/** The message shape every pure Desk function receives. */
export interface DeskMessageFacts {
    id: string;
    conversation_id?: string | null;
    direction: string;               // only 'inbound' and 'outbound' are meaningful
    content_type: string | null;
    status: string | null;
    source: string | null;
    template_name: string | null;
    is_internal_note: boolean | null;
    body: string | null;
    media_url?: string | null;
    created_at: string;              // the raw string PostgREST returned
}

/** The only column list the engine selects from public.messages. */
export const DESK_MESSAGE_COLUMNS =
    'id, conversation_id, direction, content_type, status, source, template_name, is_internal_note, body, media_url, created_at, ticket_id';

export const DESK_FAILED_STATUSES: readonly string[] = ['failed'];
export const DESK_NON_REPLY_CONTENT_TYPES: readonly string[] = ['template'];

export interface ClockTicket {
    opened_at: string;               // desk_tickets.opened_at
    last_reopened_at: string | null; // desk_tickets.last_reopened_at
}

export interface TicketClock {
    last_inbound_at: string | null;
    last_outbound_at: string | null;
    awaiting_reply_since: string | null;
    first_response_at: string | null;
    first_response_message_id: string | null;
    first_response_source: FirstResponseSource | null;
    status: 'new' | 'open' | 'waiting_customer';
}

const TEMPLATE_MARKERS = ['[Template]', '[Template:'];

function isParameterPayload(value: unknown): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && 'parameter_name' in value;
}

/** The same test as normalizeTemplateEcho in the MSG91 webhook: every value is a template parameter. */
function isTemplateParameterJson(text: string): boolean {
    if (!text.startsWith('{')) return false;
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Not JSON: an ordinary message that happens to start with a brace.
        return false;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    const values = Object.values(parsed);
    return values.length > 0 && values.every(isParameterPayload);
}

export function isTemplateBody(body: string | null | undefined): boolean {
    if (typeof body !== 'string') return false;
    const text = body.replace(/^\s+/, '');
    return TEMPLATE_MARKERS.some((marker) => text.startsWith(marker)) || isTemplateParameterJson(text);
}

function normalised(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
}

export function isHumanReply(message: DeskMessageFacts | null | undefined): boolean {
    if (!message || message.direction !== 'outbound') return false;
    if (message.is_internal_note === true) return false;
    if (DESK_FAILED_STATUSES.includes(normalised(message.status))) return false;
    if (DESK_NON_REPLY_CONTENT_TYPES.includes(normalised(message.content_type))) return false;
    if (normalised(message.template_name).length > 0) return false;
    if (isTemplateBody(message.body)) return false;
    return message.source !== 'broadcast';
}

/** Instant ascending; at the same instant outbound first (so the customer counts as later); then id. */
export function compareMessages(a: DeskMessageFacts, b: DeskMessageFacts): number {
    const byInstant = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (byInstant !== 0 && !Number.isNaN(byInstant)) return byInstant;
    if (a.direction !== b.direction) return a.direction === 'outbound' ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

function sortedWithin(messages: readonly DeskMessageFacts[], openedAt: string): DeskMessageFacts[] {
    const openedMs = Date.parse(openedAt);
    return messages
        .filter((message) => message.direction === 'inbound' || message.direction === 'outbound')
        .filter((message) => Date.parse(message.created_at) >= openedMs)
        .sort(compareMessages);
}

function systemStatus(hasReply: boolean, awaiting: string | null): TicketClock['status'] {
    if (!hasReply) return 'new';
    return awaiting === null ? 'waiting_customer' : 'open';
}

export function deriveTicketClock(messages: readonly DeskMessageFacts[], ticket: ClockTicket): TicketClock {
    const kept = sortedWithin(messages, ticket.opened_at);
    const inbound = kept.filter((message) => message.direction === 'inbound');
    const replies = kept.filter(isHumanReply);
    const firstInbound = inbound[0];
    const lastReply = replies[replies.length - 1];
    const floor = Date.parse(ticket.last_reopened_at ?? ticket.opened_at);
    const awaiting = inbound.find((message) => (
        Date.parse(message.created_at) >= floor && (!lastReply || compareMessages(message, lastReply) > 0)
    ));
    const firstResponse = replies.find((reply) => !firstInbound || compareMessages(reply, firstInbound) > 0);
    return {
        last_inbound_at: inbound.length > 0 ? inbound[inbound.length - 1].created_at : null,
        last_outbound_at: lastReply ? lastReply.created_at : null,
        awaiting_reply_since: awaiting ? awaiting.created_at : null,
        first_response_at: firstResponse ? firstResponse.created_at : null,
        first_response_message_id: firstResponse ? firstResponse.id : null,
        first_response_source: firstResponse ? (firstResponse.source === 'webapp' ? 'panel' : 'phone') : null,
        status: systemStatus(replies.length > 0, awaiting ? awaiting.created_at : null),
    };
}
