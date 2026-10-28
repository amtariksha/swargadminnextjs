'use client';

// The payment step of a day order (contract §2.3): exactly one of link / mark paid / collect on delivery.
// Renders inside an ActionDrawer, so the wallet confirm below stays inside the drawer's portal.

import { useState } from 'react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import { inputClassName, selectClassName } from '@/components/FormField';
import { GET, POST } from '@/lib/api';
import {
    opsBackendErrorText, paymentStepFor, readPaymentLinkResult, type DayOrderStep, type PaymentChoice,
} from '@/lib/desk/ops-actions';
import { isOrderAlreadyPaid, readOrderPaymentState, stepFromOrderState } from '@/lib/desk/ops-payment';
import type { MarkPaidMode } from '@/lib/desk/constants';

interface Props {
    orderId: number; total: number; onStep: (step: DayOrderStep) => void;
    /** The wallet confirm is open: the drawer must not also close on Escape. */
    onConfirming: (open: boolean) => void;
}

const BUTTON = 'w-full rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-50';
const MODE_LABEL: Record<MarkPaidMode, string> = { cash: 'Cash', upi: 'UPI (bank)', wallet: 'Customer wallet' };

function takenText(step: DayOrderStep): string {
    if (step.payment_step === 'link_sent') return 'Link sent';
    if (step.payment_step === 'marked_paid') return `Marked paid (${MODE_LABEL[step.payment_mode as MarkPaidMode] ?? ''})`;
    return 'Collect on delivery';
}

export function DayOrderPaymentPanel({ orderId, total, onStep, onConfirming }: Props) {
    const [busy, setBusy] = useState(false);
    const [taken, setTaken] = useState<DayOrderStep | null>(null);
    const [error, setError] = useState('');
    const [mode, setMode] = useState<MarkPaidMode>('cash');
    const [note, setNote] = useState('');
    const [confirmWallet, setConfirmWallet] = useState(false);
    const locked = busy || taken !== null;

    const finishStep = (step: DayOrderStep) => {
        setTaken(step);
        onStep(step);
    };
    const finish = (choice: PaymentChoice) => finishStep(paymentStepFor(choice));
    const askWallet = (open: boolean) => { setConfirmWallet(open); onConfirming(open); };

    // After a lost response or a repeated click the backend may already hold the step: record what it really holds.
    const reconcile = async (): Promise<boolean> => {
        try {
            const state = readOrderPaymentState(await GET(`/daytime/orders/${orderId}`));
            const step = state === null ? null : stepFromOrderState(state);
            if (step === null) return false;
            toast.info('This order already had its payment step done. It is recorded as the backend shows it.');
            finishStep(step);
            return true;
        } catch {
            return false;
        }
    };

    const sendLink = async () => {
        setBusy(true);
        setError('');
        try {
            const result = readPaymentLinkResult(await POST(`/daytime/orders/${orderId}/payment_link`));
            if (result === null) {
                if (!(await reconcile())) setError('The backend did not return a payment link. Check the order before trying again: a link may exist.');
                return;
            }
            if (result.whatsappSent) toast.success('Payment link sent on WhatsApp');
            else {
                toast.warning(`Payment link created, but WhatsApp was not sent (${result.whatsappNote ?? 'unknown reason'}). Copy it into the chat.`, {
                    duration: 20_000,
                    action: { label: 'Copy link', onClick: () => { void navigator.clipboard.writeText(result.shortUrl); } },
                });
            }
            finish({ kind: 'link_sent', paymentLinkId: result.paymentLinkId });
        } catch (cause) {
            if (isOrderAlreadyPaid(cause) && await reconcile()) return;
            setError(opsBackendErrorText(cause, 'Could not complete the payment step.'));
        } finally {
            setBusy(false);
        }
    };

    const markPaid = async () => {
        askWallet(false);
        setBusy(true);
        setError('');
        try {
            await POST(`/daytime/orders/${orderId}/mark_paid`, { payment_mode: mode, ...(note.trim() ? { note: note.trim() } : {}) });
            finish({ kind: 'marked_paid', mode });
        } catch (cause) {
            if (isOrderAlreadyPaid(cause) && await reconcile()) return;
            setError(opsBackendErrorText(cause, 'Could not complete the payment step.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 text-sm text-slate-300">
            <p className="font-medium text-white">Order {orderId} · Total ₹{total.toFixed(2)}</p>
            <button type="button" className={BUTTON} disabled={locked || total <= 0} onClick={() => { void sendLink(); }}>
                Send payment link
            </button>
            <div className="space-y-2 rounded-xl border border-slate-800 p-3">
                <select className={selectClassName} value={mode} disabled={locked} onChange={(event) => setMode(event.target.value as MarkPaidMode)}>
                    {(Object.keys(MODE_LABEL) as MarkPaidMode[]).map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
                </select>
                <input type="text" maxLength={250} placeholder="Note (optional)" value={note} disabled={locked}
                    className={inputClassName} onChange={(event) => setNote(event.target.value)} />
                <button type="button" className={BUTTON} disabled={locked}
                    onClick={() => (mode === 'wallet' ? askWallet(true) : void markPaid())}>
                    Mark paid
                </button>
            </div>
            <button type="button" className={BUTTON} disabled={locked} onClick={() => finish({ kind: 'collect_on_delivery' })}>
                Collect on delivery
            </button>
            {taken !== null ? <p className="text-xs text-emerald-400">Payment step: {takenText(taken)}</p> : null}
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <ConfirmDialog isOpen={confirmWallet} title="Debit from wallet?" message={`Debit ₹${total.toFixed(2)} from the customer's wallet?`}
                onConfirm={() => { void markPaid(); }} onCancel={() => askWallet(false)} />
        </div>
    );
}
