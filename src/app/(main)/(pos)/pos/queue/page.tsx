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
import { ArrowLeft, Check, ChefHat, Bell, X, Loader2 } from 'lucide-react';
import { stallGet, stallPost, StallApiError } from '@/lib/stall/api';
import { readTillSession } from '@/lib/stall/session';
import { type StallQueue, type QueueTicket, isSettled } from '@/lib/stall/types';

const POLL_MS = 8000;
const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

const LANES: { key: QueueTicket['state']; title: string; tone: string }[] = [
    { key: 'new', title: 'New', tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10' },
    { key: 'preparing', title: 'Preparing', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
    { key: 'ready', title: 'Ready', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
];

export default function QueuePage() {
    const [code, setCode] = useState('');
    const [queue, setQueue] = useState<StallQueue | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<number | null>(null);
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

    const act = useCallback(async (ticket: QueueTicket, action: 'preparing' | 'ready' | 'handover' | 'reject') => {
        setActing(ticket.id);
        try {
            if (action === 'handover') {
                await stallPost(`/stall/${code}/orders/${ticket.id}/handover`);
                toast.success(`Token ${ticket.token} handed over`);
            } else if (action === 'reject') {
                await stallPost(`/stall/${code}/orders/${ticket.id}/reject`, { reason: 'Rejected at the counter' });
                toast.success(`Token ${ticket.token} removed`);
            } else {
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

    if (!code) return <Centered>No stall selected.</Centered>;
    if (!queue && error) return <Centered>{error}</Centered>;
    if (!queue) return <Centered><span className="w-8 h-8 spinner" /></Centered>;

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-3 py-2 flex-shrink-0">
                <Link href="/pos" className="flex items-center gap-1.5 text-sm text-slate-300 px-3 py-2 rounded-lg border border-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Till
                </Link>
                <div className="text-right">
                    <div className="text-sm font-semibold">{money(queue.totals.paid_total)} taken</div>
                    <div className="text-[11px] text-slate-500">
                        {queue.totals.orders_count} orders
                        {queue.totals.unpaid_total > 0 && ` · ${money(queue.totals.unpaid_total)} unpaid`}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden px-3 pb-3">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:h-full">
                    {LANES.map((lane) => {
                        const tickets = queue.orders.filter((o) => o.state === lane.key);
                        return (
                            <section key={lane.key} className="flex flex-col min-h-0">
                                <h2 className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold mb-2 ${lane.tone}`}>
                                    {lane.title} · {tickets.length}
                                </h2>
                                <div className="space-y-2 lg:overflow-y-auto lg:flex-1 lg:min-h-0">
                                    {tickets.map((t) => (
                                        <TicketCard
                                            key={t.id} ticket={t} lane={lane.key}
                                            busy={acting === t.id} onAct={act}
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
        </div>
    );
}

function TicketCard({ ticket, lane, busy, onAct }: {
    ticket: QueueTicket;
    lane: QueueTicket['state'];
    busy: boolean;
    onAct: (t: QueueTicket, a: 'preparing' | 'ready' | 'handover' | 'reject') => void;
}) {
    const paid = isSettled(ticket.payment_status);
    return (
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="flex items-start justify-between gap-2">
                <div className="text-2xl font-bold leading-none tabular-nums">
                    {ticket.token ?? '—'}
                </div>
                <div className="text-right">
                    <div className="text-sm font-semibold">{money(ticket.total_amount)}</div>
                    <div className={`text-[11px] ${paid ? 'text-emerald-400' : 'text-red-300'}`}>
                        {paid ? (ticket.payment_mode === 'upi' ? 'UPI' : 'Paid') : 'UNPAID'}
                    </div>
                </div>
            </div>

            <ul className="mt-2 space-y-0.5">
                {ticket.items.map((it, i) => (
                    <li key={i} className="text-sm text-slate-300">
                        <span className="text-slate-500">{it.qty}×</span> {it.label}
                    </li>
                ))}
            </ul>
            {ticket.note && <p className="mt-1.5 text-xs text-amber-300">{ticket.note}</p>}

            <div className="mt-3 flex gap-2">
                {lane === 'new' && (
                    <LaneButton onClick={() => onAct(ticket, 'preparing')} busy={busy}
                        icon={<ChefHat className="w-4 h-4" />} label="Start" className="bg-amber-600 active:bg-amber-700" />
                )}
                {lane === 'preparing' && (
                    <LaneButton onClick={() => onAct(ticket, 'ready')} busy={busy}
                        icon={<Bell className="w-4 h-4" />} label="Ready" className="bg-emerald-600 active:bg-emerald-700" />
                )}
                {(lane === 'ready' || lane === 'new') && (
                    <LaneButton
                        onClick={() => onAct(ticket, 'handover')}
                        busy={busy}
                        // The server refuses an unpaid handover anyway; disabling
                        // it here just avoids an error the operator can't act on
                        // while a customer is standing there.
                        disabled={!paid}
                        icon={<Check className="w-4 h-4" />} label="Handed over"
                        className="bg-slate-700 active:bg-slate-600" />
                )}
                {!paid && (
                    <button
                        onClick={() => onAct(ticket, 'reject')}
                        disabled={busy}
                        className="px-3 py-2.5 rounded-lg bg-slate-800 text-slate-400 active:bg-slate-700"
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
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 disabled:bg-slate-800 disabled:text-slate-600 ${className}`}
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
