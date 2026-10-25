'use client';

// Refund on one delivery row: button → drawer (confirm → link → RefundModal → record). RefundModal
// is mounted inside the ActionDrawer (a Modal inside the pane's glass cards would be clipped).

import { useState } from 'react';
import RefundModal, { type RefundResult } from '@/components/RefundModal';
import { selectClassName } from '@/components/FormField';
import type { TicketActionBody } from '@/lib/desk/contracts';
import {
    actionErrorText, canRetryRecording, classifyPart, defaultCategorySlug, moneyBlockReason, refundActionBody,
} from '@/lib/desk/action-plan';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext } from '@/lib/desk/action-context';
import { useTicketAction } from '@/lib/desk/action-mutations';
import { describeDeskError } from '@/lib/desk/desk-query';
import { deliveryLinkBody } from '@/lib/desk/snapshot-format';
import { groupCategoriesByType } from '@/lib/desk/ticket-format';
import { useDeskCategories } from '@/lib/desk/ticket-hooks';
import { TICKET_TYPE_LABEL } from '@/lib/desk/ticket-labels';
import { useTicketPatch } from '@/lib/desk/ticket-mutations';
import type { SnapshotDelivery } from '@/lib/desk/types';
import type { UserTransaction } from '@/hooks/useData';
import { ActionDrawer } from './ActionDrawer';

interface Session { clientActionId: string; seen: string | null }

type Stage =
    | { kind: 'confirm' } | { kind: 'linking' } | { kind: 'modal' } | { kind: 'recording' }
    | { kind: 'failed'; body: TicketActionBody; code: Parameters<typeof canRetryRecording>[0]; text: string }
    | { kind: 'lost_id' };

interface DrawerProps { ctx: DeskActionContext; delivery: SnapshotDelivery; session: Session; onClose: () => void }

