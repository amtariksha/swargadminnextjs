import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiUrl } from '@/config/tenant';
import { fetchCustomerSnapshot, SnapshotError } from '@/lib/desk/snapshot-client';
import { describeSnapshotFailure, parseSnapshotEnvelope, snapshotParseIssue } from '@/lib/desk/snapshot-schema';

const RAW = {
    canonical_phone: '9876543210',
    phone_variants: ['9876543210', '919876543210'],
    match: { kind: 'exact', user_id: 9001, candidates: [] },
    profile: {
        user_id: 9001, name: 'Meera', phone: '9876543210', email: null, channel_tag: 'app',
        is_b2b: false, alternate_phones: [], created_at: '2025-01-04 09:10:00',
    },
    wallet: { balance: 412.5, low_balance: false, low_balance_threshold: 180 },
    address: {
        address_id: 77, name: 'Meera', s_phone: '9876543210', flat_no: 'B-402', apartment_name: 'Prestige Lake',
        area: 'HSR Layout', landmark: null, city: 'Bengaluru', pincode: '560102', lat: 12.91, lng: 77.64,
    },
    driver: { user_id: 812, name: 'Ravi', phone: '9000000812' },
    drop_point: { id: 3, title: 'HSR Hub' },
    subscriptions: [{
        order_id: 5501, product_id: 5, product_title: 'A2 Milk', qty_text: '500 ml', variant_id: 11, qty: 2,
        subscription_type: 3, selected_days_for_weekly: null, order_type: 1, order_amount: 64,
        start_date: '2026-09-01', end_date: null, address_id: 77, state: 'active', created_at: '2026-08-30 18:00:00',
    }],
    holidays: [{ id: 41, date: '2026-10-20' }],
    last_order: { channel: 'app', id: 5501, created_at: '2026-08-30 18:00:00', title: 'A2 Milk 500 ml', amount: 64 },
    recent_deliveries: [{
        delivery_id: 70001, order_id: 5501, delivery_date: '2026-10-17', status: 3, qty: 2, product_id: 5,
        product_title: 'A2 Milk', qty_text: '500 ml', driver_user_id: 812, driver_name: 'Ravi',
        tap_time: '2026-10-17 07:42:10', usual_time: '07:10', late_by_min: 32, tap_distance_m: 140,
        marked_by: 'driver', reason_category: null, reason: null, debit_txn_id: 880001, debit_amount: 64,
        refunded: false, refund_txn_id: null, refund_amount: null,
    }],
    recent_day_orders: [{
        id: 3101, order_no: 1201, delivery_date: '2026-10-16', total_amount: 240, order_status: 'delivered',
        payment_status: 'paid', payment_mode: 'upi', payment_short_url: null, entry_type: 'whatsapp',
        items_text: 'Ghee 500 g × 1', delivery_status: 'delivered', delivered_at: '2026-10-16 15:20:00',
        created_at: '2026-10-16 10:05:00',
    }],
    recent_actions: [{
        kind: 'refund', ref_type: 'transaction', ref_id: '880050', amount: 64, at: '2026-10-17 09:12:00',
        summary: 'Refund ₹64 for 17 Oct (A2 Milk)',
    }],
    tomorrow: {
        date: '2026-10-18', list_generated: false, cutoff: '22:00', cutoff_passed: false,
        rows: [{ delivery_id: 70002, order_id: 5501, product_title: 'A2 Milk', qty: 2, status: 1 }],
    },
    generated_at: '2026-10-17 10:00:00',
};

const ok = (data: unknown) => ({ response: 200, status: true, message: 'successfully', data });

