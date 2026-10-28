// Pure helpers for reconciling the day-order payment step with what the backend really holds (P4b review M2):
// a lost response must never leave the exec recording a step that did not happen.

import { paymentStepFor, type DayOrderStep } from './ops-actions';

export interface OrderPaymentState { status: string; mode: string | null; linkId: string | null }

type Rec = Record<string, unknown>;
const asRecord = (value: unknown): Rec | null =>
    (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : null);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** The backend answers 422 `daytime_order_paid` when the order was already paid (mark_paid / payment_link). */
export function isOrderAlreadyPaid(error: unknown): boolean {
    return asRecord(error)?.code === 'daytime_order_paid';
}

/** `res` is the whole body of `GET /daytime/orders/:id`. */
export function readOrderPaymentState(res: unknown): OrderPaymentState | null {
    const data = asRecord(asRecord(res)?.data);
    const status = textOrNull(data?.payment_status);
    if (data === null || status === null) return null;
    return { status, mode: textOrNull(data.payment_mode), linkId: textOrNull(data.payment_link_id) };
}

/** The payment step the order's real state proves, or null when the state proves no step (unpaid, unknown). */
export function stepFromOrderState(state: OrderPaymentState): DayOrderStep | null {
    if (state.status === 'cash') return paymentStepFor({ kind: 'marked_paid', mode: 'cash' });
    if (state.status === 'wallet_deducted') return paymentStepFor({ kind: 'marked_paid', mode: 'wallet' });
    if (state.status === 'link_sent' && state.linkId !== null) return paymentStepFor({ kind: 'link_sent', paymentLinkId: state.linkId });
    if (state.status !== 'paid') return null;
    if (state.mode === 'upi') return paymentStepFor({ kind: 'marked_paid', mode: 'upi' });
    if (state.linkId === null) return null;
    return { payment_step: 'link_sent', payment_status: 'paid', payment_mode: 'link', payment_link_id: state.linkId };
}
