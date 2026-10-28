import { describe, expect, it } from 'vitest';
import {
    actionErrorText, actionResolveCode, amountsMatch, backstopFlag, canResolve, canRetryRecording, classifyPart,
    customerPatch, followUpProblem, isNoMoneyAction, moneyBlockReason, needsTomorrowCheck, noDeliveryLinkBody,
    planOutcome, refundActionBody, replacementActionBody, replacementDefaults, replayResult, requestProblem,
    requestUserId, snapshotColumnsPatch, snapshotUserIds, tomorrowFollowUpIso, walletCreditActionBody,
    walletDescription,
} from '@/lib/desk/action-plan';
import { ticketActionBody, type TicketActionBody } from '@/lib/desk/contracts';
import type { CustomerSnapshot, Ticket, TicketEvent } from '@/lib/desk/types';

const NOW = Date.parse('2026-10-20T06:00:00.000Z');
const TOMORROW_0830 = '2026-10-21T03:00:00.000Z';
const S = '2026-10-20T05:00:00.000000+00:00';
const C1 = '11111111-1111-4111-8111-111111111111';

const common = { client_action_id: C1, seen_inbound_at: S, resolve: true };
const refund = (over: Record<string, unknown> = {}): TicketActionBody => ticketActionBody.parse({
    ...common, action_type: 'refund', ref_type: 'transaction', ref_id: '9001', amount: 32,
    data: {
        debit_txn_id: 8800, order_id: 812, delivery_date: '2026-10-19', refund_reason: 'Product quality',
        billed_to_driver: false, billed_driver_id: null, driver_deduction_amount: null, new_wallet_balance: 412.5,
        user_id: 501,
    },
    ...over,
});
const wallet = (data: Record<string, unknown> = {}, over: Record<string, unknown> = {}): TicketActionBody =>
    ticketActionBody.parse({
        ...common, action_type: 'wallet_credit', ref_type: 'transaction', ref_id: '77', amount: 50,
        data: { user_id: 501, description: 'Desk credit', payment_id: `desk-${C1}`, ...data }, ...over,
    });
const holiday = (refId: string, from = '2026-10-22', to = '2026-10-23'): TicketActionBody => ticketActionBody.parse({
    ...common, action_type: 'holiday_added', ref_type: 'holiday', ref_id: refId, amount: null,
    data: { user_id: 501, from, to },
});
const replacement = (followUp: string, over: Record<string, unknown> = {}): TicketActionBody => ticketActionBody.parse({
    ...common, resolve: false, action_type: 'replacement_promised', ref_type: 'promise',
    ref_id: 'replacement:41:2026-10-21', amount: null, hold: { follow_up_at: followUp },
    data: { promised_date: '2026-10-21', note: 'x', product_name: null }, ...over,
});
const appOrder = (affects: boolean, resolve = true): TicketActionBody => ticketActionBody.parse({
    ...common, resolve, action_type: 'app_order_created', ref_type: 'order', ref_id: '812', amount: 450,
    data: { order_id: 812, product_id: 3, subscription_type: 3, start_date: null, affects_tomorrow: affects },
});
const subscription = (resolve: boolean): TicketActionBody => ticketActionBody.parse({
    ...common, resolve, action_type: 'subscription_updated', ref_type: 'order_update', ref_id: `order:812:${C1}`,
    amount: null, data: { order_id: 812, changes: ['qty'], affects_tomorrow: true },
});
const appLink = (): TicketActionBody => ticketActionBody.parse({
    ...common, resolve: false, action_type: 'app_link_sent', ref_type: 'message',
    ref_id: C1, amount: null, data: { message_id: C1 },
});
const notDelivered = (): TicketActionBody => ticketActionBody.parse({
    ...common, resolve: false, action_type: 'delivery_marked_not_delivered', ref_type: 'delivery',
    ref_id: '5', amount: null, data: { delivery_id: 5, order_id: null, delivery_date: '2026-10-19', reason_category: 1, reason: null },
});
const linked = (): TicketActionBody => ticketActionBody.parse({
    ...common, resolve: false, action_type: 'customer_linked', ref_type: 'alternate_phone',
    ref_id: 'user:501:9845012345', amount: null,
    data: { user_id: 501, phone: '9845012345', alternate_phone_id: null, already_linked: false },
});
const dayOrder = (): TicketActionBody => ticketActionBody.parse({
    ...common, action_type: 'day_order_created', ref_type: 'daytime_order', ref_id: '300', amount: 120,
    data: {
        daytime_order_id: 300, delivery_date: '2026-10-21', payment_step: 'link_sent', payment_status: 'unpaid',
        payment_mode: 'link', payment_link_id: null, new_customer: false,
    },
});

