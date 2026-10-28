import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ticketActionBody } from '@/lib/desk/contracts';
import { DeskClientError } from '@/lib/desk/desk-query';
import {
    buildCustomerLinkedBody, buildDayOrderBody, customerLinkNotApplied, buildHolidayBody, buildNotDeliveredBody, buildPaymentLinkBody,
    canMarkNotDelivered, canSendPaymentLink, checkHolidayRange, holidayAvailability, holidayEarliestDate,
    holidayErrorText, holidayRangeText, HOLIDAY_REFUSED_TEXT, istDateAfter, linkableCandidates, needsDayOrderRecord,
    newCustomerPreset, opsBackendErrorText, recordOnlyBody, paymentStepFor, planOpsResolution, presetCustomerFor,
    readAlternatePhoneResult, readPaymentLinkResult, recordFailure, resolveFragment, type OpsResolveChoice,
} from '@/lib/desk/ops-actions';
import type { Category, CustomerSnapshot, SnapshotCandidate, TicketEvent } from '@/lib/desk/types';

const CID = '3f2b8c1e-5d4a-4b6e-9c2d-7a1e0f3b5c6d';
const S = '2026-10-12T02:30:00.123456+00:00';
const COMMON = { client_action_id: CID, seen_inbound_at: S };
const at = (iso: string) => Date.parse(iso);
const parses = (body: unknown) => expect(ticketActionBody.safeParse(body).success).toBe(true);

const cat = (slug: string, type: Category['type'], sort: number, active = true): Category =>
    ({ slug, type, sort_order: sort, active, label: slug }) as unknown as Category;
const CATS: Category[] = [
    cat('new_day_order', 'sales', 200), cat('new_app_subscription', 'sales', 210), cat('b2b_enquiry', 'sales', 220, false),
    cat('change_subscription', 'request', 300), cat('pause_resume', 'request', 330), cat('not_delivered', 'complaint', 120),
    cat('general_enquiry', 'enquiry', 410),
];

const cand = (id: number, matchedOn: SnapshotCandidate['matched_on'] = 'address_phone', staff = false): SnapshotCandidate => ({
    user_id: id, name: `C${id}`, phone_tail: '0000', matched_on: matchedOn, apartment_name: null, flat_no: null, area: null, is_staff: staff,
});
const snap = (patch: Record<string, unknown> = {}): CustomerSnapshot => ({
    canonical_phone: '9876543210',
    match: { kind: 'exact', user_id: 42, candidates: [] },
    profile: { user_id: 42, name: 'Asha', phone: '9876543210', email: null, channel_tag: null, is_b2b: false, alternate_phones: [], created_at: null },
    subscriptions: [{ order_id: 1 }],
    tomorrow: { date: '2026-10-19', list_generated: false, cutoff: '22:45', cutoff_passed: false, rows: [] },
    ...patch,
}) as unknown as CustomerSnapshot;

