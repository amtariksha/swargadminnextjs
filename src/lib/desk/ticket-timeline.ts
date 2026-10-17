// Pure: merges a ticket's events and actions into one ordered list of rows for the timeline.

import { formatIstDateTime, categoryLabel } from './ticket-format';
import {
    ACTION_TITLE, EVENT_TITLE, HOLD_REASON_LABEL, RESOLUTION_CODE_LABEL,
} from './ticket-labels';
import type { Category, TicketAction, TicketEvent } from './types';

export interface TimelineRow {
    key: string;
    at: string;
    kind: 'event' | 'action';
    title: string;
    detail: string | null;
    actor: string | null;
}

interface SortableRow {
    row: TimelineRow;
    atMs: number;
    kindRank: number;
    id: number;
}

function eventDetail(event: TicketEvent, bySlug: ReadonlyMap<string, Category>): string | null {
    switch (event.type) {
        case 'created':
            return `${event.data.origin}, via ${event.data.via}`;
        case 'reopened':
            return `reason: ${event.data.reason}`;
        case 'status_changed':
            return `${event.from_status ?? '—'} → ${event.to_status ?? '—'}`;
        case 'assigned':
            return `${event.data.to_name ?? 'unassigned'}${event.data.auto ? ' (automatic)' : ''}`;
        case 'suggested':
            return `${categoryLabel(event.data.suggested_category, bySlug)} (${event.data.source})`;
        case 'classified':
            return `${categoryLabel(event.data.category_slug, bySlug)}${event.data.after_resolution ? ' after resolution' : ''}`;
        case 'held':
            return `${HOLD_REASON_LABEL[event.data.hold_reason]} until ${formatIstDateTime(event.data.follow_up_at)}`;
        case 'resolved': {
            const base = `${RESOLUTION_CODE_LABEL[event.data.resolution_code]} (${event.data.resolved_via})`;
            return event.data.note ? `${base}: ${event.data.note}` : base;
        }
        case 'resolve_conflict':
            return 'A customer message arrived before the resolve.';
        case 'resolution_updated':
            return RESOLUTION_CODE_LABEL[event.data.resolution_code];
        case 'first_response':
            return event.data.source;
        case 'duplicate_marked':
            return `of #${event.data.duplicate_of_ticket_no}`;
        case 'escalated':
            return event.data.escalation_reason;
        default:
            return null;
    }
}

function eventRow(event: TicketEvent, bySlug: ReadonlyMap<string, Category>): SortableRow {
    return {
        atMs: Date.parse(event.created_at),
        kindRank: 0,
        id: event.id,
        row: {
            key: `e-${event.id}`,
            at: event.created_at,
            kind: 'event',
            title: EVENT_TITLE[event.type],
            detail: eventDetail(event, bySlug),
            actor: event.actor_name,
        },
    };
}

function actionRow(action: TicketAction): SortableRow {
    const amount = action.amount === null ? '' : ` ₹${action.amount}`;
    return {
        atMs: Date.parse(action.created_at),
        kindRank: 1,
        id: action.id,
        row: {
            key: `a-${action.id}`,
            at: action.created_at,
            kind: 'action',
            title: `${ACTION_TITLE[action.action_type]}${amount}`,
            detail: action.verified ? null : 'not verified',
            actor: action.actor_name,
        },
    };
}

/** Ordered by time; on a tie an event comes before an action, then the lower id first. */
export function buildTimeline(
    events: readonly TicketEvent[],
    actions: readonly TicketAction[],
    bySlug: ReadonlyMap<string, Category>,
): TimelineRow[] {
    const rows = [...events.map((event) => eventRow(event, bySlug)), ...actions.map(actionRow)];
    rows.sort((a, b) => a.atMs - b.atMs || a.kindRank - b.kindRank || a.id - b.id);
    return rows.map((entry) => entry.row);
}
