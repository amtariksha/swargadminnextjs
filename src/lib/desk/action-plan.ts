// Pure rules of the actions route (route 6) and of the P4a drawers: reference ids, the outcome of an
// action, the tomorrow rule, the approval backstop, body builders and error texts. No I/O, no
// clock (callers pass nowMs), no React.

import type { RefundResult } from '@/components/RefundModal';
import { istClockToUtc, addIstDays, istToday } from './business-hours';
import {
    ACTION_DEFAULT_CODE, ACTION_HOLD_REASON, ACTION_OUTCOME, APP_LINK_FOLLOW_UP_DAYS, NEXT_MORNING_FOLLOW_UP_HHMM,
    NO_MONEY_ACTIONS, type ActionType, type ClassificationSource, type DaytimePaymentStatus, type HoldReason,
    type HumanResolutionCode, type TicketType,
} from './constants';
import type { DeskErrorCode, TicketActionBody, TicketPatchBody } from './contracts';
import { classificationSourceFor } from './resolve-plan';
import { deskErrorText } from './ticket-labels';
import type {
    CustomerSnapshot, Ticket, TicketAction, TicketActionResponse, TicketEvent,
} from './types';

export const WALLET_DEDUP_DESCRIPTION = 'Amount credited to wallet';
export const AMOUNT_TOLERANCE = 0.01;

const MS_PER_DAY = 86_400_000;

// ── ids ──
export const refundRefId = (refundTxnId: number): string => String(refundTxnId);
export const walletCreditRefId = (txnId: number): string => String(txnId);
export const holidayRefId = (userId: number, from: string, to: string): string => `user:${userId}:${from}..${to}`;
export const subscriptionRefId = (orderId: number, clientActionId: string): string => `order:${orderId}:${clientActionId}`;
export const replacementRefId = (ticketNo: number, promisedDate: string): string => `replacement:${ticketNo}:${promisedDate}`;
export const customerLinkRefId = (userId: number, phone: string): string => `user:${userId}:${phone}`;
export const walletPaymentId = (clientActionId: string): string => `desk-${clientActionId}`;

const REF_MISMATCH = 'ref_id: does not match the action';

function expectedRefId(body: TicketActionBody, ticketNo: number): string | RegExp | null {
    switch (body.action_type) {
        case 'refund':
        case 'wallet_credit':
            return /^[0-9]{1,18}$/;
        case 'holiday_added':
            return holidayRefId(body.data.user_id, body.data.from, body.data.to);
        case 'day_order_created':
            return String(body.data.daytime_order_id);
        case 'app_order_created':
            return String(body.data.order_id);
        case 'subscription_updated':
            return subscriptionRefId(body.data.order_id, body.client_action_id);
        case 'replacement_promised':
            return replacementRefId(ticketNo, body.data.promised_date);
        case 'delivery_marked_not_delivered':
            return String(body.data.delivery_id);
        case 'customer_linked':
            return customerLinkRefId(body.data.user_id, body.data.phone);
        case 'app_link_sent':
            return body.data.message_id;
        case 'payment_link_sent':
            return null;
    }
}

function refIdMatches(expected: string | RegExp | null, refId: string): boolean {
    if (expected === null) return true;
    return typeof expected === 'string' ? refId === expected : expected.test(refId);
}

function extraProblem(body: TicketActionBody): string | null {
    if (body.action_type === 'wallet_credit') {
        if (body.data.payment_id !== walletPaymentId(body.client_action_id)) {
            return 'data.payment_id: must be desk-<client_action_id>';
        }
        if (body.data.description.trim() === WALLET_DEDUP_DESCRIPTION) {
            return 'data.description: this description is reserved';
        }
    }
    if (body.action_type === 'holiday_added' && body.data.to < body.data.from) {
        return 'data.to: must not be before data.from';
    }
    return null;
}

/** D-7. null = consistent; otherwise the 400 message ('<path>: <reason>'). */
export function requestProblem(body: TicketActionBody, ticketNo: number): string | null {
    if (!refIdMatches(expectedRefId(body, ticketNo), body.ref_id)) return REF_MISMATCH;
    return extraProblem(body);
}

