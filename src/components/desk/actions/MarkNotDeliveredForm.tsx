'use client';

// Mark one delivery not delivered: POST /pre_delivery_reason, then record. It does not refund (that is the
// refund strip). A retry after the backend call succeeded never calls the backend again.

import { useState } from 'react';
import { PackageX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { selectClassName, textareaClassName } from '@/components/FormField';
import { GET, POST } from '@/lib/api';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import { useNowMs } from '@/lib/desk/browser-hooks';
import { DELIVERY_STATUS_LABEL } from '@/lib/desk/constants';
import type { TicketActionBody } from '@/lib/desk/contracts';
import {
    buildNotDeliveredBody, canMarkNotDelivered, istDateAfter, opsBackendErrorText, type RecordFailure,
} from '@/lib/desk/ops-actions';
import { REASON_CATEGORIES } from '@/lib/deliveryHelpers';
import type { SnapshotDelivery } from '@/lib/desk/types';
import { ActionDrawer } from './ActionDrawer';
import { CloseGuardDialog, FailureNotice, useCloseGuard, useRecordAndClose } from './OpsRecord';

interface ReasonCatalogRow { id: number; category: number; category_label: string; reason_text: string; sort_order: number }
type Category = 1 | 2 | 3 | 4;

const STATUS_TEXT = { pending: 'Pending', not_delivered: 'Not delivered', delivered: 'Delivered' } as const;

function Flow({ ctx, delivery, onDone }: { ctx: DeskActionContext; delivery: SnapshotDelivery; onDone: () => void }) {
    const [seen] = useState(() => ctx.seenInboundAt);
    const [clientActionId] = useState(newClientActionId);
    const [category, setCategory] = useState<Category | ''>('');
    const [reason, setReason] = useState('');
    const [saved, setSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [last, setLast] = useState<{ body: TicketActionBody; failure: RecordFailure } | null>(null);
    const recorder = useRecordAndClose(ctx, onDone);
    const guard = useCloseGuard(last?.failure ?? null, onDone);
    const catalog = useQuery({
        queryKey: ['delivery-reason-catalog'],
        queryFn: async () => (await GET<ReasonCatalogRow[]>('/get_delivery_reason_catalog')).data ?? [],
        staleTime: 5 * 60 * 1000,
    });
    const canned = (catalog.data ?? []).filter((row) => row.category === category);

    const record = async (body: TicketActionBody) => {
        const failure = await recorder.record(body);
        setLast(failure === null ? null : { body, failure });
    };
    const submit = async () => {
        if (category === '') return;
        setBusy(true);
        setError('');
        try {
            if (!saved) {
                try {
                    await POST('/pre_delivery_reason', { id: delivery.delivery_id, reason_category: category, reason: reason.trim() || null, status: 2 });
                    setSaved(true);
                } catch (cause) {
                    setError(opsBackendErrorText(cause, 'Could not mark the delivery.'));
                    return;
                }
            }
            await record(buildNotDeliveredBody({ client_action_id: clientActionId, seen_inbound_at: seen }, { delivery, reasonCategory: category, reason }));
        } finally {
            setBusy(false);
        }
    };
    const retry = async (body: TicketActionBody) => {
        setBusy(true);
        try { await record(body); } finally { setBusy(false); }
    };

    return (
        <ActionDrawer title="Mark not delivered" open onClose={guard.requestClose} closable={!busy && !guard.confirming}>
            <div className="space-y-3 text-sm text-slate-300">
                <p>
                    {delivery.delivery_date} · {delivery.product_title}{delivery.qty_text ? ` (${delivery.qty_text})` : ''} × {delivery.qty}
                    {delivery.driver_name ? ` · ${delivery.driver_name}` : ''} · {STATUS_TEXT[DELIVERY_STATUS_LABEL[delivery.status]]}
                </p>
                {delivery.status === 3 ? (
                    <p className="text-xs text-amber-300">The driver app shows this delivered{delivery.tap_time ? ` at ${delivery.tap_time}` : ''}.</p>
                ) : null}
                <select className={selectClassName} value={category} disabled={saved}
                    onChange={(event) => setCategory(event.target.value === '' ? '' : (Number(event.target.value) as Category))}>
                    <option value="">Performance category…</option>
                    {Object.entries(REASON_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
                {canned.length > 0 ? (
                    <select className={selectClassName} value="" disabled={saved} onChange={(event) => setReason(event.target.value)}>
                        <option value="">Canned reason…</option>
                        {canned.map((row) => <option key={row.id} value={row.reason_text}>{row.reason_text}</option>)}
                    </select>
                ) : null}
                <textarea rows={3} maxLength={250} value={reason} disabled={saved} className={textareaClassName}
                    placeholder="Reason (optional)" onChange={(event) => setReason(event.target.value)} />
                <p className="text-xs text-slate-400">This does not refund the customer. Use Refund on this delivery for the money.</p>
                {error ? <p className="text-red-400">{error}</p> : null}
                {last !== null ? (
                    <FailureNotice failure={last.failure} onRetry={() => { void retry(last.body); }} onRecordOnly={() => { void retry(last.body); }} />
                ) : (
                    <button type="button" disabled={category === '' || busy} onClick={() => { void submit(); }}
                        className="w-full rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">
                        {busy ? 'Working…' : 'Mark not delivered'}
                    </button>
                )}
            </div>
            <CloseGuardDialog guard={guard} onDone={onDone}
                message="The delivery is marked not delivered in the backend but this is not on the ticket. Close anyway?" />
        </ActionDrawer>
    );
}

export function MarkNotDeliveredAction({ ctx, delivery, offer }: { ctx: DeskActionContext; delivery: SnapshotDelivery; offer: boolean }) {
    const nowMs = useNowMs(60_000);
    const [open, setOpen] = useState(false);
    // Eligibility only gates the button: once the backend call lands the row is "not delivered" and the flow must stay for its Retry.
    const eligible = offer && nowMs !== 0 && canMarkNotDelivered(delivery, istDateAfter(nowMs, 0));
    return (
        <>
            {eligible ? (
                <button type="button" onClick={() => setOpen(true)}
                    className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">
                    <PackageX className="mr-1 inline h-3 w-3" />Not delivered
                </button>
            ) : null}
            {open ? <Flow ctx={ctx} delivery={delivery} onDone={() => setOpen(false)} /> : null}
        </>
    );
}
