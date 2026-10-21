import { describe, expect, it } from 'vitest';
import {
    actionOutcomeText, autoCandidateId, backstopDraft, dayLabel, dayOrderLinkBody, deliveryLinkBody, distanceLabel,
    flaggedText, isLinkedDayOrder, isLinkedDelivery, isRecentActionRecorded, naiveLabel, rupees, slotRights,
    snapshotErrorText, snapshotMatchPatch, snapshotPhone, snapshotRetry, suggestDelivery, tapEvidence,
    unmatchedRecentActions,
} from '@/lib/desk/snapshot-format';
import type {
    CustomerSnapshot, SnapshotDayOrder, SnapshotDelivery, SnapshotRecentAction, TicketAction, TicketActionResponse,
    TicketView,
} from '@/lib/desk/types';
import { makeTicket } from './fake-repo';

const OPENED = '2026-10-17T03:30:00.123456+00:00';

function delivery(fields: Partial<SnapshotDelivery> = {}): SnapshotDelivery {
    return {
        delivery_id: 1, order_id: 5501, delivery_date: '2026-10-17', status: 3, qty: 2, product_id: 5,
        product_title: 'A2 Milk', qty_text: '500 ml', driver_user_id: 812, driver_name: 'Ravi', tap_time: null,
        usual_time: null, late_by_min: null, tap_distance_m: null, marked_by: null, reason_category: null,
        reason: null, debit_txn_id: null, debit_amount: null, refunded: false, refund_txn_id: null,
        refund_amount: null, ...fields,
    };
}

function dayOrder(fields: Partial<SnapshotDayOrder> = {}): SnapshotDayOrder {
    return {
        id: 3101, order_no: 1201, delivery_date: '2026-10-16', total_amount: 240, order_status: 'delivered',
        payment_status: 'paid', payment_mode: 'upi', payment_short_url: null, entry_type: 'whatsapp',
        items_text: 'Ghee 500 g × 1', delivery_status: 'claimed', delivered_at: null,
        created_at: '2026-10-16 10:05:00', ...fields,
    };
}

function snapshot(fields: Partial<CustomerSnapshot> = {}): CustomerSnapshot {
    return {
        canonical_phone: '9876543210',
        phone_variants: ['9876543210', '919876543210'],
        match: { kind: 'exact', user_id: 9001, candidates: [] },
        profile: {
            user_id: 9001, name: 'Meera', phone: '9876543210', email: null, channel_tag: null, is_b2b: false,
            alternate_phones: [], created_at: null,
        },
        wallet: { balance: 412.5, low_balance: false, low_balance_threshold: 180 },
        address: {
            address_id: 77, name: 'Meera', s_phone: null, flat_no: 'B-402', apartment_name: 'Prestige Lake',
            area: 'HSR Layout', landmark: null, city: null, pincode: '560102', lat: null, lng: null,
        },
        driver: { user_id: 812, name: 'Ravi', phone: null },
        drop_point: { id: 3, title: 'HSR Hub' },
        subscriptions: [], holidays: [], last_order: null, recent_deliveries: [], recent_day_orders: [],
        recent_actions: [],
        tomorrow: { date: '2026-10-18', list_generated: false, cutoff: '22:00', cutoff_passed: false, rows: [] },
        generated_at: '2026-10-17 10:00:00',
        ...fields,
    };
}

const EXPECTED_PATCH = {
    op: 'customer_snapshot', backend_user_id: 9001, customer_match: 'exact', customer_name: 'Meera', address_id: 77,
    apartment_name: 'Prestige Lake', flat_no: 'B-402', area: 'HSR Layout', pincode: '560102', driver_user_id: 812,
    driver_name: 'Ravi', drop_point_id: 3, drop_point_name: 'HSR Hub',
};

function recent(fields: Partial<SnapshotRecentAction> = {}): SnapshotRecentAction {
    return {
        kind: 'refund', ref_type: 'transaction', ref_id: '880050', amount: 64, at: '2026-10-17 09:12:00',
        summary: 'Refund ₹64', ...fields,
    };
}

