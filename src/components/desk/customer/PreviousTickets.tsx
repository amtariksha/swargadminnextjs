'use client';

import Link from 'next/link';
import { categoryLabel, deskHref, formatIstDateTime, type DeskTab } from '@/lib/desk/ticket-format';
import { RESOLUTION_CODE_LABEL, TICKET_STATUS_LABEL } from '@/lib/desk/ticket-labels';
import type { Category, TicketSummary } from '@/lib/desk/types';

export interface PreviousTicketsProps {
    items: TicketSummary[];
    tab: DeskTab;
    bySlug: ReadonlyMap<string, Category>;
}

export function PreviousTickets({ items, tab, bySlug }: PreviousTicketsProps) {
    return (
        <section className="glass space-y-2 rounded-xl p-3 text-sm">
            <p className="font-medium text-white">Previous tickets</p>
            {items.length === 0 ? <p className="text-slate-500">No earlier tickets.</p> : null}
            {items.map((item) => (
                <Link key={item.id} href={deskHref(item.ticket_no, tab)} className="block text-slate-300 hover:text-white">
                    #{item.ticket_no} · {categoryLabel(item.category_slug, bySlug)} ·{' '}
                    {item.resolution_code === null ? TICKET_STATUS_LABEL[item.status] : RESOLUTION_CODE_LABEL[item.resolution_code]}
                    <span className="text-slate-500"> · {formatIstDateTime(item.opened_at)}</span>
                </Link>
            ))}
        </section>
    );
}