const tk = (over: Partial<Ticket> = {}): Ticket => ({
    category_slug: null, suggested_category: null, backend_user_id: 501, order_id: null, daytime_order_id: null,
    status: 'open', hold_reason: null, escalation_reason: null, ...over,
} as unknown as Ticket);

const snap = (kind: string, user: number | null, candidates: number[]): CustomerSnapshot => ({
    match: { kind, user_id: user, candidates: candidates.map((id) => ({ user_id: id })) },
} as unknown as CustomerSnapshot);

describe('requestProblem / followUpProblem', () => {
    it('Q01-Q02 refund ref id', () => {
        expect(requestProblem(refund(), 41)).toBeNull();
        expect(requestProblem(refund({ ref_id: 'txn-9001' }), 41)).toBe('ref_id: does not match the action');
    });
    it('Q03-Q05 wallet credit', () => {
        expect(requestProblem(wallet(), 41)).toBeNull();
        expect(requestProblem(wallet({ payment_id: 'desk-22222222-2222-4222-8222-222222222222' }), 41))
            .toBe('data.payment_id: must be desk-<client_action_id>');
        expect(requestProblem(wallet({ description: ' Amount credited to wallet ' }), 41))
            .toBe('data.description: this description is reserved');
    });
    it('Q06-Q08 holiday', () => {
        expect(requestProblem(holiday('user:501:2026-10-22..2026-10-23'), 41)).toBeNull();
        expect(requestProblem(holiday('user:501:2026-10-22'), 41)).toBe('ref_id: does not match the action');
        expect(requestProblem(holiday('user:501:2026-10-23..2026-10-22', '2026-10-23', '2026-10-22'), 41))
            .toBe('data.to: must not be before data.from');
    });
    it('Q09-Q13 other types', () => {
        expect(requestProblem(replacement('2026-10-21T03:00:00+00:00'), 41)).toBeNull();
        expect(requestProblem(replacement('2026-10-21T03:00:00+00:00'), 40)).toBe('ref_id: does not match the action');
        expect(requestProblem(subscription(true), 41)).toBeNull();
        expect(requestProblem(linked(), 41)).toBeNull();
        expect(requestProblem(appLink(), 41)).toBeNull();
        expect(requestProblem(notDelivered(), 41)).toBeNull();
        expect(requestProblem(appOrder(true), 41)).toBeNull();
        expect(requestProblem(dayOrder(), 41)).toBeNull();
        const link = ticketActionBody.parse({
            ...common, resolve: false, action_type: 'payment_link_sent', ref_type: 'payment_link', ref_id: 'plink_Abc',
            amount: null, data: { daytime_order_id: 300, short_url: 'https://rzp.io/x', whatsapp_sent: true },
        });
        expect(requestProblem(link, 41)).toBeNull();
    });
    it('F01-F04 follow-up', () => {
        expect(followUpProblem(replacement('2026-10-21T03:00:00+00:00'), NOW)).toBeNull();
        expect(followUpProblem(replacement('2026-10-20T05:59:59+00:00'), NOW)).toBe('follow_up_required');
        expect(followUpProblem(appLink(), NOW)).toBeNull();
        expect(followUpProblem(refund(), NOW)).toBeNull();
    });
});

