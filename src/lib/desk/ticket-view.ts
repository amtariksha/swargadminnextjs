// Pure helpers behind the ticket list and detail routes: the attention clock computed at read time,
// the queue ordering and view membership, and the search-box cleaner. No I/O, no clock: `now` is
// an argument. Timestamps stay opaque strings; Date.parse is used only to compare them.

import { businessSecondsBetween } from './business-hours';
import type { TicketListView } from './contracts';
import type { DeskSettings, Ticket, TicketComputed } from './types';

type ClockFields = Pick<Ticket, 'status' | 'awaiting_reply_since' | 'follow_up_at'>;
type QueueFields = ClockFields & Pick<Ticket, 'assigned_to' | 'is_ack_only' | 'priority' | 'opened_at'> & TicketComputed;

const NOT_WAITING: TicketComputed = { attention_since: null, overdue: false, waiting_secs: null };

const instant = (value: string): number => Date.parse(value);

function earlier(awaiting: string | null, followUpDue: string | null): string | null {
    if (awaiting === null) return followUpDue;
    if (followUpDue === null) return awaiting;
    return instant(followUpDue) < instant(awaiting) ? followUpDue : awaiting;
}

export function computeTicketView<T extends ClockFields>(
    ticket: T,
    settings: Pick<DeskSettings, 'reply_alert_mins' | 'business_hours'>,
    now: Date,
): T & TicketComputed {
    if (ticket.status === 'resolved') return { ...ticket, ...NOT_WAITING };
    const followDue = ticket.follow_up_at !== null && instant(ticket.follow_up_at) <= now.getTime();
    const attention = earlier(ticket.awaiting_reply_since, followDue ? ticket.follow_up_at : null);
    const waitingTooLong = ticket.awaiting_reply_since !== null
        && businessSecondsBetween(ticket.awaiting_reply_since, now, settings.business_hours)
            > settings.reply_alert_mins * 60;
    return {
        ...ticket,
        attention_since: attention,
        overdue: followDue || waitingTooLong,
        waiting_secs: attention === null ? null : Math.floor((now.getTime() - instant(attention)) / 1000),
    };
}

/** attention_since ascending (nulls last), then priority ascending, then opened_at ascending. */
export function compareQueue(a: QueueFields, b: QueueFields): number {
    if (a.attention_since !== b.attention_since) {
        if (a.attention_since === null) return 1;
        if (b.attention_since === null) return -1;
        const byAttention = instant(a.attention_since) - instant(b.attention_since);
        if (byAttention !== 0) return byAttention;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    return instant(a.opened_at) - instant(b.opened_at);
}

export function inQueueView(ticket: QueueFields, view: TicketListView, actorId: string): boolean {
    if (ticket.status === 'resolved') return false;
    if (view === 'acks') return ticket.is_ack_only;
    if (ticket.is_ack_only) return false;
    if (view === 'all') return true;
    if (view === 'mine') return ticket.assigned_to === actorId || ticket.overdue;
    if (view === 'unassigned') return ticket.assigned_to === null || ticket.overdue;
    return false;
}

export type TicketSearch =
    | { kind: 'phone'; digits: string; ticketNo: number | null }
    | { kind: 'name'; text: string };

const SEARCH_UNSAFE = /[^\p{L}\p{M}\p{N} ]/gu;
const MIN_SEARCH_CHARS = 2;
const TICKET_NO_MAX_DIGITS = 7;

/** Keeps letters, combining marks (Kannada and Hindi vowel signs), digits and spaces; null = too short. */
export function parseTicketSearch(q: string): TicketSearch | null {
    const cleaned = q.replace(SEARCH_UNSAFE, '').replace(/ +/g, ' ').trim();
    if (cleaned.length < MIN_SEARCH_CHARS) return null;
    const compact = cleaned.replace(/ /g, '');
    if (/^[0-9]+$/.test(compact)) {
        return { kind: 'phone', digits: compact, ticketNo: compact.length <= TICKET_NO_MAX_DIGITS ? Number(compact) : null };
    }
    return { kind: 'name', text: cleaned };
}
