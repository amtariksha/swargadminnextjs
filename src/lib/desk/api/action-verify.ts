// Contract §2.2 verification of a recorded action: server to backend, with the caller's bearer
// token. The judges are pure and exported for the tests; verifyAction does the reads. A check that
// ran and contradicts the request throws reference_mismatch; one that could not run leaves
// verified = false. Messages never carry an id, phone or amount.

import { z } from 'zod';
import { amountsMatch, snapshotUserIds } from '../action-plan';
import { deskBackendGet } from '../backend';
import { DAYTIME_PAYMENT_STATUSES, type DaytimePaymentStatus } from '../constants';
import { backendEnvelope, type TicketActionBody } from '../contracts';
import { DeskApiError } from '../api-error';
import type { CustomerSnapshot } from '../types';

export type Check = 'pass' | 'mismatch' | 'unavailable';
export interface BackendTxn { id: number; user_id: number; amount: number; type: number; payment_id?: string | null }
export interface BackendDayOrder {
    user_id: number | null; total_amount: number; order_status: string;
    payment_status: string | null; payment_link_id: string | null;
}

export function judgeUserInSet(userId: number | null, users: ReadonlySet<number> | null): Check {
    if (users === null) return 'unavailable';
    return userId !== null && users.has(userId) ? 'pass' : 'mismatch';
}

export function judgeCreditTxn(txn: BackendTxn, expect: { userId: number; amount: number; paymentId?: string }): Check {
    const ok = txn.type === 1 && txn.user_id === expect.userId && amountsMatch(txn.amount, expect.amount)
        && (expect.paymentId === undefined || txn.payment_id === expect.paymentId);
    return ok ? 'pass' : 'mismatch';
}

export function judgeRefundContext(context: { is_debit: boolean; already_refunded: boolean }): Check {
    return context.is_debit && context.already_refunded ? 'pass' : 'mismatch';
}

export function judgeHolidayRows(rows: ReadonlyArray<{ date: string }>, from: string): Check {
    return rows.some((row) => row.date === from) ? 'pass' : 'mismatch';
}

export function judgeDayOrder(order: BackendDayOrder, amount: number): Check {
    return order.order_status !== 'cancelled' && amountsMatch(order.total_amount, amount) ? 'pass' : 'mismatch';
}

export function judgePaymentLink(order: BackendDayOrder, refId: string): Check {
    return order.payment_link_id === refId ? 'pass' : 'mismatch';
}

export function combineChecks(checks: readonly Check[]): Check {
    if (checks.includes('mismatch')) return 'mismatch';
    return checks.length > 0 && checks.every((check) => check === 'pass') ? 'pass' : 'unavailable';
}

export interface VerifyOutcome {
    verified: boolean;
    /** The backend amount when the record check passed (refund, wallet_credit, day_order_created). */
    amount: number | null;
    /** D-5: the customer a check confirmed, or null. */
    confirmedUserId: number | null;
    /** day_order_created: the backend payment_status when the record check passed and it is a known value. */
    paymentStatus: DaytimePaymentStatus | null;
}

const txnSchema = z.object({
    id: z.coerce.number(), user_id: z.coerce.number(), amount: z.coerce.number(), type: z.coerce.number(),
    payment_id: z.string().nullable().optional(),
});
const refundContextSchema = z.object({ is_debit: z.boolean(), already_refunded: z.boolean() });
const holidaysSchema = z.array(z.object({ date: z.string() }));
const dayOrderSchema = z.object({
    user_id: z.coerce.number().nullable(), total_amount: z.coerce.number(), order_status: z.string(),
    payment_status: z.string().nullable(), payment_link_id: z.string().nullable(),
});
const orderSchema = z.object({ user_id: z.coerce.number() });

type Read<T> = { kind: 'ok'; data: T } | { kind: 'not_found' } | { kind: 'unavailable' };

async function readBackend<T>(path: string, token: string, schema: z.ZodType<T>): Promise<Read<T>> {
    try {
        const response = await deskBackendGet(path, token);
        if (response.status === 404) return { kind: 'not_found' };
        if (response.status !== 200) return { kind: 'unavailable' };
        const parsed = backendEnvelope(schema).safeParse(await response.json());
        return parsed.success && parsed.data.response === 200 ? { kind: 'ok', data: parsed.data.data } : { kind: 'unavailable' };
    } catch {
        return { kind: 'unavailable' };
    }
}

/** A record read mapped to a check: not_found contradicts the request, unavailable could not run. */
function judged<T>(read: Read<T>, judge: (data: T) => Check): Check {
    if (read.kind === 'not_found') return 'mismatch';
    return read.kind === 'ok' ? judge(read.data) : 'unavailable';
}

interface Named { check: Check; message: string }

const MSG_CUSTOMER = 'This customer is not the one matched to this WhatsApp number.';
const NONE: VerifyOutcome = { verified: false, amount: null, confirmedUserId: null, paymentStatus: null };

function conclude(named: readonly Named[], outcome: Omit<VerifyOutcome, 'verified'>): VerifyOutcome {
    const failed = named.find((item) => item.check === 'mismatch');
    if (failed) throw new DeskApiError('reference_mismatch', failed.message);
    return { verified: combineChecks(named.map((item) => item.check)) === 'pass', ...outcome };
}

type Body<K extends TicketActionBody['action_type']> = Extract<TicketActionBody, { action_type: K }>;