describe('planOutcome', () => {
    const plan = (body: TicketActionBody, listGenerated: boolean | null = null, ticketResolved = false) =>
        planOutcome({ body, ticketResolved, listGenerated, nowMs: NOW });
    it('O01-O03 refund', () => {
        expect(plan(refund())).toEqual({ kind: 'resolve' });
        expect(plan(refund({ resolve: false }))).toEqual({ kind: 'none' });
        expect(plan(refund(), null, true)).toEqual({ kind: 'none' });
    });
    it('O04-O06 hold and none', () => {
        const f = '2026-10-21T03:00:00+00:00';
        expect(plan(replacement(f))).toEqual({ kind: 'hold', hold_reason: 'replacement_promised', follow_up_at: f });
        expect(plan(appLink())).toEqual({ kind: 'hold', hold_reason: 'app_link_sent', follow_up_at: '2026-10-22T06:00:00.000Z' });
        expect(plan(notDelivered())).toEqual({ kind: 'none' });
    });
    it('O07-O11 tomorrow rule', () => {
        const held = { kind: 'hold', hold_reason: 'verify_delivery', follow_up_at: TOMORROW_0830 };
        expect(plan(appOrder(true), true)).toEqual(held);
        expect(plan(appOrder(true), null)).toEqual(held);
        expect(plan(appOrder(true), false)).toEqual({ kind: 'resolve' });
        expect(plan(appOrder(false), null)).toEqual({ kind: 'resolve' });
        expect(plan(subscription(false), true)).toEqual({ kind: 'none' });
    });
    it('O12 tomorrow follow-up after midnight IST', () => {
        expect(tomorrowFollowUpIso(Date.parse('2026-10-20T19:00:00.000Z'))).toBe('2026-10-22T03:00:00.000Z');
    });
});

describe('codes and flags', () => {
    it('C01-C06 resolve code', () => {
        expect(actionResolveCode(refund(), 'complaint')).toBe('refunded');
        expect(actionResolveCode(refund({ resolution_code: 'explained' }), 'complaint')).toBe('explained');
        expect(actionResolveCode(wallet(), null)).toBe('credit_given');
        expect(actionResolveCode(appOrder(true), 'request')).toBe('done');
        expect(actionResolveCode(appOrder(true), 'sales')).toBe('won');
        expect(actionResolveCode(appOrder(true), null)).toBe('won');
        expect(actionResolveCode(replacement('2026-10-21T03:00:00+00:00'), null)).toBeNull();
    });
    it('C08-C10 predicates', () => {
        expect(canResolve('refund')).toBe(true);
        expect(canResolve('holiday_added')).toBe(true);
        expect(canResolve('app_order_created')).toBe(true);
        expect(canResolve('replacement_promised')).toBe(false);
        expect(canResolve('customer_linked')).toBe(false);
        expect(isNoMoneyAction('app_link_sent')).toBe(true);
        expect(isNoMoneyAction('refund')).toBe(false);
        expect(needsTomorrowCheck(appOrder(true))).toBe(true);
        expect(needsTomorrowCheck(appOrder(true, false))).toBe(false);
        expect(needsTomorrowCheck(refund())).toBe(false);
    });
    it('B01-B07 backstop', () => {
        const base = { isManager: false, creditMaxAgent: 200, otherMoneyActions: 0 };
        expect(backstopFlag({ ...base, actionType: 'wallet_credit', amount: 200 })).toBeNull();
        expect(backstopFlag({ ...base, actionType: 'wallet_credit', amount: 200.01 })).toBe('credit_over_limit');
        expect(backstopFlag({ ...base, actionType: 'wallet_credit', amount: 250, otherMoneyActions: 2 })).toBe('credit_over_limit');
        expect(backstopFlag({ ...base, actionType: 'refund', amount: 900 })).toBeNull();
        expect(backstopFlag({ ...base, actionType: 'refund', amount: 64, otherMoneyActions: 1 })).toBe('repeat_refund');
        expect(backstopFlag({ ...base, isManager: true, actionType: 'wallet_credit', amount: 5000, otherMoneyActions: 3 })).toBeNull();
        expect(backstopFlag({ ...base, actionType: 'replacement_promised', amount: null, otherMoneyActions: 5 })).toBeNull();
    });
    it('M01-M04 moneyBlockReason', () => {
        const base = { manager: false, creditMaxAgent: 200, priorMoneyActions: 0 };
        expect(moneyBlockReason({ ...base, actionType: 'wallet_credit', amount: 250 })).toBe('Above your limit of ₹200. Ask a Desk manager.');
        expect(moneyBlockReason({ ...base, actionType: 'refund', amount: 64, priorMoneyActions: 1 }))
            .toBe('This customer had a refund or credit in the last 30 days. Ask a Desk manager.');
        expect(moneyBlockReason({ ...base, manager: true, actionType: 'wallet_credit', amount: 9999, priorMoneyActions: 4 })).toBeNull();
        expect(moneyBlockReason({ ...base, actionType: 'wallet_credit', amount: 150 })).toBeNull();
    });
});

