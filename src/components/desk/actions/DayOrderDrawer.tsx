'use client';

// Day order from the Desk pane: customer fixed from the snapshot, then a mandatory payment step before the
// drawer can close (R-4B1), then one `day_order_created` record. Each drawer is a keyed child so every opening
// starts clean and captures its own seen-token / client id.

import { useEffect, useMemo, useState } from 'react';
import { Sun } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import DaytimeOrderForm from '@/components/DaytimeOrderForm';
import { inputClassName } from '@/components/FormField';
import { useDaytimeOrder } from '@/hooks/useData';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import type { TicketActionBody } from '@/lib/desk/contracts';
import {
    buildDayOrderBody, newCustomerPreset, planOpsResolution, presetCustomerFor, recordOnlyBody, resolveFragment,
    type DayOrderStep, type PresetCustomer, type PresetResult, type RecordFailure,
} from '@/lib/desk/ops-actions';
import { useDeskCategories } from '@/lib/desk/ticket-hooks';
import type { SnapshotDayOrder } from '@/lib/desk/types';
import { ActionDrawer } from './ActionDrawer';
import { DayOrderPaymentPanel } from './DayOrderPaymentPanel';
import { ResolveChoice, useRecordAndClose, useResolveChoice } from './OpsRecord';

const BUTTON = 'rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';
const PRIMARY = 'w-full rounded-xl bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50';

type Stage =
    | { at: 'payment' } | { at: 'recording'; body: TicketActionBody }
    | { at: 'failed'; body: TicketActionBody; failure: RecordFailure };

interface PaymentDrawerProps {
    ctx: DeskActionContext; title: string; orderId: number; total: number | null; deliveryDate: string | null;
    newCustomer: boolean; strict: boolean; onDone: () => void;
}

