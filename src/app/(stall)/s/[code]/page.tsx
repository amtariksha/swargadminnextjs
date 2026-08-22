'use client';

/**
 * The customer's QR page.
 *
 * Scanned at the stall: browse the menu, build an order, hand over a phone
 * number if you want a receipt, and either pay now or pay at the counter. The
 * customer's phone then shows a TOKEN — the number that gets called out.
 *
 * Entirely unauthenticated. Safe because the backend prices every line from the
 * stall's own menu (the payload carries no price), never resolves the typed
 * phone to an existing customer account, and sends no WhatsApp from this path.
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Plus, Minus, ShoppingBag, Check, Loader2, Clock } from 'lucide-react';
import { stallImageUrl, stallInitials } from '@/lib/stall/image';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'https://node.desicowmilk.com').replace(/\/$/, '');
const TENANT = process.env.NEXT_PUBLIC_TENANT_CODE || 'swarg';
const api = (path: string) => `${API_BASE}/api/${TENANT}${path}`;
const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
/** Per-stall, so scanning a second stall's QR does not show the first one's receipt. */
const RECEIPT_KEY = (code: string) => `stall_receipt_${code}`;

interface StoredReceipt {
    id: number; orderNo: number | null; token: number | null; total: number;
    payUrl?: string | null; ref?: string; at: number;
}

/** The receipt this browser last placed at this stall, or null if it has aged out. */
function readReceipt(code: string): (StoredReceipt & { ref: string }) | null {
    try {
        const raw = window.localStorage.getItem(RECEIPT_KEY(code));
        if (!raw) return null;
        const saved = JSON.parse(raw) as StoredReceipt;
        // Four hours: a stall packing up at 6pm must not resurrect a lunchtime
        // receipt for whoever scans the QR next on a shared phone.
        if (!saved?.id || Date.now() - (saved.at || 0) > 4 * 60 * 60 * 1000) {
            window.localStorage.removeItem(RECEIPT_KEY(code));
            return null;
        }
        return { ...saved, ref: saved.ref ?? '' };
    } catch {
        return null;
    }
}

interface PublicItem {
    id: number; label: string; size_text: string | null; price: number;
    tab: string | null; image_url: string | null;
}
interface PublicMenu {
    stall: { code: string; title: string; location_text: string | null; open_from: string | null; open_to: string | null };
    accepting: boolean;
    reason: string | null;
    items: PublicItem[];
}

/**
 * The Swarg mark.
 *
 * Worth having on both public screens: this page is opened by scanning a code
 * on a stall banner, so the first thing it must do is confirm the customer is
 * where they think they are. The token screen carries it too — that is the
 * screen they hold up at the counter, and it doubles as the receipt.
 *
 * Intrinsic size passed exactly (193x79) so Next reserves the box and the
 * layout does not jump as it loads.
 */
const SwargMark = ({ className = '' }: { className?: string }) => (
    <Image
        src="/swarg-logo.png"
        alt="Swarg"
        width={193}
        height={79}
        priority
        className={`h-11 w-auto ${className}`}
    />
);