describe('builders', () => {
    it('B1 day order, collect on delivery', () => {
        const body = buildDayOrderBody(COMMON, { resolve: true }, {
            orderId: 501, total: 240, deliveryDate: '2026-10-19', step: paymentStepFor({ kind: 'collect_on_delivery' }), newCustomer: true,
        });
        expect(body).toEqual({
            client_action_id: CID, seen_inbound_at: S, resolve: true, action_type: 'day_order_created', ref_type: 'daytime_order',
            ref_id: '501', amount: 240,
            data: {
                daytime_order_id: 501, delivery_date: '2026-10-19', payment_step: 'collect_on_delivery', payment_status: 'unpaid',
                payment_mode: null, payment_link_id: null, new_customer: true,
            },
        });
        parses(body);
    });
    it('B2 day order with a link step and a classification', () => {
        const body = buildDayOrderBody(COMMON, { resolve: true, category_slug: 'new_day_order', classification_source: 'human' }, {
            orderId: 501, total: 99.999, deliveryDate: '2026-10-19', step: paymentStepFor({ kind: 'link_sent', paymentLinkId: 'plink_Q1' }), newCustomer: false,
        });
        expect(body).toMatchObject({
            category_slug: 'new_day_order', classification_source: 'human', amount: 100,
            data: { payment_step: 'link_sent', payment_status: 'link_sent', payment_mode: 'link', payment_link_id: 'plink_Q1', new_customer: false },
        });
        parses(body);
    });
    it('B3 holiday', () => {
        const body = buildHolidayBody(COMMON, { resolve: false }, { userId: 42, from: '2026-10-20', to: '2026-10-22' });
        expect(body).toEqual({
            ...COMMON, resolve: false, action_type: 'holiday_added', ref_type: 'holiday', ref_id: 'user:42:2026-10-20..2026-10-22',
            amount: null, data: { user_id: 42, from: '2026-10-20', to: '2026-10-22' },
        });
        parses(body);
    });
    it('B4-B6 not delivered', () => {
        const input = { delivery: { delivery_id: 9001, order_id: 77, delivery_date: '2026-10-17' }, reasonCategory: 1 as const, reason: '  bag missing ' };
        const body = buildNotDeliveredBody(COMMON, input);
        expect(body).toEqual({
            ...COMMON, resolve: false, action_type: 'delivery_marked_not_delivered', ref_type: 'delivery', ref_id: '9001', amount: null,
            data: { delivery_id: 9001, order_id: 77, delivery_date: '2026-10-17', reason_category: 1, reason: 'bag missing' },
        });
        parses(body);
        expect(buildNotDeliveredBody(COMMON, { ...input, reason: '   ' }).data.reason).toBeNull();
        expect(buildNotDeliveredBody(COMMON, { ...input, reason: 'x'.repeat(300) }).data.reason?.length).toBe(250);
    });
    it('B7-B8 customer linked', () => {
        const body = buildCustomerLinkedBody(COMMON, { userId: 7, phone: '9876543210', alternatePhoneId: 15, alreadyLinked: false });
        expect(body).toEqual({
            ...COMMON, resolve: false, action_type: 'customer_linked', ref_type: 'alternate_phone', ref_id: 'user:7:9876543210',
            amount: null, data: { user_id: 7, phone: '9876543210', alternate_phone_id: 15, already_linked: false },
        });
        parses(body);
        const again = buildCustomerLinkedBody(COMMON, { userId: 7, phone: '9876543210', alternatePhoneId: null, alreadyLinked: true });
        expect(again.data).toMatchObject({ alternate_phone_id: null, already_linked: true });
        expect(again.ref_id).toBe('user:7:9876543210');
        parses(again);
    });
    it('B9 payment link', () => {
        const body = buildPaymentLinkBody(COMMON, {
            order: { id: 501, total_amount: 240 }, paymentLinkId: 'plink_Q1', shortUrl: 'https://rzp.io/rzp/AbC123', whatsappSent: false,
        });
        expect(body).toEqual({
            ...COMMON, resolve: false, action_type: 'payment_link_sent', ref_type: 'payment_link', ref_id: 'plink_Q1', amount: 240,
            data: { daytime_order_id: 501, short_url: 'https://rzp.io/rzp/AbC123', whatsapp_sent: false },
        });
        parses(body);
    });
    it('B10 a null seen token stays in the body', () => {
        const body = buildDayOrderBody({ ...COMMON, seen_inbound_at: null }, { resolve: true }, {
            orderId: 501, total: 240, deliveryDate: '2026-10-19', step: paymentStepFor({ kind: 'collect_on_delivery' }), newCustomer: true,
        });
        expect('seen_inbound_at' in body && body.seen_inbound_at === null).toBe(true);
        parses(body);
    });
});

describe('paymentStepFor', () => {
    it.each([
        [{ kind: 'link_sent', paymentLinkId: 'plink_Q1' }, 'link_sent', 'link_sent', 'link', 'plink_Q1'],
        [{ kind: 'marked_paid', mode: 'cash' }, 'marked_paid', 'cash', 'cash', null],
        [{ kind: 'marked_paid', mode: 'upi' }, 'marked_paid', 'paid', 'upi', null],
        [{ kind: 'marked_paid', mode: 'wallet' }, 'marked_paid', 'wallet_deducted', 'wallet', null],
        [{ kind: 'collect_on_delivery' }, 'collect_on_delivery', 'unpaid', null, null],
    ] as const)('%j', (choice, step, status, mode, linkId) => {
        expect(paymentStepFor(choice)).toEqual({ payment_step: step, payment_status: status, payment_mode: mode, payment_link_id: linkId });
    });
});

