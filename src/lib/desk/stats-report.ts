// Pure builder of GET /api/desk/stats: ticket rows in, DeskStats out. No I/O, no clock (`now` is an
// argument) and no mutation of the input. One function per block of the response; the heavy blocks
// live in stats-report-timing.ts and stats-report-complaints.ts, the shared indexes in
// stats-report-context.ts. Day boundaries are IST dates, never UTC.

import { businessSecondsBetween } from './business-hours';
import {
    LOST_REASONS, QUEUES, RECONTACT_WINDOW_HOURS, REPORT_GROUPS, RESOLUTION_CODES, RESOLVED_VIA, TICKET_TYPES,
} from './constants';
import type { Queue } from './constants';
import { buildContext, type StatsContext } from './stats-report-context';
import { buildComplaints, buildRefunds, buildRepeatComplainers, buildSales } from './stats-report-complaints';
import { buildFirstResponse, buildResolution } from './stats-report-timing';
import { epochOf, isHumanResolved, isHumanVia, isInboundOrigin } from './stats-helpers';
import { countBy, istDatesInRange, pct, rate, volumeByIstDay } from './stats';
import type {
    Category, DeskSettings, DeskStats, IsoDateTime, IstDate, Ticket, TicketAction, TicketEvent,
} from './types';

// ── Rows and input ─────────────────────────────────────────────────────────

/** The columns a stats read selects from desk_tickets; the pure files never import the reader. */
export const STATS_TICKET_COLUMNS = [
    'id', 'ticket_no', 'origin', 'queue', 'type', 'category_slug', 'status', 'assigned_to', 'assigned_name',
    'opened_at', 'awaiting_reply_since', 'first_response_at', 'first_response_by', 'first_response_source',
    'follow_up_at', 'reopen_count', 'is_ack_only', 'resolved_at', 'resolved_by', 'resolved_by_name',
    'resolution_code', 'resolved_via', 'lost_reason', 'prior_resolution', 'root_cause',
    'customer_phone', 'customer_name', 'backend_user_id', 'driver_user_id', 'driver_name',
    'drop_point_id', 'drop_point_name', 'pincode', 'product_id', 'product_name', 'order_value', 'payment_status',
] as const satisfies readonly (keyof Ticket)[];
export type StatsTicketRow = Pick<Ticket, (typeof STATS_TICKET_COLUMNS)[number]>;
export type ComplaintRow = Pick<Ticket, 'id' | 'ticket_no' | 'queue' | 'customer_phone' | 'customer_name'
    | 'backend_user_id' | 'opened_at' | 'resolution_code'>;
export type MoneyActionRow = Pick<TicketAction, 'id' | 'ticket_id' | 'action_type' | 'amount' | 'verified'
    | 'actor_id' | 'actor_name' | 'created_at'>;
export type StatusEventRow = Pick<TicketEvent, 'id' | 'ticket_id' | 'type' | 'from_status' | 'to_status' | 'created_at'>;

/**
 * `data` of GET /api/support/delivery-counts (contract b-types-and-api.md, section 4.9). It is declared
 * here because the frozen types.ts of the earlier units does not export it.
 */
export interface DeliveryCounts {
    from: IstDate;
    to: IstDate;
    total: { stops: number; delivered_stops: number; not_delivered_stops: number; delivered_qty: number };
    by_day: Array<{ day: IstDate; stops: number; delivered_stops: number; not_delivered_stops: number; delivered_qty: number }>;
    by_driver: Array<{ driver_id: number; driver_name: string | null; stops: number; delivered_stops: number; not_delivered_stops: number; delivered_qty: number }>;
    by_product: Array<{ product_id: number; product_title: string | null; delivered_qty: number }>;
}

export interface StatsInput {
    now: Date;
    range: { from: IstDate; to: IstDate; queue: Queue | null };
    settings: Pick<DeskSettings, 'stats_from' | 'go_live_at' | 'reply_alert_mins' | 'business_hours'>;
    categories: Array<Pick<Category, 'slug' | 'label' | 'report_group' | 'category_group'>>;
    tickets: StatsTicketRow[];           // read S2: every queue, range start … range end + 72 h
    openTickets: StatsTicketRow[];       // read S3: unresolved, not ack-only
    wrapUpBacklog: number;               // read S4
    complaintsWindow: ComplaintRow[];    // read S5: complaints of the last 30 IST days
    moneyActions: MoneyActionRow[];      // read S6
    actionTickets: Array<Pick<Ticket, 'id' | 'queue' | 'category_slug' | 'opened_at'>>; // read S6b
    statusEvents: StatusEventRow[] | null; // read S7; null = not read, failed or capped
    heldAt: Record<string, IsoDateTime>;   // read S8: ticket id → newest `held` event time
    deliveryCounts: DeliveryCounts | null; // read S9
    truncated: boolean;
}

