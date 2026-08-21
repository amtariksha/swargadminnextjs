'use client';

/**
 * The counter board — what to make next.
 *
 * Lanes (new → preparing → ready), each ticket keyed by its short daily token.
 * This is where a stall sale is handed over: a counter sale has no address to
 * drive to, and putting one row per scoop into the day-driver pool would push an
 * FCM to every driver and force a full pool refetch on their phones.
 *
 * Polls rather than streams: the backend is a separate Express service behind
 * Vercel, so SSE would need a second long-lived connection per tablet for a
 * board that changes every few minutes. A poll is also self-healing on the
 * flaky network a market stall actually has.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Bell, X, Loader2, Printer } from 'lucide-react';
import { stallGet, stallPost, StallApiError } from '@/lib/stall/api';
import { readTillSession } from '@/lib/stall/session';
import { type StallQueue, type QueueTicket, isSettled } from '@/lib/stall/types';
import { getPrinterConfig, printTokenTicket } from '@/lib/stall/printer';
import PrinterSheet from '@/components/stall/PrinterSheet';

const POLL_MS = 8000;
const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

/**
 * Two lanes, deliberately.
 *
 * A three-stage board (new -> preparing -> ready) is one tap too many for a
 * gelato scoop, and the middle lane made tickets look like they had vanished:
 * press Start and the card leaves New for a column that is below the fold on a
 * phone. The backend still ACCEPTS 'preparing', so a slower kitchen can have
 * the lane back by adding one entry here — no deploy of the API needed.
 */
