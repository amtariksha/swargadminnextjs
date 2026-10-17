'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDeskMe } from '@/components/desk/desk-me-context';
import { DeskHealthStrip } from '@/components/desk/DeskHealthStrip';
import { DeskWorkspaceFrame } from '@/components/desk/DeskFrame';
import { DeskQueue } from '@/components/desk/DeskQueue';
import { TicketPanel } from '@/components/desk/TicketPanel';
import { parseTabParam, parseTicketParam } from '@/lib/desk/ticket-format';
import { useDeskCounts } from '@/lib/desk/ticket-hooks';

function titleFor(mine: number, unassigned: number): string {
    return mine > 0 || unassigned > 0 ? `Desk (${mine} mine, ${unassigned} unassigned)` : 'Desk';
}

/** The browser tab shows what is waiting. Restores the previous title when the page unmounts. */
function useDeskTabTitle(): void {
    const counts = useDeskCounts().data;
    const title = titleFor(counts?.mine ?? 0, counts?.unassigned ?? 0);
    useEffect(() => {
        const previous = document.title;
        document.title = title;
        return () => { document.title = previous; };
    }, [title]);
}

function NoTicketSelected({ showAllTickets }: { showAllTickets: boolean }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-slate-400">Select a ticket</p>
            {showAllTickets ? (
                <Link href="/desk/tickets" className="text-sm text-purple-300 hover:underline">All tickets →</Link>
            ) : null}
        </div>
    );
}

/** Body of /desk. The URL (ticket and tab) is the only selection state. */
export function DeskWorkspace() {
    const params = useSearchParams();
    const me = useDeskMe();
    const ticketNo = parseTicketParam(params.get('ticket'));
    const tab = parseTabParam(params.get('tab'));
    useDeskTabTitle();

    return (
        <DeskWorkspaceFrame>
            <DeskHealthStrip />
            <div className="flex min-h-0 flex-1">
                <div
                    className={`min-h-0 w-full flex-col border-r border-slate-800/50 lg:flex lg:w-[380px] lg:flex-shrink-0 ${
                        ticketNo !== null ? 'hidden' : 'flex'
                    }`}
                >
                    <DeskQueue tab={tab} selectedTicketNo={ticketNo} />
                </div>
                <div className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${ticketNo === null ? 'hidden' : 'flex'}`}>
                    {ticketNo === null
                        ? <NoTicketSelected showAllTickets={me.manager} />
                        : <TicketPanel key={ticketNo} ticketNo={ticketNo} tab={tab} />}
                </div>
                {/* P3d: customer pane mounts here */}
            </div>
        </DeskWorkspaceFrame>
    );
}