/** D-7 follow-up rule. null = fine; 'follow_up_required' otherwise. */
export function followUpProblem(body: TicketActionBody, nowMs: number): 'follow_up_required' | null {
    if (body.action_type !== 'replacement_promised' && body.action_type !== 'app_link_sent') return null;
    if (body.hold === undefined) return null;
    const at = Date.parse(body.hold.follow_up_at);
    return Number.isFinite(at) && at > nowMs ? null : 'follow_up_required';
}

// ── outcome ──
export const isNoMoneyAction = (type: ActionType): boolean => (NO_MONEY_ACTIONS as readonly string[]).includes(type);
export const canResolve = (type: ActionType): boolean =>
    ACTION_OUTCOME[type] === 'resolve' || ACTION_OUTCOME[type] === 'resolve_unless_tomorrow';

/** true for resolve_unless_tomorrow types whose data.affects_tomorrow is true and body.resolve is true. */
export function needsTomorrowCheck(body: TicketActionBody): boolean {
    if (!body.resolve) return false;
    if (body.action_type !== 'app_order_created' && body.action_type !== 'subscription_updated') return false;
    return body.data.affects_tomorrow;
}

export type OutcomePlan =
    | { kind: 'resolve' }
    | { kind: 'hold'; hold_reason: HoldReason; follow_up_at: string }
    | { kind: 'none' };

export function tomorrowFollowUpIso(nowMs: number): string {
    const tomorrow = addIstDays(istToday(new Date(nowMs)), 1);
    return (istClockToUtc(tomorrow, NEXT_MORNING_FOLLOW_UP_HHMM) as Date).toISOString();
}

export function appLinkFollowUpIso(nowMs: number): string {
    return new Date(nowMs + APP_LINK_FOLLOW_UP_DAYS * MS_PER_DAY).toISOString();
}

function holdPlan(body: TicketActionBody, nowMs: number): OutcomePlan {
    const holdReason = ACTION_HOLD_REASON[body.action_type];
    if (holdReason === undefined) return { kind: 'none' };
    const followUp = 'hold' in body && body.hold !== undefined ? body.hold.follow_up_at : appLinkFollowUpIso(nowMs);
    return { kind: 'hold', hold_reason: holdReason, follow_up_at: followUp };
}

export function planOutcome(input: {
    body: TicketActionBody; ticketResolved: boolean; listGenerated: boolean | null; nowMs: number;
}): OutcomePlan {
    const { body, ticketResolved, listGenerated, nowMs } = input;
    if (ticketResolved) return { kind: 'none' };
    const rule = ACTION_OUTCOME[body.action_type];
    if (rule === 'hold') return holdPlan(body, nowMs);
    if (rule === 'none' || !body.resolve) return { kind: 'none' };
    if (rule === 'resolve_unless_tomorrow' && needsTomorrowCheck(body) && listGenerated !== false) {
        return { kind: 'hold', hold_reason: 'verify_delivery', follow_up_at: tomorrowFollowUpIso(nowMs) };
    }
    return { kind: 'resolve' };
}

export function actionResolveCode(body: TicketActionBody, categoryType: TicketType | null): HumanResolutionCode | null {
    if (body.resolution_code !== undefined) return body.resolution_code;
    if (body.action_type === 'app_order_created' && categoryType === 'request') return 'done';
    return ACTION_DEFAULT_CODE[body.action_type];
}

// ── backstop and replay ──
export type BackstopFlag = TicketActionResponse['flagged'];

export function backstopFlag(input: {
    isManager: boolean; actionType: ActionType; amount: number | null; creditMaxAgent: number; otherMoneyActions: number;
}): BackstopFlag {
    if (input.isManager) return null;
    if (input.actionType === 'wallet_credit' && input.amount !== null && input.amount > input.creditMaxAgent) {
        return 'credit_over_limit';
    }
    const isMoney = input.actionType === 'refund' || input.actionType === 'wallet_credit';
    return isMoney && input.otherMoneyActions > 0 ? 'repeat_refund' : null;
}

