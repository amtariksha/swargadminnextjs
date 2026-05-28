'use client';

/**
 * Bulk cost-price update (Phase J — procurement integration shim).
 *
 *   /inventory/cost-prices
 *
 * Two-pane page for operators / procurement to set cost_price on
 * products and/or variants in batch. Drives the existing
 * PATCH /api/cost-prices endpoint shipped with the Phase-A variations
 * work.
 *
 * Two input modes:
 *   1. Paste/CSV — header `product_id,variant_id,cost_price` (one of
 *      product_id or variant_id per row); operator pastes a sheet of
 *      lines and hits Apply.
 *   2. Manual list — pick a product, optionally pick a variant, type
 *      the cost_price, add to the batch, repeat.
 *
 * The endpoint is idempotent (last-write-wins) so re-importing a
 * procurement run safely overwrites stale cost values.
 */

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Upload, Calculator, AlertCircle } from 'lucide-react';
import { useProducts } from '@/hooks/useData';
import apiClient, { ApiError } from '@/lib/api';

interface CostRow {
    product_id: number | null;
    variant_id: number | null;
    cost_price: number | null;
}

interface BackendResult {
    products_updated: number;
    variants_updated: number;
    items_skipped: number;
    errors: Array<{ item: unknown; error: string }>;
}

