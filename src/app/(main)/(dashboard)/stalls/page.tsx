'use client';

/**
 * Stalls & Menus — the office side of the stall POS.
 *
 * Where a stall's price list is built, its passcode is issued and rotated, and
 * its QR poster is printed. The till itself lives outside the dashboard chrome
 * at /pos and is reached by scanning that QR.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
    Store, Plus, KeyRound, QrCode, Pencil, Trash2, Printer, Copy, Loader2, TriangleAlert,
} from 'lucide-react';
import { GET, POST, PUT, DELETE, ApiError } from '@/lib/api';
import { useProducts } from '@/hooks/useData';
import type { StallSummary, StallMenuItem } from '@/lib/stall/types';

const money = (n: number) => `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

/** The URL the QR encodes. The public menu lives on the same host as /pos. */
const publicUrl = (code: string) =>
    typeof window === 'undefined' ? '' : `${window.location.origin}/s/${code}`;
const tillUrl = (code: string) =>
    typeof window === 'undefined' ? '' : `${window.location.origin}/pos?stall=${code}`;

export default function StallsPage() {
    const [stalls, setStalls] = useState<StallSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<StallSummary | null>(null);
    const [creating, setCreating] = useState(false);
    const [issued, setIssued] = useState<{ code: string; passcode: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await GET<StallSummary[]>('/stall/admin/stalls');
            setStalls(res.data || []);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Could not load stalls');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const create = useCallback(async (body: Record<string, unknown>) => {
        try {
            const res = await POST<{ id: number; code: string; passcode: string }>(
                '/stall/admin/stalls', body);
            const d = (res as { data?: { code: string; passcode: string } }).data;
            if (d) setIssued({ code: d.code, passcode: d.passcode });
            setCreating(false);
            await load();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Could not create the stall');
        }
    }, [load]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Store className="w-7 h-7 text-emerald-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Stalls &amp; Menus</h1>
                        <p className="text-slate-400">
                            Counter prices, passcodes and QR posters for market stalls
                        </p>
                    </div>
                </div>
                <button onClick={() => setCreating(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 rounded-xl font-medium hover:bg-emerald-700">
                    <Plus className="w-4 h-4" /> New stall
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><span className="w-8 h-8 spinner" /></div>
            ) : !stalls.length ? (
                <EmptyState onCreate={() => setCreating(true)} />
            ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {stalls.map((s) => (
                        <StallCard key={s.id} stall={s} onOpen={() => setSelected(s)} />
                    ))}
                </div>
            )}

            {creating && <NewStallModal onClose={() => setCreating(false)} onCreate={create} />}
            {issued && <PasscodeModal code={issued.code} passcode={issued.passcode} onClose={() => setIssued(null)} />}
            {selected && (
                <StallDetail
                    stall={selected}
                    onClose={() => { setSelected(null); void load(); }}
                    onPasscode={(p) => setIssued({ code: selected.code, passcode: p })}
                />
            )}
        </div>
    );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="glass rounded-2xl p-10 text-center">
            <Store className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h2 className="font-semibold text-white">No stalls yet</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                A stall holds its own price list — the same gelato can be ₹100 a scoop here and a
                tub price in the catalogue. Create one, add its menu, then print the QR.
            </p>
            <button onClick={onCreate} className="mt-4 px-4 py-2 bg-emerald-600 rounded-xl text-sm font-medium">
                Create the first stall
            </button>
        </div>
    );
}

