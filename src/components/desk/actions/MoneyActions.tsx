'use client';

// Money slots of the customer pane: the refund strip on a delivery row, and the wallet credit /
// replacement promise buttons in the bar. The pane mounts this only when ctx.me.money is true;
// every dialog lives inside an ActionDrawer (portal), never directly in the pane.

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { newClientActionId } from '@/lib/desk/action-client';
import type { DeskActionContext, DeskActionSlotProps } from '@/lib/desk/action-context';
import { describeDeskError } from '@/lib/desk/desk-query';
import { useTicketResolve } from '@/lib/desk/ticket-mutations';
import { RefundStrip } from './RefundStrip';
import { ReplacementPromiseForm } from './ReplacementPromiseForm';
import { WalletCreditForm } from './WalletCreditForm';

/** Created in the click handler that opens a drawer; the seen-token is copied once and reused by every retry. */
export interface DrawerSession { clientActionId: string; seen: string | null; nowMs: number }

type Open = { kind: 'none' } | { kind: 'credit' | 'replacement'; session: DrawerSession };

const BUTTON = 'rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';

function MoneyBar({ ctx }: { ctx: DeskActionContext }) {
    const [open, setOpen] = useState<Open>({ kind: 'none' });
    const resolve = useTicketResolve(ctx.ticket.id);
    const close = () => setOpen({ kind: 'none' });
    const start = (kind: 'credit' | 'replacement') => setOpen({
        kind, session: { clientActionId: newClientActionId(), seen: ctx.seenInboundAt, nowMs: Date.now() },
    });
    const received = () => resolve.mutate(
        { seen_inbound_at: ctx.seenInboundAt, resolution_code: 'replacement_promised' },
        {
            onSuccess: (outcome) => {
                if (outcome.kind === 'resolved') toast.success(`Ticket #${ctx.ticket.ticket_no} resolved`);
                else ctx.onRecorded({ kind: 'conflict', ticket: outcome.ticket, action: null });
            },
            onError: (error) => toast.error(describeDeskError(error).text),
        },
    );
    const noCustomer = ctx.snapshot.profile === null;
    const awaitingReplacement = ctx.ticket.status === 'on_hold' && ctx.ticket.hold_reason === 'replacement_promised';
    return (
        <>
            <button type="button" className={BUTTON} disabled={noCustomer}
                title={noCustomer ? 'Pick the customer first' : undefined} onClick={() => start('credit')}>
                Wallet credit
            </button>
            {ctx.ticket.status !== 'resolved' ? (
                <button type="button" className={BUTTON} onClick={() => start('replacement')}>Promise replacement</button>
            ) : null}
            {awaitingReplacement ? (
                <button type="button" className={BUTTON} disabled={resolve.isPending} onClick={received}>
                    Replacement received
                </button>
            ) : null}
            {open.kind === 'credit' ? (
                <WalletCreditForm key={open.session.clientActionId} ctx={ctx} session={open.session} onClose={close} />
            ) : null}
            {open.kind === 'replacement' ? (
                <ReplacementPromiseForm key={open.session.clientActionId} ctx={ctx} session={open.session} onClose={close} />
            ) : null}
        </>
    );
}

export function MoneyActions({ ctx, placement }: DeskActionSlotProps): ReactNode {
    if (!ctx.me.money) return null;
    if (placement.at === 'delivery') return <RefundStrip ctx={ctx} delivery={placement.delivery} />;
    if (placement.at !== 'bar') return null;
    return <MoneyBar ctx={ctx} />;
}
