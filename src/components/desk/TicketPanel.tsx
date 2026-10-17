'use client';

import Link from 'next/link';
import { DeskErrorState } from '@/components/desk/DeskErrorState';
import { TicketPanelLoaded } from '@/components/desk/TicketPanelLoaded';
import { deskHref, type DeskTab } from '@/lib/desk/ticket-format';
import { useTicketByNo, useTicketDetail } from '@/lib/desk/ticket-hooks';

interface TicketPanelProps {
    ticketNo: number;
    tab: DeskTab;
}

function Spinner() {
    return <div className="flex flex-1 items-center justify-center"><div className="spinner h-8 w-8" /></div>;
}

/** Turns the ticket number in the URL into an id, then loads that ticket. Mount with key={ticketNo}. */
export function TicketPanel({ ticketNo, tab }: TicketPanelProps) {
    const lookup = useTicketByNo(ticketNo);
    const id = lookup.data?.id ?? null;
    const detailQuery = useTicketDetail(id);

    if (lookup.isError) return <div className="p-4"><DeskErrorState error={lookup.error} onRetry={() => { void lookup.refetch(); }} /></div>;
    if (lookup.isPending) return <Spinner />;
    if (lookup.data === null) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <p className="text-slate-300">Ticket #{ticketNo} was not found.</p>
                <Link href={deskHref(null, tab)} className="text-sm text-purple-300 hover:underline">Back to the queue</Link>
            </div>
        );
    }
    if (detailQuery.isError) return <div className="p-4"><DeskErrorState error={detailQuery.error} onRetry={() => { void detailQuery.refetch(); }} /></div>;
    // Cached detail is not shown before this mount's first fetch finishes, so the seen-token starts fresh.
    if (detailQuery.data === undefined || !detailQuery.isFetchedAfterMount) return <Spinner />;
    return (
        <TicketPanelLoaded
            key={detailQuery.data.ticket.id}
            detail={detailQuery.data}
            tab={tab}
            onRefetch={() => { void detailQuery.refetch(); }}
        />
    );
}
