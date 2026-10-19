/**
 * buildDeskStats over the synthetic fixture of spec section 8.3, plus the imported median,
 * percentile and business-seconds functions checked against the vectors of sections 8.1 and 8.2.
 */

import { describe, expect, it } from 'vitest';
import { businessSecondsBetween } from '@/lib/desk/business-hours';
import { median, percentile } from '@/lib/desk/stats';
import { buildDeskStats, emptyDeskStats, STATS_TICKET_COLUMNS } from '@/lib/desk/stats-report';
import { HOURS, NOW, RANGE, SETTINGS, ist, statsInput, toMoneyRow, A3, T10 } from './fixtures/p6a';

describe('imported median and percentile', () => {
    it.each([
        [[], null, null],
        [[5], 5, 5],
        [[5, 9], 7, 9],
        [[1, 2, 4], 2, 4],
        [[60, 1800, 3600, 7200], 2700, 7200],
        [[120, 300, 300, 600, 1800], 300, 1800],
        [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6, 9],
        [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110], 60, 100],
    ])('MD %j', (values, expectedMedian, expectedP90) => {
        expect(median(values)).toBe(expectedMedian);
        expect(percentile(values, 90)).toBe(expectedP90);
    });
});

describe('imported businessSecondsBetween', () => {
    const weekdays = { ...HOURS, days: [1, 2, 3, 4, 5] };
    it.each([
        ['2026-10-12T05:10:00+05:30', '2026-10-12T05:40:00+05:30', HOURS, 600],
        ['2026-10-11T23:40:00.000Z', '2026-10-12T00:10:00.000Z', HOURS, 600],
        ['2026-10-12T23:50:00+05:30', '2026-10-12T23:55:00+05:30', HOURS, 0],
        ['2026-10-12T21:50:00+05:30', '2026-10-13T05:40:00+05:30', HOURS, 1200],
        ['2026-10-12T09:00:00+05:30', '2026-10-12T09:05:00+05:30', HOURS, 300],
        ['2026-10-14T08:30:00+05:30', '2026-10-14T04:30:00.000Z', HOURS, 5400],
        ['2026-10-12T10:00:00+05:30', '2026-10-12T09:00:00+05:30', HOURS, 0],
        ['2026-10-12T00:00:00+05:30', '2026-10-14T00:00:00+05:30', HOURS, 118800],
        ['2026-10-10T10:00:00+05:30', '2026-10-12T06:00:00+05:30', weekdays, 1800],
    ])('BS %s to %s', (start, end, hours, seconds) => {
        expect(businessSecondsBetween(start, end, hours)).toBe(seconds);
    });
});

const stats = buildDeskStats(statsInput());
const dim = (rows: Array<{ key: string | null; n: number; refund_total: number; per_1000: number | null; label: string | null }>) =>
    rows.map(({ key, label, n, refund_total, per_1000 }) => [key, label, n, refund_total, per_1000]);