export default function CostPricesPage() {
    const { data: products = [] } = useProducts();

    const [pasteText, setPasteText] = useState('');
    const [parsed, setParsed] = useState<CostRow[]>([]);
    const [parseError, setParseError] = useState<string | null>(null);
    const [result, setResult] = useState<BackendResult | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Manual single-row entry.
    const [manualProductId, setManualProductId] = useState('');
    const [manualVariantId, setManualVariantId] = useState('');
    const [manualCost, setManualCost] = useState('');

    const validCount = useMemo(
        () => parsed.filter((r) => r.cost_price != null && (r.product_id != null || r.variant_id != null)).length,
        [parsed],
    );

    const parsePaste = () => {
        setResult(null);
        setParseError(null);
        if (!pasteText.trim()) {
            setParsed([]);
            return;
        }
        const lines = pasteText.split(/\r?\n/);
        const rows: CostRow[] = [];
        const errors: string[] = [];
        let headerSkipped = false;

        for (let i = 0; i < lines.length; i += 1) {
            const raw = lines[i].trim();
            if (!raw) continue;
            // Skip a header line if present.
            if (!headerSkipped && /^(product_id|variant_id|cost_price)/i.test(raw)) {
                headerSkipped = true;
                continue;
            }
            const cells = raw.split(',').map((c) => c.trim());
            if (cells.length < 3) {
                errors.push(`Line ${i + 1}: expected 3 columns (product_id, variant_id, cost_price), got ${cells.length}`);
                continue;
            }
            const pid = cells[0] ? parseInt(cells[0], 10) : NaN;
            const vid = cells[1] ? parseInt(cells[1], 10) : NaN;
            const cost = cells[2] ? parseFloat(cells[2]) : NaN;
            const row: CostRow = {
                product_id: Number.isFinite(pid) ? pid : null,
                variant_id: Number.isFinite(vid) ? vid : null,
                cost_price: Number.isFinite(cost) ? cost : null,
            };
            if (row.product_id == null && row.variant_id == null) {
                errors.push(`Line ${i + 1}: needs at least product_id or variant_id`);
                continue;
            }
            if (row.cost_price == null) {
                errors.push(`Line ${i + 1}: cost_price is not numeric`);
                continue;
            }
            rows.push(row);
        }

        setParsed(rows);
        setParseError(errors.length > 0 ? errors.slice(0, 5).join(' · ') : null);
    };

    const addManual = () => {
        const pid = manualProductId ? parseInt(manualProductId, 10) : null;
        const vid = manualVariantId ? parseInt(manualVariantId, 10) : null;
        const cost = manualCost ? parseFloat(manualCost) : null;
        if ((!pid && !vid) || cost == null || !Number.isFinite(cost)) {
            toast.error('Enter product_id (or variant_id) AND a numeric cost_price');
            return;
        }
        setParsed((prev) => [
            ...prev,
            { product_id: pid, variant_id: vid, cost_price: cost },
        ]);
        setManualCost('');
        setManualVariantId('');
    };

    const removeRow = (idx: number) => {
        setParsed((prev) => prev.filter((_, i) => i !== idx));
    };

    const submit = async () => {
        if (parsed.length === 0) {
            toast.error('No rows to apply');
            return;
        }
        setSubmitting(true);
        setResult(null);
        try {
            const res = await apiClient.patch<{ data: BackendResult }>(
                '/cost-prices',
                { items: parsed },
            );
            const data = res.data?.data || (res.data as unknown as BackendResult);
            setResult(data);
            const { products_updated = 0, variants_updated = 0, items_skipped = 0 } = data;
            toast.success(
                `Updated ${products_updated} product · ${variants_updated} variant · skipped ${items_skipped}`,
            );
            if (items_skipped === 0) setParsed([]);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Apply failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-purple-400" />
                    Bulk cost-price update
                </h1>
                <p className="text-slate-400 text-sm">
                    Procurement / margin-report shim. Updates <code>product.cost_price</code> or
                    <code className="ml-1">variant.cost_price</code> in batch via
                    <code className="mx-1">PATCH /api/cost-prices</code>. Idempotent — last write wins.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Paste / CSV mode */}
                <section className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Upload className="w-4 h-4 text-purple-400" /> Paste rows
                    </h2>
                    <p className="text-xs text-slate-500">
                        One row per line. Header optional. Columns:
                        <code className="ml-1">product_id,variant_id,cost_price</code>.
                        Leave one of product_id / variant_id blank.
                    </p>
                    <textarea rows={8} value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder={'product_id,variant_id,cost_price\n42,,80\n,135,38.50\n,136,42'}
                        className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-purple-500/50" />
                    <button onClick={parsePaste}
                        className="px-4 py-2 bg-slate-800/70 border border-slate-700/50 text-slate-200 rounded-lg text-sm hover:border-purple-500/50">
                        Parse
                    </button>
                    {parseError && (
                        <div className="flex items-start gap-2 text-xs text-amber-300">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>{parseError}</span>
                        </div>
                    )}
                </section>

                {/* Manual add */}
                <section className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Plus className="w-4 h-4 text-purple-400" /> Add manually
                    </h2>
                    <p className="text-xs text-slate-500">
                        Pick a product (or type a variant_id directly), enter the cost, hit Add.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-1">Product</label>
                            <select value={manualProductId}
                                onChange={(e) => setManualProductId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white">
                                <option value="">— pick a product —</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>{p.title} (#{p.id})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Variant ID (optional)</label>
                            <input value={manualVariantId} type="number" min={1}
                                onChange={(e) => setManualVariantId(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">Cost (₹)</label>
                            <input value={manualCost} type="number" step="0.01" min={0}
                                onChange={(e) => setManualCost(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white" />
                        </div>
                    </div>
                    <button onClick={addManual}
                        className="px-4 py-2 bg-slate-800/70 border border-slate-700/50 text-slate-200 rounded-lg text-sm hover:border-purple-500/50">
                        Add to batch
                    </button>
                </section>
            </div>

            {/* Staged batch */}
            <section className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-semibold text-white">Staged batch</h2>
                        <p className="text-xs text-slate-500">{validCount} row{validCount === 1 ? '' : 's'} ready to apply (max 500).</p>
                    </div>
                    <button onClick={submit} disabled={submitting || parsed.length === 0}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                        {submitting ? 'Applying…' : `Apply ${validCount}`}
                    </button>
                </div>

                {parsed.length === 0 ? (
                    <p className="text-slate-500 text-sm italic">Nothing staged yet.</p>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="text-xs uppercase text-slate-500 border-b border-slate-800/50">
                                <th className="px-3 py-2 text-left font-medium">Product</th>
                                <th className="px-3 py-2 text-left font-medium">Variant</th>
                                <th className="px-3 py-2 text-left font-medium">Cost (₹)</th>
                                <th className="px-3 py-2 w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsed.map((r, idx) => (
                                <tr key={idx} className="border-b border-slate-800/30">
                                    <td className="px-3 py-2 text-sm text-slate-300">
                                        {r.product_id != null ? `#${r.product_id}` : <span className="text-slate-600">—</span>}
                                        {r.product_id != null && products.find((p) => p.id === r.product_id) && (
                                            <span className="text-slate-500 text-xs ml-2">
                                                {products.find((p) => p.id === r.product_id)?.title}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-slate-300">
                                        {r.variant_id != null ? `#${r.variant_id}` : <span className="text-slate-600">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-slate-300">
                                        ₹ {r.cost_price?.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <button onClick={() => removeRow(idx)} className="p-1.5 hover:bg-red-500/20 rounded">
                                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {result && (
                <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <h3 className="text-sm font-semibold text-emerald-300 mb-2">Result</h3>
                    <p className="text-sm text-slate-300">
                        <strong className="text-white">{result.products_updated}</strong> product cost prices updated ·
                        <strong className="text-white ml-1">{result.variants_updated}</strong> variant cost prices updated ·
                        <strong className="text-amber-300 ml-1">{result.items_skipped}</strong> skipped
                    </p>
                    {result.errors && result.errors.length > 0 && (
                        <details className="mt-2">
                            <summary className="text-xs text-amber-300 cursor-pointer">{result.errors.length} error(s)</summary>
                            <ul className="mt-1 text-xs text-slate-400 list-disc pl-5">
                                {result.errors.slice(0, 20).map((e, i) => (
                                    <li key={i}>{e.error}: {JSON.stringify(e.item)}</li>
                                ))}
                            </ul>
                        </details>
                    )}
                </section>
            )}
        </div>
    );
}