function action(fields: Record<string, unknown> = {}): TicketAction {
    return {
        id: 1, client_action_id: '3f1c2b9e-8a4d-4c6e-9f00-1234567890ab', ticket_id: 't1', ref_type: 'transaction',
        ref_id: '880050', amount: 64, verified: true, resolved_ticket: false, actor_id: '1', actor_name: null,
        created_at: '2026-10-17T04:00:00+00:00', action_type: 'refund', data: { user_id: 9001 }, ...fields,
    } as unknown as TicketAction;
}

const HOLIDAY = action({
    action_type: 'holiday_added', ref_type: 'holiday', ref_id: 'user:9001:2026-10-20..2026-10-22',
    data: { user_id: 9001, from: '2026-10-20', to: '2026-10-22' },
});

function view(fields: Partial<TicketView> = {}): TicketView {
    return { ...makeTicket(), attention_since: null, overdue: false, waiting_secs: null, ...fields };
}

describe('request and errors', () => {
    it.each([
        ['919876543210', '919876543210'],
        ['+91 98765-43210', '919876543210'],
        ['9876543', null],
        ['1234567890123456', null],
        [null, null],
        ['', null],
    ])('P snapshotPhone(%j) = %j', (input, expected) => {
        expect(snapshotPhone(input)).toBe(expected);
    });

    it.each([
        [0, { status: 0 }, true],
        [0, { status: 502 }, true],
        [1, { status: 502 }, false],
        [0, { status: 429 }, false],
        [0, { status: 404 }, false],
        [0, { status: 422 }, false],
        [0, new Error('x'), false],
        [0, null, false],
    ])('R snapshotRetry(%i, %j) = %j', (count, error, expected) => {
        expect(snapshotRetry(count, error)).toBe(expected);
    });

    it('E1 gives a text per code and only retries what a retry can fix', () => {
        expect(snapshotErrorText('rate_limited')).toEqual({ text: 'Too many customer lookups. Wait a minute, then press Retry.', retry: true });
        expect(snapshotErrorText('not_deployed').retry).toBe(false);
        expect(snapshotErrorText('forbidden').retry).toBe(false);
        expect(snapshotErrorText('backend_error')).toEqual({ text: 'Customer details could not be loaded.', retry: true });
    });
});

describe('snapshotMatchPatch (decision D-a)', () => {
    it('M1 writes the twelve fields for an unmatched ticket', () => {
        expect(snapshotMatchPatch(makeTicket({ customer_name: 'Meera WA' }), snapshot())).toEqual(EXPECTED_PATCH);
    });

    it('M2 writes nothing when the ticket already holds the same user and kind', () => {
        expect(snapshotMatchPatch(makeTicket({ backend_user_id: 9001, customer_match: 'exact' }), snapshot())).toBeNull();
    });

    it('M3a writes when only the match kind changed', () => {
        const alternate = snapshot({ match: { kind: 'alternate', user_id: 9001, candidates: [] } });
        const patch = snapshotMatchPatch(makeTicket({ backend_user_id: 9001, customer_match: 'exact' }), alternate);
        expect(patch?.customer_match).toBe('alternate');
    });

    it('M3b writes when the user changed', () => {
        const patch = snapshotMatchPatch(makeTicket({ backend_user_id: 4, customer_match: 'exact' }), snapshot());
        expect(patch?.backend_user_id).toBe(9001);
    });

    it.each([
        ['a resolved ticket', makeTicket({ status: 'resolved' }), snapshot()],
        ['a manual link', makeTicket({ customer_match: 'manual', backend_user_id: 4 }), snapshot()],
        ['candidates', makeTicket(), snapshot({ match: { kind: 'candidates', user_id: null, candidates: [] }, profile: null })],
        ['a staff account', makeTicket(), snapshot({ match: { kind: 'staff', user_id: 9001, candidates: [] } })],
        ['no match', makeTicket(), snapshot({ match: { kind: 'none', user_id: null, candidates: [] }, profile: null })],
        ['a profile that is not the match', makeTicket(), snapshot({ match: { kind: 'exact', user_id: 9002, candidates: [] } })],
    ])('M4 writes nothing for %s', (_name, ticket, input) => {
        expect(snapshotMatchPatch(ticket, input)).toBeNull();
    });

    it('M5 trims, caps and nulls awkward values', () => {
        const base = snapshot();
        const awkward = snapshot({
            profile: base.profile === null ? null : { ...base.profile, name: '  ' },
            address: base.address === null ? null : {
                ...base.address, flat_no: '  ', pincode: '5601020000000000000000099', address_id: 0,
            },
            driver: null,
            drop_point: null,
        });
        expect(snapshotMatchPatch(makeTicket({ customer_name: 'Meera WA' }), awkward)).toEqual({
            ...EXPECTED_PATCH, customer_name: 'Meera WA', flat_no: null, pincode: '56010200000000000000', address_id: null,
            driver_user_id: null, driver_name: null, drop_point_id: null, drop_point_name: null,
        });
    });
});

