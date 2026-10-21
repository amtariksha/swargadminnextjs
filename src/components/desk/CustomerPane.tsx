'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AppActions } from '@/components/desk/actions/AppActions';
import { MoneyActions } from '@/components/desk/actions/MoneyActions';
import { OpsActions } from '@/components/desk/actions/OpsActions';
import { ActionBackstop } from '@/components/desk/customer/ActionBackstop';
import { DeliveryLinkChip } from '@/components/desk/customer/DeliveryLinkChip';
import { MatchBanner } from '@/components/desk/customer/MatchBanner';
import { PreviousTickets } from '@/components/desk/customer/PreviousTickets';
import { RecentDayOrders } from '@/components/desk/customer/RecentDayOrders';
import { RecentDeliveries } from '@/components/desk/customer/RecentDeliveries';
import { WalletSubscriptions } from '@/components/desk/customer/WalletSubscriptions';
import { useDeskMe } from '@/components/desk/desk-me-context';
import type { ActionPostOutcome } from '@/lib/desk/action-client';
import type { DeskActionContext, DeskActionPlacement } from '@/lib/desk/action-context';
import { describeDeskError } from '@/lib/desk/desk-query';
import type { ResolveDraft } from '@/lib/desk/resolve-plan';
import { SnapshotError, useCustomerSnapshot, useSnapshotMatchWrite } from '@/lib/desk/snapshot-client';
import {
    ACTION_CONFLICT_TEXT, actionOutcomeText, autoCandidateId, backstopDraft, flaggedText, slotRights,
    snapshotErrorText, snapshotPhone, suggestDelivery, unmatchedRecentActions, type DeliveryLinkPatch,
} from '@/lib/desk/snapshot-format';
import type { DeskTab } from '@/lib/desk/ticket-format';
import type { DeskCategories } from '@/lib/desk/ticket-hooks';
import { useTicketPatch } from '@/lib/desk/ticket-mutations';
import type { TicketDetail, TicketView } from '@/lib/desk/types';

export interface CustomerPaneProps {
    detail: TicketDetail;
    tab: DeskTab;
    categories: DeskCategories;
    seen: string | null;
    onActionConflict: (fresh: TicketView) => void;
    onStartResolve: (draft: ResolveDraft) => void;
}

function PaneMessage({ text, detail, onRetry }: { text: string; detail?: string; onRetry?: () => void }) {
    return (
        <div className="space-y-2 p-4 text-sm text-slate-400">
            <p>{text}</p>
            {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
            {onRetry ? (
                <button type="button" onClick={onRetry} className="rounded-lg bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700">
                    Retry
                </button>
            ) : null}
        </div>
    );
}

/** Customer 360 and the action slots of one open ticket (blueprint §7, D7). */
export function CustomerPane({ detail, tab, categories, seen, onActionConflict, onStartResolve }: CustomerPaneProps) {
    const { ticket } = detail;
    const me = useDeskMe();
    const [picked, setPicked] = useState<number | null>(null);
    const base = useCustomerSnapshot(ticket, null);
    const userId = picked ?? (base.data ? autoCandidateId(ticket, base.data) : null);
    const viewed = useCustomerSnapshot(ticket, userId);
    const query = userId === null ? base : viewed;
    const matchError = useSnapshotMatchWrite(ticket, base.data);
    const linkPatch = useTicketPatch(ticket.id);

    if (snapshotPhone(ticket.customer_phone) === null) return <PaneMessage text="This ticket has no phone number to look up." />;
    if (query.isError) {
        const code = query.error instanceof SnapshotError ? query.error.code : 'network';
        const { text, retry } = snapshotErrorText(code);
        const detail = code === 'bad_response' ? query.error.message : undefined;
        return <PaneMessage text={text} detail={detail} onRetry={retry ? () => { void query.refetch(); } : undefined} />;
    }
    if (query.data === undefined) return <div className="flex justify-center p-6"><div className="spinner h-6 w-6" /></div>;

    const snapshot = query.data;
    const onRecorded = (outcome: ActionPostOutcome) => {
        if (outcome.kind === 'conflict') {
            toast.error(ACTION_CONFLICT_TEXT);
            onActionConflict(outcome.ticket);
            return;
        }
        toast.success(actionOutcomeText(outcome.response));
        const flag = flaggedText(outcome.response.flagged);
        if (flag !== null) toast.warning(flag);
    };
    const ctx: DeskActionContext = {
        ticket, detail, category: detail.category, snapshot, seenInboundAt: seen, me, onRecorded,
    };
    const rights = slotRights(me);
    const slots = (placement: DeskActionPlacement): ReactNode => (
        <>
            {rights.money ? <MoneyActions ctx={ctx} placement={placement} /> : null}
            {rights.ops ? <OpsActions ctx={ctx} placement={placement} /> : null}
            {rights.app ? <AppActions ctx={ctx} placement={placement} /> : null}
        </>
    );
    const link = (body: DeliveryLinkPatch) => linkPatch.mutate(body, {
        onSuccess: () => toast.success('Delivery linked to the ticket'),
        onError: (error) => toast.error(describeDeskError(error).text),
    });
    const suggestionCategory = categories.bySlug.get(ticket.category_slug ?? ticket.suggested_category ?? '') ?? null;
    const suggestion = suggestDelivery(ticket, suggestionCategory, snapshot.recent_deliveries);
    const backstop = ticket.status === 'resolved' ? [] : unmatchedRecentActions(snapshot.recent_actions, detail.actions, ticket.opened_at);
    const hasCustomer = snapshot.profile !== null;

    return (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <MatchBanner ticket={ticket} snapshot={snapshot} viewingId={userId} matchError={matchError} onPick={setPicked} slots={slots} />
            <ActionBackstop items={backstop} onResolve={(item) => onStartResolve(backstopDraft(item, ticket, detail.category))} />
            <div className="flex flex-wrap gap-2 empty:hidden">{slots({ at: 'bar' })}</div>
            {hasCustomer ? (
                <>
                    <WalletSubscriptions snapshot={snapshot} slots={slots} />
                    <DeliveryLinkChip ticket={ticket} suggestion={suggestion} pending={linkPatch.isPending} onLink={link} />
                    <RecentDeliveries ticket={ticket} deliveries={snapshot.recent_deliveries} pending={linkPatch.isPending} onLink={link} slots={slots} />
                    <RecentDayOrders ticket={ticket} orders={snapshot.recent_day_orders} pending={linkPatch.isPending} onLink={link} slots={slots} />
                </>
            ) : null}
            <PreviousTickets items={detail.previous_tickets} tab={tab} bySlug={categories.bySlug} />
        </div>
    );
}
