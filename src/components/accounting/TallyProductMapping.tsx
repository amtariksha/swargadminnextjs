'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Search, ScanSearch, Save, Hash, Wand2 } from 'lucide-react';
import { GET, POST, PUT } from '@/lib/api';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';
const DATALIST_ID = 'tally-stock-item-options';

interface StockItem { name: string; group: string | null; unit: string | null; hsn: string | null; gst_rate: number | null }

interface MappingRow {
    product_id: number;
    variant_id: number | null;
    title: string;
    size: string | null;
    tally_stock_item: string | null;
    product_stock_item: string | null;
    hsn: string | null;
    gst_rate: number | null;
    in_tally: boolean | null;
    tally: { hsn: string | null; gst_rate: number | null; unit: string | null } | null;
    gst_differs: boolean;
    suggestion: { name: string; score: number } | null;
}

interface MappingResult {
    rows: MappingRow[];
    stock_items: StockItem[] | null;
    tally_company: string | null;
    tally_error: string | null;
    mapped: number;
    total: number;
}

interface Numbering {
    financial_year: string;
    prefix: string;
    number_style: 'fy' | 'plain';
    last_number: number;
    next_invoice_number: string;
}

const rowKey = (r: { product_id: number; variant_id: number | null }) => `${r.product_id}:${r.variant_id ?? ''}`;
const gstText = (hsn: string | null | undefined, rate: number | null | undefined) =>
    hsn || rate != null ? `${hsn || '—'} · ${rate != null ? `${Number(rate)}%` : '—'}` : '—';