describe('link bodies', () => {
    it('L1a builds the delivery link with an IST-offset delivered_at', () => {
        expect(deliveryLinkBody(delivery({ delivery_id: 9, tap_time: '2026-10-17 07:42:10' }))).toEqual({
            op: 'link_delivery', link_status: 'linked', order_id: 5501, daytime_order_id: null, product_id: 5,
            product_name: 'A2 Milk', delivery_date: '2026-10-17', delivery_status: 3,
            delivered_at: '2026-10-17T07:42:10+05:30', driver_user_id: 812, driver_name: 'Ravi',
        });
    });

    it('L1b keeps a not-delivered row without a tap time or driver', () => {
        expect(deliveryLinkBody(delivery({ status: 2, driver_user_id: null, driver_name: null }))).toMatchObject({
            delivery_status: 2, delivered_at: null, driver_user_id: null, driver_name: null,
        });
    });

    it('L2a builds the day-order link with the pending code for a claimed order', () => {
        expect(dayOrderLinkBody(dayOrder())).toEqual({
            op: 'link_delivery', link_status: 'linked', order_id: null, daytime_order_id: 3101, product_id: null,
            product_name: 'Ghee 500 g × 1', delivery_date: '2026-10-16', delivery_status: 1, delivered_at: null,
            driver_user_id: null, driver_name: null,
        });
    });

    it('L2b maps a delivered day order and a missing delivery', () => {
        expect(dayOrderLinkBody(dayOrder({ delivery_status: 'delivered', delivered_at: '2026-10-16 15:20:00' }))).toMatchObject({
            delivery_status: 3, delivered_at: '2026-10-16T15:20:00+05:30',
        });
        expect(dayOrderLinkBody(dayOrder({ delivery_status: null })).delivery_status).toBeNull();
    });

    it('L3 recognises the linked delivery', () => {
        const linked = makeTicket({ link_status: 'linked', order_id: 5501, delivery_date: '2026-10-17', product_id: 5 });
        expect(isLinkedDelivery(linked, delivery())).toBe(true);
        expect(isLinkedDelivery({ ...linked, delivery_date: '2026-10-16' }, delivery())).toBe(false);
        expect(isLinkedDelivery({ ...linked, product_id: null }, delivery({ product_id: 6 }))).toBe(true);
        expect(isLinkedDelivery({ ...linked, link_status: 'none_found' }, delivery())).toBe(false);
    });

    it('L3b recognises the linked day order', () => {
        expect(isLinkedDayOrder(makeTicket({ link_status: 'linked', daytime_order_id: 3101 }), dayOrder())).toBe(true);
        expect(isLinkedDayOrder(makeTicket({ link_status: 'linked', daytime_order_id: 3102 }), dayOrder())).toBe(false);
    });
});

