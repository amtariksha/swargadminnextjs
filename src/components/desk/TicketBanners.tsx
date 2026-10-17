'use client';

import Link from 'next/link';
import { deskHref, formatIstDateTime, inboxHref, type DeskTab } from '@/lib/desk/ticket-format';
import { TICKET_STATUS_LABEL } from '@/lib/desk/ticket-labels';
import type { TicketDetail } from '@/lib/desk/types';

interface TicketBannersProps {
    detail: TicketDetail;
    tab: DeskTab;
    /** A customer message arrived that the exec has not marked as read (rule U-2). */
    unseen: boolean;
    /** The last resolve was refused because of that message (rule U-4). */
    refused: boolean;
    onMarkRead: () => void;
}

/** Banners above the ticket body. They are siblings of the centre body, never children of it. */
export function TicketBanners({ detail, tab, unseen, refused, onMarkRead }: TicketBannersProps) {
    const { ticket, other_open_tickets: others } = detail;
    return (
        <div className="space-y-2 px-4 pt-2 empty:hidden">
            {unseen ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    <span className="min-w-0 flex-1">
                        {refused ? 'The ticket was not resolved. ' : ''}
                        The customer wrote again at {formatIstDateTime(ticket.last_inbound_at)}. Read it in the inbox before you resolve.
                    </span>
                    <a href={inboxHref(ticket.integrated_number)} target="_blank" rel="noreferrer" className="underline">
                        Open inbox
                    </a>
                    <button
                        type="button"
                        onClick={onMarkRead}
                        className="rounded-lg bg-amber-500/20 px-3 py-1 hover:bg-amber-500/30"
                    >
                        Mark as read
                    </button>
                </div>
            ) : null}
            {others.length > 0 ? (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
                    This customer has {others.length} other open ticket{others.length === 1 ? '' : 's'}:{' '}
                    {others.map((other) => (
                        <Link key={other.id} href={deskHref(other.ticket_no, tab)} className="mr-3 underline">
                            #{other.ticket_no} ({TICKET_STATUS_LABEL[other.status]})
                        </Link>
                    ))}
                </div>
            ) : null}
            {ticket.origin === 'missing_message' ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    No message is stored for this ticket. The customer may have written and the message was not saved. Check the inbox.
                </div>
            ) : null}
        </div>
    );
}