/** Continue Tally's own bill series (e.g. PC8-INV) from the last number used there. */
function InvoiceNumbering() {
    const queryClient = useQueryClient();
    const { data } = useQuery({
        queryKey: ['accounting', 'invoice-numbering'],
        queryFn: async () => (await GET<Numbering>('/accounting/invoice-numbering')).data,
    });
    const [draft, setDraft] = useState<{ prefix: string; style: 'fy' | 'plain'; last: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const form = draft ?? {
        prefix: data?.prefix ?? '', style: data?.number_style ?? 'plain', last: data ? String(data.last_number) : '',
    };

    const preview = form.prefix
        ? form.style === 'plain'
            ? `${form.prefix}${Number(form.last || 0) + 1}`
            : `${form.prefix}/${data?.financial_year ?? 'FY'}/${String(Number(form.last || 0) + 1).padStart(5, '0')}`
        : '';

    const save = async () => {
        if (!window.confirm(`The next shop / GST bill will be ${preview}. Numbers are never reused, so this can't be moved back. Continue?`)) return;
        setSaving(true);
        try {
            const res = await PUT<Numbering>('/accounting/invoice-numbering', {
                prefix: form.prefix.trim(), number_style: form.style, last_number: Number(form.last),
            });
            toast.success(res.message || 'Saved');
            setDraft(null);
            queryClient.invalidateQueries({ queryKey: ['accounting', 'invoice-numbering'] });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold">
                <Hash className="w-4 h-4 text-purple-400" /> Bill numbers
            </div>
            <p className="text-sm text-slate-400">
                Shop and GST-customer bills continue Tally&rsquo;s own series. Enter the prefix and the <span className="text-slate-300">last
                number already used in Tally</span>; Swarg carries on from the next one. Retail (home delivery) bills keep their own
                RTL series — they reach Tally only inside the day&rsquo;s retail voucher. Next bill now:{' '}
                <span className="font-mono text-white">{data?.next_invoice_number ?? '…'}</span>
            </p>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-slate-400">Prefix
                    <input value={form.prefix} onChange={(e) => setDraft({ ...form, prefix: e.target.value })}
                        placeholder="PC8-INV" className={`${inputCls} !w-36 mt-1 font-mono`} />
                </label>
                <label className="text-xs text-slate-400">Style
                    <select value={form.style} onChange={(e) => setDraft({ ...form, style: e.target.value as 'fy' | 'plain' })}
                        className={`${inputCls} !w-56 mt-1`}>
                        <option value="plain">PC8-INV1065 (as in Tally)</option>
                        <option value="fy">INV/2026-2027/00001</option>
                    </select>
                </label>
                <label className="text-xs text-slate-400">Last number used
                    <input type="number" min={0} value={form.last} onChange={(e) => setDraft({ ...form, last: e.target.value })}
                        className={`${inputCls} !w-32 mt-1 text-right`} />
                </label>
                <button type="button" onClick={save} disabled={saving || !draft || !form.prefix.trim() || form.last === ''}
                    className="px-4 py-2 text-sm rounded-xl border bg-purple-500/20 text-purple-300 border-purple-500/30 disabled:opacity-40">
                    {saving ? 'Saving…' : preview ? `Next: ${preview}` : 'Save'}
                </button>
            </div>
        </div>
    );
}

/**
 * Map every live product — each size of a sized product — to the Tally stock
 * item it is sold as. "Read Tally" fetches the company's stock items once
 * (read-only): the list, name suggestions and each item's HSN / GST.
 */
export default function TallyProductMapping() {
    const queryClient = useQueryClient();
    const [checked, setChecked] = useState(false);
    const { data, isFetching } = useQuery({
        queryKey: ['accounting', 'tally-product-mapping', checked],
        queryFn: async () => (await GET<MappingResult>('/accounting/tally/product-mapping', checked ? { check: 1 } : {})).data,
    });
    const [edits, setEdits] = useState<Record<string, string>>({});
    const [query, setQuery] = useState('');
    const [unmappedOnly, setUnmappedOnly] = useState(false);
    const [busy, setBusy] = useState<'save' | 'gst' | null>(null);

    const valueOf = (r: MappingRow) => edits[rowKey(r)] ?? r.tally_stock_item ?? '';
    const stockNames = useMemo(() => new Set((data?.stock_items || []).map((s) => s.name.toLowerCase())), [data]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data?.rows || []).filter((r) =>
            (!unmappedOnly || !(r.tally_stock_item || r.product_stock_item))
            && (!q || `${r.title} ${r.size || ''} ${r.tally_stock_item || ''}`.toLowerCase().includes(q)));
    }, [data, query, unmappedOnly]);

    const changed = (data?.rows || []).filter((r) => edits[rowKey(r)] !== undefined && edits[rowKey(r)] !== (r.tally_stock_item ?? ''));
    const gstProducts = [...new Set((data?.rows || []).filter((r) => r.gst_differs).map((r) => r.product_id))];
    const suggestable = (data?.rows || []).filter((r) => r.suggestion && edits[rowKey(r)] === undefined);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-product-mapping'] });

    const save = async () => {
        setBusy('save');
        try {
            const res = await PUT<{ saved: number }>('/accounting/tally/product-mapping', {
                rows: changed.map((r) => ({ product_id: r.product_id, variant_id: r.variant_id, tally_stock_item: edits[rowKey(r)] || null })),
            });
            toast.success(res.message || 'Saved');
            setEdits({});
            refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setBusy(null);
        }
    };

    const applyGst = async () => {
        if (!window.confirm(`Set HSN and GST from Tally on ${gstProducts.length} product(s)? Every bill made from now on uses them.`)) return;
        setBusy('gst');
        try {
            const res = await POST<{ applied: number; skipped: { product_id: number; reason: string }[] }>(
                '/accounting/tally/product-mapping/apply-gst', { product_ids: gstProducts });
            toast.success(res.message || 'Done');
            for (const s of res.data?.skipped || []) toast.warning(`Product #${s.product_id}: ${s.reason}`);
            refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusy(null);
        }
    };

    const acceptSuggestions = () => setEdits((prev) => ({
        ...prev, ...Object.fromEntries(suggestable.map((r) => [rowKey(r), r.suggestion!.name])),
    }));

    return (
        <div className="space-y-4">
            <InvoiceNumbering />

            <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => (checked ? refresh() : setChecked(true))} disabled={isFetching}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border bg-slate-800/50 text-slate-300 border-slate-700/50 disabled:opacity-40">
                        <ScanSearch className="w-4 h-4" /> {isFetching ? 'Reading…' : checked ? 'Read Tally again' : "Read Tally's stock items"}
                    </button>
                    <button type="button" onClick={acceptSuggestions} disabled={!suggestable.length}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border bg-slate-800/50 text-slate-300 border-slate-700/50 disabled:opacity-40">
                        <Wand2 className="w-4 h-4" /> Use {suggestable.length} suggestion{suggestable.length === 1 ? '' : 's'}
                    </button>
                    <button type="button" onClick={save} disabled={busy !== null || !changed.length}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border bg-purple-500/20 text-purple-300 border-purple-500/30 disabled:opacity-40">
                        <Save className="w-4 h-4" /> {busy === 'save' ? 'Saving…' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
                    </button>
                    <button type="button" onClick={applyGst} disabled={busy !== null || !gstProducts.length}
                        className="px-3 py-2 text-sm rounded-xl border bg-amber-500/10 text-amber-300 border-amber-500/30 disabled:opacity-40">
                        {busy === 'gst' ? 'Applying…' : `Use Tally's HSN & GST (${gstProducts.length})`}
                    </button>
                    <span className="text-xs text-slate-400 ml-auto">
                        {data ? `${data.mapped} of ${data.total} mapped` : ''}{data?.tally_company ? ` · ${data.tally_company}` : ''}
                    </span>
                </div>
                {data?.tally_error && <div className="text-sm text-red-400">{data.tally_error}</div>}
                <p className="text-xs text-slate-500">
                    A sized product is mapped per size — each size is its own stock item in Tally. Suggestions are by name and never
                    saved until you press Save. Amber HSN / GST = Swarg differs from Tally; &ldquo;Use Tally&rsquo;s HSN &amp; GST&rdquo; copies Tally&rsquo;s.
                </p>
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter products…" className={`${inputCls} pl-9`} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        <input type="checkbox" checked={unmappedOnly} onChange={(e) => setUnmappedOnly(e.target.checked)} /> Unmapped only
                    </label>
                </div>

                <datalist id={DATALIST_ID}>
                    {(data?.stock_items || []).map((s) => <option key={s.name} value={s.name}>{s.unit || ''}</option>)}
                </datalist>

                <div className="overflow-auto rounded-lg border border-slate-700/50 max-h-[60vh]">
                    <table className="w-full text-sm">
                        <thead className="text-slate-400 bg-slate-800/50 text-xs sticky top-0">
                            <tr>
                                <th className="p-2 text-left">Product</th>
                                <th className="p-2 text-left">Size</th>
                                <th className="p-2 text-left w-[34%]">Tally stock item</th>
                                <th className="p-2 text-left">Swarg HSN · GST</th>
                                <th className="p-2 text-left">Tally HSN · GST</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-300">
                            {rows.map((r) => {
                                const value = valueOf(r);
                                const known = checked && value ? stockNames.has(value.toLowerCase()) : null;
                                return (
                                    <tr key={rowKey(r)} className="border-t border-slate-800 align-top">
                                        <td className="p-2">{r.title}</td>
                                        <td className="p-2 text-slate-400">{r.size || '—'}</td>
                                        <td className="p-2">
                                            <div className="flex items-center gap-2">
                                                <input list={DATALIST_ID} value={value}
                                                    placeholder={r.product_stock_item ? `(product: ${r.product_stock_item})` : 'Not mapped'}
                                                    onChange={(e) => setEdits((prev) => ({ ...prev, [rowKey(r)]: e.target.value }))}
                                                    className={inputCls} aria-label={`Tally stock item for ${r.title} ${r.size || ''}`} />
                                                {known === true && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                                                {known === false && <XCircle className="w-4 h-4 text-red-400 shrink-0" aria-label="Not in Tally" />}
                                            </div>
                                            {!value && r.suggestion && (
                                                <button type="button" onClick={() => setEdits((prev) => ({ ...prev, [rowKey(r)]: r.suggestion!.name }))}
                                                    className="mt-1 text-xs text-purple-300 hover:underline">
                                                    Suggest: {r.suggestion.name} ({Math.round(r.suggestion.score * 100)}%)
                                                </button>
                                            )}
                                        </td>
                                        <td className={`p-2 font-mono text-xs ${r.gst_differs ? 'text-amber-300' : ''}`}>{gstText(r.hsn, r.gst_rate)}</td>
                                        <td className="p-2 font-mono text-xs">{r.tally ? gstText(r.tally.hsn, r.tally.gst_rate) : checked ? '—' : ''}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
