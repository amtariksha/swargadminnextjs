// The synthetic fixture of unit P6a (spec section 8.3): ten tickets, five categories, ten status
// events and three money actions. Not a test file. All data is invented.

import type { ReviewEventRow, ReviewInput, ReviewTicketItem } from '@/lib/desk/review-report';
import { reviewWindow } from '@/lib/desk/review-report';
import { addIstDays, istDayStartUtc } from '@/lib/desk/business-hours';
import { epochOf } from '@/lib/desk/stats-helpers';
import type {
    ComplaintRow, DeliveryCounts, MoneyActionRow, StatsInput, StatsTicketRow, StatusEventRow,
} from '@/lib/desk/stats-report';
import type { ActionItem, BusinessHours, TicketAction } from '@/lib/desk/types';

export const ist = (date: string, hm: string): string => `${date}T${hm}:00+05:30`;
export const NOW = new Date('2026-10-14T04:30:00.000Z');
export const HOURS: BusinessHours = { start: '05:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] };
export const SETTINGS = {
    stats_from: ist('2026-10-12', '00:00') as string | null,
    go_live_at: ist('2026-10-10', '00:00') as string | null,
    reply_alert_mins: 15,
    business_hours: HOURS,
    last_tick_at: '2026-10-14T04:29:30.000Z' as string | null,
};
export const RANGE = { from: '2026-10-12', to: '2026-10-13', queue: null } as const;

const BASE: StatsTicketRow = {
    id: '', ticket_no: 0, origin: 'inbound', queue: 'care', type: null, category_slug: null, status: 'open',
    assigned_to: null, assigned_name: null, opened_at: '', awaiting_reply_since: null, first_response_at: null,
    first_response_by: null, first_response_source: null, follow_up_at: null, reopen_count: 0, is_ack_only: false,
    resolved_at: null, resolved_by: null, resolved_by_name: null, resolution_code: null, resolved_via: null,
    lost_reason: null, prior_resolution: null, root_cause: null, customer_phone: null, customer_name: null,
    backend_user_id: null, driver_user_id: null, driver_name: null, drop_point_id: null, drop_point_name: null,
    pincode: null, product_id: null, product_name: null, order_value: null, payment_status: null,
};
const row = (fields: Partial<StatsTicketRow>): StatsTicketRow => ({ ...BASE, ...fields });

const MEERA = {
    customer_phone: '919900000001', customer_name: 'Meera', backend_user_id: 9001,
    driver_user_id: 812, driver_name: 'Ravi', drop_point_id: 3, drop_point_name: 'HSR Hub',
    pincode: '560102', product_id: 5, product_name: 'A2 Milk 500ml',
};
const ASHA = { resolved_by: '7', resolved_by_name: 'Asha' };

export const T1 = row({
    ...MEERA, ...ASHA, id: 't1', ticket_no: 101, opened_at: ist('2026-10-12', '05:10'), type: 'complaint',
    category_slug: 'milk_spoilage', status: 'resolved', resolved_at: ist('2026-10-12', '06:10'), resolved_via: 'action',
    resolution_code: 'refunded', first_response_at: ist('2026-10-12', '05:40'), first_response_source: 'phone',
});
export const T2 = row({
    ...MEERA, ...ASHA, id: 't2', ticket_no: 102, opened_at: ist('2026-10-12', '09:00'), type: 'complaint',
    category_slug: 'milk_spoilage', status: 'resolved', resolved_at: ist('2026-10-12', '11:00'), resolved_via: 'manual',
    resolution_code: 'explained', first_response_at: ist('2026-10-12', '09:05'), first_response_by: '7',
    first_response_source: 'panel', reopen_count: 1, root_cause: 'cold_chain',
    prior_resolution: {
        resolved_at: ist('2026-10-12', '09:30'), resolved_by: '7', resolved_by_name: 'Asha', resolution_code: 'explained',
        resolution_note: null, resolved_via: 'manual', lost_reason: null,
    },
});
export const T3 = row({
    id: 't3', ticket_no: 103, opened_at: ist('2026-10-12', '23:50'), queue: 'sales', type: 'sales',
    category_slug: 'new_day_order', status: 'resolved', resolved_at: ist('2026-10-13', '00:20'), resolved_via: 'action',
    resolution_code: 'won', resolved_by: '8', resolved_by_name: 'Bala', first_response_at: ist('2026-10-12', '23:55'),
    first_response_by: '8', first_response_source: 'panel', customer_phone: '919900000002', order_value: 450,
    payment_status: 'link_sent',
});
export const T4 = row({
    id: 't4', ticket_no: 104, opened_at: ist('2026-10-13', '08:00'), origin: 'manual', type: 'complaint',
    category_slug: 'late_delivery', status: 'open', assigned_to: '7', assigned_name: 'Asha',
    awaiting_reply_since: ist('2026-10-14', '08:30'), customer_phone: '919900000003', driver_user_id: 812,
    driver_name: 'Ravi', pincode: '560103',
});
export const T5 = row({
    id: 't5', ticket_no: 105, opened_at: ist('2026-10-13', '10:00'), is_ack_only: true, status: 'resolved',
    resolved_at: ist('2026-10-13', '12:00'), resolved_via: 'system', resolution_code: 'no_action',
    customer_phone: '919900000006',
});
export const T6 = row({
    id: 't6', ticket_no: 106, opened_at: ist('2026-10-13', '11:00'), queue: 'sales', status: 'waiting_customer',
    first_response_at: ist('2026-10-13', '11:02'), first_response_source: 'phone', customer_phone: '919900000004',
});
export const T7 = row({
    id: 't7', ticket_no: 107, opened_at: ist('2026-10-13', '15:00'), type: 'other', category_slug: 'spam',
    status: 'resolved', resolved_at: ist('2026-10-13', '15:01'), resolved_via: 'manual', resolution_code: 'spam',
    ...ASHA, customer_phone: '919900000007',
});
export const T8 = row({
    id: 't8', ticket_no: 108, opened_at: ist('2026-10-13', '16:00'), type: 'request', category_slug: 'change_subscription',
    status: 'on_hold', follow_up_at: ist('2026-10-14', '08:30'), first_response_at: ist('2026-10-13', '16:10'),
    first_response_by: '7', first_response_source: 'panel', assigned_to: '7', assigned_name: 'Asha',
    customer_phone: '919900000005',
});
export const T9 = row({
    id: 't9', ticket_no: 109, opened_at: ist('2026-10-14', '09:00'), status: 'new',
    awaiting_reply_since: ist('2026-10-14', '09:00'), customer_phone: '919900000001', backend_user_id: 9001,
});
export const T10 = row({
    id: 't10', ticket_no: 100, opened_at: ist('2026-10-11', '20:00'), status: 'open',
    awaiting_reply_since: ist('2026-10-11', '20:00'), customer_phone: '919900000008',
});
export const TICKETS: StatsTicketRow[] = [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10];

export const CATEGORIES = [
    { slug: 'milk_spoilage', label: 'Milk spoiled / curdled', report_group: 'complaint', category_group: 'product_quality' },
    { slug: 'late_delivery', label: 'Late delivery', report_group: 'complaint', category_group: 'delivery' },
    { slug: 'new_day_order', label: 'New day order', report_group: 'sales', category_group: null },
    { slug: 'change_subscription', label: 'Change subscription', report_group: 'sales', category_group: null },
    { slug: 'spam', label: 'Spam', report_group: 'other', category_group: null },
] as const satisfies StatsInput['categories'];

const status = (id: number, ticket: string, type: StatusEventRow['type'], time: string, to: StatusEventRow['to_status']): StatusEventRow =>
    ({ id, ticket_id: ticket, type, from_status: null, to_status: to, created_at: time });
export const STATUS_EVENTS: StatusEventRow[] = [
    status(1, 't1', 'status_changed', ist('2026-10-12', '05:40'), 'waiting_customer'),
    status(2, 't1', 'resolved', ist('2026-10-12', '06:10'), null),
    status(3, 't2', 'status_changed', ist('2026-10-12', '09:05'), 'waiting_customer'),
    status(4, 't2', 'resolved', ist('2026-10-12', '09:30'), null),
    status(5, 't2', 'reopened', ist('2026-10-12', '09:45'), 'open'),
    status(6, 't2', 'status_changed', ist('2026-10-12', '10:00'), 'waiting_customer'),
    status(7, 't2', 'resolved', ist('2026-10-12', '11:00'), null),
    status(8, 't3', 'status_changed', ist('2026-10-12', '23:55'), 'waiting_customer'),
    status(9, 't3', 'resolved', ist('2026-10-13', '00:20'), null),
    status(10, 't7', 'resolved', ist('2026-10-13', '15:01'), null),
];
export const HELD_AT = { t8: ist('2026-10-13', '16:30') };

export const DELIVERY_COUNTS: DeliveryCounts = {
    from: '2026-10-12', to: '2026-10-13',
    total: { stops: 2000, delivered_stops: 1900, not_delivered_stops: 100, delivered_qty: 2400 },
    by_day: [],
    by_driver: [{ driver_id: 812, driver_name: 'Ravi', stops: 150, delivered_stops: 140, not_delivered_stops: 10, delivered_qty: 160 }],
    by_product: [{ product_id: 5, product_title: 'A2 Milk 500ml', delivered_qty: 1200 }],
};

const action = (
    id: number, ticket: string, kind: 'refund' | 'wallet_credit', amount: number, verified: boolean, time: string,
    actor: { id: string; name: string },
): TicketAction => {
    const base = {
        id, client_action_id: `c${id}`, ticket_id: ticket, ref_id: `r${id}`, amount, verified, resolved_ticket: false,
        actor_id: actor.id, actor_name: actor.name, created_at: time,
    };
    return kind === 'refund'
        ? {
            ...base, action_type: 'refund', ref_type: 'transaction',
            data: {
                debit_txn_id: 1, order_id: null, delivery_date: null, refund_reason: 'spoilage', billed_to_driver: false,
                billed_driver_id: null, driver_deduction_amount: null, new_wallet_balance: null,
            },
        }
        : { ...base, action_type: 'wallet_credit', ref_type: 'transaction', data: { user_id: 1, description: 'credit', payment_id: 'p' } };
};
export const A1 = action(1, 't1', 'refund', 64, true, ist('2026-10-12', '06:10'), { id: '7', name: 'Asha' });
export const A2 = action(2, 't4', 'wallet_credit', 50, false, ist('2026-10-13', '08:30'), { id: '8', name: 'Bala' });
export const A3 = action(3, 't10', 'refund', 30, true, ist('2026-10-12', '10:00'), { id: '7', name: 'Asha' });
export const ACTIONS: TicketAction[] = [A1, A2, A3];

export const toMoneyRow = (full: TicketAction): MoneyActionRow => ({
    id: full.id, ticket_id: full.ticket_id, action_type: full.action_type, amount: full.amount, verified: full.verified,
    actor_id: full.actor_id, actor_name: full.actor_name, created_at: full.created_at,
});
export const toComplaintRow = (ticket: StatsTicketRow): ComplaintRow => ({
    id: ticket.id, ticket_no: ticket.ticket_no, queue: ticket.queue, customer_phone: ticket.customer_phone,
    customer_name: ticket.customer_name, backend_user_id: ticket.backend_user_id, opened_at: ticket.opened_at,
    resolution_code: ticket.resolution_code,
});

export function statsInput(over: Partial<StatsInput> = {}): StatsInput {
    return {
        now: NOW,
        range: RANGE,
        settings: SETTINGS,
        categories: [...CATEGORIES],
        tickets: TICKETS,
        openTickets: TICKETS.filter((ticket) => ticket.status !== 'resolved'),
        wrapUpBacklog: 0,
        complaintsWindow: [T1, T2, T4].map(toComplaintRow),
        moneyActions: ACTIONS.map(toMoneyRow),
        actionTickets: [],
        statusEvents: STATUS_EVENTS,
        heldAt: HELD_AT,
        deliveryCounts: DELIVERY_COUNTS,
        truncated: false,
        ...over,
    };
}

// ── Review fixture ─────────────────────────────────────────────────────────

const DELIVERY_DATES: Record<string, string> = { t1: '2026-10-12', t2: '2026-10-12' };
const LIST_DEFAULTS = {
    channel: 'whatsapp', conversation_id: null, integrated_number: null, customer_match: null, priority: 3,
    suggested_type: null, suggested_category: null, last_inbound_at: null, last_outbound_at: null, hold_reason: null,
    escalated_at: null, escalation_reason: null, apartment_name: null, area: null, link_status: null,
    preventive_action: null, reviewed_at: null, review_note: null, attention_since: null, overdue: false,
    waiting_secs: null, preview: null, unread_count: 0,
} as const;

export const toItem = (ticket: StatsTicketRow): ReviewTicketItem => ({
    ...LIST_DEFAULTS, ...ticket, delivery_date: DELIVERY_DATES[ticket.id] ?? null,
});

export const REVIEW_EVENTS: ReviewEventRow[] = [
    { id: 1, ticket_id: 't2', type: 'reopened', created_at: ist('2026-10-12', '09:45'),
      data: { reason: 'unseen_message', message_id: null, prior_resolution: null } },
    { id: 2, ticket_id: 't6', type: 'created', created_at: ist('2026-10-13', '11:07'),
      data: { origin: 'inbound', via: 'tick', lag_secs: 400 } },
    { id: 3, ticket_id: 't7', type: 'created', created_at: ist('2026-10-13', '15:01'),
      data: { origin: 'inbound', via: 'tick', lag_secs: 95 } },
    { id: 4, ticket_id: 't1', type: 'ack_would_suppress', created_at: ist('2026-10-12', '06:30'),
      data: { message_id: 'm1', text: 'ok thanks' } },
];
export const ACTION_ITEM: ActionItem = {
    id: 1, ticket_id: null, title: 'Check the cold chain', detail: null, owner_id: null, owner_name: null,
    due_date: '2026-10-13', status: 'open', review_date: null, data: {}, created_by: null, created_by_name: null,
    created_at: ist('2026-10-12', '10:00'), updated_at: ist('2026-10-12', '10:00'), done_at: null, done_by: null,
    done_by_name: null, done_note: null,
};

const within = (instant: string | null, gte: string, lt: string): boolean =>
    instant !== null && Date.parse(instant) >= Date.parse(gte) && Date.parse(instant) < Date.parse(lt);

/** The input the reads of task 4 would produce for this date, derived from the fixture. */
export function reviewInput(date: string, over: Partial<ReviewInput> = {}): ReviewInput {
    const window = reviewWindow(date, NOW);
    const epoch = epochOf(SETTINGS) ?? '';
    const known = TICKETS.filter((ticket) => Date.parse(ticket.opened_at) >= Date.parse(epoch));
    const windowFrom = new Date(Math.max(Date.parse(window.from), Date.parse(epoch))).toISOString();
    const windowTickets = known.filter((ticket) => within(ticket.opened_at, windowFrom, window.to));
    const open = known.filter((ticket) => ticket.status !== 'resolved' && !ticket.is_ack_only);
    const resolved = known.filter((ticket) => within(ticket.resolved_at, window.from, window.to));
    const events = REVIEW_EVENTS.filter((event) => within(event.created_at, window.from, window.to));
    const actions = ACTIONS.filter((item) => within(item.created_at, window.from, window.to));
    const have = new Set([...windowTickets, ...open, ...resolved].map((ticket) => ticket.id));
    const wanted = new Set([...events.map((event) => event.ticket_id), ...actions.map((item) => item.ticket_id)]);
    const lookup = known.filter((ticket) => wanted.has(ticket.id) && !have.has(ticket.id));
    const complaintsFrom = istDayStartUtc(addIstDays(date, -29)).toISOString();
    return {
        now: NOW, date, settings: SETTINGS, categories: [...CATEGORIES],
        windowTickets: windowTickets.map(toItem), openTickets: open.map(toItem), resolvedTickets: resolved.map(toItem),
        lookupTickets: lookup.map(toItem),
        complaintsWindow: [T1, T2, T4].filter((ticket) => within(ticket.opened_at, complaintsFrom, window.to)).map(toComplaintRow),
        events, moneyActions: actions, actionItemsDue: [ACTION_ITEM], deliveryCounts: DELIVERY_COUNTS, truncated: false,
        ...over,
    };
}
