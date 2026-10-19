/**
 * The morning review: the window, the stable sample order (FNV-1a) and the seven blocks over the
 * synthetic fixture of spec section 8.3 for two review dates.
 */

import { describe, expect, it } from 'vitest';
import { istToday } from '@/lib/desk/business-hours';
import { buildDeskReview, fnv1a32, reviewWindow, sampleRank } from '@/lib/desk/review-report';
import { LIST_MAX_LIMIT } from '@/lib/desk/constants';
import { NOW, SETTINGS, ist, reviewInput, toItem, T4 } from './fixtures/p6a';

describe('reviewWindow', () => {
    it.each([
        ['2026-10-14', '2026-10-12T18:30:00.000Z', '2026-10-14T04:30:00.000Z', false],
        ['2026-10-13', '2026-10-11T18:30:00.000Z', '2026-10-13T18:30:00.000Z', false],
        ['2026-10-16', '2026-10-14T18:30:00.000Z', '2026-10-14T04:30:00.000Z', true],
    ])('RW %s', (date, from, to, empty) => {
        expect(reviewWindow(date, NOW)).toEqual({ from, to, empty });
    });

    it('RW4 the default date just after IST midnight is the new IST day', () => {
        expect(istToday(new Date('2026-10-13T19:00:00.000Z'))).toBe('2026-10-14');
    });
});

describe('sample order', () => {
    it('SR1 FNV-1a of "" and "a"', () => {
        expect(fnv1a32('')).toBe(2166136261);
        expect(fnv1a32('a')).toBe(3826002220);
    });

    it('SR2 sampleRank values', () => {
        expect(sampleRank(102, '2026-10-13')).toBe(1440645158);
        expect(sampleRank(101, '2026-10-13')).toBe(2239769217);
        expect(sampleRank(102, '2026-10-14')).toBe(1055160772);
    });

    const firstFive = (date: string): number[] =>
        Array.from({ length: 12 }, (_unused, index) => 101 + index)
            .sort((a, b) => sampleRank(a, date) - sampleRank(b, date) || a - b)
            .slice(0, 5);

    it('SR3 order on 2026-10-13', () => {
        expect(firstFive('2026-10-13')).toEqual([108, 109, 107, 106, 102]);
    });

    it('SR4 order on 2026-10-14', () => {
        expect(firstFive('2026-10-14')).toEqual([110, 112, 104, 101, 102]);
    });

    it('SR5 order of three tickets', () => {
        expect([101, 102, 103].sort((a, b) => sampleRank(a, '2026-10-13') - sampleRank(b, '2026-10-13'))).toEqual([102, 101, 103]);
    });
});

const nos = (list: Array<{ ticket_no: number }>): number[] => list.map((item) => item.ticket_no);
const review13 = buildDeskReview(reviewInput('2026-10-13'));
const review14 = buildDeskReview(reviewInput('2026-10-14'));

describe('buildDeskReview, block by block', () => {
    it('B0 window', () => {
        expect(review13.window).toEqual({ date: '2026-10-13', from: '2026-10-11T18:30:00.000Z', to: '2026-10-13T18:30:00.000Z', truncated: false });
        expect(review14.window.to).toBe(NOW.toISOString());
    });

    it('B1 carry-over shows the state now, for either date', () => {
        for (const review of [review13, review14]) {
            expect(nos(review.carry_over.open_over_24h)).toEqual([104]);
            expect(nos(review.carry_over.on_hold)).toEqual([108]);
            expect(review.carry_over.action_items_due.map((item) => item.id)).toEqual([1]);
        }
    });

    it('B2 complaints by category', () => {
        const summary = (review: typeof review13) => review.complaints.map((group) =>
            [group.category_slug, group.n, group.per_1000, group.refund_total, nos(group.tickets)]);
        expect(summary(review13)).toEqual([['milk_spoilage', 2, 1, 64, [101, 102]], ['late_delivery', 1, 0.5, 50, [104]]]);
        expect(summary(review14)).toEqual([['late_delivery', 1, 0.5, 50, [104]]]);
        expect(review13.complaints[0].label).toBe('Milk spoiled / curdled');
    });

    it('B3 clusters', () => {
        expect(review13.clusters.product_date).toEqual([{
            key: '5', label: 'A2 Milk 500ml', n: 2, ticket_nos: [101, 102], category_group: 'product_quality', delivery_date: '2026-10-12',
        }]);
        expect(review13.clusters.driver).toEqual([{ key: '812', label: 'Ravi', n: 3, ticket_nos: [101, 102, 104] }]);
        expect(review13.clusters.drop_point).toEqual([{ key: '3', label: 'HSR Hub', n: 2, ticket_nos: [101, 102] }]);
        expect(review13.clusters.repeat_complainers).toHaveLength(1);
        expect(review13.clusters.repeat_complainers[0]).toMatchObject({ backend_user_id: 9001, n: 2, ticket_nos: [101, 102] });
        expect(review14.clusters).toEqual({ product_date: [], driver: [], drop_point: [], repeat_complainers: [] });
    });

    it('B4 money skips an action whose ticket is before stats_from', () => {
        expect(review13.money.map((row) => [row.ticket_no, row.category_slug, row.customer_name])).toEqual([
            [101, 'milk_spoilage', 'Meera'], [104, 'late_delivery', null],
        ]);
        expect(review14.money.map((row) => row.ticket_no)).toEqual([104]);
    });

    it('B5 sales', () => {
        const summary = (review: typeof review13) => ({
            opened: nos(review.sales.opened), won: nos(review.sales.won), lost: nos(review.sales.lost),
            awaiting_payment: nos(review.sales.awaiting_payment),
        });
        expect(summary(review13)).toEqual({ opened: [103, 108], won: [], lost: [], awaiting_payment: [103] });
        expect(summary(review14)).toEqual({ opened: [108], won: [], lost: [], awaiting_payment: [103] });
    });

    it('B6 sample leaves out a system close', () => {
        expect(nos(review13.sample)).toEqual([102]);
        expect(review14.sample).toEqual([]);
    });

    it('B7 health', () => {
        expect(review13.health.orphans_repaired).toBe(1);
        expect(review13.health.acks_suppressed).toEqual([
            { ticket_no: 101, text: 'ok thanks', mode: 'shadow', at: ist('2026-10-12', '06:30') },
        ]);
        expect(nos(review13.health.resolved_over_unseen)).toEqual([102]);
        expect(review13.health.unverified_actions).toBe(1);
        expect(review13.health.tick_stale).toBe(false);
        expect(review14.health).toMatchObject({ orphans_repaired: 1, acks_suppressed: [], resolved_over_unseen: [], unverified_actions: 1, tick_stale: false });
    });

    it.each([null, '2026-10-14T04:24:59.000Z'])('B8 a heartbeat of %s is stale', (lastTick) => {
        const stale = buildDeskReview(reviewInput('2026-10-14', { settings: { ...SETTINGS, last_tick_at: lastTick } }));
        expect(stale.health.tick_stale).toBe(true);
        expect(stale.health.last_tick_at).toBe(lastTick);
    });
});