function StallCard({ stall, onOpen }: { stall: StallSummary; onOpen: () => void }) {
    return (
        <button onClick={onOpen} className="glass rounded-2xl p-4 text-left hover:border-emerald-500/40 border border-transparent transition-colors">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{stall.title}</h3>
                    <p className="text-xs text-slate-400 font-mono">/{stall.code}</p>
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${
                    stall.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/50 text-slate-400'
                }`}>
                    {stall.is_active ? 'Active' : 'Off'}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Tag>{stall.menu_count ?? 0} items</Tag>
                {stall.self_order_enabled && <Tag tone="sky">QR ordering on</Tag>}
                {!stall.has_passcode && <Tag tone="amber">No passcode</Tag>}
                {stall.open_from && stall.open_to && <Tag>{stall.open_from}–{stall.open_to}</Tag>}
            </div>
        </button>
    );
}

const Tag = ({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'sky' | 'amber' }) => (
    <span className={`px-2 py-1 rounded-md ${
        tone === 'sky' ? 'bg-sky-500/15 text-sky-300'
            : tone === 'amber' ? 'bg-amber-500/15 text-amber-300'
                : 'bg-slate-800 text-slate-400'
    }`}>{children}</span>
);

function NewStallModal({ onClose, onCreate }: {
    onClose: () => void; onCreate: (b: Record<string, unknown>) => Promise<void>;
}) {
    const [title, setTitle] = useState('');
    const [code, setCode] = useState('');
    const [selfOrder, setSelfOrder] = useState(false);
    const [busy, setBusy] = useState(false);

    // Suggest a code from the name, but keep it editable — it goes in a URL and
    // on a printed poster, so short and memorable beats auto-generated.
    const suggest = (t: string) =>
        t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16);

    return (
        <Modal title="New stall" onClose={onClose}>
            <Field label="Name">
                <input value={title} autoFocus
                    onChange={(e) => { setTitle(e.target.value); if (!code) setCode(suggest(e.target.value)); }}
                    placeholder="KR Market Sunday" className={inputCls} />
            </Field>
            <Field label="Code" hint="Goes in the QR URL — short and memorable, e.g. kr">
                <input value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="kr" className={`${inputCls} font-mono`} />
            </Field>
            <label className="flex items-start gap-3 py-2 cursor-pointer">
                <input type="checkbox" checked={selfOrder} onChange={(e) => setSelfOrder(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-emerald-500" />
                <span className="text-sm">
                    Let customers order from the QR
                    <span className="block text-xs text-slate-500">
                        A public page anyone who scans can order from. Leave off for a staff-only till.
                    </span>
                </span>
            </label>
            <div className="flex gap-2 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-sm">Cancel</button>
                <button
                    disabled={busy || !title.trim() || code.length < 2}
                    onClick={async () => {
                        setBusy(true);
                        await onCreate({ title, code, self_order_enabled: selfOrder });
                        setBusy(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-sm font-medium disabled:bg-slate-800 disabled:text-slate-600"
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create'}
                </button>
            </div>
        </Modal>
    );
}

/**
 * The passcode is shown ONCE, at creation or rotation — it is bcrypt-hashed
 * server-side and cannot be read back. Say so plainly, or someone will close
 * this and expect to find it later.
 */
function PasscodeModal({ code, passcode, onClose }: { code: string; passcode: string; onClose: () => void }) {
    return (
        <Modal title="Stall passcode" onClose={onClose}>
            <p className="text-sm text-slate-400">
                Give this to the stall staff. It unlocks the till at{' '}
                <span className="font-mono text-slate-300">/pos</span>.
            </p>
            <div className="my-4 py-6 rounded-2xl bg-slate-900 border border-emerald-500/30 text-center">
                <div className="text-4xl font-bold tracking-[0.3em] font-mono">{passcode}</div>
            </div>
            <p className="text-xs text-amber-300 flex items-start gap-1.5">
                <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-px" />
                <span>This is the only time it is shown. It is stored hashed and cannot be read back —
                    you can only issue a new one.</span>
            </p>
            <div className="flex gap-2 pt-4">
                <button
                    onClick={() => { void navigator.clipboard.writeText(passcode); toast.success('Copied'); }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-sm flex items-center justify-center gap-2">
                    <Copy className="w-4 h-4" /> Copy
                </button>
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-sm font-medium">
                    Done
                </button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 text-center font-mono">{tillUrl(code)}</p>
        </Modal>
    );
}

function StallDetail({ stall, onClose, onPasscode }: {
    stall: StallSummary; onClose: () => void; onPasscode: (p: string) => void;
}) {
    const [items, setItems] = useState<StallMenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<StallMenuItem | null>(null);
    const [adding, setAdding] = useState(false);
    const [showQr, setShowQr] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await GET<{ items: StallMenuItem[] }>(`/stall/admin/stalls/${stall.id}/menu`);
            setItems(res.data?.items || []);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Could not load the menu');
        } finally {
            setLoading(false);
        }
    }, [stall.id]);

    useEffect(() => { void load(); }, [load]);

    const rotate = useCallback(async () => {
        if (!confirm('Issue a new passcode? Every till signed in to this stall will be locked out.')) return;
        try {
            const res = await POST<{ passcode: string; sessions_revoked: number }>(
                `/stall/admin/stalls/${stall.id}/passcode`, {});
            const d = (res as { data?: { passcode: string; sessions_revoked: number } }).data;
            if (d) onPasscode(d.passcode);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Could not rotate the passcode');
        }
    }, [stall.id, onPasscode]);

    const remove = useCallback(async (item: StallMenuItem) => {
        try {
            const res = await DELETE<{ delisted: boolean }>(`/stall/admin/stalls/${stall.id}/menu/${item.id}`);
            const delisted = (res as { data?: { delisted?: boolean } })?.data?.delisted;
            toast.success(delisted
                // Sold items are de-listed, not deleted: daytime_order_item
                // references them and the sales history must stay readable.
                ? `${item.label} removed from the menu (past sales keep it)`
                : `${item.label} deleted`);
            await load();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Could not remove the item');
        }
    }, [stall.id, load]);

    const byTab = useMemo(() => {
        const map = new Map<string, StallMenuItem[]>();
        for (const i of items) {
            const t = i.tab || 'Other';
            map.set(t, [...(map.get(t) || []), i]);
        }
        return [...map.entries()];
    }, [items]);

    return (
        <Modal title={stall.title} onClose={onClose} wide>
            <div className="flex flex-wrap gap-2 mb-4">
                <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-lg bg-emerald-600 text-sm flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Add item
                </button>
                <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-lg bg-slate-800 text-sm flex items-center gap-1.5">
                    <QrCode className="w-4 h-4" /> QR poster
                </button>
                <button onClick={rotate} className="px-3 py-2 rounded-lg bg-slate-800 text-sm flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4" /> New passcode
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><span className="w-7 h-7 spinner" /></div>
            ) : !items.length ? (
                <p className="text-sm text-slate-500 py-10 text-center">
                    No items yet. Add the first tile — its price here is the counter price.
                </p>
            ) : (
                <div className="space-y-5">
                    {byTab.map(([tabName, list]) => (
                        <div key={tabName}>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{tabName}</h4>
                            <div className="space-y-1.5">
                                {list.map((item) => (
                                    <div key={item.id}
                                        className={`flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 border ${
                                            item.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-50'
                                        }`}>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-medium truncate">
                                                {item.label}
                                                {item.size_text && <span className="text-slate-400"> · {item.size_text}</span>}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">{item.product_title}</div>
                                            {item.warn_morning_only && (
                                                <div className="text-[11px] text-amber-300 mt-0.5">
                                                    Morning-only product — it won&apos;t appear in the customer app
                                                </div>
                                            )}
                                            {item.warn_variant_archived && (
                                                <div className="text-[11px] text-amber-300 mt-0.5">This variant is archived</div>
                                            )}
                                        </div>
                                        <div className="font-semibold whitespace-nowrap">{money(item.price)}</div>
                                        <button onClick={() => setEditing(item)} className="p-2 rounded-lg bg-slate-800">
                                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                        </button>
                                        <button onClick={() => remove(item)} className="p-2 rounded-lg bg-slate-800">
                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {(adding || editing) && (
                <MenuItemModal
                    stallId={stall.id}
                    item={editing}
                    onClose={() => { setAdding(false); setEditing(null); }}
                    onSaved={async () => { setAdding(false); setEditing(null); await load(); }}
                />
            )}
            {showQr && <QrModal stall={stall} onClose={() => setShowQr(false)} />}
        </Modal>
    );
}

function MenuItemModal({ stallId, item, onClose, onSaved }: {
    stallId: number; item: StallMenuItem | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
    const { data: products = [] } = useProducts();
    const [productId, setProductId] = useState<number | ''>(item?.product_id ?? '');
    const [label, setLabel] = useState(item?.label ?? '');
    const [sizeText, setSizeText] = useState(item?.size_text ?? '');
    const [price, setPrice] = useState(item ? String(item.price) : '');
    const [tab, setTab] = useState(item?.tab ?? '');
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            const body = {
                product_id: productId,
                variant_id: item?.variant_id ?? null,
                label, size_text: sizeText, price: Number(price),
                tab, sort_order: item?.sort_order ?? 0, is_active: true,
            };
            if (item) await PUT(`/stall/admin/stalls/${stallId}/menu/${item.id}`, body);
            else await POST(`/stall/admin/stalls/${stallId}/menu`, body);
            await onSaved();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Could not save the item');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={item ? 'Edit item' : 'Add item'} onClose={onClose}>
            <Field label="Product" hint="The catalogue product this tile sells — for stock and GST">
                <select value={productId} onChange={(e) => setProductId(Number(e.target.value) || '')} className={inputCls}>
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                </select>
            </Field>
            <Field label="Tile label" hint="What the operator taps, e.g. Alphonso Mango">
                <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="Size" hint="e.g. 1 Scoop">
                    <input value={sizeText ?? ''} onChange={(e) => setSizeText(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Counter price" hint="₹ at this stall">
                    <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
                        inputMode="decimal" className={inputCls} />
                </Field>
            </div>
            <Field label="Tab" hint="Groups tiles on the till, e.g. Gelato">
                <input value={tab ?? ''} onChange={(e) => setTab(e.target.value)} className={inputCls} />
            </Field>
            <div className="flex gap-2 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-sm">Cancel</button>
                <button onClick={save} disabled={busy || !productId || !label.trim() || price === ''}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-sm font-medium disabled:bg-slate-800 disabled:text-slate-600">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
                </button>
            </div>
        </Modal>
    );
}

function QrModal({ stall, onClose }: { stall: StallSummary; onClose: () => void }) {
    const url = stall.self_order_enabled ? publicUrl(stall.code) : tillUrl(stall.code);
    return (
        <Modal title="QR poster" onClose={onClose}>
            <div id="stall-qr-print" className="bg-white text-slate-900 rounded-2xl p-8 text-center">
                <h2 className="text-2xl font-bold">{stall.title}</h2>
                <p className="text-sm text-slate-600 mt-1">
                    {stall.self_order_enabled ? 'Scan to see the menu and order' : 'Staff till'}
                </p>
                <div className="flex justify-center my-6">
                    <QRCodeSVG value={url} size={220} level="M" />
                </div>
                <p className="font-mono text-xs text-slate-500 break-all">{url}</p>
            </div>
            <div className="flex gap-2 pt-4">
                <button onClick={() => { void navigator.clipboard.writeText(url); toast.success('Link copied'); }}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-sm flex items-center justify-center gap-2">
                    <Copy className="w-4 h-4" /> Copy link
                </button>
                <button onClick={() => window.print()}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-sm font-medium flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> Print
                </button>
            </div>
        </Modal>
    );
}

/* ── small shared pieces ─────────────────────────────────────────────── */

const inputCls = 'w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm focus:outline-none focus:border-emerald-500';

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div className="mb-3">
        <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
        {children}
        {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
);

/**
 * A modal, rendered through a PORTAL to document.body.
 *
 * The portal is load-bearing, not tidiness. `.glass` sets
 * `backdrop-filter: blur(12px)` and this overlay adds `backdrop-blur-sm` — and
 * a backdrop-filter makes an element a CONTAINING BLOCK for any
 * `position: fixed` descendant. So a modal opened from inside another modal
 * (Add item / QR poster, both children of the stall detail) resolved its
 * `fixed inset-0` against the stall panel rather than the viewport, and was
 * then clipped by that panel's `max-h-[90vh] overflow-y-auto` — the form
 * appeared as a cropped strip with its top and bottom cut off.
 *
 * Portalling to document.body puts every modal outside any blurred ancestor, so
 * nesting works and each one fills the viewport.
 *
 * `mounted` guards SSR: document does not exist during the server render, and
 * rendering null on the first client pass keeps hydration consistent.
 */
function Modal({ title, onClose, children, wide }: {
    title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Escape closes the topmost modal — expected of a dialog, and the only way
    // out on a keyboard once two are stacked.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    if (!mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={onClose}>
            <div
                className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto glass rounded-2xl p-5`}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <h3 className="text-lg font-semibold mb-4">{title}</h3>
                {children}
            </div>
        </div>,
        document.body,
    );
}