describe('response readers', () => {
    const link = (whatsapp?: unknown, over: Record<string, unknown> = {}) => ({
        response: 200, status: true, message: 'successfully',
        data: { payment_link_id: 'plink_Q1', short_url: 'https://rzp.io/rzp/AbC123', ...(whatsapp === undefined ? {} : { whatsapp }), ...over },
    });
    it('P1-P4 payment link', () => {
        expect(readPaymentLinkResult(link({ sent: true }))).toEqual({ paymentLinkId: 'plink_Q1', shortUrl: 'https://rzp.io/rzp/AbC123', whatsappSent: true, whatsappNote: null });
        expect(readPaymentLinkResult(link({ sent: false, skipped: 'no_template' }))).toMatchObject({ whatsappSent: false, whatsappNote: 'no_template' });
        expect(readPaymentLinkResult(link({ sent: false, error: 'msg91 401' }))).toMatchObject({ whatsappNote: 'msg91 401' });
        expect(readPaymentLinkResult(link())).toMatchObject({ whatsappSent: false, whatsappNote: null });
    });
    it('P5-P7 payment link rejects bad answers', () => {
        expect(readPaymentLinkResult({ response: 200 })).toBeNull();
        expect(readPaymentLinkResult(link({ sent: true }, { short_url: null }))).toBeNull();
        expect(readPaymentLinkResult(link({ sent: true }, { payment_link_id: '' }))).toBeNull();
    });
    it('P8-P11 alternate phone', () => {
        expect(readAlternatePhoneResult({ data: { id: 15, user_id: 7, phone: '9876543210' } })).toEqual({ alternatePhoneId: 15, alreadyLinked: false });
        expect(readAlternatePhoneResult({ data: { user_id: 7, phone: '9876543210', already_linked: true } })).toEqual({ alternatePhoneId: null, alreadyLinked: true });
        expect(readAlternatePhoneResult({ data: { user_id: 7 } })).toBeNull();
        expect(readAlternatePhoneResult(null)).toBeNull();
    });
});

describe('customer', () => {
    it('C1-C3 ready', () => {
        expect(presetCustomerFor(snap(), 'Asha K')).toEqual({ kind: 'ready', customer: { userId: 42, name: 'Asha', phone: '9876543210', isNew: false } });
        const alt = snap({ match: { kind: 'alternate', user_id: 42, candidates: [] }, profile: { ...snap().profile, name: null } });
        expect(presetCustomerFor(alt, 'Asha K')).toMatchObject({ kind: 'ready', customer: { name: 'Asha K' } });
        expect(presetCustomerFor(alt, null)).toMatchObject({ kind: 'ready', customer: { name: 'Customer' } });
    });
    it('C4-C6 blocked or picked', () => {
        const candidates = { kind: 'candidates', user_id: null, candidates: [cand(7)] };
        expect(presetCustomerFor(snap({ match: candidates, profile: null }), null)).toEqual({ kind: 'blocked', reason: 'pick_customer' });
        const picked = presetCustomerFor(snap({ match: candidates, profile: { ...snap().profile, user_id: 7, name: 'Ravi' } }), null);
        expect(picked).toMatchObject({ kind: 'ready', customer: { userId: 7, name: 'Ravi' } });
        expect(presetCustomerFor(snap({ match: { kind: 'staff', user_id: 9, candidates: [] } }), null)).toEqual({ kind: 'blocked', reason: 'staff' });
    });
    it('C7-C10 new customer', () => {
        const none = snap({ match: { kind: 'none', user_id: null, candidates: [] }, profile: null });
        expect(presetCustomerFor(none, ' Meena ')).toEqual({ kind: 'needs_name', phone: '9876543210', suggestedName: 'Meena' });
        expect(presetCustomerFor(none, null)).toMatchObject({ suggestedName: '' });
        expect(newCustomerPreset('9876543210', ' Meena ')).toEqual({ userId: null, name: 'Meena', phone: '9876543210', isNew: true });
        expect(newCustomerPreset('9876543210', '   ')).toBeNull();
        expect(newCustomerPreset('9876543210', 'x'.repeat(81))).toBeNull();
    });
    it('C11-C14 holiday availability', () => {
        expect(holidayAvailability(snap())).toBe('ok');
        expect(holidayAvailability(snap({ subscriptions: [] }))).toBe('no_subscriptions');
        expect(holidayAvailability(snap({ profile: null, match: { kind: 'candidates', user_id: null, candidates: [] } }))).toBe('no_customer');
        expect(holidayAvailability(snap({ match: { kind: 'staff', user_id: 9, candidates: [] } }))).toBe('staff');
    });
    it('C15-C16 linkable candidates', () => {
        const match = { kind: 'candidates', user_id: null, candidates: [cand(7), cand(8, 'address_phone', true), cand(9, 'phone')] };
        expect(linkableCandidates(snap({ match })).map((item) => item.user_id)).toEqual([7]);
        expect(linkableCandidates(snap())).toEqual([]);
        expect(linkableCandidates(snap({ match: { kind: 'none', user_id: null, candidates: [] } }))).toEqual([]);
    });
});