async function verifyTransaction(
    body: Body<'refund'> | Body<'wallet_credit'>, token: string, snapshot: Promise<CustomerSnapshot | null>,
): Promise<VerifyOutcome> {
    const contextRead: Promise<Read<z.infer<typeof refundContextSchema>> | null> = body.action_type === 'refund'
        ? readBackend(`/refund/order-context/${body.data.debit_txn_id}`, token, refundContextSchema)
        : Promise.resolve(null);
    const [txn, context, snap] = await Promise.all([
        readBackend(`/txn/${body.ref_id}`, token, txnSchema), contextRead, snapshot,
    ]);
    const userId = body.data.user_id;
    const paymentId = body.action_type === 'wallet_credit' ? body.data.payment_id : undefined;
    const set = judgeUserInSet(userId, snapshotUserIds(snap));
    const txnCheck = judged(txn, (row) => judgeCreditTxn(row, { userId, amount: body.amount, paymentId }));
    const named: Named[] = [
        { check: set, message: MSG_CUSTOMER },
        { check: txnCheck, message: 'The credit transaction belongs to another customer or has another amount.' },
    ];
    if (context !== null) {
        named.push({
            check: judged(context, judgeRefundContext),
            message: 'The original debit is not marked as refunded.',
        });
    }
    return conclude(named, {
        amount: txnCheck === 'pass' && txn.kind === 'ok' ? txn.data.amount : null,
        confirmedUserId: set === 'pass' || txnCheck === 'pass' ? userId : null,
        paymentStatus: null,
    });
}

async function verifyHoliday(
    body: Body<'holiday_added'>, token: string, snapshot: Promise<CustomerSnapshot | null>,
): Promise<VerifyOutcome> {
    const [rows, snap] = await Promise.all([
        readBackend(`/get_user_holiday/user/${body.data.user_id}`, token, holidaysSchema), snapshot,
    ]);
    const set = judgeUserInSet(body.data.user_id, snapshotUserIds(snap));
    const rowCheck = judged(rows, (list) => judgeHolidayRows(list, body.data.from));
    return conclude(
        [{ check: set, message: MSG_CUSTOMER }, { check: rowCheck, message: 'No holiday on that date.' }],
        { amount: null, confirmedUserId: set === 'pass' || rowCheck === 'pass' ? body.data.user_id : null, paymentStatus: null },
    );
}

async function verifyDayOrder(
    body: Body<'day_order_created'>, token: string, snapshot: Promise<CustomerSnapshot | null>,
): Promise<VerifyOutcome> {
    const [read, snap] = await Promise.all([
        readBackend(`/daytime/orders/${body.ref_id}`, token, dayOrderSchema), snapshot,
    ]);
    const orderCheck = judged(read, (order) => judgeDayOrder(order, body.amount));
    const order = read.kind === 'ok' ? read.data : null;
    const set = order === null ? 'unavailable' : judgeUserInSet(order.user_id, snapshotUserIds(snap));
    const known = (DAYTIME_PAYMENT_STATUSES as readonly string[]).includes(order?.payment_status ?? '');
    return conclude(
        [{ check: orderCheck, message: 'The day order is cancelled or its total differs.' }, { check: set, message: MSG_CUSTOMER }],
        {
            amount: orderCheck === 'pass' && order !== null ? order.total_amount : null,
            confirmedUserId: orderCheck === 'pass' && order !== null ? order.user_id : null,
            paymentStatus: orderCheck === 'pass' && known ? (order?.payment_status as DaytimePaymentStatus) : null,
        },
    );
}

async function verifyOrderOwner(
    orderId: number, token: string, snapshot: Promise<CustomerSnapshot | null>,
): Promise<VerifyOutcome> {
    const [read, snap] = await Promise.all([readBackend(`/get_order/${orderId}`, token, orderSchema), snapshot]);
    const check = judged(read, (order) => judgeUserInSet(order.user_id, snapshotUserIds(snap)));
    return conclude([{ check, message: MSG_CUSTOMER }], {
        amount: null, confirmedUserId: read.kind === 'ok' ? read.data.user_id : null, paymentStatus: null,
    });
}

async function verifyPaymentLink(body: Body<'payment_link_sent'>, token: string): Promise<VerifyOutcome> {
    const read = await readBackend(`/daytime/orders/${body.data.daytime_order_id}`, token, dayOrderSchema);
    const check = judged(read, (order) => judgePaymentLink(order, body.ref_id));
    return conclude([{ check, message: 'The payment link does not belong to this order.' }],
        { amount: null, confirmedUserId: null, paymentStatus: null });
}

/** Throws DeskApiError('reference_mismatch', …) when a check ran and contradicts the request. */
export async function verifyAction(
    body: TicketActionBody, token: string, snapshot: Promise<CustomerSnapshot | null>,
): Promise<VerifyOutcome> {
    switch (body.action_type) {
        case 'refund':
        case 'wallet_credit':
            return verifyTransaction(body, token, snapshot);
        case 'holiday_added':
            return verifyHoliday(body, token, snapshot);
        case 'day_order_created':
            return verifyDayOrder(body, token, snapshot);
        case 'app_order_created':
            return verifyOrderOwner(body.data.order_id, token, snapshot);
        case 'subscription_updated':
            return verifyOrderOwner(body.data.order_id, token, snapshot);
        case 'payment_link_sent':
            return verifyPaymentLink(body, token);
        default:
            return NONE;
    }
}