describe('buildDeskReview, edges', () => {
    it('E1 a resolved event over an unanswered message counts as resolved over unseen', () => {
        const input = reviewInput('2026-10-13');
        const event = { id: 9, ticket_id: 't1', type: 'resolved' as const, created_at: ist('2026-10-12', '06:10'), data: { over_unanswered: true } };
        expect(nos(buildDeskReview({ ...input, events: [...input.events, event] }).health.resolved_over_unseen)).toEqual([101, 102]);
    });

    it('E2 an event of an unknown ticket is skipped', () => {
        const input = reviewInput('2026-10-13');
        const event = { id: 9, ticket_id: 'zzz', type: 'ack_suppressed' as const, created_at: ist('2026-10-13', '09:00'), data: { text: 'ok' } };
        expect(buildDeskReview({ ...input, events: [...input.events, event] }).health.acks_suppressed).toHaveLength(1);
    });

    it('E3 a list longer than the cap is cut and flags truncated', () => {
        const input = reviewInput('2026-10-13');
        const many = Array.from({ length: LIST_MAX_LIMIT + 5 }, (_unused, index) =>
            toItem({ ...T4, id: `x${index}`, ticket_no: 500 + index }));
        const cut = buildDeskReview({ ...input, openTickets: many });
        expect(cut.carry_over.open_over_24h).toHaveLength(LIST_MAX_LIMIT);
        expect(cut.window.truncated).toBe(true);
    });

    it('E4 the truncated flag of the reads is passed through', () => {
        expect(buildDeskReview(reviewInput('2026-10-13', { truncated: true })).window.truncated).toBe(true);
    });

    it('E5 no epoch gives empty blocks but still the tick state', () => {
        const empty = buildDeskReview(reviewInput('2026-10-13', { settings: { ...SETTINGS, stats_from: null, go_live_at: null } }));
        expect(empty.complaints).toEqual([]);
        expect(empty.sample).toEqual([]);
        expect(empty.health).toMatchObject({ last_tick_at: SETTINGS.last_tick_at, tick_stale: false });
    });

    it('E6 a date in the future has an empty window and no rows', () => {
        const future = buildDeskReview(reviewInput('2026-10-16'));
        expect(future.complaints).toEqual([]);
        expect(future.money).toEqual([]);
    });

    it('E7 inputs are not mutated', () => {
        const input = reviewInput('2026-10-13');
        const before = JSON.stringify(input);
        buildDeskReview(input);
        expect(JSON.stringify(input)).toBe(before);
    });
});

describe('buildDeskReview, internal / spam / wrong number (P1e)', () => {
    it('RX1 an internal ticket appears in no block', () => {
        const internalOpen = toItem({ ...T4, id: 't13', ticket_no: 113, origin: 'inbound', type: 'other', category_slug: 'internal', status: 'open', opened_at: ist('2026-10-12', '08:00') });
        const internalClosed = toItem({ ...T4, id: 't14', ticket_no: 114, origin: 'inbound', type: 'other', category_slug: 'internal', status: 'resolved', opened_at: ist('2026-10-13', '07:00'), resolved_at: ist('2026-10-13', '07:05'), resolved_via: 'manual', resolution_code: 'no_action', awaiting_reply_since: null });
        const base = reviewInput('2026-10-13');
        const review = buildDeskReview({
            ...base,
            windowTickets: [...base.windowTickets, internalClosed],
            openTickets: [...base.openTickets, internalOpen],
            resolvedTickets: [...base.resolvedTickets, internalClosed],
        });
        expect(review).toEqual(buildDeskReview(base));
    });
});