const MS_PER_SECOND = 1000;
const OPEN_TOO_LONG_SECS = 24 * 3600;
const MS_PER_HOUR = 3_600_000;

// ── Empty ──────────────────────────────────────────────────────────────────

export function emptyDeskStats(range: StatsInput['range'], now: Date): DeskStats {
    return {
        range: { ...range, stats_from: null, truncated: false, generated_at: now.toISOString() },
        now: {
            awaiting: 0, oldest_wait_secs: null, over_alert: 0, open_over_24h: 0,
            on_hold: 0, oldest_hold_secs: null, unassigned: 0, wrap_up_backlog: 0,
        },
        volume: {
            opened: 0, resolved: 0, unclassified: 0,
            by_day: istDatesInRange(range.from, range.to).map((date) => ({ date, opened: 0, resolved: 0 })),
            by_type: countBy([], TICKET_TYPES),
            by_queue: countBy([], QUEUES),
            by_report_group: countBy([], REPORT_GROUPS),
        },
        first_response: { n: 0, median_secs: null, p90_secs: null, business_median_secs: null, unattributed: 0, by_exec: [] },
        resolution: {
            n: 0, median_secs: null, p90_secs: null, net_median_secs: null,
            by_via: countBy([], RESOLVED_VIA), by_code: countBy([], RESOLUTION_CODES), by_exec: [],
        },
        quality: { reopen_rate: null, recontact_72h_rate: null, classified_pct: null, handled_in_desk_pct: null },
        complaints: {
            total: 0, deliveries: null, per_1000_deliveries: null, by_category: [], by_group: [], by_driver: [],
            by_drop_point: [], by_pincode: [], by_product: [], by_root_cause: [],
        },
        refunds: { n: 0, total: 0, unverified_n: 0, by_category: [], by_exec: [] },
        sales: {
            opened: 0, won_paid: 0, won_unpaid: 0, lost: 0, order_value_total: 0,
            lost_by_reason: countBy([], LOST_REASONS),
        },
        repeat_complainers: [],
    };
}

// ── Blocks ─────────────────────────────────────────────────────────────────

function buildNow(ctx: StatsContext): DeskStats['now'] {
    const { nowMs, now, settings, input } = ctx;
    const open = ctx.openTickets;
    const awaiting = open.filter((ticket) => ticket.awaiting_reply_since !== null);
    const waits = awaiting.map((ticket) => Math.max(0, Math.floor((nowMs - Date.parse(ticket.awaiting_reply_since ?? '')) / MS_PER_SECOND)));
    const onHold = open.filter((ticket) => ticket.status === 'on_hold');
    const holdAges = onHold
        .map((ticket) => input.heldAt[ticket.id])
        .filter((heldAt): heldAt is string => typeof heldAt === 'string')
        .map((heldAt) => Math.max(0, Math.floor((nowMs - Date.parse(heldAt)) / MS_PER_SECOND)));
    return {
        awaiting: awaiting.length,
        oldest_wait_secs: waits.length === 0 ? null : Math.max(...waits),
        over_alert: awaiting.filter((ticket) =>
            businessSecondsBetween(ticket.awaiting_reply_since ?? '', now, settings.business_hours) > settings.reply_alert_mins * 60).length,
        open_over_24h: open.filter((ticket) =>
            ticket.status !== 'on_hold' && (nowMs - Date.parse(ticket.opened_at)) / MS_PER_SECOND > OPEN_TOO_LONG_SECS).length,
        on_hold: onHold.length,
        oldest_hold_secs: holdAges.length === 0 ? null : Math.max(...holdAges),
        unassigned: open.filter((ticket) => ticket.assigned_to === null).length,
        wrap_up_backlog: input.wrapUpBacklog,
    };
}