const LANES: { key: QueueTicket['state']; title: string; tone: string }[] = [
    { key: 'new', title: 'New', tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
    { key: 'ready', title: 'Ready', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
];

/** Lanes the board renders. A ticket in any other state still needs somewhere
 *  to appear, or it silently disappears from the counter. */
const LANE_KEYS = LANES.map((l) => l.key);

export default function QueuePage() {
    const [code, setCode] = useState('');
    const [queue, setQueue] = useState<StallQueue | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<number | null>(null);
    const [printerOpen, setPrinterOpen] = useState(false);
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
        try {
            setQueue(await stallGet<StallQueue>(`/stall/${code}/queue`));
            setError(null);
        } catch (err) {
            // A failed poll must not blank a board the operator is reading from;
            // keep the last good data and only surface the error when there is
            // nothing to show.
            if (!silent) setError((err as StallApiError).message);
        } finally {
            inFlight.current = false;
        }
    }, [code]);

    useEffect(() => {
        if (!code) return;
        void load();
        const id = setInterval(() => void load(true), POLL_MS);
        return () => clearInterval(id);
    }, [code, load]);

    const act = useCallback(async (ticket: QueueTicket, action: 'ready' | 'handover' | 'reject') => {
        setActing(ticket.id);
        try {
            if (action === 'handover') {
                await stallPost(`/stall/${code}/orders/${ticket.id}/handover`);
                // Drop the card NOW rather than waiting for the refetch. The
                // poll is on an interval and the board is read across a counter:
                // a ticket that lingers after "Handed over" gets handed over
                // twice. The refetch below reconciles either way.
                setQueue((q) => (q ? { ...q, orders: q.orders.filter((o) => o.id !== ticket.id) } : q));
                toast.success(`Token ${ticket.token} handed over`);
            } else if (action === 'reject') {
                await stallPost(`/stall/${code}/orders/${ticket.id}/reject`, { reason: 'Rejected at the counter' });
                setQueue((q) => (q ? { ...q, orders: q.orders.filter((o) => o.id !== ticket.id) } : q));
                toast.success(`Token ${ticket.token} removed`);
            } else {
                // Same for a lane move — reflect it before the next poll.
                setQueue((q) => (q ? {
                    ...q,
                    orders: q.orders.map((o) => (o.id === ticket.id ? { ...o, state: action } : o)),
                } : q));
                await stallPost(`/stall/${code}/orders/${ticket.id}/state`, { state: action });
            }
            await load();
        } catch (err) {
            toast.error((err as StallApiError).message);
            await load(true);
        } finally {
            setActing(null);
        }
    }, [code, load]);

    /**
     * Reprint one ticket's slip.
     *
     * `force` bypasses the auto-print switch: this is an explicit tap, so it
     * prints even for a stall that has auto-print off and only wants a slip
     * occasionally. The board carries no unit prices, so the lines print without
     * per-line amounts — the total is what the customer needs to see.
     */
    const reprint = useCallback(async (ticket: QueueTicket) => {
        const config = getPrinterConfig();
        if (config.mode === 'off') {
            toast.error('No printer set up on this device', {
                description: 'Tap the printer icon above to choose one.',
            });
            return;
        }
        try {
            await printTokenTicket({
                stallTitle: queue?.stall.title || '',
                stallLocation: null,
                token: ticket.token,
                orderNo: null,
                placedAt: ticket.created_at || new Date().toLocaleString('en-IN'),
                lines: ticket.items.map((i) => ({ label: i.label, qty: i.qty, lineTotal: null })),
                total: ticket.total_amount,
                paymentLabel: isSettled(ticket.payment_status)
                    ? (ticket.payment_mode === 'upi' ? 'UPI' : 'CASH')
                    : 'AWAITING PAYMENT',
                phone: ticket.contact_phone,
                note: ticket.note,
            }, { force: true, config });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'That slip did not print.');
        }
    }, [queue?.stall.title]);

    // Mirrors the till: reached without a code (an admin from the sidebar), send
    // them to the till, which knows how to ask which stall.
    if (!code) {
        return (
            <Centered>
                No stall selected.{' '}
                <Link href="/pos" className="text-emerald-400 underline">Pick one on the till</Link>.
            </Centered>
        );
    }
    if (!queue && error) return <Centered>{error}</Centered>;
    if (!queue) return <Centered><span className="w-8 h-8 spinner" /></Centered>;

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-3 py-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <Link href="/pos" className="flex items-center gap-1.5 text-sm text-slate-300 px-3 py-2 rounded-lg border border-slate-800">
                        <ArrowLeft className="w-4 h-4" /> Till
                    </Link>
                    <button onClick={() => setPrinterOpen(true)} title="Printer setup"
                        aria-label="Printer setup"
                        className="text-slate-300 px-3 py-2 rounded-lg border border-slate-800">
                        <Printer className="w-4 h-4" />
                    </button>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold">{money(queue.totals.paid_total)} taken</div>
                    <div className="text-xs text-slate-400">
                        {money(queue.totals.cash_total)} cash · {money(queue.totals.upi_total)} UPI
                        {queue.totals.link_total > 0 && ` · ${money(queue.totals.link_total)} link`}
                    </div>
                    {queue.totals.awaiting_payment > 0 && (
                        // These orders exist but are NOT on the board — payment
                        // gates it, so nothing is made for them.
                        <div className="text-xs text-amber-400">
                            {queue.totals.awaiting_payment} awaiting payment
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-3 pb-3">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:h-full">
                    {LANES.map((lane) => {
                        // Anything in a state this board no longer renders (a
                        // 'preparing' ticket from before the lane was removed)
                        // falls into New rather than vanishing off the counter.
                        const tickets = queue.orders.filter((o) =>
                            o.state === lane.key
                            || (lane.key === 'new' && !LANE_KEYS.includes(o.state)));
                        return (
                            <section key={lane.key} className="flex flex-col min-h-0">
                                <h2 className={`flex-shrink-0 px-3 py-2 rounded-lg border text-sm font-bold mb-2 ${lane.tone}`}>
                                    {lane.title} · {tickets.length}
                                </h2>
                                <div className="space-y-2 lg:overflow-y-auto lg:flex-1 lg:min-h-0">
                                    {tickets.map((t) => (
                                        <TicketCard
                                            key={t.id} ticket={t} lane={lane.key}
                                            busy={acting === t.id} onAct={act} onPrint={reprint}
                                        />
                                    ))}
                                    {!tickets.length && (
                                        <p className="text-xs text-slate-600 py-4 text-center">Empty</p>
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>

            <PrinterSheet
                open={printerOpen}
                onClose={() => setPrinterOpen(false)}
                stallTitle={queue.stall.title}
            />
        </div>
    );
}

function TicketCard({ ticket, lane, busy, onAct, onPrint }: {
    ticket: QueueTicket;
    lane: QueueTicket['state'];
    busy: boolean;
    onAct: (t: QueueTicket, a: 'ready' | 'handover' | 'reject') => void;
    onPrint: (t: QueueTicket) => void;
}) {
    const paid = isSettled(ticket.payment_status);
    return (
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-start justify-between gap-2">
                <div className="text-4xl font-bold leading-none tabular-nums">
                    {ticket.token ?? '—'}
                </div>
                <div className="text-right">
                    <div className="text-lg font-semibold">{money(ticket.total_amount)}</div>
                    <div className={`text-[11px] ${paid ? 'text-emerald-400' : 'text-red-300'}`}>
                        {paid ? (ticket.payment_mode === 'upi' ? 'UPI' : 'Paid') : 'UNPAID'}
                    </div>
                </div>
            </div>

            <ul className="mt-2 space-y-0.5">
                {ticket.items.map((it, i) => (
                    <li key={i} className="text-base text-slate-200">
                        <span className="text-slate-500">{it.qty}×</span> {it.label}
                    </li>
                ))}
            </ul>
            {/* How you find the customer when a slip is lost or a token is not
                answered. A QR self-order always has one — payment is mandatory,
                so the number is required to send the receipt. */}
            {ticket.contact_phone && (
                <p className="mt-1.5 text-xs text-slate-400 tabular-nums">{ticket.contact_phone}</p>
            )}
            {ticket.note && <p className="mt-1.5 text-xs text-amber-300">{ticket.note}</p>}

            <div className="mt-3 flex gap-2">
                {lane === 'new' && (
                    <LaneButton onClick={() => onAct(ticket, 'ready')} busy={busy}
                        icon={<Bell className="w-4 h-4" />} label="Ready"
                        className="bg-emerald-600 active:bg-emerald-700" />
                )}
                <LaneButton
                    onClick={() => onAct(ticket, 'handover')}
                    busy={busy}
                    // The server refuses an unpaid handover anyway; disabling it
                    // here just avoids an error the operator cannot act on while
                    // a customer is standing there.
                    disabled={!paid}
                    icon={<Check className="w-4 h-4" />} label="Handed over"
                    className="bg-slate-700 active:bg-slate-600" />
                <button
                    onClick={() => onPrint(ticket)}
                    className="px-4 py-4 rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700"
                    aria-label={`Print the slip for token ${ticket.token ?? ''}`}
                    title="Print this token slip"
                >
                    <Printer className="w-4 h-4" />
                </button>
                {!paid && (
                    <button
                        onClick={() => onAct(ticket, 'reject')}
                        disabled={busy}
                        className="px-4 py-4 rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700"
                        aria-label="Remove ticket"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

function LaneButton({ onClick, busy, disabled, icon, label, className }: {
    onClick: () => void; busy: boolean; disabled?: boolean;
    icon: React.ReactNode; label: string; className: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={busy || disabled}
            className={`flex-1 py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 disabled:bg-slate-800 disabled:text-slate-600 ${className}`}
        >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
            {label}
        </button>
    );
}

const Centered = ({ children }: { children: React.ReactNode }) => (
    <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-sm">
        {children}
    </div>
);