describe('parseSnapshotEnvelope', () => {
    it('S1 parses a full exact-match snapshot unchanged', () => {
        expect(parseSnapshotEnvelope(ok(RAW))).toEqual(RAW);
    });

    it('S2 accepts digit strings for numbers (node-postgres NUMERIC / BIGINT)', () => {
        const raw = {
            ...RAW,
            wallet: { ...RAW.wallet, balance: '412.50' },
            recent_deliveries: [{ ...RAW.recent_deliveries[0], debit_txn_id: '880001' }],
        };
        const parsed = parseSnapshotEnvelope(ok(raw));
        expect(parsed?.wallet?.balance).toBe(412.5);
        expect(parsed?.recent_deliveries[0]?.debit_txn_id).toBe(880001);
    });

    it('S3 parses a candidates answer with every customer block empty', () => {
        const candidate = {
            user_id: 9001, name: 'Meera', phone_tail: '3210', matched_on: 'phone', apartment_name: null,
            flat_no: null, area: null, is_staff: false,
        };
        const raw = {
            ...RAW,
            match: { kind: 'candidates', user_id: null, candidates: [candidate, { ...candidate, user_id: 9002 }] },
            profile: null, wallet: null, address: null, driver: null, drop_point: null, last_order: null,
            subscriptions: [], holidays: [], recent_deliveries: [], recent_day_orders: [], recent_actions: [],
        };
        expect(parseSnapshotEnvelope(ok(raw))?.match.candidates).toHaveLength(2);
    });

    it.each([
        ['response 201', { response: 201, status: true, data: RAW }],
        ['status false', { response: 200, status: false, data: RAW }],
        ['no data', { response: 200, status: true }],
        ['a string', 'oops'],
        ['null', null],
    ])('S4 returns null for %s', (_name, body) => {
        expect(parseSnapshotEnvelope(body)).toBeNull();
    });

    it('S5 rejects an out-of-range delivery status and names the field', () => {
        const raw = { ...RAW, recent_deliveries: [{ ...RAW.recent_deliveries[0], status: 4 }] };
        expect(parseSnapshotEnvelope(ok(raw))).toBeNull();
        expect(snapshotParseIssue(ok(raw))).toBe('data.recent_deliveries.0.status');
    });

    it('S5b an unknown day-order status drops only that row', () => {
        const odd = { ...RAW.recent_day_orders[0], id: 3102, delivery_status: 'not_delivered' };
        const raw = { ...RAW, recent_day_orders: [odd, RAW.recent_day_orders[0]] };
        expect(parseSnapshotEnvelope(ok(raw))?.recent_day_orders).toEqual(RAW.recent_day_orders);
    });

    it('S6 names the first failing field, and reports null for a valid body', () => {
        const withoutTomorrow = Object.fromEntries(Object.entries(RAW).filter(([key]) => key !== 'tomorrow'));
        expect(snapshotParseIssue(ok(withoutTomorrow))).toBe('data.tomorrow');
        expect(snapshotParseIssue(ok({ ...RAW, generated_at: '2026-10-17T10:00:00+05:30' }))).toBe('data.generated_at');
        expect(snapshotParseIssue(ok(RAW))).toBeNull();
    });
});

describe('describeSnapshotFailure', () => {
    it.each([
        ['F1', 0, null, 'network', 'Network error'],
        ['F2', 401, { message: 'Token expired' }, 'unauthorized', 'Token expired'],
        ['F3', 403, { statusCode: 403, code: 'desk_right_denied', message: 'Desk access required' }, 'forbidden', 'Desk access required'],
        ['F4', 404, null, 'not_deployed', 'HTTP 404'],
        ['F5', 429, { code: 'rate_limited', message: 'Too many requests', retry_after_seconds: 30 }, 'rate_limited', 'Too many requests'],
        ['F6', 422, { code: 'user_not_in_matches', message: 'User is not a match' }, 'user_not_in_matches', 'User is not a match'],
        ['F7', 400, { code: 'validation_failed', message: ['phone must have 8-15 digits'] }, 'validation_failed', 'phone must have 8-15 digits'],
        ['F8', 400, { code: 'Bad Code!', message: '' }, 'http_400', 'HTTP 400'],
        ['F9', 502, '<html>', 'backend_error', 'HTTP 502'],
    ])('%s maps status %i to a stable code and message', (_id, status, body, code, message) => {
        expect(describeSnapshotFailure(status, body)).toEqual({ code, message });
    });
});

describe('fetchCustomerSnapshot', () => {
    const fetchMock = vi.fn();
    afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

    function answer(status: number, body: unknown): void {
        vi.stubGlobal('fetch', fetchMock);
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        fetchMock.mockImplementation(() => Promise.resolve(new Response(text, { status })));
    }

    function lastCall(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
        return { url, init };
    }

    it('C1 posts the phone to the backend snapshot route', async () => {
        answer(200, ok(RAW));
        await expect(fetchCustomerSnapshot({ phone: '919876543210' })).resolves.toEqual(RAW);
        const { url, init } = lastCall();
        expect(url).toBe(`${getApiUrl()}/support/customer-snapshot`);
        expect(init.method).toBe('POST');
        expect(init.headers['content-type']).toBe('application/json');
        expect(init.body).toBe('{"phone":"919876543210"}');
    });

    it('C2 adds user_id to the body when a candidate is picked', async () => {
        answer(200, ok(RAW));
        await fetchCustomerSnapshot({ phone: '919876543210', user_id: 9002 });
        expect(lastCall().init.body).toBe('{"phone":"919876543210","user_id":9002}');
    });

    it.each([
        ['an unparseable 200', 200, ok({ ...RAW, match: null }), 200, 'bad_response'],
        ['an HTML 404', 404, '<!DOCTYPE html><html></html>', 404, 'not_deployed'],
        ['a 429', 429, { statusCode: 429, code: 'rate_limited', message: 'Too many requests' }, 429, 'rate_limited'],
        ['a 422', 422, { statusCode: 422, code: 'user_not_in_matches', message: 'No' }, 422, 'user_not_in_matches'],
        ['an empty 500', 500, '', 500, 'backend_error'],
    ])('C3 rejects with a SnapshotError for %s', async (_name, status, body, expectedStatus, expectedCode) => {
        answer(status, body);
        const error = await fetchCustomerSnapshot({ phone: '919876543210' }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(SnapshotError);
        expect(error).toMatchObject({ status: expectedStatus, code: expectedCode });
    });

    it('C4 reports a rejected fetch as a network error', async () => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
        const error = await fetchCustomerSnapshot({ phone: '919876543210' }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(SnapshotError);
        expect(error).toMatchObject({ status: 0, code: 'network' });
    });
});
