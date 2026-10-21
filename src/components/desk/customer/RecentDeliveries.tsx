'use client';

import { useState, type ReactNode } from 'react';
import type { DeskActionPlacement } from '@/lib/desk/action-context';
import {
    DELIVERIES_SHOWN, DELIVERY_STATUS_TEXT, REASON_CATEGORY_TEXT, dayLabel, deliveryLinkBody, distanceLabel,
    isLinkedDelivery, rupees, tapEvidence, type DeliveryLinkPatch,
} from '@/lib/desk/snapshot-format';
import type { SnapshotDelivery, TicketView } from '@/lib/desk/types';

export interface RecentDeliveriesProps {
    ticket: TicketView;
    deliveries: SnapshotDelivery[];
    pending: boolean;
    onLink: (body: DeliveryLinkPatch) => void;
    slots: (placement: DeskActionPlacement) => ReactNode;
}

const BUTTON = 'rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';
const STATUS_CHIP: Record<1 | 2 | 3, string> = {
    1: 'bg-slate-500/20 text-slate-300', 2: 'bg-red-500/20 text-red-400', 3: 'bg-green-500/20 text-green-400',
};

function moneyText(row: SnapshotDelivery): string {
    if (row.refunded) return `Refunded ${rupees(row.refund_amount)}`;
    return row.debit_txn_id === null ? 'No wallet debit found' : `Debit ${rupees(row.debit_amount)}`;
}

function present(parts: ReadonlyArray<string | null>): string[] {
    return parts.filter((part): part is string => part !== null && part.trim() !== '');
}

export function RecentDeliveries({ ticket, deliveries, pending, onLink, slots }: RecentDeliveriesProps) {
    const [showAll, setShowAll] = useState(false);
    const rows = showAll ? deliveries : deliveries.slice(0, DELIVERIES_SHOWN);
    return (
        <section className="glass space-y-2 rounded-xl p-3 text-sm">
            <p className="font-medium text-white">Deliveries (14 days)</p>
            {deliveries.length === 0 ? <p className="text-slate-500">No deliveries in the last 14 days.</p> : null}
            {rows.map((row) => {
                const evidence = present([row.driver_name ?? 'No driver', tapEvidence(row), distanceLabel(row.tap_distance_m)]);
                const reason = present([row.reason_category === null ? null : REASON_CATEGORY_TEXT[row.reason_category], row.reason]);
                return (
                    <div key={row.delivery_id} className="space-y-1 border-t border-slate-800/50 pt-2 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-300">{dayLabel(row.delivery_date)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CHIP[row.status]}`}>{DELIVERY_STATUS_TEXT[row.status]}</span>
                            <span className="text-slate-200">{present([row.product_title, row.qty_text]).join(' ')} × {row.qty}</span>
                        </div>
                        <p className="text-xs text-slate-400">{evidence.join(' · ')} · {moneyText(row)}</p>
                        {reason.length > 0 ? <p className="text-xs text-slate-500">Reason: {reason.join(' ')}</p> : null}
                        <div className="flex flex-wrap items-center gap-2">
                            {isLinkedDelivery(ticket, row) ? (
                                <span className="text-xs text-purple-300">Linked to this ticket</span>
                            ) : (
                                <button type="button" disabled={pending} onClick={() => onLink(deliveryLinkBody(row))} className={BUTTON}>
                                    Link to ticket
                                </button>
                            )}
                            {slots({ at: 'delivery', delivery: row })}
                        </div>
                    </div>
                );
            })}
            {deliveries.length > DELIVERIES_SHOWN ? (
                <button type="button" onClick={() => setShowAll((value) => !value)} className={BUTTON}>
                    {showAll ? 'Show fewer' : `Show all ${deliveries.length}`}
                </button>
            ) : null}
        </section>
    );
}