function RefundDrawer({ ctx, delivery, session, onClose }: DrawerProps) {
    const categories = useDeskCategories();
    const patch = useTicketPatch(ctx.ticket.id);
    const action = useTicketAction(ctx.ticket.id);
    const [stage, setStage] = useState<Stage>({ kind: 'confirm' });
    const [slug, setSlug] = useState(defaultCategorySlug(ctx.ticket) ?? '');
    const [closeTicket, setCloseTicket] = useState(true);
    const [error, setError] = useState('');
    const profile = ctx.snapshot.profile;
    const category = categories.bySlug.get(slug) ?? null;
    const needsLink = ctx.ticket.link_status === null;

    const record = (body: TicketActionBody) => {
        setStage({ kind: 'recording' });
        action.mutate(body, {
            onSuccess: (outcome) => { ctx.onRecorded(outcome); onClose(); },
            onError: (cause) => {
                const code = describeDeskError(cause).code;
                setStage({ kind: 'failed', body, code, text: actionErrorText(code, cause.message) });
            },
        });
    };

    const onRefunded = (result: RefundResult) => {
        if (profile === null || result.refundTxnId <= 0) { setStage({ kind: 'lost_id' }); return; }
        record(refundActionBody({
            clientActionId: session.clientActionId, seen: session.seen, resolve: closeTicket, result,
            userId: profile.user_id, classify: classifyPart(slug || null, ctx.ticket, ctx.detail.events),
        }));
    };

    const onContinue = async () => {
        setError('');
        if (!needsLink) { setStage({ kind: 'modal' }); return; }
        setStage({ kind: 'linking' });
        try {
            await patch.mutateAsync(deliveryLinkBody(delivery));
            setStage({ kind: 'modal' });
        } catch (cause) {
            setError(describeDeskError(cause instanceof Error ? cause : new Error('Failed')).text);
            setStage({ kind: 'confirm' });
        }
    };

    const closable = stage.kind === 'confirm' || stage.kind === 'failed' || stage.kind === 'lost_id';
    const transaction: UserTransaction | null = profile === null || delivery.debit_txn_id === null || delivery.debit_amount === null
        ? null
        : {
            id: delivery.debit_txn_id, user_id: profile.user_id, amount: delivery.debit_amount, type: 2,
            created_at: delivery.delivery_date, name: profile.name ?? undefined, order_id: delivery.order_id,
            delivery_date: delivery.delivery_date,
        };
    const title = `Refund · ${delivery.delivery_date} · ${delivery.product_title}`;

    return (
        <ActionDrawer title={title} open onClose={onClose} closable={closable}>
            {stage.kind === 'confirm' || stage.kind === 'linking' ? (
                <div className="space-y-3 text-sm text-slate-300">
                    <label className="block space-y-1">
                        <span>Category</span>
                        <select className={selectClassName} value={slug} onChange={(event) => setSlug(event.target.value)}>
                            <option value="">Choose a category…</option>
                            {groupCategoriesByType(categories.items).map((group) => (
                                <optgroup key={group.type} label={TICKET_TYPE_LABEL[group.type]}>
                                    {group.items.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={closeTicket} onChange={(event) => setCloseTicket(event.target.checked)} />
                        Close the ticket
                    </label>
                    {needsLink ? <p className="text-xs text-slate-400">This delivery will be linked to the ticket.</p> : null}
                    {error ? <p className="text-sm text-red-400">{error}</p> : null}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-800 px-3 py-2">Cancel</button>
                        <button type="button" onClick={() => { void onContinue(); }}
                            disabled={stage.kind === 'linking' || (closeTicket && slug === '')}
                            className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-white disabled:opacity-50">
                            {stage.kind === 'linking' ? 'Linking…' : 'Continue'}
                        </button>
                    </div>
                </div>
            ) : null}
            {stage.kind === 'modal' && transaction !== null ? (
                <RefundModal
                    transaction={transaction}
                    defaultReason={category?.refund_reason_label ?? undefined}
                    defaultDriverId={delivery.driver_user_id ?? ctx.snapshot.driver?.user_id ?? undefined}
                    onClose={() => setStage((current) => (current.kind === 'modal' ? { kind: 'confirm' } : current))}
                    onSuccess={onRefunded}
                />
            ) : null}
            {stage.kind === 'recording' ? <p className="text-sm text-slate-300">Recording the refund on the ticket…</p> : null}
            {stage.kind === 'lost_id' ? (
                <p className="text-sm text-amber-300">
                    The refund went through but its id did not come back. It will show on the delivery row after a
                    refresh; resolve the ticket from the header.
                </p>
            ) : null}
            {stage.kind === 'failed' ? (
                <div className="space-y-3 text-sm">
                    <p className="text-red-400">Refund done; recording it on the ticket failed: {stage.text}</p>
                    <div className="flex gap-2">
                        {canRetryRecording(stage.code) ? (
                            <button type="button" onClick={() => record(stage.body)}
                                className="flex-1 rounded-xl bg-green-600 px-3 py-2 text-white">Retry</button>
                        ) : null}
                        <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-slate-200">Close</button>
                    </div>
                </div>
            ) : null}
        </ActionDrawer>
    );
}

export function RefundStrip({ ctx, delivery }: { ctx: DeskActionContext; delivery: SnapshotDelivery }) {
    const [session, setSession] = useState<Session | null>(null);
    if (delivery.refunded) {
        return (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                Refunded ₹{delivery.refund_amount ?? ''}
            </span>
        );
    }
    if (delivery.debit_txn_id === null || delivery.debit_amount === null || ctx.snapshot.profile === null) return null;
    const blocked = moneyBlockReason({
        manager: ctx.me.manager, creditMaxAgent: ctx.me.credit_max_agent, actionType: 'refund',
        amount: delivery.debit_amount, priorMoneyActions: ctx.detail.prior_money_actions.length,
    });
    const open = () => setSession({ clientActionId: newClientActionId(), seen: ctx.seenInboundAt });
    return (
        <>
            <button type="button" disabled={blocked !== null} title={blocked ?? undefined} onClick={open}
                className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                Refund ₹{delivery.debit_amount}
            </button>
            {session !== null ? (
                <RefundDrawer key={session.clientActionId} ctx={ctx} delivery={delivery} session={session}
                    onClose={() => setSession(null)} />
            ) : null}
        </>
    );
}
