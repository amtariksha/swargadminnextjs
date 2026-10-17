'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DeskErrorState } from '@/components/desk/DeskErrorState';
import { QueueRow } from '@/components/desk/QueueRow';
import type { Queue } from '@/lib/desk/constants';
import { useDeskQueue } from '@/lib/desk/ticket-hooks';
import type { Category } from '@/lib/desk/types';

interface AcksLaneProps {
    count: number;
    queue: Queue | undefined;
    selectedTicketNo: number | null;
    bySlug: ReadonlyMap<string, Category>;
    onSelect: (ticketNo: number) => void;
}

/** Tickets that hold only an acknowledgement ("ok", "thanks"). Collapsed, it makes no request. */
export function AcksLane({ count, queue, selectedTicketNo, bySlug, onSelect }: AcksLaneProps) {
    const [open, setOpen] = useState(false);
    const acks = useDeskQueue('acks', queue, open);
    return (
        <div className="border-t border-slate-800/50">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-400 hover:text-white"
            >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Acks ({count})
            </button>
            {open ? (
                <div>
                    <p className="px-3 pb-2 text-xs text-slate-500">
                        Only an acknowledgement (ok, thanks). These close by themselves.
                    </p>
                    {acks.isError ? <DeskErrorState error={acks.error} onRetry={() => { void acks.refetch(); }} /> : null}
                    {(acks.data?.items ?? []).map((item) => (
                        <QueueRow
                            key={item.id}
                            item={item}
                            selected={item.ticket_no === selectedTicketNo}
                            showQueue={queue === undefined}
                            bySlug={bySlug}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
