'use client';

/**
 * The day's till roll.
 *
 * The counter board answers "what do I make next", and to do that it hides
 * three things on purpose: handed-over tickets, unpaid orders (payment gates
 * entry) and swept ones. All three are exactly what you go looking for at close
 * of day — "did that link order ever get paid?", "how much cash is in the box?",
 * "what happened to token 34?" — and the operator does not have the admin panel
 * on a laptop at a market.
 *
 * So: every order of the day, newest first, with its payment state spelt out.
 * Reprint is here too, because a lost slip is the other reason to open this.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Printer, RefreshCw, Search } from 'lucide-react';
import { stallGet, StallApiError } from '@/lib/stall/api';
import { readTillSession } from '@/lib/stall/session';
import { type StallSale, type StallSalesDay, isSettled } from '@/lib/stall/types';
import { getPrinterConfig, printTokenTicket } from '@/lib/stall/printer';
import PrinterSheet from '@/components/stall/PrinterSheet';

const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
const POLL_MS = 20000;

type Filter = 'all' | 'unpaid' | 'handed_over';

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unpaid', label: 'Not paid' },
    { key: 'handed_over', label: 'Handed over' },
];

export default function StallSalesPage() {
    const [code, setCode] = useState('');
    const [day, setDay] = useState<StallSalesDay | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [printerOpen, setPrinterOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const inFlight = useRef(false);

    useEffect(() => {
        const till = readTillSession();
        const remembered = typeof window !== 'undefined'
            ? window.localStorage.getItem('stall_last_code') : null;
        setCode((till?.stall.code || remembered || '').toLowerCase());
    }, []);

    const load = useCallback(async (silent = false) => {
        if (!code || inFlight.current) return;
        inFlight.current = true;
        if (!silent) setRefreshing(true);
        try {
            setDay(await stallGet<StallSalesDay>(`/stall/${code}/sales`));
            setError(null);
        } catch (err) {
            // Same rule as the board: a failed poll must not blank a screen
            // somebody is reading a number off.
            if (!silent) setError((err as StallApiError).message);
        } finally {
            inFlight.current = false;
            setRefreshing(false);
        }
    }, [code]);

    useEffect(() => {
        if (!code) return;
        void load();
        // Slower than the board — this is a ledger you consult, not a queue you
        // work, and every poll is a full day of rows.
        const id = setInterval(() => void load(true), POLL_MS);
        return () => clearInterval(id);
    }, [code, load]);

    const reprint = useCallback(async (sale: StallSale) => {
        const config = getPrinterConfig();
        if (config.mode === 'off') {
            toast.error('No printer set up on this device', {
                description: 'Tap the printer icon above to choose one.',
            });
            return;
        }
        try {
            await printTokenTicket({
                stallTitle: day?.stall.title || '',
                stallLocation: null,
                token: sale.token,
                orderNo: sale.order_no,
                placedAt: sale.created_at || '',
                lines: sale.items.map((i) => ({
                    label: i.label, qty: i.qty, lineTotal: i.line_total,
                })),
                total: sale.total_amount,
                paymentLabel: paymentLabel(sale),
                phone: sale.contact_phone,
                note: sale.cancelled ? 'CANCELLED' : sale.note,
            }, { force: true, config });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'That slip did not print.');
        }
    }, [day?.stall.title]);

    const visible = useMemo(() => {
        const rows = day?.orders ?? [];
        const q = search.trim().toLowerCase();
        return rows
            .filter((o) => {
                if (filter === 'unpaid') return !isSettled(o.payment_status) && !o.cancelled;
                if (filter === 'handed_over') return o.state === 'handed_over';
                return true;
            })
            .filter((o) => !q
                || String(o.token ?? '').includes(q)
                || String(o.order_no ?? '').includes(q)
                || (o.contact_phone || '').includes(q)
                || o.items.some((i) => i.label.toLowerCase().includes(q)));
    }, [day?.orders, filter, search]);

    if (!code) {
        return (
            <Centered>
                No stall selected.{' '}
                <Link href="/pos" className="text-emerald-400 underline">Pick one on the till</Link>.
            </Centered>
        );
    }
    if (!day && error) return <Centered>{error}</Centered>;
    if (!day) return <Centered><span className="w-8 h-8 spinner" /></Centered>;

    const t = day.totals;

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-3 py-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Link href="/pos" className="flex items-center gap-1.5 text-sm text-slate-300 px-3 py-2 rounded-lg border border-slate-800">
                        <ArrowLeft className="w-4 h-4" /> Till
                    </Link>
                    <button onClick={() => void load()} disabled={refreshing}
                        aria-label="Refresh" title="Refresh"
                        className="text-slate-300 px-3 py-2 rounded-lg border border-slate-800 disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setPrinterOpen(true)} aria-label="Printer setup" title="Printer setup"
                        className="text-slate-300 px-3 py-2 rounded-lg border border-slate-800">
                        <Printer className="w-4 h-4" />
                    </button>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold">{money(t.paid_total)} taken</div>
                    <div className="text-xs text-slate-400">
                        {t.orders_count} {t.orders_count === 1 ? 'sale' : 'sales'} today
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 px-3 pb-2 flex-shrink-0">
                <Tile label="Cash" value={money(t.cash_total)} tone="text-emerald-300" />
                <Tile label="UPI" value={money(t.upi_total)} tone="text-sky-300" />
                <Tile label="Link" value={money(t.link_total)} tone="text-violet-300" />
            </div>
            {t.awaiting_payment > 0 && (
                <p className="px-3 pb-2 text-xs text-amber-400 flex-shrink-0">
                    {t.awaiting_payment} not paid · {money(t.unpaid_total)} — these were never made.
                </p>
            )}

            <div className="flex items-center gap-2 px-3 pb-2 flex-shrink-0">
                {FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap ${
                            filter === f.key
                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}>
                        {f.label}
                    </button>
                ))}
                <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Token, order #, phone…"
                        className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-full text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
                {visible.map((sale) => <SaleRow key={sale.id} sale={sale} onPrint={reprint} />)}
                {!visible.length && (
                    <p className="text-sm text-slate-600 py-10 text-center">
                        {day.orders.length ? 'Nothing matches that.' : 'No sales yet today.'}
                    </p>
                )}
            </div>

            <PrinterSheet open={printerOpen} onClose={() => setPrinterOpen(false)} stallTitle={day.stall.title} />
        </div>
    );
}

/** How the money came in — or plainly that it did not. */
function paymentLabel(sale: StallSale): string {
    if (sale.cancelled) return 'CANCELLED';
    if (!isSettled(sale.payment_status)) {
        return sale.payment_status === 'link_sent' ? 'LINK SENT — NOT PAID' : 'NOT PAID';
    }
    if (sale.payment_mode === 'cash') return 'CASH';
    if (sale.payment_mode === 'upi') return 'UPI';
    if (sale.payment_mode === 'link' || sale.payment_mode === 'razorpay') return 'PAYMENT LINK';
    return 'PAID';
}

