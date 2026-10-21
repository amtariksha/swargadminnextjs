'use client';

import type { ReactNode } from 'react';
import { DAYTIME_PAID_STATUSES } from '@/lib/desk/constants';
import type { DeskActionPlacement } from '@/lib/desk/action-context';
import { dayLabel, dayOrderLinkBody, isLinkedDayOrder, rupees, type DeliveryLinkPatch } from '@/lib/desk/snapshot-format';
import type { SnapshotDayOrder, TicketView } from '@/lib/desk/types';

export interface RecentDayOrdersProps {
    ticket: TicketView;
    orders: SnapshotDayOrder[];
    pending: boolean;
    onLink: (body: DeliveryLinkPatch) => void;
    slots: (placement: DeskActionPlacement) => ReactNode;
}

const BUTTON = 'rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50';

export function RecentDayOrders({ ticket, orders, pending, onLink, slots }: RecentDayOrdersProps) {
    if (orders.length === 0) return null;
    return (
        <section className="glass space-y-2 rounded-xl p-3 text-sm">
            <p className="font-medium text-white">Day orders (30 days)</p>
            {orders.map((order) => {
                const paid = (DAYTIME_PAID_STATUSES as readonly string[]).includes(order.payment_status);
                return (
                    <div key={order.id} className="space-y-1 border-t border-slate-800/50 pt-2 first:border-t-0 first:pt-0">
                        <p className="text-slate-200">
                            #{order.order_no} · {dayLabel(order.delivery_date)} · {rupees(order.total_amount)} ·{' '}
                            <span className={paid ? 'text-green-400' : 'text-amber-400'}>{order.payment_status}</span>
                        </p>
                        <p className="text-xs text-slate-400">
                            {order.items_text} · {order.order_status}{order.delivery_status === null ? '' : ` · delivery ${order.delivery_status}`}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            {isLinkedDayOrder(ticket, order) ? (
                                <span className="text-xs text-purple-300">Linked to this ticket</span>
                            ) : (
                                <button type="button" disabled={pending} onClick={() => onLink(dayOrderLinkBody(order))} className={BUTTON}>
                                    Link to ticket
                                </button>
                            )}
                            {slots({ at: 'day_order', dayOrder: order })}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