describe('holiday dates', () => {
    const T = { date: '2026-10-19', cutoff: '22:45', list_generated: false };
    it('H1-H3 IST dates', () => {
        expect(istDateAfter(at('2026-10-18T23:59:00+05:30'), 0)).toBe('2026-10-18');
        expect(istDateAfter(at('2026-10-18T18:31:00Z'), 0)).toBe('2026-10-19');
        expect(istDateAfter(at('2026-10-18T21:00:00+05:30'), 2)).toBe('2026-10-20');
    });
    it.each([
        ['H4', '2026-10-18T21:00:00+05:30', T, '2026-10-19'],
        ['H5', '2026-10-18T22:44:00+05:30', T, '2026-10-19'],
        ['H6', '2026-10-18T22:45:00+05:30', T, '2026-10-20'],
        ['H7', '2026-10-18T23:30:00+05:30', T, '2026-10-20'],
        ['H8', '2026-10-18T21:00:00+05:30', { ...T, list_generated: true }, '2026-10-20'],
        ['H9', '2026-10-19T00:30:00+05:30', { ...T, list_generated: true }, '2026-10-20'],
        ['H10', '2026-10-18T10:00:00+05:30', { ...T, cutoff: 'bad' }, '2026-10-20'],
        ['H11', '2026-10-18T10:00:00+05:30', { ...T, cutoff: '22:00' }, '2026-10-19'],
    ])('%s earliest date', (_id, now, tomorrow, expected) => {
        expect(holidayEarliestDate(at(now), tomorrow)).toBe(expected);
    });
    it.each([
        ['H12', '2026-10-19', '2026-10-19', [], 'ok'],
        ['H13', '2026-10-18', '2026-10-20', [], 'before_earliest'],
        ['H14', '2026-10-21', '2026-10-20', [], 'to_before_from'],
        ['H15', '2026-10-19', '2027-01-16', [], 'ok'],
        ['H16', '2026-10-19', '2027-01-17', [], 'too_long'],
        ['H17', '2026-10-20', '2026-10-21', ['2026-10-20', '2026-10-21'], 'all_existing'],
        ['H18', '2026-10-20', '2026-10-21', ['2026-10-20'], 'ok'],
        ['H19a', '2026-13-01', '2026-10-21', [], 'invalid'],
        ['H19b', '', '', [], 'invalid'],
    ])('%s range', (_id, from, to, existing, expected) => {
        expect(checkHolidayRange(from, to, '2026-10-19', existing)).toBe(expected);
    });
    it('H20 text', () => {
        expect(holidayRangeText('before_earliest', '2026-10-20')).toBe('The first date that can still be paused is 2026-10-20.');
    });
});

