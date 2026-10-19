'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AcksLane } from '@/components/desk/AcksLane';
import { DeskErrorState } from '@/components/desk/DeskErrorState';
import { InternalLane } from '@/components/desk/InternalLane';
import { QueueRow } from '@/components/desk/QueueRow';
import type { Queue } from '@/lib/desk/constants';
import { deskKeys } from '@/lib/desk/desk-query';
import { DESK_TABS, deskHref, listItemDiffers, type DeskTab } from '@/lib/desk/ticket-format';
import {
    useDeskCategories, useDeskCounts, useDeskQueue, useWrapUpList, type QueueView,
} from '@/lib/desk/ticket-hooks';
import type { TicketDetail, TicketListItem } from '@/lib/desk/types';

type QueueChoice = 'all' | Queue;
const QUEUE_CHOICES: readonly { value: QueueChoice; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'care', label: 'Care' }, { value: 'sales', label: 'Sales' },
];
const TAB_LABEL: Record<DeskTab, string> = {
    mine: 'Mine', unassigned: 'Unassigned', all: 'All', wrap_up: 'Needs wrap-up',
};
const TAB_ACTIVE = 'bg-purple-600/20 text-purple-400 border border-purple-500/30';
const TAB_IDLE = 'text-slate-400 hover:text-white hover:bg-slate-800/50';

interface DeskQueueProps {
    tab: DeskTab;
    selectedTicketNo: number | null;
}

function queueView(tab: DeskTab): QueueView {
    return tab === 'wrap_up' ? 'mine' : tab;
}

export function DeskQueue({ tab, selectedTicketNo }: DeskQueueProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [choice, setChoice] = useState<QueueChoice>('all');
    const queue = choice === 'all' ? undefined : choice;
    const isWrapUp = tab === 'wrap_up';

    const counts = useDeskCounts().data;
    const categories = useDeskCategories();
    const live = useDeskQueue(queueView(tab), queue, !isWrapUp);
    const wrapUp = useWrapUpList(queue, isWrapUp);

    const wrapUpPages = wrapUp.data?.pages;
    const items = useMemo<TicketListItem[]>(
        () => (isWrapUp ? (wrapUpPages ?? []).flatMap((page) => page.items) : (live.data?.items ?? [])),
        [isWrapUp, wrapUpPages, live.data],
    );
    const active = isWrapUp ? wrapUp : live;

    // Q-9: when the list row says the ticket changed, refresh the open header without a second poll.
    useEffect(() => {
        const row = items.find((item) => item.ticket_no === selectedTicketNo);
        if (row === undefined) return;
        const cached = queryClient.getQueryData<TicketDetail>(deskKeys.ticket(row.id));
        if (cached !== undefined && listItemDiffers(row, cached.ticket)) {
            void queryClient.invalidateQueries({ queryKey: deskKeys.ticket(row.id) });
        }
    }, [items, selectedTicketNo, queryClient]);

    const select = (ticketNo: number) => router.push(deskHref(ticketNo, tab), { scroll: false });
    const showEmpty = !active.isPending && !active.isError && items.length === 0;

    return (
        <>
            <div className="flex gap-1 overflow-x-auto p-2">
                {DESK_TABS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => router.push(deskHref(selectedTicketNo, key), { scroll: false })}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                            key === tab ? TAB_ACTIVE : TAB_IDLE
                        }`}
                    >
                        {TAB_LABEL[key]}
                        {counts !== undefined ? (
                            <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 text-xs text-slate-400">{counts[key]}</span>
                        ) : null}
                    </button>
                ))}
            </div>
            <div className="flex gap-1 px-2 pb-2">
                {QUEUE_CHOICES.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => setChoice(option.value)}
                        className={`rounded-md px-2 py-1 text-xs ${choice === option.value ? TAB_ACTIVE : TAB_IDLE}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {active.isError ? (
                    <div className="p-3">
                        <DeskErrorState error={active.error} onRetry={() => { void active.refetch(); }} />
                    </div>
                ) : null}
                {active.isPending ? <div className="flex justify-center py-8"><div className="spinner h-8 w-8" /></div> : null}
                {items.map((item) => (
                    <QueueRow
                        key={item.id}
                        item={item}
                        selected={item.ticket_no === selectedTicketNo}
                        showQueue={tab === 'all' && queue === undefined}
                        bySlug={categories.bySlug}
                        onSelect={select}
                    />
                ))}
                {showEmpty ? <p className="p-4 text-center text-sm text-slate-500">Nothing waiting here.</p> : null}
                {isWrapUp && wrapUp.hasNextPage ? (
                    <button
                        type="button"
                        disabled={wrapUp.isFetchingNextPage}
                        onClick={() => { void wrapUp.fetchNextPage(); }}
                        className="m-3 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                        {wrapUp.isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                ) : null}
                {!isWrapUp && live.data?.next_cursor != null ? (
                    <p className="p-3 text-center text-xs text-slate-500">Showing the 100 most urgent tickets.</p>
                ) : null}
                {!isWrapUp && live.data?.truncated === true ? (
                    <p className="mx-3 mb-3 rounded-lg bg-amber-500/20 p-2 text-xs text-amber-300">
                        More than 500 open tickets: this list is incomplete.
                    </p>
                ) : null}
                {!isWrapUp ? (
                    <AcksLane
                        count={counts?.acks ?? 0}
                        queue={queue}
                        selectedTicketNo={selectedTicketNo}
                        bySlug={categories.bySlug}
                        onSelect={select}
                    />
                ) : null}
                {!isWrapUp ? <InternalLane /> : null}
            </div>
        </>
    );
}