export function replayResult(
    action: Pick<TicketAction, 'action_type' | 'resolved_ticket'>,
    ticket: Pick<Ticket, 'status' | 'hold_reason' | 'escalation_reason'>,
): { outcome: TicketActionResponse['outcome']; flagged: BackstopFlag } {
    if (action.resolved_ticket) return { outcome: 'resolved', flagged: null };
    if (ticket.status === 'on_hold' && ticket.hold_reason === (ACTION_HOLD_REASON[action.action_type] ?? null)) {
        return { outcome: 'held', flagged: null };
    }
    const isMoney = action.action_type === 'refund' || action.action_type === 'wallet_credit';
    const reason = ticket.escalation_reason;
    const flagged = isMoney && (reason === 'credit_over_limit' || reason === 'repeat_refund') ? reason : null;
    return { outcome: 'recorded', flagged };
}

// ── customer ──
export function snapshotUserIds(snapshot: CustomerSnapshot | null): ReadonlySet<number> | null {
    if (snapshot === null) return null;
    const ids = new Set<number>();
    if (snapshot.match.user_id !== null) ids.add(snapshot.match.user_id);
    for (const candidate of snapshot.match.candidates) ids.add(candidate.user_id);
    return ids;
}

/** data.user_id for refund, wallet_credit, holiday_added, customer_linked; null for the others. */
export function requestUserId(body: TicketActionBody): number | null {
    switch (body.action_type) {
        case 'refund':
        case 'wallet_credit':
        case 'holiday_added':
        case 'customer_linked':
            return body.data.user_id;
        default:
            return null;
    }
}

export const amountsMatch = (a: number, b: number): boolean => Math.abs(a - b) <= AMOUNT_TOLERANCE + 1e-9;

export function customerPatch(
    ticket: Pick<Ticket, 'backend_user_id'>, userId: number | null,
): { backend_user_id: number; customer_match: 'manual' } | null {
    if (userId === null || userId === ticket.backend_user_id) return null;
    return { backend_user_id: userId, customer_match: 'manual' };
}

/** Step 10 columns other than the customer (D-9). */
export function snapshotColumnsPatch(
    body: TicketActionBody, ticket: Pick<Ticket, 'order_id' | 'daytime_order_id'>,
    verified: { amount: number | null; paymentStatus: DaytimePaymentStatus | null },
): Record<string, unknown> {
    if (body.action_type === 'day_order_created') {
        return {
            order_value: verified.amount ?? body.amount,
            payment_status: verified.paymentStatus ?? body.data.payment_status,
            ...(ticket.daytime_order_id === null ? { daytime_order_id: body.data.daytime_order_id } : {}),
        };
    }
    if (body.action_type === 'app_order_created') {
        return {
            order_value: verified.amount ?? body.amount,
            ...(ticket.order_id === null ? { order_id: body.data.order_id } : {}),
        };
    }
    return {};
}

// ── drawers (browser) ──
export function moneyBlockReason(input: {
    manager: boolean; creditMaxAgent: number; actionType: 'refund' | 'wallet_credit';
    amount: number; priorMoneyActions: number;
}): string | null {
    if (input.manager) return null;
    if (input.actionType === 'wallet_credit' && input.amount > input.creditMaxAgent) {
        return `Above your limit of ₹${input.creditMaxAgent}. Ask a Desk manager.`;
    }
    if (input.priorMoneyActions > 0) {
        return 'This customer had a refund or credit in the last 30 days. Ask a Desk manager.';
    }
    return null;
}

export const defaultCategorySlug = (ticket: Pick<Ticket, 'category_slug' | 'suggested_category'>): string | null =>
    ticket.category_slug ?? ticket.suggested_category;

export interface ClassifyPart { category_slug?: string; classification_source?: ClassificationSource }

export function classifyPart(
    slug: string | null, ticket: Pick<Ticket, 'category_slug' | 'suggested_category'>, events: readonly TicketEvent[],
): ClassifyPart {
    if (slug === null || slug === ticket.category_slug) return {};
    return { category_slug: slug, classification_source: classificationSourceFor(slug, ticket, events) };
}

export function walletDescription(categoryLabel: string | null, ticketNo: number): string {
    return `Desk credit · ${categoryLabel ?? 'Customer care'} · ticket #${ticketNo}`.slice(0, 250);
}

