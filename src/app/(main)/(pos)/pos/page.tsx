'use client';

/**
 * The till.
 *
 * Product grid + category chips on the left, cart on the right, settlement
 * along the bottom — the reference POS layout minus its nav sidebar. The stall
 * menus are ~19 tiles across two tabs, so the grid never paginates.
 *
 * Money shown here is a PREVIEW. The backend re-prices every line from
 * stall_menu_item and returns the authoritative total; the wire payload carries
 * no price at all. Same contract as the day-order form.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import {
    Plus, Minus, Trash2, IndianRupee, Smartphone, Link2, ListOrdered, Loader2,
} from 'lucide-react';
import { stallGet, stallPost, StallApiError } from '@/lib/stall/api';
import { readTillSession } from '@/lib/stall/session';
import {
    type StallMenuItem, type CartLine, type StallOrderResult, type StallSummary, cartSubtotal,
} from '@/lib/stall/types';

type StallOption = Pick<StallSummary, 'id' | 'code' | 'title' | 'is_active'>;

const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

export default function PosPage() {
    const params = useSearchParams();
    // Remembering the pick means an office user only chooses once per device.
    const pickStall = useCallback((next: string) => {
        window.localStorage.setItem('stall_last_code', next);
        setCode(next);
        setNeedsPick(false);
        setStallOptions(null);
    }, []);
    const [code, setCode] = useState<string>('');
    const [needsPick, setNeedsPick] = useState(false);
    const [stallOptions, setStallOptions] = useState<StallOption[] | null>(null);
    const [items, setItems] = useState<StallMenuItem[]>([]);
    // Which stall the operator is ringing up for. The code alone
    // ('artofliving-perma…') is not what anyone calls the stall.
    const [stallTitle, setStallTitle] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [tab, setTab] = useState<string>('');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState<null | 'cash' | 'upi' | 'link'>(null);

/**
 * The idempotency key for the sale in progress, tied to the CART CONTENTS.
 *
 * Reusing one key across a retry is what makes a double-tap — or a retry after
 * the signal drops mid-request — return the original order instead of ringing
 * up a second one. But it must be reused only while the cart is UNCHANGED.
 * Otherwise: the first request lands server-side, the client never sees the
 * response, the customer adds one more item and taps again — and the backend
 * matches the stale key and returns the ORIGINAL, smaller order as `reused`.
 * The added item is silently never charged and never made.
 *
 * Keying on a cart fingerprint gives both properties: identical cart ⇒ same
 * key ⇒ deduped; changed cart ⇒ new key ⇒ a real second order.
 */
    const clientRef = useRef<{ key: string; fingerprint: string }>({ key: '', fingerprint: '' });
    const ensureRef = useCallback((fingerprint: string) => {
        if (!clientRef.current.key || clientRef.current.fingerprint !== fingerprint) {
            clientRef.current = {
                key: (crypto?.randomUUID?.() ?? `ref-${Date.now()}-${Math.random()}`),
                fingerprint,
            };
        }
        return clientRef.current.key;
    }, []);

    /**
     * Where the stall code comes from, in priority order:
     *   1. the till session — a tablet unlocked with the stall's passcode;
     *   2. ?stall= — what the QR encodes;
     *   3. the last code used on this device.
     *
     * An ADMIN arriving from the sidebar has none of those: no QR to scan and
     * no passcode session. That used to dead-end on "No stall selected", which
     * made the sidebar link useless. Now it falls through to a picker (and
     * auto-selects when there is only one stall, which is the normal case).
     */
    useEffect(() => {
        const till = readTillSession();
        const fromUrl = params.get('stall');
        const remembered = typeof window !== 'undefined'
            ? window.localStorage.getItem('stall_last_code') : null;
        const resolved = (till?.stall.code || fromUrl || remembered || '').toLowerCase();
        if (resolved) { setCode(resolved); return; }
        setNeedsPick(true);
    }, [params]);

    // Only runs on the admin path — a till session always has its own code.
    useEffect(() => {
        if (!needsPick) return;
        let cancelled = false;
        stallGet<StallOption[]>('/stall/admin/stalls')
            .then((rows) => {
                if (cancelled) return;
                const active = (rows || []).filter((r) => r.is_active);
                if (active.length === 1) {
                    // One stall is the common case; making someone pick from a
                    // list of one is just a click between them and a customer.
                    pickStall(active[0].code);
                } else {
                    setStallOptions(active);
                }
            })
            .catch(() => { if (!cancelled) setStallOptions([]); });
        return () => { cancelled = true; };
    }, [needsPick, pickStall]);

    useEffect(() => {
        if (!code) return;
        let cancelled = false;
        setLoading(true);
        stallGet<{ items: StallMenuItem[]; stall?: { title?: string } }>(`/stall/${code}/menu`)
            .then((d) => {
                if (cancelled) return;
                setStallTitle(d.stall?.title || '');
                setItems(d.items || []);
                setTab((d.items?.[0]?.tab) || '');
                setLoadError(null);
            })
            .catch((err: StallApiError) => { if (!cancelled) setLoadError(err.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [code]);

    const tabs = useMemo(() => {
        const seen: string[] = [];
        for (const i of items) {
            const t = i.tab || 'Other';
            if (!seen.includes(t)) seen.push(t);
        }
        return seen;
    }, [items]);

    const visible = useMemo(
        () => items.filter((i) => (i.tab || 'Other') === (tab || 'Other')),
        [items, tab],
    );

    const subtotal = cartSubtotal(cart);

    const addItem = useCallback((item: StallMenuItem) => {
        setCart((prev) => {
            const at = prev.findIndex((l) => l.menuItemId === item.id);
            if (at >= 0) {
                const next = [...prev];
                next[at] = { ...next[at], qty: next[at].qty + 1 };
                return next;
            }
            return [...prev, {
                menuItemId: item.id,
                label: item.label,
                sizeText: item.size_text,
                unitPrice: item.price,
                qty: 1,
            }];
        });
    }, []);

    const bump = useCallback((menuItemId: number, by: number) => {
        setCart((prev) => prev.flatMap((l) => {
            if (l.menuItemId !== menuItemId) return [l];
            const qty = l.qty + by;
            return qty <= 0 ? [] : [{ ...l, qty }];
        }));
    }, []);

    const clearSale = useCallback(() => {
        setCart([]);
        setPhone('');
        clientRef.current = { key: '', fingerprint: '' };
    }, []);

    const charge = useCallback(async (mode: 'cash' | 'upi' | 'link') => {
        if (!cart.length || busy) return;
        setBusy(mode);
        // Sorted so tap ORDER cannot change the fingerprint of the same cart.
        const fingerprint = JSON.stringify(
            cart.map((l) => [l.menuItemId, l.qty]).sort((a, b) => a[0] - b[0]),
        );
        const ref = ensureRef(fingerprint);
        try {
            const order = await stallPost<StallOrderResult>(`/stall/${code}/orders`, {
                items: cart.map((l) => ({ stall_menu_item_id: l.menuItemId, qty: l.qty })),
                client_ref: ref,
                customer_phone: phone || undefined,
            });

            if (mode === 'link') {
                if (!phone) {
                    toast.error('A phone number is needed to send a payment link');
                    return;
                }
                await stallPost(`/stall/${code}/orders/${order.id}/payment_link`);
                toast.success(`Token ${order.token} · payment link sent`);
            } else {
                await stallPost(`/stall/${code}/orders/${order.id}/settle`, { payment_mode: mode });
                toast.success(
                    `Token ${order.token} · ${money(order.total)} ${mode === 'cash' ? 'cash' : 'by UPI'}`,
                );
            }
            clearSale();
        } catch (err) {
            const e = err as StallApiError;
            toast.error(e.needsUnlock ? 'Till session ended — enter the passcode again' : e.message);
            // The client_ref is deliberately NOT reset: retrying after a failure
            // must reuse it, so a request that actually landed before the error
            // is recognised rather than duplicated.
        } finally {
            setBusy(null);
        }
    }, [cart, busy, ensureRef, code, phone, clearSale]);

    if (!code) {
        if (stallOptions === null) return <Centered><span className="w-8 h-8 spinner" /></Centered>;
        if (!stallOptions.length) {
            return (
                <Centered>
                    No active stalls yet. Create one in <strong className="text-slate-200">Orders &rarr; Stalls &amp; Menus</strong>,
                    add its items, then come back.
                </Centered>
            );
        }
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <h2 className="text-lg font-semibold mb-1">Which stall?</h2>
                <p className="text-sm text-slate-400 mb-5">You can change this any time.</p>
                <div className="w-full max-w-sm space-y-2">
                    {stallOptions.map((s) => (
                        <button key={s.id} onClick={() => pickStall(s.code)}
                            className="w-full p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left active:bg-slate-800">
                            <div className="font-medium">{s.title}</div>
                            <div className="text-xs text-slate-500 font-mono">/{s.code}</div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }
    if (loading) return <Centered><span className="w-8 h-8 spinner" /></Centered>;
    if (loadError) return <Centered>{loadError}</Centered>;

    return (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-x-hidden">
            {/* ── Grid ─────────────────────────────────────────────────── */}
            <section className="flex-1 min-w-0 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800/60">
                {/* Shown even for ONE category: the chip tells the operator what
                    they are looking at, and a stall that starts with only gelato
                    gains chaats mid-season without the row appearing from
                    nowhere. Hiding it was why there was no filter at all. */}
                {tabs.length > 0 && (
                    <div className="flex gap-2 px-3 py-2 overflow-x-auto flex-shrink-0">
                        {tabs.map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-5 py-2.5 rounded-full text-base font-medium whitespace-nowrap border ${
                                    (tab || 'Other') === t
                                        ? 'bg-emerald-600 border-emerald-500 text-white'
                                        : 'bg-slate-900 border-slate-800 text-slate-300'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                        {visible.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => addItem(item)}
                                // Big touch target: this is tapped hundreds of
                                // times a day, often with one hand.
                                className="min-h-[104px] p-4 rounded-2xl bg-slate-900 border border-slate-800 text-left active:bg-slate-800 active:scale-[0.98] transition-transform"
                            >
                                <div className="font-semibold text-base leading-snug">{item.label}</div>
                                {item.size_text && (
                                    <div className="text-xs text-slate-400 mt-0.5">{item.size_text}</div>
                                )}
                                <div className="mt-2 text-emerald-400 font-bold text-lg">{money(item.price)}</div>
                            </button>
                        ))}
                        {!visible.length && (
                            <p className="col-span-full text-sm text-slate-500 py-8 text-center">
                                Nothing on this tab yet.
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* ── Cart ─────────────────────────────────────────────────── */}
            <aside className="w-full lg:w-[380px] flex-shrink-0 flex flex-col min-h-0 bg-slate-950">
                <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
                    <h2 className="text-sm font-semibold text-slate-300">
                        Order {cart.length > 0 && <span className="text-slate-500">· {cart.length} items</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                        <Link href="/pos/queue" className="flex items-center gap-1.5 text-xs text-slate-400 px-2 py-1.5 rounded-lg border border-slate-800">
                            <ListOrdered className="w-3.5 h-3.5" /> Queue
                        </Link>
                        {!readTillSession() && (
                            // Only offered on the admin path: a passcode till is
                            // pinned to its own stall server-side anyway.
                            <button onClick={() => { setCode(''); setNeedsPick(true); }}
                                title={`${stallTitle || code} — tap to switch stall`}
                                className="text-xs text-slate-300 px-2 py-1.5 rounded-lg border border-slate-800 max-w-[10rem] truncate">
                                {stallTitle || code}
                            </button>
                        )}
                        {cart.length > 0 && (
                            <button onClick={clearSale} className="text-xs text-slate-400 px-2 py-1.5 rounded-lg border border-slate-800">
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2">
                    {cart.map((l) => (
                        <div key={l.menuItemId} className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{l.label}</div>
                                    <div className="text-xs text-slate-400">
                                        {money(l.unitPrice)}{l.sizeText ? ` · ${l.sizeText}` : ''}
                                    </div>
                                </div>
                                <div className="text-sm font-semibold whitespace-nowrap">
                                    {money(l.unitPrice * l.qty)}
                                </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <button onClick={() => bump(l.menuItemId, -1)}
                                    className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center active:bg-slate-700">
                                    {l.qty === 1 ? <Trash2 className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4" />}
                                </button>
                                <span className="w-8 text-center font-semibold">{l.qty}</span>
                                <button onClick={() => bump(l.menuItemId, 1)}
                                    className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center active:bg-slate-700">
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {!cart.length && (
                        <p className="text-sm text-slate-600 py-10 text-center">Tap an item to start.</p>
                    )}
                </div>

                <div className="flex-shrink-0 border-t border-slate-800/60 p-3 space-y-3">
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        inputMode="numeric"
                        placeholder="Customer phone (optional)"
                        className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-baseline justify-between">
                        <span className="text-slate-400 text-sm">Total</span>
                        <span className="text-2xl font-bold">{money(subtotal)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <ChargeButton onClick={() => charge('cash')} disabled={!cart.length || !!busy}
                            busy={busy === 'cash'} icon={<IndianRupee className="w-4 h-4" />} label="Cash"
                            className="bg-emerald-600 active:bg-emerald-700" />
                        <ChargeButton onClick={() => charge('upi')} disabled={!cart.length || !!busy}
                            busy={busy === 'upi'} icon={<Smartphone className="w-4 h-4" />} label="UPI"
                            className="bg-sky-600 active:bg-sky-700" />
                        <ChargeButton onClick={() => charge('link')} disabled={!cart.length || !!busy || !phone}
                            busy={busy === 'link'} icon={<Link2 className="w-4 h-4" />} label="Link"
                            className="bg-violet-600 active:bg-violet-700" />
                    </div>
                    {!phone && cart.length > 0 && (
                        <p className="text-[11px] text-slate-500 text-center">
                            Add a phone number to send a payment link or a receipt.
                        </p>
                    )}
                </div>
            </aside>
        </div>
    );
}

function ChargeButton({ onClick, disabled, busy, icon, label, className }: {
    onClick: () => void; disabled: boolean; busy: boolean;
    icon: React.ReactNode; label: string; className: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`py-3.5 rounded-xl font-semibold text-sm flex flex-col items-center gap-1 disabled:bg-slate-800 disabled:text-slate-600 ${className}`}
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
