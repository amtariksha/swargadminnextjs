'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { formatIst, humanise } from '@/components/desk/reports/format';
import type { ReviewTicketItem } from '@/lib/desk/review-report';
import { ReviewEditor } from './ReviewEditor';

export function ReviewTicketRow({ ticket }: { ticket: ReviewTicketItem }) {
    const [open, setOpen] = useState(false);
    return (
        <li className="border-t border-slate-800/60 py-2 text-sm text-slate-200 first:border-t-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Review this ticket" className="text-slate-400 hover:text-white">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Link href={`/desk?ticket=${ticket.ticket_no}`} className="font-medium text-purple-300 underline">#{ticket.ticket_no}</Link>
                <span>{ticket.customer_name ?? ticket.customer_phone ?? 'Not recorded'}</span>
                <span className="text-slate-400">{humanise(ticket.category_slug)}</span>
                <span>{humanise(ticket.status)}</span>
                <span className="text-slate-400">{formatIst(ticket.opened_at)}</span>
                <span className="text-slate-400">{ticket.assigned_name ?? 'Unassigned'}</span>
                {ticket.resolution_code ? <span>{humanise(ticket.resolution_code)}</span> : null}
                {ticket.driver_name ? <span className="text-slate-400">Driver {ticket.driver_name}</span> : null}
                {ticket.product_name ? <span className="text-slate-400">{ticket.product_name}</span> : null}
                {ticket.reviewed_at ? (
                    <span className="flex items-center gap-1 text-emerald-400"><Check className="h-4 w-4" /> Reviewed</span>
                ) : null}
            </div>
            {open ? <ReviewEditor ticket={ticket} /> : null}
        </li>
    );
}

export function TicketList({ tickets, empty }: { tickets: ReviewTicketItem[]; empty: string }) {
    return tickets.length === 0
        ? <p className="py-2 text-sm text-slate-500">{empty}</p>
        : <ul>{tickets.map((ticket) => <ReviewTicketRow key={ticket.id} ticket={ticket} />)}</ul>;
}