describe('buildDeskStats, no queue filter', () => {
    it('S1 echoes the range', () => {
        expect(stats.range).toEqual({
            from: '2026-10-12', to: '2026-10-13', queue: null, stats_from: ist('2026-10-12', '00:00'),
            truncated: false, generated_at: NOW.toISOString(),
        });
    });

    it('S2 now: the open tickets after stats_from', () => {
        expect(stats.now).toEqual({
            awaiting: 2, oldest_wait_secs: 5400, over_alert: 2, open_over_24h: 1, on_hold: 1,
            oldest_hold_secs: 63000, unassigned: 2, wrap_up_backlog: 0,
        });
    });

    it('S3 volume counts, cohorted by the IST day a ticket was opened', () => {
        expect(stats.volume).toMatchObject({ opened: 7, resolved: 4, unclassified: 1 });
        expect(stats.volume.by_day).toEqual([
            { date: '2026-10-12', opened: 3, resolved: 3 },
            { date: '2026-10-13', opened: 4, resolved: 1 },
        ]);
        expect(stats.volume.by_type).toEqual({ complaint: 3, sales: 1, request: 1, enquiry: 0, other: 0 });
        expect(stats.volume.by_queue).toEqual({ care: 5, sales: 2 });
        expect(stats.volume.by_report_group).toEqual({ complaint: 3, sales: 2, other: 0 });
    });

    it('S4 first response', () => {
        expect(stats.first_response).toMatchObject({
            n: 5, median_secs: 300, p90_secs: 1800, business_median_secs: 300, unattributed: 2,
        });
        expect(stats.first_response.by_exec.map((row) => [row.actor_id, row.actor_name, row.n, row.median_secs, row.p90_secs])).toEqual([
            ['7', 'Asha', 2, 450, 600], [null, null, 2, 960, 1800], ['8', 'Bala', 1, 300, 300],
        ]);
    });

    it('S5 resolution', () => {
        expect(stats.resolution).toMatchObject({ n: 3, median_secs: 3600, p90_secs: 7200, net_median_secs: 1800 });
        expect(stats.resolution.by_via).toEqual({
            manual: 1, action: 2, auto_idle: 0, legacy_inbox: 0, system: 1, migration: 0, auto_converted: 0,
        });
        expect(Object.fromEntries(Object.entries(stats.resolution.by_code).filter(([, count]) => count > 0)))
            .toEqual({ refunded: 1, explained: 1, won: 1, no_action: 1 });
        expect(Object.keys(stats.resolution.by_code)).toHaveLength(15);
        expect(stats.resolution.by_exec.map((row) => [row.actor_id, row.actor_name, row.n, row.median_secs, row.p90_secs])).toEqual([
            ['7', 'Asha', 2, 5400, 7200], ['8', 'Bala', 1, 1800, 1800],
        ]);
    });

    it('S6 quality', () => {
        expect(stats.quality).toEqual({
            reopen_rate: 0.3333, recontact_72h_rate: 0.6667, classified_pct: 83.3, handled_in_desk_pct: 100,
            excluded_tickets: 1,
        });
    });

    it('S7 complaints: totals and the rate', () => {
        expect(stats.complaints).toMatchObject({ total: 3, deliveries: 2000, per_1000_deliveries: 1.5 });
    });

    it('S8 complaint breakdowns', () => {
        expect(dim(stats.complaints.by_category)).toEqual([
            ['milk_spoilage', 'Milk spoiled / curdled', 2, 64, 1], ['late_delivery', 'Late delivery', 1, 50, 0.5],
        ]);
        expect(dim(stats.complaints.by_group)).toEqual([
            ['product_quality', 'product_quality', 2, 64, 1], ['delivery', 'delivery', 1, 50, 0.5],
        ]);
        expect(dim(stats.complaints.by_driver)).toEqual([['812', 'Ravi', 3, 114, 20]]);
        expect(dim(stats.complaints.by_drop_point)).toEqual([['3', 'HSR Hub', 2, 64, null], [null, null, 1, 50, null]]);
        expect(dim(stats.complaints.by_pincode)).toEqual([['560102', '560102', 2, 64, null], ['560103', '560103', 1, 50, null]]);
        expect(dim(stats.complaints.by_product)).toEqual([['5', 'A2 Milk 500ml', 2, 64, 1.7], [null, null, 1, 50, null]]);
        expect(dim(stats.complaints.by_root_cause)).toEqual([[null, null, 2, 114, null], ['cold_chain', 'cold_chain', 1, 0, null]]);
    });

    it('S9 refunds only count tickets after stats_from', () => {
        expect(stats.refunds).toEqual({
            n: 2, total: 114, unverified_n: 1,
            by_category: [{ category_slug: 'milk_spoilage', n: 1, total: 64 }, { category_slug: 'late_delivery', n: 1, total: 50 }],
            by_exec: [
                { actor_id: '7', actor_name: 'Asha', n: 1, total: 64 },
                { actor_id: '8', actor_name: 'Bala', n: 1, total: 50 },
            ],
        });
    });

    it('S10 sales', () => {
        expect(stats.sales).toMatchObject({ opened: 2, won_paid: 0, won_unpaid: 1, lost: 0, order_value_total: 450 });
        expect(Object.values(stats.sales.lost_by_reason).every((count) => count === 0)).toBe(true);
        expect(Object.keys(stats.sales.lost_by_reason)).toHaveLength(8);
    });

    it('S11 repeat complainers', () => {
        expect(stats.repeat_complainers).toEqual([
            { backend_user_id: 9001, customer_phone: '919900000001', customer_name: 'Meera', n: 2, ticket_nos: [101, 102] },
        ]);
    });
});