describe('row eligibility', () => {
    it('M1-M4 not delivered', () => {
        expect(canMarkNotDelivered({ status: 3, delivery_date: '2026-10-17' }, '2026-10-18')).toBe(true);
        expect(canMarkNotDelivered({ status: 1, delivery_date: '2026-10-18' }, '2026-10-18')).toBe(true);
        expect(canMarkNotDelivered({ status: 2, delivery_date: '2026-10-17' }, '2026-10-18')).toBe(false);
        expect(canMarkNotDelivered({ status: 1, delivery_date: '2026-10-19' }, '2026-10-18')).toBe(false);
    });
    it('L1-L6 payment link', () => {
        const order = { order_status: 'confirmed', payment_status: 'unpaid', total_amount: 120, entry_type: 'whatsapp' } as const;
        expect(canSendPaymentLink(order)).toBe(true);
        expect(canSendPaymentLink({ ...order, payment_status: 'link_sent' })).toBe(true);
        for (const status of ['paid', 'cash', 'wallet_deducted'] as const) expect(canSendPaymentLink({ ...order, payment_status: status })).toBe(false);
        expect(canSendPaymentLink({ ...order, order_status: 'cancelled' })).toBe(false);
        expect(canSendPaymentLink({ ...order, total_amount: 0 })).toBe(false);
        expect(canSendPaymentLink({ ...order, entry_type: 'morning_backup' })).toBe(false);
        expect(canSendPaymentLink({ ...order, entry_type: null })).toBe(true);
    });
    it('N1-N6 day order record', () => {
        const order = { id: 501, order_status: 'confirmed', payment_status: 'unpaid', entry_type: 'whatsapp', created_at: '2026-10-20 10:30:00' } as const;
        const ticket = { daytime_order_id: null, opened_at: '2026-10-20T09:00:00+05:30' } as const;
        const recent = [{ kind: 'day_order', ref_id: '501' }] as const;
        expect(needsDayOrderRecord(order, recent, [], ticket)).toBe(true);
        expect(needsDayOrderRecord(order, recent, [{ action_type: 'day_order_created', ref_id: '501' }], ticket)).toBe(false);
        expect(needsDayOrderRecord(order, [], [], ticket)).toBe(false);
        expect(needsDayOrderRecord(order, [{ kind: 'day_order', ref_id: '502' }], [], ticket)).toBe(false);
        expect(needsDayOrderRecord({ ...order, payment_status: 'link_sent' }, recent, [], ticket)).toBe(false);
        expect(needsDayOrderRecord({ ...order, order_status: 'cancelled' }, recent, [], ticket)).toBe(false);
        expect(needsDayOrderRecord({ ...order, entry_type: 'morning_backup' }, recent, [], ticket)).toBe(false);
        expect(needsDayOrderRecord(order, recent, [{ action_type: 'payment_link_sent', ref_id: '501' }], ticket)).toBe(true);
    });
    it('N7-N10 an order another ticket handled is not offered here (review M3)', () => {
        const order = { id: 501, order_status: 'confirmed', payment_status: 'unpaid', entry_type: 'whatsapp', created_at: '2026-10-20 10:30:00' } as const;
        const recent = [{ kind: 'day_order', ref_id: '501' }] as const;
        // the order predates this ticket: a COD order recorded on an earlier ticket stays unpaid
        expect(needsDayOrderRecord(order, recent, [], { daytime_order_id: null, opened_at: '2026-10-21T09:00:00+05:30' })).toBe(false);
        // IST wall clock vs the ticket's +05:30 instant, whatever the process time zone
        expect(needsDayOrderRecord(order, recent, [], { daytime_order_id: null, opened_at: '2026-10-20T10:30:00+05:30' })).toBe(true);
        expect(needsDayOrderRecord(order, recent, [], { daytime_order_id: null, opened_at: '2026-10-20T10:30:01+05:30' })).toBe(false);
        // the ticket is linked to a different order
        expect(needsDayOrderRecord(order, recent, [], { daytime_order_id: 777, opened_at: '2026-10-20T09:00:00+05:30' })).toBe(false);
        // linked to this very order: no date window
        expect(needsDayOrderRecord(order, recent, [], { daytime_order_id: 501, opened_at: '2026-10-21T09:00:00+05:30' })).toBe(true);
        // an unreadable date fails closed
        expect(needsDayOrderRecord({ ...order, created_at: 'garbage' }, recent, [], { daytime_order_id: null, opened_at: '2026-10-20T09:00:00+05:30' })).toBe(false);
    });
});

