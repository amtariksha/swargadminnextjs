'use client';

// P3c seam: the thread and composer mount in this file, inside the shell wrapper that P3c adds here and nowhere else.

import { useMemo } from 'react';
import MarkdownView from '@/components/crm/MarkdownView';
import { TicketTimeline } from '@/components/desk/TicketTimeline';
import { inboxHref } from '@/lib/desk/ticket-format';
import { buildTimeline } from '@/lib/desk/ticket-timeline';
import type { Category, TicketDetail } from '@/lib/desk/types';

interface TicketCentreBodyProps {
    detail: TicketDetail;
    bySlug: ReadonlyMap<string, Category>;
}

function ChatCard({ detail }: { detail: TicketDetail }) {
    const { ticket, conversation } = detail;
    return (
        <section className="glass rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white">Chat</h3>
            {conversation === null ? (
                <p className="mt-2 text-sm text-slate-400">This ticket has no conversation.</p>
            ) : (
                <div className="mt-2 space-y-1 text-sm text-slate-300">
                    <a
                        href={inboxHref(ticket.integrated_number)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-300 underline"
                    >
                        Open in inbox
                    </a>
                    <p>Search for {ticket.customer_phone ?? 'the customer'} there.</p>
                    <p className="text-xs text-slate-500">
                        Chat is {conversation.status} in the old inbox · {conversation.unread_count} unread
                    </p>
                </div>
            )}
        </section>
    );
}

/** The middle of the ticket screen: chat link, timeline, playbook. Nothing here opens a dialog. */
export function TicketCentreBody({ detail, bySlug }: TicketCentreBodyProps) {
    const rows = useMemo(
        () => buildTimeline(detail.events, detail.actions, bySlug),
        [detail.events, detail.actions, bySlug],
    );
    const playbook = detail.category?.playbook_md ?? '';
    return (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <ChatCard detail={detail} />
            <section className="glass rounded-xl p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Timeline</h3>
                <TicketTimeline rows={rows} />
            </section>
            {playbook.trim() !== '' ? (
                <details className="glass rounded-xl p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-white">Playbook</summary>
                    <div className="mt-3 text-sm text-slate-300"><MarkdownView content={playbook} /></div>
                </details>
            ) : null}
        </div>
    );
}