function SaleRow({ sale, onPrint }: { sale: StallSale; onPrint: (s: StallSale) => void }) {
    const paid = isSettled(sale.payment_status);
    const label = paymentLabel(sale);
    const tone = sale.cancelled
        ? 'bg-slate-800 text-slate-400'
        : paid
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-red-500/15 text-red-300';
    return (
        <div className={`p-3 rounded-xl border ${
            sale.cancelled ? 'bg-slate-900/40 border-slate-800/60 opacity-70' : 'bg-slate-900 border-slate-800'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tabular-nums">{sale.token ?? '—'}</span>
                        {sale.order_no != null && (
                            <span className="text-xs text-slate-500 tabular-nums">#{sale.order_no}</span>
                        )}
                        {sale.state === 'handed_over' && !sale.cancelled && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                handed over
                            </span>
                        )}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                        {sale.items.map((it, i) => (
                            <li key={i} className="text-sm text-slate-300">
                                <span className="text-slate-500">{it.qty}×</span> {it.label}
                            </li>
                        ))}
                    </ul>
                    {sale.contact_phone && (
                        <p className="mt-1 text-xs text-slate-500 tabular-nums">{sale.contact_phone}</p>
                    )}
                    {sale.cancelled && sale.cancellation_reason && (
                        <p className="mt-1 text-xs text-slate-500">{sale.cancellation_reason}</p>
                    )}
                    {sale.created_at && (
                        <p className="mt-1 text-[11px] text-slate-600">{sale.created_at}</p>
                    )}
                </div>
                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                    <div className="text-lg font-semibold">{money(sale.total_amount)}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${tone}`}>{label}</span>
                    <button onClick={() => onPrint(sale)}
                        aria-label={`Print the slip for token ${sale.token ?? ''}`}
                        title="Print this slip"
                        className="mt-1 px-3 py-2 rounded-lg bg-slate-800 text-slate-400 active:bg-slate-700">
                        <Printer className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

const Tile = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
    <div className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p className={`text-base font-bold ${tone}`}>{value}</p>
    </div>
);

const Centered = ({ children }: { children: React.ReactNode }) => (
    <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-sm">
        {children}
    </div>
);