describe('suggestDelivery (decision D-b)', () => {
    const ticket = makeTicket({ opened_at: OPENED });
    const rows = [
        delivery({ delivery_id: 1, delivery_date: '2026-10-18', status: 1 }),
        delivery({ delivery_id: 2, delivery_date: '2026-10-17', status: 1 }),
        delivery({ delivery_id: 3, delivery_date: '2026-10-16', status: 3, late_by_min: 25 }),
        delivery({ delivery_id: 4, delivery_date: '2026-10-15', status: 3 }),
        delivery({ delivery_id: 5, delivery_date: '2026-10-13', status: 3 }),
        delivery({ delivery_id: 6, delivery_date: '2026-10-16', status: 3, late_by_min: null }),
    ];
    const category = (slug: string) => ({ slug, requires_delivery_link: true });

    it.each([
        ['G1', 'not_delivered', 2],
        ['G2', 'late_delivery', 3],
        ['G3', 'cancelled_due_to_late', 3],
        ['G4', 'milk_spoilage', 6],
        ['G5', 'wrong_flat', 6],
    ])('%s picks the preferred delivery for %s', (_id, slug, expected) => {
        expect(suggestDelivery(ticket, category(slug), rows)?.delivery_id).toBe(expected);
    });

    it('G6 falls back to the newest row in the window when none is preferred', () => {
        const two = rows.filter((row) => row.delivery_id === 2 || row.delivery_id === 4);
        expect(suggestDelivery(ticket, category('late_delivery'), two)?.delivery_id).toBe(2);
    });

    it('G7 suggests nothing when a link exists, there is no category, or it needs no link', () => {
        expect(suggestDelivery({ ...ticket, link_status: 'none_found' }, category('milk_spoilage'), rows)).toBeNull();
        expect(suggestDelivery(ticket, null, rows)).toBeNull();
        expect(suggestDelivery(ticket, { slug: 'billing_dispute', requires_delivery_link: false }, rows)).toBeNull();
    });

    it('G8 uses the IST date of opened_at and only the 3 days before it', () => {
        const outside = rows.filter((row) => row.delivery_id === 1 || row.delivery_id === 5);
        expect(suggestDelivery(ticket, category('milk_spoilage'), outside)).toBeNull();
        const lateNight = { ...ticket, opened_at: '2026-10-16T18:40:00+00:00' };
        expect(suggestDelivery(lateNight, category('not_delivered'), rows)?.delivery_id).toBe(2);
    });
});

describe('recent actions (decision D-c)', () => {
    it.each([
        ['B1', recent({}), [action({})], true],
        ['B2', recent({ kind: 'wallet_credit' }), [action({ action_type: 'wallet_credit' })], true],
        ['B3', recent({ ref_id: '880051' }), [action({})], false],
        ['B4', recent({ kind: 'app_order', ref_type: 'order', ref_id: '5600' }),
            [action({ action_type: 'app_order_created', ref_type: 'order', ref_id: '5600' })], true],
        ['B5', recent({ kind: 'day_order', ref_type: 'daytime_order', ref_id: '3101' }),
            [action({ action_type: 'day_order_created', ref_type: 'daytime_order', ref_id: '3101' })], true],
        ['B6', recent({ kind: 'holiday', ref_type: 'holiday', ref_id: 'user:9001:2026-10-21' }), [HOLIDAY], true],
        ['B7', recent({ kind: 'holiday', ref_type: 'holiday', ref_id: 'user:9001:2026-10-23' }), [HOLIDAY], false],
        ['B8', recent({ kind: 'holiday', ref_type: 'holiday', ref_id: 'user:9002:2026-10-21' }), [HOLIDAY], false],
        ['B9', recent({ kind: 'holiday', ref_type: 'holiday', ref_id: 'holiday:41' }), [HOLIDAY], false],
        ['B10', recent({}), [], false],
    ])('%s isRecentActionRecorded = %j', (_id, row, actions, expected) => {
        expect(isRecentActionRecorded(row, actions)).toBe(expected);
    });

    it('B11 drops rows before the ticket opened (to the second) and recorded rows, and keeps unparseable times', () => {
        const rows = [
            recent({ ref_id: '1', at: '2026-10-17 08:59:59' }),
            recent({ ref_id: '2', at: '2026-10-17 09:00:00' }),
            recent({ ref_id: '880050' }),
            recent({ ref_id: '3', at: 'garbage' }),
        ];
        expect(unmatchedRecentActions(rows, [action({})], OPENED).map((row) => row.ref_id)).toEqual(['2', '3']);
    });

    it('B12 prefills the resolve dialog from a backend refund', () => {
        const category = { slug: 'milk_spoilage', type: 'complaint' as const, default_resolution_code: 'explained' as const, requires_delivery_link: true };
        expect(backstopDraft(recent({}), makeTicket({ ticket_no: 41, category_slug: 'milk_spoilage' }), category)).toEqual({
            category_slug: 'milk_spoilage', classification_source: 'human', resolution_code: 'refunded',
            resolution_note: 'Done outside Desk: Refund ₹64', lost_reason: null, duplicate_of_ticket_no: null, link_status: null,
        });
    });

    it('B13 picks done for an app order on a request category and won otherwise', () => {
        const appOrder = recent({ kind: 'app_order', ref_type: 'order', ref_id: '5600' });
        const request = { slug: 'cancel_subscription', type: 'request' as const, default_resolution_code: null, requires_delivery_link: false };
        expect(backstopDraft(appOrder, makeTicket(), request).resolution_code).toBe('done');
        expect(backstopDraft(appOrder, makeTicket(), null).resolution_code).toBe('won');
        expect(backstopDraft(recent({ kind: 'holiday', ref_type: 'holiday', ref_id: 'user:1:2026-10-21' }), makeTicket(), null).resolution_code).toBe('done');
    });
});

