// Complaint, refund, sales and repeat-complainer blocks of DeskStats. Pure.

import { LOST_REASONS } from './constants';
import { countBy, per1000 } from './stats';
import { compareKeys, findRepeatComplainers, isAtOrAfter, isNotDuplicateOrSpam, round2 } from './stats-helpers';
import type { StatsContext } from './stats-report-context';
import type { StatsTicketRow } from './stats-report';
import type { DeskStats, RepeatComplainer, StatsDim } from './types';

const UNPAID: readonly string[] = ['unpaid', 'link_sent'];

interface DimSpec {
    keyOf: (ticket: StatsTicketRow) => string | null;
    labelOf: (ticket: StatsTicketRow) => string | null;
    /** The number of deliveries (or units) the rate is per; null = no rate for this key. */
    base: (key: string) => number | null;
}

const NO_RATE = (): null => null;
const asKey = (value: number | string | null): string | null => (value === null ? null : String(value));

function dimension(ctx: StatsContext, spec: DimSpec): StatsDim[] {
    const groups = new Map<string | null, { n: number; refund: number; label: string | null }>();
    for (const ticket of ctx.complaints) {
        const key = spec.keyOf(ticket);
        const group = groups.get(key) ?? { n: 0, refund: 0, label: null };
        groups.set(key, {
            n: group.n + 1,
            refund: group.refund + (ctx.moneyByTicket.get(ticket.id) ?? 0),
            label: spec.labelOf(ticket) ?? group.label,
        });
    }
    return [...groups.entries()]
        .map(([key, group]) => ({
            key,
            label: key === null ? null : group.label,
            n: group.n,
            refund_total: round2(group.refund),
            per_1000: key === null ? null : per1000(group.n, spec.base(key)),
        }))
        .sort((a, b) => b.n - a.n || compareKeys(a.key, b.key));
}

function categoryOf(ctx: StatsContext, ticket: StatsTicketRow) {
    return ticket.category_slug === null ? undefined : ctx.categories.get(ticket.category_slug);
}

function dimensionSpecs(ctx: StatsContext): Record<keyof DeskStats['complaints'] & `by_${string}`, DimSpec> {
    const counts = ctx.deliveryCounts;
    const totalStops = (): number | null => counts?.total.stops ?? null;
    return {
        by_category: {
            keyOf: (ticket) => ticket.category_slug,
            labelOf: (ticket) => categoryOf(ctx, ticket)?.label ?? ticket.category_slug,
            base: totalStops,
        },
        by_group: {
            keyOf: (ticket) => categoryOf(ctx, ticket)?.category_group ?? null,
            labelOf: (ticket) => categoryOf(ctx, ticket)?.category_group ?? null,
            base: totalStops,
        },
        by_driver: {
            keyOf: (ticket) => asKey(ticket.driver_user_id),
            labelOf: (ticket) => ticket.driver_name,
            base: (key) => counts?.by_driver.find((driver) => String(driver.driver_id) === key)?.stops ?? null,
        },
        by_drop_point: { keyOf: (ticket) => asKey(ticket.drop_point_id), labelOf: (ticket) => ticket.drop_point_name, base: NO_RATE },
        by_pincode: { keyOf: (ticket) => ticket.pincode, labelOf: (ticket) => ticket.pincode, base: NO_RATE },
        by_product: {
            keyOf: (ticket) => asKey(ticket.product_id),
            labelOf: (ticket) => ticket.product_name,
            base: (key) => counts?.by_product.find((product) => String(product.product_id) === key)?.delivered_qty ?? null,
        },
        by_root_cause: { keyOf: (ticket) => ticket.root_cause, labelOf: (ticket) => ticket.root_cause, base: NO_RATE },
    };
}

export function buildComplaints(ctx: StatsContext): DeskStats['complaints'] {
    const specs = dimensionSpecs(ctx);
    const deliveries = ctx.deliveryCounts?.total.stops ?? null;
    return {
        total: ctx.complaints.length,
        deliveries,
        per_1000_deliveries: per1000(ctx.complaints.length, deliveries),
        by_category: dimension(ctx, specs.by_category),
        by_group: dimension(ctx, specs.by_group),
        by_driver: dimension(ctx, specs.by_driver),
        by_drop_point: dimension(ctx, specs.by_drop_point),
        by_pincode: dimension(ctx, specs.by_pincode),
        by_product: dimension(ctx, specs.by_product),
        by_root_cause: dimension(ctx, specs.by_root_cause),
    };
}

function sumBy<K extends string | null>(
    ctx: StatsContext,
    keyOf: (action: StatsContext['money'][number]) => K,
): Array<{ key: K; n: number; total: number }> {
    const groups = new Map<K, { n: number; total: number }>();
    for (const action of ctx.money) {
        const key = keyOf(action);
        const group = groups.get(key) ?? { n: 0, total: 0 };
        groups.set(key, { n: group.n + 1, total: group.total + action.amount });
    }
    return [...groups.entries()]
        .map(([key, group]) => ({ key, n: group.n, total: round2(group.total) }))
        .sort((a, b) => b.total - a.total || b.n - a.n || compareKeys(a.key, b.key));
}

export function buildRefunds(ctx: StatsContext): DeskStats['refunds'] {
    return {
        n: ctx.money.length,
        total: round2(ctx.money.reduce((sum, action) => sum + action.amount, 0)),
        unverified_n: ctx.money.filter((action) => action.verified === false).length,
        by_category: sumBy(ctx, (action) => ctx.ticketInfo.get(action.ticket_id)?.category_slug ?? null)
            .map(({ key, n, total }) => ({ category_slug: key, n, total })),
        by_exec: sumBy(ctx, (action) => action.actor_id ?? null)
            .map(({ key, n, total }) => ({
                actor_id: key,
                actor_name: key === null ? null : (ctx.names.get(key) ?? null),
                n,
                total,
            })),
    };
}

export function buildSales(ctx: StatsContext): DeskStats['sales'] {
    const sales = ctx.volume.filter((ticket) => categoryOf(ctx, ticket)?.report_group === 'sales');
    const won = sales.filter((ticket) => ticket.resolution_code === 'won');
    const lost = sales.filter((ticket) => ticket.resolution_code === 'lost');
    const unpaid = (ticket: StatsTicketRow): boolean => UNPAID.includes(ticket.payment_status ?? '');
    return {
        opened: sales.length,
        won_paid: won.filter((ticket) => !unpaid(ticket)).length,
        won_unpaid: won.filter(unpaid).length,
        lost: lost.length,
        order_value_total: round2(won.reduce((sum, ticket) => sum + Number(ticket.order_value ?? 0), 0)),
        lost_by_reason: countBy(lost.map((ticket) => ticket.lost_reason ?? 'other'), LOST_REASONS),
    };
}

export function buildRepeatComplainers(ctx: StatsContext): RepeatComplainer[] {
    const rows = ctx.input.complaintsWindow.filter((row) =>
        isAtOrAfter(row.opened_at, ctx.epoch)
        && (ctx.range.queue === null || row.queue === ctx.range.queue)
        && isNotDuplicateOrSpam(row.resolution_code));
    return findRepeatComplainers(rows, (row) => ctx.inRange(row.opened_at));
}