describe('replayResult', () => {
    const r = (type: string, resolved: boolean, status: string, hold: string | null, esc: string | null) =>
        replayResult({ action_type: type, resolved_ticket: resolved } as never,
            { status, hold_reason: hold, escalation_reason: esc } as never);
    it('P01-P06', () => {
        expect(r('refund', true, 'resolved', null, null)).toEqual({ outcome: 'resolved', flagged: null });
        expect(r('replacement_promised', false, 'on_hold', 'replacement_promised', null)).toEqual({ outcome: 'held', flagged: null });
        expect(r('app_order_created', false, 'on_hold', 'verify_delivery', null)).toEqual({ outcome: 'held', flagged: null });
        expect(r('wallet_credit', false, 'open', null, 'credit_over_limit')).toEqual({ outcome: 'recorded', flagged: 'credit_over_limit' });
        expect(r('refund', false, 'open', null, 'health_concern')).toEqual({ outcome: 'recorded', flagged: null });
        expect(r('refund', false, 'on_hold', 'needs_approval', null)).toEqual({ outcome: 'recorded', flagged: null });
    });
});

describe('customer helpers', () => {
    it('U01-U07', () => {
        expect(snapshotUserIds(null)).toBeNull();
        expect([...(snapshotUserIds(snap('exact', 501, [])) ?? [])]).toEqual([501]);
        expect([...(snapshotUserIds(snap('candidates', null, [601, 602])) ?? [])]).toEqual([601, 602]);
        expect(snapshotUserIds(snap('none', null, []))?.size).toBe(0);
        expect(requestUserId(refund())).toBe(501);
        expect(requestUserId(dayOrder())).toBeNull();
        expect(requestUserId(linked())).toBe(501);
        expect(customerPatch({ backend_user_id: 501 }, 501)).toBeNull();
        expect(customerPatch({ backend_user_id: 501 }, 601)).toEqual({ backend_user_id: 601, customer_match: 'manual' });
        expect(customerPatch({ backend_user_id: null }, 601)).toEqual({ backend_user_id: 601, customer_match: 'manual' });
        expect(customerPatch({ backend_user_id: 501 }, null)).toBeNull();
        expect(amountsMatch(64, 64.009)).toBe(true);
        expect(amountsMatch(64, 64.02)).toBe(false);
    });
    it('U08-U11 snapshot columns', () => {
        expect(snapshotColumnsPatch(dayOrder(), tk(), { amount: 118, paymentStatus: 'cash' }))
            .toEqual({ order_value: 118, payment_status: 'cash', daytime_order_id: 300 });
        expect(snapshotColumnsPatch(dayOrder(), tk({ daytime_order_id: 77 }), { amount: null, paymentStatus: null }))
            .toEqual({ order_value: 120, payment_status: 'unpaid' });
        expect(snapshotColumnsPatch(appOrder(true), tk(), { amount: null, paymentStatus: null }))
            .toEqual({ order_value: 450, order_id: 812 });
        expect(snapshotColumnsPatch(appOrder(true), tk({ order_id: 900 }), { amount: null, paymentStatus: null }))
            .toEqual({ order_value: 450 });
        expect(snapshotColumnsPatch(refund(), tk(), { amount: 32, paymentStatus: null })).toEqual({});
    });
});

