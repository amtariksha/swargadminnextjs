'use client';

// Pre-Packing List — on demand, computes the total quantity to pack per product
// for the next day. It runs the delivery-list generation as a DRY RUN
// (/genrate_order_list { dryRun: true }) and aggregates the deliverable rows by
// product. Nothing is stored — it's a packer-facing preview only.

import { useState } from 'react';
import { format, addDays } from 'date-fns';
import { POST } from '@/lib/api';
import { Package, RefreshCw, Boxes } from 'lucide-react';
import { toast } from 'sonner';

interface PackingItem {
    product_id: number | null;
    product: string;
    qty: number;
}

interface DryRunResult {
    date: string;
    considered: number;
    would_insert: number;
    packingList: PackingItem[];
}

export default function PrePackingListPage() {
    const nextDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DryRunResult | null>(null);

    const runCheck = async () => {
        setLoading(true);
        try {
            const res = await POST<DryRunResult>('/genrate_order_list', { date: nextDate, dryRun: true });
            setResult(res?.data ?? null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to run quantity check');
        } finally {
            setLoading(false);
        }
    };

    const items = result?.packingList ?? [];
    const totalUnits = items.reduce((s, i) => s + (i.qty || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Package className="w-8 h-8 text-purple-400" />
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Pre-Packing List</h1>
                    <p className="text-slate-400 text-sm">
                        Total items to pack for <span className="text-white font-medium">{nextDate}</span>. Dry run — nothing is saved.
                    </p>
                </div>
                <button onClick={runCheck} disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                    {loading ? 'Checking…' : 'Run quantity check'}
                </button>
            </div>

            {!result && !loading && (
                <div className="glass rounded-2xl p-10 text-center text-slate-500">
                    Click <span className="text-slate-300 font-medium">Run quantity check</span> to compute tomorrow&apos;s packing list.
                </div>
            )}

            {result && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="glass rounded-xl p-4">
                            <div className="text-sm text-slate-400 mb-1">Products to pack</div>
                            <div className="text-2xl font-bold text-white">{items.length}</div>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <div className="text-sm text-slate-400 mb-1">Total units</div>
                            <div className="text-2xl font-bold text-white">{totalUnits}</div>
                        </div>
                        <div className="glass rounded-xl p-4">
                            <div className="text-sm text-slate-400 mb-1">Deliveries</div>
                            <div className="text-2xl font-bold text-white">
                                {result.would_insert}
                                <span className="text-sm text-slate-500 ml-1">of {result.considered} considered</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900/60 text-slate-400 uppercase text-xs tracking-wide">
                                <tr>
                                    <th className="px-4 py-2 text-left">Product</th>
                                    <th className="px-4 py-2 text-right">Quantity to pack</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                                {items.length === 0 ? (
                                    <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">Nothing to pack for {nextDate}.</td></tr>
                                ) : items.map((it) => (
                                    <tr key={it.product_id ?? it.product} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-2.5 text-white">{it.product}</td>
                                        <td className="px-4 py-2.5 text-right font-semibold text-purple-300">{it.qty}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-slate-500">
                        Quantities are net of wallet allocation — low-balance orders that would be skipped or
                        partially delivered are already reflected, so this is what will actually go out.
                    </p>
                </>
            )}
        </div>
    );
}