export default function PublicStallPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const [menu, setMenu] = useState<PublicMenu | null>(null);
    const [failed, setFailed] = useState(false);
    const [tab, setTab] = useState('');
    const [cart, setCart] = useState<Record<number, number>>({});
    const [phone, setPhone] = useState('');
    const [placing, setPlacing] = useState(false);
    const [placed, setPlaced] = useState<
        {
            id: number; orderNo: number | null; token: number | null; total: number;
            payUrl: string | null;
            /** The UUID that authorises amending THIS order. See amendPublicStallOrder. */
            ref: string;
        } | null
    >(null);
    /** Set while the customer is adding to an order that already exists. */
    const [amending, setAmending] = useState(false);
    /** What had already landed on that order — the top-up is priced against it. */
    const [paidBeforeAmend, setPaidBeforeAmend] = useState(0);
    const [resuming, setResuming] = useState(false);
    const [paid, setPaid] = useState(false);
    /** > 0 when the customer topped up a paid order and owes the difference. */
    const [balanceDue, setBalanceDue] = useState(0);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        fetch(api(`/stall/public/${encodeURIComponent(code)}/menu`))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
            .then((body) => {
                const d = body?.data as PublicMenu;
                setMenu(d);
                setTab(d?.items?.[0]?.tab || '');
            })
            .catch(() => setFailed(true));
    }, [code]);

    /**
     * Bring the receipt back after the trip to Razorpay.
     *
     * Paying navigates the tab away to the hosted payment page, and the link is
     * created with no callback_url — so Razorpay shows its own success screen
     * and the customer presses Back. That is a FULL page load: React state is
     * gone, and without this they would land on the menu again with no token, no
     * order number and no way to tell whether they had just paid.
     *
     * Only the id really matters — the poll below re-reads everything from the
     * server a moment later — but keeping the token and total makes the screen
     * correct on the first paint instead of flashing placeholders.
     *
     * Four hours, so a stall packing up at 6pm does not resurrect a lunchtime
     * receipt for whoever scans the QR next on a shared phone.
     */
    useEffect(() => {
        if (!code || placed) return;
        const saved = readReceipt(code);
        if (saved) {
            setPlaced({
                id: saved.id, orderNo: saved.orderNo, token: saved.token,
                total: saved.total, payUrl: saved.payUrl ?? null, ref: saved.ref,
            });
        }
        // Deliberately mount-only: re-running when `placed` changes would restore
        // the receipt the moment "Order something else" cleared it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code]);

    /**
     * Poll the receipt until payment clears.
     *
     * The customer comes back from Razorpay to this screen, and the webhook that
     * marks the order paid lands server-side a moment later — so the page cannot
     * know from the redirect alone. Polling stops as soon as it is paid.
     */
    useEffect(() => {
        // Keeps polling while a BALANCE is outstanding, not just while unpaid:
        // a topped-up order is already `paid` and still waiting on the
        // difference, and stopping here would freeze the screen mid-top-up.
        if (!placed?.id || (paid && balanceDue <= 0)) return;
        let stop = false;
        const tick = async () => {
            try {
                const r = await fetch(api(`/stall/public/${encodeURIComponent(code)}/orders/${placed.id}`));
                const b = await r.json();
                if (stop) return;
                const d = b?.data;
                if (!d) return;
                // The server is authoritative — a rehydrated receipt may predate
                // the token allocation, and this is also where a restored screen
                // fills in anything localStorage did not carry.
                setPlaced((prev) => (prev && prev.id === d.id ? {
                    ...prev,
                    orderNo: d.order_no ?? prev.orderNo,
                    token: d.token ?? prev.token,
                    total: d.total_amount ?? prev.total,
                    // Amending mints a NEW link; the old one is cancelled, so the
                    // server's copy is the only one safe to send anyone to.
                    payUrl: d.payment_short_url ?? prev.payUrl,
                } : prev));
                setBalanceDue(Number(d.balance_due) || 0);
                if (d.paid) setPaid(true);
            } catch { /* a failed poll is not worth showing anyone */ }
        };
        void tick();
        const id = setInterval(tick, 4000);
        return () => { stop = true; clearInterval(id); };
    }, [placed?.id, paid, balanceDue, code]);

    const tabs = useMemo(() => {
        const seen: string[] = [];
        for (const i of menu?.items ?? []) {
            const t = i.tab || 'Menu';
            if (!seen.includes(t)) seen.push(t);
        }
        return seen;
    }, [menu]);

    const lines = useMemo(
        () => (menu?.items ?? [])
            .filter((i) => cart[i.id] > 0)
            .map((i) => ({ item: i, qty: cart[i.id] })),
        [menu, cart],
    );
    const total = lines.reduce((s, l) => s + l.item.price * l.qty, 0);

    const bump = useCallback((id: number, by: number) => {
        setCart((prev) => {
            const qty = (prev[id] || 0) + by;
            const next = { ...prev };
            if (qty <= 0) delete next[id]; else next[id] = qty;
            return next;
        });
    }, []);

    /**
     * Pull the customer's existing basket back onto the menu so they can add to
     * it — the "I also want a chaat" path, taken after they backed out of the
     * payment page.
     *
     * Rebuilt from the ORDER, not from whatever this browser still remembers:
     * they may have come back on a reload, and the server is the only thing that
     * knows what is actually on the order.
     */
    const addMoreItems = useCallback(async () => {
        if (!placed || resuming) return;
        setResuming(true);
        setError(null);
        try {
            const r = await fetch(api(`/stall/public/${encodeURIComponent(code)}/orders/${placed.id}`));
            if (!r.ok) throw new Error('read failed');
            const d = (await r.json())?.data;
            if (!d) throw new Error('empty');
            const restored: Record<number, number> = {};
            for (const it of (d?.items ?? [])) {
                if (it?.stall_menu_item_id) {
                    restored[it.stall_menu_item_id] = (restored[it.stall_menu_item_id] || 0) + Number(it.qty || 0);
                }
            }
            setCart(restored);
            setPaidBeforeAmend(Number(d?.amount_paid) || 0);
            setAmending(true);
            setPlaced(null);   // back to the menu; the order itself is untouched
        } catch {
            setError('Could not load your order — please try again.');
        } finally {
            setResuming(false);
        }
    }, [placed, resuming, code]);

    const place = useCallback(async () => {
        if (!lines.length || placing) return;
        setPlacing(true);
        setError(null);
        const fingerprint = JSON.stringify(
            lines.map((l) => [l.item.id, l.qty]).sort((a, b) => a[0] - b[0]),
        );
        if (!clientRef.current.key || clientRef.current.fingerprint !== fingerprint) {
            clientRef.current = {
                key: (crypto?.randomUUID?.() ?? `pub-${Date.now()}-${Math.random()}`),
                fingerprint,
            };
        }
        // Amending keeps the SAME order — same token, same order number, one
        // payment — so it must reuse the ref that authorises it, not the
        // cart-fingerprint ref a fresh order would mint.
        const existing = amending ? readReceipt(code) : null;
        const url = existing
            ? api(`/stall/public/${encodeURIComponent(code)}/orders/${existing.id}/amend`)
            : api(`/stall/public/${encodeURIComponent(code)}/orders`);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: lines.map((l) => ({ stall_menu_item_id: l.item.id, qty: l.qty })),
                    customer_phone: phone || undefined,
                    client_ref: existing ? existing.ref : clientRef.current.key,
                }),
            });
            const body = await res.json().catch(() => null);
            // HTTP status FIRST. The envelope check below only recognises the
            // API's own error shape ({status:false} / {response:4xx}); an
            // unhandled 500 returns {statusCode, error, message} with neither
            // field, sailed straight through, and left `data` undefined — so the
            // customer got a token screen with no token and "online payment is
            // unavailable" instead of an error. That is exactly how a real
            // outage presented, and it cost an hour to find.
            if (!res.ok) {
                throw new Error(res.status >= 500
                    ? 'Something went wrong at our end — please try again in a moment.'
                    : (body?.message || 'Could not place the order'));
            }
            if (body?.status === false || (body?.response && body.response !== 200)) {
                throw new Error(body?.message || 'Could not place the order');
            }
            if (!body?.data?.id) {
                // Belt and braces: never render a receipt we did not actually get.
                throw new Error('Could not place the order — please try again.');
            }
            const d = body?.data ?? {};
            const receipt = {
                id: d.id, orderNo: d.order_no ?? null, token: d.token ?? null, total: d.total ?? total,
                payUrl: d.payment_short_url ?? null,
                ref: existing ? existing.ref : clientRef.current.key,
            };
            setAmending(false);
            setPaidBeforeAmend(0);
            setBalanceDue(Number(d.balance_due) || 0);
            setPlaced(receipt);
            // Written BEFORE the redirect below, or the trip to Razorpay loses it.
            try {
                window.localStorage.setItem(RECEIPT_KEY(code), JSON.stringify({ ...receipt, at: Date.now() }));
            } catch { /* storage blocked — the receipt just will not survive a reload */ }
            setPaid(false);
            setCart({});
            // Payment is mandatory: nothing is made until it clears. Send the
            // customer straight to Razorpay rather than making them find a
            // button — they came here to buy, and the counter only sees the
            // ticket once the webhook marks it paid.
            if (d.payment_short_url) window.location.href = d.payment_short_url;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not place the order');
        } finally {
            setPlacing(false);
        }
    }, [lines, placing, code, phone, total]);

    if (failed) {
        return <Screen title="Menu not available" body="This code doesn't match a stall. Check the QR and try again." />;
    }
    if (!menu) {
        return <div className="min-h-screen flex items-center justify-center"><span className="w-8 h-8 spinner" /></div>;
    }

    // The token screen — the receipt, and the number that gets called out.
    if (placed) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
                <SwargMark className="mb-8" />
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${
                    paid ? 'bg-emerald-100' : 'bg-amber-100'
                }`}>
                    {paid
                        ? <Check className="w-8 h-8 text-emerald-600" />
                        : <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />}
                </div>
                <p className="text-slate-600">Your token</p>
                <div className="text-7xl font-bold tabular-nums my-2">{placed.token ?? '—'}</div>
                <p className="text-lg font-semibold">{money(placed.total)}</p>
                {/* The token is the number shouted across the counter and resets
                    to 1 every morning; the order number is the one that means
                    anything on the phone if something needs sorting out later. */}
                {placed.orderNo != null && (
                    <p className="mt-1 text-sm text-slate-500 tabular-nums">Order #{placed.orderNo}</p>
                )}
                <p className="mt-4 text-sm text-slate-600 max-w-xs">
                    {paid
                        ? 'Paid. We\u2019re making it now — we\u2019ll call your number.'
                        : 'Waiting for your payment to confirm. This page updates on its own.'}
                </p>
                {!paid && (
                    <p className="mt-2 text-xs text-amber-700 max-w-xs">
                        Nothing is made until payment clears.
                    </p>
                )}
                {paid && balanceDue > 0 && (
                    <p className="mt-2 text-sm text-amber-800 font-medium max-w-xs">
                        {money(balanceDue)} still to pay for the items you added.
                        Collect once it&apos;s done.
                    </p>
                )}

                {/* PAID and settled — they can still add to the SAME token and pay
                    only the difference. The order is theirs until it is handed
                    over, so "Order something else" was making people queue twice
                    for one collection. */}
                {paid && balanceDue <= 0 && (
                    <div className="mt-7 w-full max-w-xs space-y-2">
                        <button onClick={addMoreItems} disabled={resuming}
                            className="w-full py-4 rounded-2xl bg-white border-2 border-slate-900 text-slate-900 font-semibold active:bg-slate-100 disabled:opacity-60 flex items-center justify-center gap-2">
                            {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add more items
                        </button>
                        <p className="text-[11px] text-slate-500">
                            Same token — you&apos;ll only pay for what you add.
                        </p>
                    </div>
                )}

                {/* PART-PAID after a top-up: the difference is still owed. */}
                {paid && balanceDue > 0 && placed.payUrl && (
                    <div className="mt-7 w-full max-w-xs space-y-2">
                        <a href={placed.payUrl}
                            className="block w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold active:bg-emerald-700">
                            Pay {money(balanceDue)}
                        </a>
                        <button onClick={addMoreItems} disabled={resuming}
                            className="w-full py-4 rounded-2xl bg-white border-2 border-slate-900 text-slate-900 font-semibold active:bg-slate-100 disabled:opacity-60 flex items-center justify-center gap-2">
                            {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add more items
                        </button>
                    </div>
                )}

                {/* UNPAID — the two things a customer actually wants here.
                    This screen used to offer only "Order something else", which
                    starts a SECOND order: a second token, a second payment, and
                    a counter handing two tickets to one person. Someone who
                    backed out of the payment page wants to finish paying, or to
                    add the chaat they came back for. */}
                {!paid && (
                    <div className="mt-7 w-full max-w-xs space-y-2">
                        {placed.payUrl ? (
                            <a href={placed.payUrl}
                                className="block w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold active:bg-emerald-700">
                                Pay {money(placed.total)}
                            </a>
                        ) : (
                            // attachPaymentLink never throws — a stall with Razorpay
                            // down still gets its order and token, just no link. Say
                            // so, rather than showing a screen with no way forward.
                            <p className="px-3 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                                Online payment is unavailable right now — show this token
                                at the counter and pay there.
                            </p>
                        )}
                        <button onClick={addMoreItems} disabled={resuming}
                            className="w-full py-4 rounded-2xl bg-white border-2 border-slate-900 text-slate-900 font-semibold active:bg-slate-100 disabled:opacity-60 flex items-center justify-center gap-2">
                            {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add more items
                        </button>
                        <p className="text-[11px] text-slate-500">
                            Adding keeps this same token — you pay once, for everything.
                        </p>
                    </div>
                )}

                <button onClick={() => {
                    setPlaced(null);
                    setPaid(false);
                    setAmending(false);
                    setBalanceDue(0);
                    setPaidBeforeAmend(0);
                    setCart({});
                    clientRef.current = { key: '', fingerprint: '' };
                    try { window.localStorage.removeItem(RECEIPT_KEY(code)); } catch { /* nothing to clear */ }
                }}
                    className="mt-5 px-5 py-2 text-sm text-slate-500 underline">
                    Start a different order
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col pb-40">
            <header className="px-5 pt-6 pb-3">
                <SwargMark className="mb-4" />
                <h1 className="text-2xl font-bold">{menu.stall.title}</h1>
                {menu.stall.location_text && (
                    <p className="text-sm text-slate-600">{menu.stall.location_text}</p>
                )}
                {!menu.accepting && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                        <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                            {menu.reason === 'closed' && menu.stall.open_from
                                ? `Not taking orders right now — we open at ${menu.stall.open_from}.`
                                : 'Not taking orders from the QR right now. Please order at the counter.'}
                        </span>
                    </div>
                )}
            </header>

            {/* Without this the menu looks like a fresh order with a mysteriously
                pre-filled basket. Says which token is being added to, and gives
                a way out that is not "empty the cart and wonder". */}
            {amending && (
                <div className="mx-5 mb-3 flex items-start justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900 text-white">
                    <div className="text-sm">
                        <div className="font-semibold">Adding to your order</div>
                        <div className="text-xs text-slate-300">
                            {paidBeforeAmend > 0
                                ? `Same token — you'll only pay for what you add.`
                                : 'Same token — you pay once, for everything.'}
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setAmending(false);
                            setPaidBeforeAmend(0);
                            setCart({});
                            const saved = readReceipt(code);
                            if (saved) {
                                setPlaced({
                                    id: saved.id, orderNo: saved.orderNo, token: saved.token,
                                    total: saved.total, payUrl: saved.payUrl ?? null, ref: saved.ref,
                                });
                            }
                        }}
                        className="text-xs underline text-slate-200 flex-shrink-0 pt-0.5"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {tabs.length > 1 && (
                <div className="flex gap-2 px-5 pb-3 overflow-x-auto">
                    {tabs.map((t) => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap border ${
                                (tab || 'Menu') === t
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white border-slate-200 text-slate-700'
                            }`}>
                            {t}
                        </button>
                    ))}
                </div>
            )}

            <div className="px-5 space-y-2">
                {menu.items.filter((i) => (i.tab || 'Menu') === (tab || 'Menu')).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200">
                        <MenuThumb src={item.image_url} label={item.label} />
                        <div className="min-w-0 flex-1">
                            <div className="font-medium">{item.label}</div>
                            {item.size_text && <div className="text-sm text-slate-500">{item.size_text}</div>}
                            <div className="mt-1 font-semibold">{money(item.price)}</div>
                        </div>
                        {menu.accepting && (
                            cart[item.id] ? (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => bump(item.id, -1)}
                                        className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center active:bg-slate-200">
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-8 text-center font-semibold">{cart[item.id]}</span>
                                    <button onClick={() => bump(item.id, 1)}
                                        className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center active:bg-slate-700">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => bump(item.id, 1)}
                                    className="px-4 h-10 rounded-xl bg-slate-900 text-white text-sm font-medium active:bg-slate-700">
                                    Add
                                </button>
                            )
                        )}
                    </div>
                ))}
            </div>

            {menu.accepting && lines.length > 0 && (
                <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-4 space-y-3">
                    {/* Red until it holds ten digits. This is the one field the
                        customer MUST fill — it is where the token goes — and as a
                        grey box among grey boxes it read as optional, so people
                        tapped Pay and wondered why nothing happened. */}
                    <div>
                        <input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            inputMode="numeric"
                            aria-label="Your phone number"
                            aria-invalid={phone.length !== 10}
                            placeholder="Phone number"
                            className={`w-full px-4 py-3 rounded-xl text-base border-2 focus:outline-none transition-colors ${
                                phone.length === 10
                                    ? 'bg-white border-emerald-500 focus:border-emerald-600'
                                    : 'bg-red-50 border-red-400 placeholder:text-red-400 focus:border-red-500'
                            }`}
                        />
                        {phone.length > 0 && phone.length < 10 && (
                            <p className="mt-1 text-xs text-red-600">
                                {10 - phone.length} more {10 - phone.length === 1 ? 'digit' : 'digits'}
                            </p>
                        )}
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button
                        onClick={place}
                        disabled={placing || phone.length !== 10}
                        className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 active:bg-emerald-700 disabled:bg-slate-300"
                    >
                        {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
                        {amending
                            ? (paidBeforeAmend > 0
                                // The difference, not the new total — someone who
                                // has paid 200 and adds a 130 chaat pays 130.
                                ? `Add & pay ${money(Math.max(0, total - paidBeforeAmend))}`
                                : `Update & pay ${money(total)}`)
                            : `Pay ${money(total)}`}
                    </button>
                    <p className={`text-[11px] text-center ${phone.length === 10 ? 'text-slate-500' : 'text-red-600 font-medium'}`}>
                        {phone.length === 10
                            ? 'You\u2019ll pay on the next screen, then collect at the counter.'
                            : 'Enter your number \u2014 your token is sent there.'}
                    </p>
                </div>
            )}
        </div>
    );
}

const Screen = ({ title, body }: { title: string; body: string }) => (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <SwargMark className="mb-6" />
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-xs">{body}</p>
    </div>
);

/**
 * The product photo on a customer's own phone.
 *
 * Small and square, beside the row rather than above it: this is a list to
 * scroll and tap, not a grid to recognise at speed, and a full-width photo per
 * item would turn a 19-item menu into a very long page on a 5-inch screen.
 * Items with no photo get tinted initials so the rows still line up.
 */
function MenuThumb({ src, label }: { src: string | null; label: string }) {
    const url = stallImageUrl(src);
    const [broken, setBroken] = useState(false);
    if (!url || broken) {
        return (
            <div className="w-14 h-14 flex-shrink-0 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center text-sm font-semibold">
                {stallInitials(label)}
            </div>
        );
    }
    return (
        <Image
            src={url}
            alt=""
            width={56}
            height={56}
            unoptimized
            onError={() => setBroken(true)}
            className="w-14 h-14 flex-shrink-0 rounded-xl object-cover bg-slate-100"
        />
    );
}