describe('resolve plan', () => {
    const tk = (status: string, category: string | null, suggested: string | null) =>
        ({ status, category_slug: category, suggested_category: suggested }) as never;
    const DAY = ['new_day_order', 'new_app_subscription', 'change_subscription', 'pause_resume'];
    const HOLIDAY = ['change_subscription', 'pause_resume'];
    const slugs = (plan: { options: Category[] }) => plan.options.map((item) => item.slug);
    it.each([
        ['R1', 'day_order_created', tk('open', null, null), { resolve: true, category_slug: 'new_day_order', locked: null }, DAY],
        ['R2', 'day_order_created', tk('open', null, 'change_subscription'), { resolve: true, category_slug: 'change_subscription', locked: null }, DAY],
        ['R3', 'day_order_created', tk('new', 'new_app_subscription', null), { resolve: true, category_slug: 'new_app_subscription', locked: null }, DAY],
        ['R4', 'day_order_created', tk('open', 'not_delivered', null), { resolve: false, category_slug: 'new_day_order', locked: null }, DAY],
        ['R5', 'day_order_created', tk('resolved', 'new_day_order', null), { resolve: false, category_slug: null, locked: 'resolved' }, DAY],
        ['R6', 'day_order_created', tk('open', null, 'b2b_enquiry'), { resolve: true, category_slug: 'new_day_order', locked: null }, DAY],
        ['R7', 'holiday_added', tk('open', null, 'general_enquiry'), { resolve: true, category_slug: 'pause_resume', locked: null }, HOLIDAY],
        ['R8', 'holiday_added', tk('open', 'change_subscription', null), { resolve: true, category_slug: 'change_subscription', locked: null }, HOLIDAY],
        ['R9', 'holiday_added', tk('waiting_customer', 'new_day_order', null), { resolve: false, category_slug: 'pause_resume', locked: null }, HOLIDAY],
        ['R10', 'holiday_added', tk('open', 'retired_slug', null), { resolve: false, category_slug: 'pause_resume', locked: null }, HOLIDAY],
    ] as const)('%s', (_id, action, ticket, initial, options) => {
        const plan = planOpsResolution(action, ticket, CATS);
        expect(plan.initial).toEqual(initial);
        expect(slugs(plan)).toEqual(options);
    });
    it('R11-R12', () => {
        expect(planOpsResolution('holiday_added', tk('open', null, null), [])).toEqual({
            initial: { resolve: false, category_slug: null, locked: 'no_category' }, options: [],
        });
        const two = CATS.filter((item) => ['change_subscription', 'pause_resume'].includes(item.slug));
        expect(planOpsResolution('day_order_created', tk('open', null, null), two).initial)
            .toEqual({ resolve: true, category_slug: 'change_subscription', locked: null });
    });
    it('R13 does not reorder or mutate its input', () => {
        const input = Object.freeze([...CATS].reverse());
        expect(() => planOpsResolution('day_order_created', tk('open', null, null), input)).not.toThrow();
        expect(input.map((item) => item.slug)).toEqual([...CATS].reverse().map((item) => item.slug));
    });
});

describe('resolveFragment', () => {
    const choice = (resolve: boolean, slug: string | null): OpsResolveChoice => ({ resolve, category_slug: slug, locked: null });
    const suggested = (source: 'rules' | 'ai'): TicketEvent => ({
        id: 1, ticket_id: 't', from_status: null, to_status: null, assignee_id: null, actor_id: null, actor_name: null,
        created_at: '2026-10-12T02:31:00+00:00', type: 'suggested',
        data: { source, suggested_type: null, suggested_category: 'pause_resume', order_id: null, matched_keyword: null },
    });
    it('F1-F6', () => {
        expect(resolveFragment(choice(false, 'new_day_order'), { category_slug: null, suggested_category: null }, [])).toEqual({ resolve: false });
        expect(resolveFragment(choice(true, 'new_day_order'), { category_slug: 'new_day_order', suggested_category: null }, [])).toEqual({ resolve: true });
        const f3 = resolveFragment(choice(true, 'new_day_order'), { category_slug: null, suggested_category: null }, []);
        expect(f3).toEqual({ resolve: true, category_slug: 'new_day_order', classification_source: 'human' });
        const pick = choice(true, 'pause_resume');
        const ticket = { category_slug: null, suggested_category: 'pause_resume' };
        expect(resolveFragment(pick, ticket, [])).toMatchObject({ classification_source: 'rules' });
        expect(resolveFragment(pick, ticket, [suggested('ai')])).toMatchObject({ classification_source: 'ai' });
        const bare = resolveFragment(choice(true, null), ticket, []);
        expect(bare).toEqual({ resolve: true });
        expect(Object.keys(bare)).toEqual(['resolve']);
    });
});

