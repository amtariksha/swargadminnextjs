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
import { Plus, Minus, ShoppingBag, Check, Loader2, Clock } from 'lucide-react';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'https://node.desicowmilk.com').replace(/\/$/, '');
const TENANT = process.env.NEXT_PUBLIC_TENANT_CODE || 'swarg';
const api = (path: string) => `${API_BASE}/api/${TENANT}${path}`;
const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

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

export default function PublicStallPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const [menu, setMenu] = useState<PublicMenu | null>(null);
    const [failed, setFailed] = useState(false);
    const [tab, setTab] = useState('');
    const [cart, setCart] = useState<Record<number, number>>({});
    const [phone, setPhone] = useState('');
    const [placing, setPlacing] = useState(false);
    const [placed, setPlaced] = useState<{ token: number | null; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // One key per attempt, kept across retries so a flaky connection cannot
    // produce two orders for one customer.
    const clientRef = useRef<string>('');

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

    const place = useCallback(async () => {
        if (!lines.length || placing) return;
        setPlacing(true);
        setError(null);
        if (!clientRef.current) {
            clientRef.current = (crypto?.randomUUID?.() ?? `pub-${Date.now()}-${Math.random()}`);
        }
        try {
            const res = await fetch(api(`/stall/public/${encodeURIComponent(code)}/orders`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: lines.map((l) => ({ stall_menu_item_id: l.item.id, qty: l.qty })),
                    customer_phone: phone || undefined,
                    client_ref: clientRef.current,
                }),
            });
            const body = await res.json();
            if (body?.status === false || (body?.response && body.response !== 200)) {
                throw new Error(body?.message || 'Could not place the order');
            }
            setPlaced({ token: body?.data?.token ?? null, total: body?.data?.total ?? total });
            setCart({});
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
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
                    <Check className="w-8 h-8 text-emerald-600" />
                </div>
                <p className="text-slate-600">Your token</p>
                <div className="text-7xl font-bold tabular-nums my-2">{placed.token ?? '—'}</div>
                <p className="text-lg font-semibold">{money(placed.total)}</p>
                <p className="mt-4 text-sm text-slate-600 max-w-xs">
                    Show this at the counter to pay and collect. We&apos;ll call your number.
                </p>
                <button onClick={() => { setPlaced(null); clientRef.current = ''; }}
                    className="mt-8 px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-medium">
                    Order something else
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col pb-40">
            <header className="px-5 pt-6 pb-3">
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
                    <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        inputMode="numeric"
                        placeholder="Phone number (optional)"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:border-slate-900"
                    />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button
                        onClick={place}
                        disabled={placing}
                        className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 active:bg-emerald-700 disabled:bg-slate-300"
                    >
                        {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
                        Place order · {money(total)}
                    </button>
                    <p className="text-[11px] text-slate-500 text-center">
                        Pay at the counter when you collect.
                    </p>
                </div>
            )}
        </div>
    );
}

const Screen = ({ title, body }: { title: string; body: string }) => (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-xs">{body}</p>
    </div>
);