describe('drawer helpers', () => {
    it('D01-D05', () => {
        const ticket = { category_slug: 'milk_spoilage', suggested_category: null };
        expect(classifyPart(null, ticket, [])).toEqual({});
        expect(classifyPart('milk_spoilage', ticket, [])).toEqual({});
        const ev = [{ type: 'suggested', data: { source: 'rules' } }] as unknown as TicketEvent[];
        expect(classifyPart('not_chilled', { category_slug: null, suggested_category: 'not_chilled' }, ev))
            .toEqual({ category_slug: 'not_chilled', classification_source: 'rules' });
        expect(classifyPart('late_delivery', { category_slug: null, suggested_category: 'not_chilled' }, []))
            .toEqual({ category_slug: 'late_delivery', classification_source: 'human' });
        expect(walletDescription('Milk spoiled / curdled', 41)).toBe('Desk credit · Milk spoiled / curdled · ticket #41');
        expect(walletDescription(null, 41)).toBe('Desk credit · Customer care · ticket #41');
        expect(replacementDefaults(NOW)).toEqual({ promised_date: '2026-10-21', follow_up_hhmm: '08:30' });
    });
    it('D07 noDeliveryLinkBody', () => {
        expect(noDeliveryLinkBody('none_found')).toEqual({
            op: 'link_delivery', link_status: 'none_found', order_id: null, daytime_order_id: null,
            product_id: null, product_name: null, delivery_date: null, delivery_status: null, delivered_at: null,
            driver_user_id: null, driver_name: null,
        });
    });
    it('D08-D09 error texts', () => {
        expect(actionErrorText('reference_mismatch', 'x')).toContain('does not match');
        expect(actionErrorText('note_required', 'x')).toBe('This needs a note.');
        expect(actionErrorText('internal_error', 'boom')).toBe('boom');
        expect(canRetryRecording('internal_error')).toBe(true);
        expect(canRetryRecording('authz_unavailable')).toBe(true);
        expect(canRetryRecording('reference_mismatch')).toBe(false);
        expect(canRetryRecording('duplicate_reference')).toBe(false);
    });
});

describe('body builders', () => {
    const result = {
        refundTxnId: 9101, debitTxnId: 8800, amount: 32, refundReason: 'Product quality', deliveryDate: '2026-10-19',
        billedToDriver: false, billedDriverId: null, driverDeductionAmount: null, orderId: 812, newWalletBalance: 412.5,
    };
    const w01 = {
        client_action_id: C1, seen_inbound_at: S, resolve: true, action_type: 'refund', ref_type: 'transaction',
        ref_id: '9101', amount: 32,
        data: {
            debit_txn_id: 8800, order_id: 812, delivery_date: '2026-10-19', refund_reason: 'Product quality',
            billed_to_driver: false, billed_driver_id: null, driver_deduction_amount: null, new_wallet_balance: 412.5,
            user_id: 501,
        },
    };
    it('W01-W02 refund', () => {
        const body = refundActionBody({ clientActionId: C1, seen: S, resolve: true, result, userId: 501, classify: {} });
        expect(body).toEqual(w01);
        expect(ticketActionBody.safeParse(body).success).toBe(true);
        const w02 = refundActionBody({
            clientActionId: C1, seen: S, resolve: true, result: { ...result, orderId: 0 }, userId: 501,
            classify: { category_slug: 'not_chilled', classification_source: 'human' },
        });
        expect(w02).toEqual({ ...w01, category_slug: 'not_chilled', classification_source: 'human', data: { ...w01.data, order_id: null } });
    });
    it('W03 wallet credit', () => {
        const body = walletCreditActionBody({
            clientActionId: C1, seen: null, resolve: false, txnId: 77, amount: 50, userId: 501,
            description: 'Desk credit · x · ticket #41', classify: {},
        });
        expect(body).toEqual({
            client_action_id: C1, seen_inbound_at: null, resolve: false, action_type: 'wallet_credit',
            ref_type: 'transaction', ref_id: '77', amount: 50,
            data: { user_id: 501, description: 'Desk credit · x · ticket #41', payment_id: `desk-${C1}` },
        });
        expect(ticketActionBody.safeParse(body).success).toBe(true);
    });
    it('W04 replacement', () => {
        const body = replacementActionBody({
            clientActionId: C1, seen: S, ticketNo: 41, promisedDate: '2026-10-21', note: 'Fresh packet tomorrow',
            productName: null, followUpAt: '2026-10-21T08:30:00+05:30', classify: {},
        });
        expect(body).toEqual({
            client_action_id: C1, seen_inbound_at: S, resolve: false, action_type: 'replacement_promised',
            ref_type: 'promise', ref_id: 'replacement:41:2026-10-21', amount: null,
            hold: { follow_up_at: '2026-10-21T08:30:00+05:30' },
            data: { promised_date: '2026-10-21', note: 'Fresh packet tomorrow', product_name: null },
        });
        expect(ticketActionBody.safeParse(body).success).toBe(true);
    });
});