describe('recordOnlyBody', () => {
    it('keeps the id and token but drops resolve, category and source', () => {
        const body = buildDayOrderBody(COMMON, { resolve: true, category_slug: 'new_day_order', classification_source: 'human' }, {
            orderId: 5, total: 10, deliveryDate: '2026-10-19', step: paymentStepFor({ kind: 'collect_on_delivery' }), newCustomer: false,
        });
        const plain = recordOnlyBody(body);
        expect(plain).toMatchObject({ client_action_id: CID, seen_inbound_at: S, resolve: false });
        expect('category_slug' in plain || 'classification_source' in plain).toBe(false);
        parses(plain);
    });
});

describe('customerLinkNotApplied', () => {
    it('warns only when the returned ticket customer differs from the linked user', () => {
        expect(customerLinkNotApplied({ backend_user_id: 7 }, 7)).toBe(false);
        expect(customerLinkNotApplied({ backend_user_id: 501 }, 7)).toBe(true);
        expect(customerLinkNotApplied({ backend_user_id: null }, 7)).toBe(true);
    });
});

describe('errors', () => {
    it('E1-E7 recordFailure', () => {
        expect(recordFailure(new DeskClientError('category_required', 'x'))).toEqual({ kind: 'precondition', text: 'Pick a category first.' });
        expect(recordFailure(new DeskClientError('delivery_link_required', 'x'))).toEqual({ kind: 'precondition', text: 'Say whether a delivery matches.' });
        expect(recordFailure(new DeskClientError('internal_error', 'HTTP 500'))).toEqual({ kind: 'retry', text: 'HTTP 500' });
        expect(recordFailure(new DeskClientError('authz_unavailable', 'm'))).toEqual({ kind: 'retry', text: 'Cannot check your access right now. Retrying.' });
        expect(recordFailure(new DeskClientError('reference_mismatch', 'm')))
            .toEqual({ kind: 'final', text: 'The backend shows a different customer or amount for this reference, so it was not recorded.' });
        expect(recordFailure(new DeskClientError('not_installed', 'm'))).toEqual({ kind: 'final', text: 'Desk is not installed on this database yet.' });
        expect(recordFailure(new Error('boom'))).toEqual({ kind: 'retry', text: 'Network error. Try again.' });
    });
    it('E8-E11 backend messages', () => {
        expect(holidayErrorText({ status: 201, userMessage: 'Something went wrong. Please try again.' })).toBe(HOLIDAY_REFUSED_TEXT);
        const cutoff = "Cutoff (22:45 IST) has passed for tomorrow's orders.";
        expect(holidayErrorText({ status: 422, userMessage: cutoff })).toBe(cutoff);
        expect(holidayErrorText(new Error('x'))).toBe('x');
        expect(holidayErrorText(null)).toBe('Could not add the holiday.');
        expect(opsBackendErrorText({ userMessage: '  ', message: 'y' }, 'f')).toBe('y');
        expect(opsBackendErrorText(42, 'f')).toBe('f');
    });
});

describe('source purity of ops-actions.ts', () => {
    const source = readFileSync('src/lib/desk/ops-actions.ts', 'utf8');
    it.each([
        /Date\.now\(|new Date\(\)/, /'use client'/, /@\/lib\/api/, /fetch\(|axios/, /window\./, /export default/,
        /: any\b|as any\b/, /toLocale|getHours\(|getDate\(/,
    ])('does not match %s', (pattern) => {
        expect(pattern.test(source)).toBe(false);
    });
});