describe('candidates, slots, toasts and labels', () => {
    const candidates = [9001, 9002].map((user_id) => ({
        user_id, name: null, phone_tail: '3210', matched_on: 'phone' as const, apartment_name: null, flat_no: null,
        area: null, is_staff: false,
    }));
    const pair = snapshot({ match: { kind: 'candidates', user_id: null, candidates }, profile: null });

    it('K1 shows the ticket\'s own account only when it is one of the candidates', () => {
        expect(autoCandidateId({ backend_user_id: 9002 }, pair)).toBe(9002);
        expect(autoCandidateId({ backend_user_id: 7 }, pair)).toBeNull();
        expect(autoCandidateId({ backend_user_id: null }, pair)).toBeNull();
        expect(autoCandidateId({ backend_user_id: 9001 }, snapshot())).toBeNull();
    });

    it('K2 mounts the money and ops slots only for money:true', () => {
        expect(slotRights({ money: true })).toEqual({ money: true, ops: true, app: true });
        expect(slotRights({ money: false })).toEqual({ money: false, ops: false, app: true });
    });

    it('K3 words the toast per outcome', () => {
        const ticket = view({ ticket_no: 41, follow_up_at: '2026-10-18T03:00:00+00:00' });
        const response = (fields: Partial<TicketActionResponse>): TicketActionResponse => ({
            ticket, action: action({}), outcome: 'recorded', replayed: false, flagged: null, ...fields,
        });
        expect(actionOutcomeText(response({ outcome: 'resolved' }))).toBe('Recorded. Ticket #41 resolved.');
        expect(actionOutcomeText(response({ outcome: 'held' }))).toBe('Recorded. Ticket #41 is on hold until 18 Oct 2026, 08:30.');
        expect(actionOutcomeText(response({}))).toBe('Recorded on ticket #41.');
        expect(actionOutcomeText(response({ replayed: true }))).toBe('Already recorded on ticket #41.');
    });

    it('K3b words the review flags', () => {
        expect(flaggedText(null)).toBeNull();
        expect(flaggedText('credit_over_limit')).toContain('credit limit');
        expect(flaggedText('repeat_refund')).toContain('30 days');
    });

    it('K4 formats IST dates and rejects non-naive times', () => {
        expect(dayLabel('2026-10-07')).toBe('7 Oct');
        expect(naiveLabel('2026-10-17 07:42:10')).toBe('17 Oct 07:42');
        expect(naiveLabel(null)).toBe('—');
        expect(naiveLabel('2026-10-17T07:42:10+05:30')).toBe('—');
    });

    it('K5 formats money and distance', () => {
        expect([rupees(64), rupees(64.5), rupees(null)]).toEqual(['₹64', '₹64.50', '—']);
        expect([distanceLabel(140.4), distanceLabel(1450), distanceLabel(null)])
            .toEqual(['140 m from the address', '1.4 km from the address', null]);
    });

    it('K6 summarises the delivery evidence', () => {
        expect(tapEvidence(delivery({ tap_time: '2026-10-17 07:42:10', usual_time: '07:10', late_by_min: 32 })))
            .toBe('Tapped 07:42 · usual 07:10 · late by 32 min');
        expect(tapEvidence(delivery({ marked_by: 'admin' }))).toBe('marked by admin');
        expect(tapEvidence(delivery())).toBeNull();
    });
});
