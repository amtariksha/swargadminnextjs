'use client';

import { useState } from 'react';
import { DELIVERY_STATUS_TEXT, dayLabel, deliveryLinkBody, type DeliveryLinkPatch } from '@/lib/desk/snapshot-format';
import type { SnapshotDelivery, TicketView } from '@/lib/desk/types';

export interface DeliveryLinkChipProps {
    ticket: TicketView;
    suggestion: SnapshotDelivery | null;
    pending: boolean;
    onLink: (body: DeliveryLinkPatch) => void;
}

const BUTTON = 'rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';

/** The delivery this ticket is about: linked, recorded as none, or a suggestion the exec confirms with a click. */
export function DeliveryLinkChip({ ticket, suggestion, pending, onLink }: DeliveryLinkChipProps) {
    const [dismissed, setDismissed] = useState<number | null>(null);
    if (ticket.link_status === 'linked') {
        const parts = [ticket.delivery_date === null ? '—' : dayLabel(ticket.delivery_date), ticket.product_name, ticket.driver_name]
            .filter((part): part is string => part !== null && part !== '');
        return <p className="rounded-xl bg-purple-500/20 px-3 py-2 text-sm text-purple-300">Linked delivery: {parts.join(' · ')}</p>;
    }
    if (ticket.link_status !== null) return <p className="px-1 text-xs text-slate-500">Delivery: none matching (recorded).</p>;
    if (suggestion === null || dismissed === suggestion.delivery_id) return null;
    return (
        <div className="glass space-y-2 rounded-xl p-3 text-sm">
            <p className="text-slate-300">
                Suggested: {dayLabel(suggestion.delivery_date)} · {suggestion.product_title} · {DELIVERY_STATUS_TEXT[suggestion.status]}
                {suggestion.driver_name === null ? '' : ` · ${suggestion.driver_name}`}
            </p>
            <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => onLink(deliveryLinkBody(suggestion))} className={BUTTON}>Link</button>
                <button type="button" onClick={() => setDismissed(suggestion.delivery_id)} className={BUTTON}>Not this one</button>
            </div>
        </div>
    );
}