function buildVolume(ctx: StatsContext): DeskStats['volume'] {
    const { volume } = ctx;
    // A ticket resolved later still counts under the day it was opened (cohort by opened date).
    const cohort = volume.map((ticket) => ({
        opened_at: ticket.opened_at,
        resolved_at: ticket.status === 'resolved' ? ticket.opened_at : null,
    }));
    const groupOf = (ticket: StatsTicketRow): string | null =>
        ticket.category_slug === null ? null : (ctx.categories.get(ticket.category_slug)?.report_group ?? null);
    return {
        opened: volume.length,
        resolved: ctx.resolved.length,
        unclassified: volume.filter((ticket) =>
            ticket.category_slug === null && !ticket.is_ack_only && ticket.resolved_via !== 'system').length,
        by_day: volumeByIstDay(cohort, ctx.range.from, ctx.range.to),
        by_type: countBy(volume.map((ticket) => ticket.type), TICKET_TYPES),
        by_queue: countBy(volume.map((ticket) => ticket.queue), QUEUES),
        by_report_group: countBy(volume.map(groupOf), REPORT_GROUPS),
    };
}

/** Candidate re-contacts by customer: opened instants of real inbound, non-ack tickets. */
function contactIndex(ctx: StatsContext): { byPhone: Map<string, number[]>; byUser: Map<number, number[]> } {
    const byPhone = new Map<string, number[]>();
    const byUser = new Map<number, number[]>();
    for (const ticket of ctx.keptTickets) {
        if (ticket.is_ack_only || !isInboundOrigin(ticket.origin)) continue;
        const openedMs = Date.parse(ticket.opened_at);
        if (ticket.customer_phone !== null) byPhone.set(ticket.customer_phone, [...(byPhone.get(ticket.customer_phone) ?? []), openedMs]);
        if (ticket.backend_user_id !== null) byUser.set(ticket.backend_user_id, [...(byUser.get(ticket.backend_user_id) ?? []), openedMs]);
    }
    return { byPhone, byUser };
}

function buildQuality(ctx: StatsContext): DeskStats['quality'] {
    const { volume } = ctx;
    const human = volume.filter(isHumanResolved);
    const index = contactIndex(ctx);
    const windowMs = RECONTACT_WINDOW_HOURS * MS_PER_HOUR;
    const contactedAfter = (ticket: StatsTicketRow): boolean => {
        const resolvedMs = ticket.resolved_at === null ? Number.NaN : Date.parse(ticket.resolved_at);
        if (Number.isNaN(resolvedMs)) return false;
        const later = [
            ...(ticket.customer_phone === null ? [] : (index.byPhone.get(ticket.customer_phone) ?? [])),
            ...(ticket.backend_user_id === null ? [] : (index.byUser.get(ticket.backend_user_id) ?? [])),
        ];
        return later.some((openedMs) => openedMs > resolvedMs && openedMs <= resolvedMs + windowMs);
    };
    const classifiable = volume.filter((ticket) => !ticket.is_ack_only && ticket.resolved_via !== 'system');
    const resolvedByPeople = ctx.resolved.filter((ticket) => ticket.resolved_via !== 'system' && ticket.resolved_via !== 'migration');
    return {
        reopen_rate: rate(human.filter((ticket) => ticket.reopen_count > 0).length, human.length),
        recontact_72h_rate: rate(human.filter((ticket) => ticket.reopen_count > 0 || contactedAfter(ticket)).length, human.length),
        classified_pct: pct(classifiable.filter((ticket) => ticket.category_slug !== null).length, classifiable.length),
        handled_in_desk_pct: pct(resolvedByPeople.filter((ticket) => isHumanVia(ticket.resolved_via)).length, resolvedByPeople.length),
    };
}

export function buildDeskStats(input: StatsInput): DeskStats {
    const epoch = epochOf(input.settings);
    if (epoch === null) return emptyDeskStats(input.range, input.now);
    const ctx = buildContext(input, epoch);
    return {
        range: { ...input.range, stats_from: epoch, truncated: input.truncated, generated_at: input.now.toISOString() },
        now: buildNow(ctx),
        volume: buildVolume(ctx),
        first_response: buildFirstResponse(ctx),
        resolution: buildResolution(ctx),
        quality: buildQuality(ctx),
        complaints: buildComplaints(ctx),
        refunds: buildRefunds(ctx),
        sales: buildSales(ctx),
        repeat_complainers: buildRepeatComplainers(ctx),
    };
}