/** Payment step + record. `strict` (a just-saved order) cannot be closed before a step is taken. */
function PaymentDrawer({ ctx, title, orderId, total, deliveryDate, newCustomer, strict, onDone }: PaymentDrawerProps) {
    const [seen] = useState(() => ctx.seenInboundAt);
    const [clientActionId] = useState(newClientActionId);
    const [stage, setStage] = useState<Stage>({ at: 'payment' });
    const [confirmClose, setConfirmClose] = useState(false);
    const needsOrder = total === null || deliveryDate === null;
    const order = useDaytimeOrder(needsOrder ? orderId : undefined);
    const categories = useDeskCategories();
    const plan = useMemo(() => planOpsResolution('day_order_created', ctx.ticket, categories.items), [ctx.ticket, categories.items]);
    const [choice, setChoice] = useResolveChoice(plan.initial);
    const recorder = useRecordAndClose(ctx, onDone);
    const finalTotal = total ?? order.data?.total_amount ?? null;
    const finalDate = deliveryDate ?? order.data?.delivery_date ?? null;
    const guard = strict || stage.at !== 'payment';

    useEffect(() => {
        if (!guard) return undefined;
        const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [guard]);

    const post = async (body: TicketActionBody) => {
        setStage({ at: 'recording', body });
        const failure = await recorder.record(body);
        if (failure !== null) setStage({ at: 'failed', body, failure });
    };
    const onStep = (step: DayOrderStep) => {
        if (finalTotal === null || finalDate === null) return;
        const fragment = resolveFragment(choice, ctx.ticket, ctx.detail.events);
        void post(buildDayOrderBody({ client_action_id: clientActionId, seen_inbound_at: seen }, fragment, {
            orderId, total: finalTotal, deliveryDate: finalDate, step, newCustomer,
        }));
    };
    const failure = stage.at === 'failed' ? stage.failure : null;
    const closable = stage.at === 'failed' || (!strict && stage.at === 'payment');
    const requestClose = () => (failure !== null && failure.kind !== 'final' ? setConfirmClose(true) : onDone());

    return (
        <ActionDrawer title={title} open onClose={requestClose} closable={closable}>
            <div className="space-y-4">
                {needsOrder && order.isPending ? <p className="text-sm text-slate-400">Loading the saved order…</p> : null}
                {needsOrder && order.isError ? (
                    <div className="space-y-2 text-sm text-red-400">
                        <p>Could not load order {orderId}.</p>
                        <button type="button" className={BUTTON} onClick={() => { void order.refetch(); }}>Retry</button>
                    </div>
                ) : null}
                {finalTotal !== null && finalDate !== null ? (
                    <>
                        <ResolveChoice plan={plan} current={ctx.category} value={choice} onChange={setChoice} disabled={stage.at !== 'payment'} />
                        <DayOrderPaymentPanel orderId={orderId} total={finalTotal} onStep={onStep} />
                    </>
                ) : null}
                {stage.at === 'recording' ? <p className="text-sm text-slate-300">Recording on the ticket…</p> : null}
                {stage.at === 'failed' ? (
                    <div className="space-y-2 text-sm">
                        <p className="text-red-400">{stage.failure.text}</p>
                        {stage.failure.kind === 'precondition' ? (
                            <button type="button" className={PRIMARY} onClick={() => { void post(recordOnlyBody(stage.body)); }}>Record without resolving</button>
                        ) : null}
                        {stage.failure.kind === 'retry' ? (
                            <button type="button" className={PRIMARY} onClick={() => { void post(stage.body); }}>Retry</button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <ConfirmDialog isOpen={confirmClose} title="Close without recording?" confirmText="Close anyway"
                message={`Order ${orderId} is saved and its payment step is done, but it is not on this ticket. The ticket stays open and the pane will list the order under recent actions. Close anyway?`}
                onConfirm={onDone} onCancel={() => setConfirmClose(false)} />
        </ActionDrawer>
    );
}

type Intake = { at: 'name'; phone: string; name: string } | { at: 'form'; preset: PresetCustomer };
interface Saved { orderId: number; total: number | null; preset: PresetCustomer }

function DayOrderIntake({ preset, onSaved, onClose }: {
    preset: Exclude<PresetResult, { kind: 'blocked' }>; onSaved: (saved: Saved) => void; onClose: () => void;
}) {
    const [phase, setPhase] = useState<Intake>(() => (preset.kind === 'ready'
        ? { at: 'form', preset: preset.customer }
        : { at: 'name', phone: preset.phone, name: preset.suggestedName }));
    const named = phase.at === 'name' ? newCustomerPreset(phase.phone, phase.name) : null;
    return (
        <ActionDrawer title="New day order" open onClose={onClose} closable>
            {phase.at === 'name' ? (
                <div className="space-y-3 text-sm text-slate-300">
                    <p>Phone: {phase.phone}</p>
                    <input type="text" maxLength={80} value={phase.name} placeholder="Customer name" className={inputClassName}
                        onChange={(event) => setPhase({ ...phase, name: event.target.value })} />
                    <p className="text-xs text-slate-400">A new customer account is created with this number when the order is saved.</p>
                    <button type="button" className={PRIMARY} disabled={named === null}
                        onClick={() => { if (named !== null) setPhase({ at: 'form', preset: named }); }}>Continue</button>
                </div>
            ) : (
                <DaytimeOrderForm presetCustomer={phase.preset}
                    onSaved={(orderId, extra) => onSaved({ orderId, total: extra?.total ?? null, preset: phase.preset })} />
            )}
        </ActionDrawer>
    );
}

export function DayOrderAction({ ctx }: { ctx: DeskActionContext }) {
    const [openKey, setOpenKey] = useState(0);
    const [open, setOpen] = useState(false);
    const [saved, setSaved] = useState<Saved | null>(null);
    const preset = presetCustomerFor(ctx.snapshot, ctx.ticket.customer_name);
    if (preset.kind === 'blocked' && preset.reason === 'staff') return null;
    const close = () => { setOpen(false); setSaved(null); };
    return (
        <>
            <button type="button" className={BUTTON} disabled={preset.kind === 'blocked'}
                title={preset.kind === 'blocked' ? 'Pick the customer in the match banner first' : undefined}
                onClick={() => { setOpenKey((key) => key + 1); setSaved(null); setOpen(true); }}>
                <Sun className="mr-1 inline h-3 w-3" />Day order
            </button>
            {open && openKey > 0 && preset.kind !== 'blocked' && saved === null ? (
                <DayOrderIntake key={openKey} preset={preset} onSaved={setSaved} onClose={close} />
            ) : null}
            {open && saved !== null ? (
                <PaymentDrawer key={openKey} ctx={ctx} title="New day order" orderId={saved.orderId} total={saved.total}
                    deliveryDate={null} newCustomer={saved.preset.isNew} strict onDone={close} />
            ) : null}
        </>
    );
}

/** Row button for a day order created outside a finished drawer (D-11). */
export function DayOrderResumeAction({ ctx, dayOrder }: { ctx: DeskActionContext; dayOrder: SnapshotDayOrder }) {
    const [openKey, setOpenKey] = useState(0);
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className={BUTTON} onClick={() => { setOpenKey((key) => key + 1); setOpen(true); }}>Take payment step</button>
            {open ? (
                <PaymentDrawer key={openKey} ctx={ctx} title={`Payment for order #${dayOrder.order_no}`} orderId={dayOrder.id}
                    total={dayOrder.total_amount} deliveryDate={dayOrder.delivery_date} newCustomer={false} strict={false}
                    onDone={() => setOpen(false)} />
            ) : null}
        </>
    );
}
