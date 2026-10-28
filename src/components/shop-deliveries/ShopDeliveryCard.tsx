'use client';

import Link from 'next/link';
import { Sun } from 'lucide-react';
import { formatINR } from '@/lib/accounting';
import { type Badge, type ShopInvoice, type ShopStop, shopBillLabel, tallyBadge } from '@/lib/shopBilling';

interface ShopDeliveryCardProps {
    shop: ShopStop;
    accountingEnabled: boolean;
    tallyPostingEnabled: boolean;
    onSendToDay: (shop: ShopStop) => void;
}

function Chip({ badge }: { badge: Badge }) {
    return (
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${badge.cls}`} title={badge.title}>
            {badge.label}
        </span>
    );
}

function InvoiceRef({ invoice, tallyPostingEnabled }: { invoice: ShopInvoice; tallyPostingEnabled: boolean }) {
    return (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
            <Link href={`/accounting/invoices/${invoice.id}`} className="font-mono text-xs text-cyan-400 hover:text-cyan-300">
                {invoice.invoice_number}
            </Link>
            {invoice.cancelled
                ? <Chip badge={{ label: 'Cancelled', cls: 'bg-red-500/20 text-red-300' }} />
                : <Chip badge={tallyBadge(invoice, tallyPostingEnabled)} />}
        </span>
    );
}

export function ShopDeliveryCard({ shop, accountingEnabled, tallyPostingEnabled, onSendToDay }: ShopDeliveryCardProps) {
    const done = shop.status === 3;
    const hasNotDelivered = shop.products.some((p) => p.status === 2);
    // Per-delivery shops show each line's invoice beside it; monthly and day-pooled
    // shops have one invoice for the lot, listed below the lines.
    const perLine = accountingEnabled && !shop.moved_to_day && shop.billing_cycle !== 1;

    return (
        <div className="glass rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {shop.route_order != null && <span className="text-xs font-mono text-slate-500">#{shop.route_order}</span>}
                        <h2 className="text-white font-semibold truncate">{shop.title}</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {shop.customer_name}{shop.customer_phone ? ` · ${shop.customer_phone}` : ''}
                        {shop.truck_driver_name ? <span className="text-slate-400"> · driver: {shop.truck_driver_name}</span> : null}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <Chip badge={shopBillLabel(shop, accountingEnabled)} />
                        <span className="text-[11px] text-slate-500">{shop.billing_cycle === 1 ? 'Monthly billing' : 'Per-delivery billing'}</span>
                    </div>
                </div>
                {shop.moved_to_day ? (
                    <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg shrink-0 bg-emerald-500/15 text-emerald-300"
                        title="Handed to a day driver — billed by invoice on day delivery">
                        <Sun className="w-3 h-3" /> In Day Pool
                    </span>
                ) : (
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg shrink-0 ${done ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-300'}`}>
                        {done ? 'Done' : 'Pending'}
                    </span>
                )}
            </div>

            <div className="border-t border-slate-800/50 pt-2 space-y-1.5">
                {shop.products.map((p) => {
                    const notDel = p.status === 2;
                    return (
                        <div key={p.pre_delivery_id} className="flex items-start justify-between gap-3 text-sm">
                            <div className="min-w-0">
                                <span className="text-slate-300">
                                    {p.product_title}
                                    {notDel && p.reason ? <span className="text-red-400 text-xs"> · {p.reason}</span> : null}
                                </span>
                                {perLine && p.status === 3 && (
                                    <div className="mt-0.5">
                                        {p.invoice
                                            ? <InvoiceRef invoice={p.invoice} tallyPostingEnabled={tallyPostingEnabled} />
                                            : <Chip badge={{ label: 'Not billed', cls: 'bg-red-500/20 text-red-300' }} />}
                                    </div>
                                )}
                            </div>
                            <span className={`font-mono shrink-0 ${notDel ? 'text-red-400' : 'text-slate-400'}`}>
                                {notDel ? 'Not delivered' : `${p.delivered_qty}${p.qty_text ? ` × ${p.qty_text}` : ''}`}
                            </span>
                        </div>
                    );
                })}
            </div>

            {!perLine && shop.invoices.length > 0 && (
                <div className="border-t border-slate-800/50 pt-2 space-y-1">
                    {shop.invoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between gap-3 text-sm">
                            <InvoiceRef invoice={inv} tallyPostingEnabled={tallyPostingEnabled} />
                            <span className="font-mono text-slate-400 shrink-0">{formatINR(inv.total_amount)}</span>
                        </div>
                    ))}
                </div>
            )}

            {!shop.moved_to_day && hasNotDelivered && (
                <button onClick={() => onSendToDay(shop)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-xs font-medium"
                    title="Hand this shop's undelivered lines to a day driver — billed by invoice (no wallet)">
                    <Sun className="w-3 h-3" /> Send to day pool
                </button>
            )}
        </div>
    );
}
