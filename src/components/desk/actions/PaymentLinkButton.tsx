'use client';

// Payment link for an unpaid day order. The confirm is an ActionDrawer. A retry after the link was created never
// creates a second one.

import { useState } from 'react';
import { toast } from 'sonner';
import { POST } from '@/lib/api';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import type { TicketActionBody } from '@/lib/desk/contracts';
import { buildPaymentLinkBody, opsBackendErrorText, readPaymentLinkResult, type RecordFailure } from '@/lib/desk/ops-actions';
import { isIndeterminateError } from '@/lib/desk/ops-payment';
import type { SnapshotDayOrder } from '@/lib/desk/types';
import { ActionDrawer } from './ActionDrawer';
import { CloseGuardDialog, FailureNotice, useCloseGuard, useRecordAndClose } from './OpsRecord';

function SendDrawer({ ctx, dayOrder, onDone }: { ctx: DeskActionContext; dayOrder: SnapshotDayOrder; onDone: () => void }) {
    const [seen] = useState(() => ctx.seenInboundAt);
    const [clientActionId] = useState(newClientActionId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const [last, setLast] = useState<{ body: TicketActionBody; failure: RecordFailure } | null>(null);
    const recorder = useRecordAndClose(ctx, onDone);
    const guard = useCloseGuard(last?.failure ?? null, onDone);
    const resend = dayOrder.payment_status === 'link_sent';

    const record = async (body: TicketActionBody) => {
        const failure = await recorder.record(body);
        setLast(failure === null ? null : { body, failure });
    };
    const send = async () => {
        setBusy(true);
        setError('');
        try {
            let result;
            try {
                result = readPaymentLinkResult(await POST(`/daytime/orders/${dayOrder.id}/payment_link`));
            } catch (cause) {
                // A dropped connection or a 5xx can hide a link that was created and sent: warn before a second one goes out.
                if (isIndeterminateError(cause)) setUncertain(true);
                setError(opsBackendErrorText(cause, 'Could not send the payment link.'));
                return;
            }
            if (result === null) { setUncertain(true); setError('The backend did not return a payment link, so one may already exist.'); return; }
            if (!result.whatsappSent) {
                const url = result.shortUrl;
                toast.warning(`Payment link created, but WhatsApp was not sent (${result.whatsappNote ?? 'unknown reason'}). Copy it into the chat.`, {
                    duration: 20_000, action: { label: 'Copy link', onClick: () => { void navigator.clipboard.writeText(url); } },
                });
            }
            await record(buildPaymentLinkBody({ client_action_id: clientActionId, seen_inbound_at: seen }, {
                order: dayOrder, paymentLinkId: result.paymentLinkId, shortUrl: result.shortUrl, whatsappSent: result.whatsappSent,
            }));
        } finally {
            setBusy(false);
        }
    };
    const retry = async (body: TicketActionBody) => {
        setBusy(true);
        try { await record(body); } finally { setBusy(false); }
    };

    return (
        <ActionDrawer title="Send payment link" open onClose={guard.requestClose} closable={!busy && !guard.confirming} suspended={guard.confirming}>
            <div className="space-y-3 text-sm text-slate-300">
                <p>
                    Send a Razorpay payment link for ₹{dayOrder.total_amount} to the customer on WhatsApp?
                    {resend ? ' A link was already sent; this creates a new one.' : ''}
                </p>
                {error ? <p className="text-red-400">{error}</p> : null}
                {uncertain ? (
                    <p className="text-xs text-amber-300">A link may already have been sent to the customer. Check the chat before sending another.</p>
                ) : null}
                {last !== null ? (
                    <FailureNotice failure={last.failure} onRetry={() => { void retry(last.body); }} onRecordOnly={() => { void retry(last.body); }} />
                ) : (
                    <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={onDone} className="flex-1 rounded-xl bg-slate-800 px-3 py-2">Cancel</button>
                        <button type="button" disabled={busy} onClick={() => { void send(); }}
                            className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Sending…' : uncertain ? 'Send another anyway' : 'Send'}</button>
                    </div>
                )}
            </div>
            <CloseGuardDialog guard={guard} onDone={onDone}
                message="The payment link was created but this is not on the ticket. Close anyway?" />
        </ActionDrawer>
    );
}

export function PaymentLinkButton({ ctx, dayOrder, offer }: { ctx: DeskActionContext; dayOrder: SnapshotDayOrder; offer: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            {offer ? (
                <button type="button" onClick={() => setOpen(true)}
                    className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">
                    {dayOrder.payment_status === 'link_sent' ? 'Resend payment link' : 'Send payment link'}
                </button>
            ) : null}
            {open ? <SendDrawer ctx={ctx} dayOrder={dayOrder} onDone={() => setOpen(false)} /> : null}
        </>
    );
}
