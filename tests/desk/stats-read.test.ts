/**
 * The read layer's pure-enough parts: fetchAllPaged (PG), the delivery-counts call (DC) and the
 * no-epoch short cut of readStatsInput / readReviewInput (NE). No database is touched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A plain function, not vi.fn(): vitest's call tracking would report a deliberate rejection as unhandled.
const backend = vi.hoisted(() => {
    const state = {
        calls: [] as Array<[string, string]>,
        answer: (() => Promise.resolve(new Response('{}'))) as () => Promise<Response>,
    };
    return {
        state,
        deskBackendGet: (path: string, token: string): Promise<Response> => {
            state.calls.push([path, token]);
            return state.answer();
        },
    };
});
vi.mock('@/lib/desk/backend', () => ({ deskBackendGet: backend.deskBackendGet }));

import { readReviewInput } from '@/lib/desk/review-read';
import { chunksOf, fetchAllPaged, fetchDeliveryCounts, readStatsInput, type PageFetcher } from '@/lib/desk/stats-read';
import type { DeskContext } from '@/lib/desk/types';
import { NOW, RANGE, SETTINGS } from './fixtures/p6a';

function server(total: number, perCall: number, failOnCall?: number) {
    const ranges: Array<[number, number]> = [];
    const fetchPage: PageFetcher<number> = async (from, to) => {
        ranges.push([from, to]);
        if (failOnCall !== undefined && ranges.length === failOnCall) return { data: null, error: { code: '42P01' } };
        const last = Math.min(to + 1, from + perCall, total);
        return { data: Array.from({ length: Math.max(0, last - from) }, (_unused, index) => from + index), error: null };
    };
    return { fetchPage, ranges };
}

describe('fetchAllPaged', () => {
    it.each([
        [0, 1000, 1, 0, false],
        [999, 1000, 2, 999, false],
        [1000, 1000, 2, 1000, false],
        [2500, 1000, 4, 2500, false],
        [2500, 500, 6, 2500, false],
        [25000, 1000, 20, 20000, true],
    ])('PG rows %i, server returns up to %i', async (total, perCall, calls, length, truncated) => {
        const { fetchPage, ranges } = server(total, perCall);
        const result = await fetchAllPaged(fetchPage);
        expect(ranges).toHaveLength(calls);
        expect(result).toMatchObject({ ok: true, truncated });
        expect(result.ok && result.rows).toHaveLength(length);
    });

    it('PG7 asks for the next range after the rows it received', async () => {
        const full = server(2500, 1000);
        await fetchAllPaged(full.fetchPage);
        expect(full.ranges[1]).toEqual([1000, 1999]);
        const capped = server(2500, 500);
        await fetchAllPaged(capped.fetchPage);
        expect(capped.ranges[1]).toEqual([500, 1499]);
    });

    it('PG8 a database error ends the read with no partial rows', async () => {
        const { fetchPage, ranges } = server(1500, 1000, 2);
        expect(await fetchAllPaged(fetchPage)).toEqual({ ok: false, outcome: 'not_installed' });
        expect(ranges).toHaveLength(2);
    });

    it('PG9 a rejected fetch is an outcome, not a throw', async () => {
        const result = await fetchAllPaged<number>(async () => { throw new Error('boom'); });
        expect(result).toEqual({ ok: false, outcome: 'error' });
    });

    it('PG10 the last range is cut to maxRows', async () => {
        const { fetchPage, ranges } = server(50, 1000);
        await fetchAllPaged(fetchPage, { pageSize: 30, maxRows: 40 });
        expect(ranges).toEqual([[0, 29], [30, 39]]);
    });
});

describe('chunksOf', () => {
    it('CH1 splits 250 ids into 100, 100 and 50', () => {
        expect(chunksOf(Array.from({ length: 250 }, (_unused, index) => index)).map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    });
});

const counts = {
    from: '2026-10-12', to: '2026-10-13',
    total: { stops: '2000', delivered_stops: 1900, not_delivered_stops: 100, delivered_qty: 2400 },
    by_day: [], by_driver: [{ driver_id: 812, driver_name: null, stops: 150, delivered_stops: 140, not_delivered_stops: 10, delivered_qty: '160' }],
    by_product: [{ product_id: 5, product_title: 'A2 Milk 500ml', delivered_qty: 1200 }],
};
const respond = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('fetchDeliveryCounts', () => {
    beforeEach(() => { backend.state.calls.length = 0; });

    it('DC1 reads the backend envelope and coerces NUMERIC strings', async () => {
        backend.state.answer = () => respond(200, { response: 200, status: true, message: 'ok', data: counts });
        const result = await fetchDeliveryCounts('tok', '2026-10-12', '2026-10-13');
        expect(backend.state.calls).toEqual([['/support/delivery-counts?from=2026-10-12&to=2026-10-13', 'tok']]);
        expect(result?.total.stops).toBe(2000);
        expect(result?.by_driver[0]).toMatchObject({ driver_id: 812, stops: 150, delivered_qty: 160 });
    });

    it.each([
        ['DC2 404 before the backend ships it', () => respond(404, { error: 'not found' })],
        ['DC3 a network error', () => Promise.reject(new Error('down'))],
        ['DC4 a body that does not parse', () => respond(200, { response: 200, data: { nope: true } })],
        ['DC5 an envelope that is not 200', () => respond(200, { response: 500, data: counts })],
        ['DC6 a body that is not JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ])('%s gives null and never throws', async (_id, answer) => {
        backend.state.answer = answer;
        expect(await fetchDeliveryCounts('tok', '2026-10-12', '2026-10-13')).toBeNull();
    });
});

const contextWithoutEpoch = { settings: { ...SETTINGS, stats_from: null, go_live_at: null }, token: 'tok' } as unknown as DeskContext;

describe('no epoch', () => {
    beforeEach(() => { backend.state.calls.length = 0; });

    it('NE1 readStatsInput reads nothing', async () => {
        const result = await readStatsInput(RANGE, contextWithoutEpoch, NOW);
        expect(result).toMatchObject({ ok: true, value: { tickets: [], openTickets: [], deliveryCounts: null } });
        expect(backend.state.calls).toEqual([]);
    });

    it('NE2 readReviewInput reads nothing', async () => {
        const result = await readReviewInput('2026-10-13', contextWithoutEpoch, NOW);
        expect(result).toMatchObject({ ok: true, value: { windowTickets: [], events: [] } });
        expect(backend.state.calls).toEqual([]);
    });
});