describe('buildDeskStats, variants', () => {
    it('V1 queue sales', () => {
        const sales = buildDeskStats(statsInput({ range: { ...RANGE, queue: 'sales' } }));
        expect(sales.now).toMatchObject({
            awaiting: 0, oldest_wait_secs: null, over_alert: 0, open_over_24h: 0, on_hold: 0, oldest_hold_secs: null, unassigned: 1,
        });
        expect(sales.volume).toMatchObject({ opened: 2, resolved: 1, unclassified: 1 });
        expect(sales.first_response).toMatchObject({ n: 2, median_secs: 210, p90_secs: 300, business_median_secs: 60, unattributed: 1 });
        expect(sales.resolution).toMatchObject({ n: 1, median_secs: 1800, net_median_secs: 300 });
        expect(sales.quality).toEqual({ reopen_rate: 0, recontact_72h_rate: 0, classified_pct: 50, handled_in_desk_pct: 100, excluded_tickets: 0 });
        expect(sales.complaints.total).toBe(0);
        expect(sales.refunds.n).toBe(0);
        expect(sales.sales).toMatchObject({ opened: 1, won_unpaid: 1 });
        expect(sales.repeat_complainers).toEqual([]);
    });

    it('V2 no delivery counts: every rate is null and every count is unchanged', () => {
        const unrated = buildDeskStats(statsInput({ deliveryCounts: null }));
        expect(unrated.complaints).toMatchObject({ total: 3, deliveries: null, per_1000_deliveries: null });
        const rates = [
            ...unrated.complaints.by_category, ...unrated.complaints.by_group, ...unrated.complaints.by_driver,
            ...unrated.complaints.by_product,
        ].map((row) => row.per_1000);
        expect(rates.every((rateValue) => rateValue === null)).toBe(true);
        expect(unrated.complaints.by_category.map((row) => row.n)).toEqual([2, 1]);
    });

    it('V3 no status events: the net median is null and nothing else changes', () => {
        const noEvents = buildDeskStats(statsInput({ statusEvents: null }));
        expect(noEvents.resolution.net_median_secs).toBeNull();
        expect({ ...noEvents.resolution, net_median_secs: 1800 }).toEqual(stats.resolution);
    });

    it('V4 stats_from missing: the epoch falls back to go-live and the older ticket counts', () => {
        const fallback = buildDeskStats(statsInput({ settings: { ...SETTINGS, stats_from: null } }));
        expect(fallback.range.stats_from).toBe(ist('2026-10-10', '00:00'));
        expect(fallback.now).toMatchObject({ awaiting: 3, oldest_wait_secs: 223200, over_alert: 3, open_over_24h: 2, unassigned: 3 });
        expect(fallback.volume).toMatchObject({ opened: 7, resolved: 4 });
        expect(fallback.refunds).toMatchObject({ n: 3, total: 144 });
        expect(fallback.refunds.by_category).toContainEqual({ category_slug: null, n: 1, total: 30 });
        expect(fallback.refunds.by_exec.map((row) => [row.actor_id, row.n, row.total])).toEqual([['7', 2, 94], ['8', 1, 50]]);
    });

    it('V5 a money action whose ticket is only in actionTickets still counts', () => {
        const input = statsInput({
            tickets: statsInput().tickets.filter((ticket) => ticket.id !== 't10'),
            actionTickets: [{ id: T10.id, queue: 'care', category_slug: null, opened_at: T10.opened_at }],
            moneyActions: [A3].map(toMoneyRow),
            settings: { ...SETTINGS, stats_from: null },
        });
        expect(buildDeskStats(input).refunds).toMatchObject({ n: 1, total: 30 });
    });

    it('V6 neither stats_from nor go-live: the empty response', () => {
        const input = statsInput({ settings: { ...SETTINGS, stats_from: null, go_live_at: null } });
        const empty = buildDeskStats(input);
        expect(empty).toEqual(emptyDeskStats(RANGE, NOW));
        expect(empty.range.stats_from).toBeNull();
        expect(empty.volume.by_day).toEqual([
            { date: '2026-10-12', opened: 0, resolved: 0 }, { date: '2026-10-13', opened: 0, resolved: 0 },
        ]);
        expect(empty.first_response.median_secs).toBeNull();
        expect(empty.complaints.deliveries).toBeNull();
    });

    it('V7 the truncated flag is passed through', () => {
        expect(buildDeskStats(statsInput({ truncated: true })).range.truncated).toBe(true);
    });

    it('V8 inputs are not mutated', () => {
        const input = statsInput();
        const before = JSON.stringify(input);
        buildDeskStats(input);
        expect(JSON.stringify(input)).toBe(before);
    });

    it('V9 the column list matches the row type', () => {
        expect(new Set(STATS_TICKET_COLUMNS).size).toBe(STATS_TICKET_COLUMNS.length);
    });
});

describe('buildDeskStats, internal / spam / wrong number (P1e)', () => {
    const INTERNAL_OPEN = { ...T10, id: 't11', ticket_no: 111, opened_at: ist('2026-10-13', '12:00'), category_slug: 'internal', type: 'other' as const, status: 'open' as const, awaiting_reply_since: ist('2026-10-13', '12:00'), customer_phone: '919900000011' };
    const WRONG = { ...T10, id: 't12', ticket_no: 112, opened_at: ist('2026-10-12', '12:00'), category_slug: 'wrong_number', type: 'other' as const, status: 'resolved' as const, resolved_at: ist('2026-10-12', '12:01'), resolved_via: 'manual' as const, resolution_code: 'no_action' as const, resolved_by: '7', resolved_by_name: 'Asha', awaiting_reply_since: null };
    const input = statsInput({
        tickets: [...statsInput().tickets, INTERNAL_OPEN, WRONG],
        openTickets: [...statsInput().openTickets, INTERNAL_OPEN],
    });
    const withExcluded = buildDeskStats(input);

    it('X1 excluded tickets change no number except excluded_tickets', () => {
        expect(withExcluded.quality.excluded_tickets).toBe(3);
        expect({ ...withExcluded, range: stats.range, quality: { ...withExcluded.quality, excluded_tickets: 1 } }).toEqual(stats);
    });

    it('X2 a money action on an excluded ticket still counts as a refund', () => {
        const refundOnSpam = { ...A3, id: 9, ticket_id: 't12', created_at: ist('2026-10-12', '12:05') };
        const result = buildDeskStats(statsInput({
            tickets: [...statsInput().tickets, WRONG],
            moneyActions: [...statsInput().moneyActions, toMoneyRow(refundOnSpam)],
        }));
        expect(result.refunds).toMatchObject({ n: 3, total: 144 });
        expect(result.refunds.by_category).toContainEqual({ category_slug: 'wrong_number', n: 1, total: 30 });
    });
});