export function replacementDefaults(nowMs: number): { promised_date: string; follow_up_hhmm: string } {
    return { promised_date: addIstDays(istToday(new Date(nowMs)), 1), follow_up_hhmm: NEXT_MORNING_FOLLOW_UP_HHMM };
}

export function noDeliveryLinkBody(status: 'none_found' | 'not_a_customer'): Extract<TicketPatchBody, { op: 'link_delivery' }> {
    return {
        op: 'link_delivery', link_status: status, order_id: null, daytime_order_id: null,
        product_id: null, product_name: null, delivery_date: null, delivery_status: null, delivered_at: null,
        driver_user_id: null, driver_name: null,
    };
}

export function refundActionBody(input: {
    clientActionId: string; seen: string | null; resolve: boolean; result: RefundResult; userId: number;
    classify: ClassifyPart;
}): Extract<TicketActionBody, { action_type: 'refund' }> {
    const { result } = input;
    return {
        client_action_id: input.clientActionId,
        seen_inbound_at: input.seen,
        resolve: input.resolve,
        ...input.classify,
        action_type: 'refund',
        ref_type: 'transaction',
        ref_id: refundRefId(result.refundTxnId),
        amount: result.amount,
        data: {
            debit_txn_id: result.debitTxnId,
            order_id: result.orderId && result.orderId > 0 ? result.orderId : null,
            delivery_date: result.deliveryDate,
            refund_reason: result.refundReason.slice(0, 250),
            billed_to_driver: result.billedToDriver,
            billed_driver_id: result.billedDriverId,
            driver_deduction_amount: result.driverDeductionAmount,
            new_wallet_balance: result.newWalletBalance,
            user_id: input.userId,
        },
    };
}

export function walletCreditActionBody(input: {
    clientActionId: string; seen: string | null; resolve: boolean; txnId: number; amount: number;
    userId: number; description: string; classify: ClassifyPart;
}): Extract<TicketActionBody, { action_type: 'wallet_credit' }> {
    return {
        client_action_id: input.clientActionId,
        seen_inbound_at: input.seen,
        resolve: input.resolve,
        ...input.classify,
        action_type: 'wallet_credit',
        ref_type: 'transaction',
        ref_id: walletCreditRefId(input.txnId),
        amount: input.amount,
        data: {
            user_id: input.userId,
            description: input.description,
            payment_id: walletPaymentId(input.clientActionId),
        },
    };
}

export function replacementActionBody(input: {
    clientActionId: string; seen: string | null; ticketNo: number; promisedDate: string; note: string;
    productName: string | null; followUpAt: string; classify: ClassifyPart;
}): Extract<TicketActionBody, { action_type: 'replacement_promised' }> {
    return {
        client_action_id: input.clientActionId,
        seen_inbound_at: input.seen,
        resolve: false,
        ...input.classify,
        action_type: 'replacement_promised',
        ref_type: 'promise',
        ref_id: replacementRefId(input.ticketNo, input.promisedDate),
        amount: null,
        hold: { follow_up_at: input.followUpAt },
        data: { promised_date: input.promisedDate, note: input.note, product_name: input.productName },
    };
}

const NO_RETRY_CODES: readonly DeskErrorCode[] = [
    'money_not_allowed', 'reference_mismatch', 'duplicate_reference', 'action_cannot_resolve',
    'forbidden', 'validation_failed',
];

const ACTION_ERROR_TEXT: Partial<Record<DeskErrorCode, string>> = {
    money_not_allowed: 'Your Desk access does not include refunds or credits.',
    reference_mismatch: 'The backend record does not match this action, so it was not recorded. Check the transaction.',
    duplicate_reference: 'This refund or credit is already recorded on another ticket.',
    action_cannot_resolve: 'This action does not close a ticket.',
};

export function actionErrorText(code: DeskErrorCode, fallback: string): string {
    return ACTION_ERROR_TEXT[code] ?? deskErrorText(code, fallback);
}

/** false for codes where re-posting the same body cannot succeed. */
export function canRetryRecording(code: DeskErrorCode): boolean {
    return !NO_RETRY_CODES.includes(code);
}
