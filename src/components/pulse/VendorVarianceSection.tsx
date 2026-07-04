'use client';

import { useState } from 'react';
import { usePulseVendorVariance } from '@/hooks/usePulse';
import { formatINR } from '@/lib/accounting';
import { PulseSection, num, dayLabel } from './shared';

const varianceBadge = (pct: number | null) => {
    if (pct == null) return <span className="text-slate-500">—</span>;
    const cls = Math.abs(pct) > 10 ? 'bg-rose-500/15 text-rose-300'
        : Math.abs(pct) > 5 ? 'bg-amber-500/15 text-amber-300'
            : 'bg-slate-700/40 text-slate-300';
    return (
        <span className={`text-xs px-2 py-0.5 rounded-lg ${cls}`}>
            {pct > 0 ? '+' : ''}{pct}%
        </span>
    );
};

export function VendorVarianceSection() {
    const [days, setDays] = useState<30 | 90 | 180>(90);
    const { data, isLoading } = usePulseVendorVariance(days);
    const entries = data?.entries ?? [];

    return (
        <PulseSection
            title="Vendor price variance"
            subtitle="Each purchase compared to the same vendor's own 90-day average, the average across all vendors for that material, and the agreed contract price."
            isLoading={isLoading}
            isEmpty={entries.length === 0}
            emptyText="No inventory purchases in this window — variance appears once bills are recorded."
            actions={
                <div className="flex gap-1">
                    {([30, 90, 180] as const).map((d) => (
                        <button key={d} onClick={() => setDays(d)}
                            className={`px-3 py-1.5 rounded-lg text-xs ${days === d
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
                            {d} days
                        </button>
                    ))}
                </div>
            }
        >
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-800/50 text-slate-400 sticky top-0">
                        <tr>
                            <th className="text-left p-3">Date</th>
                            <th className="text-left p-3">Vendor</th>
                            <th className="text-left p-3">Material</th>
                            <th className="text-right p-3">Price</th>
                            <th className="text-right p-3">Contract</th>
                            <th className="text-right p-3">vs own avg</th>
                            <th className="text-right p-3">vs market</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {entries.map((e) => (
                            <tr key={e.purchase_entry_id} className="hover:bg-slate-800/30">
                                <td className="p-3 text-slate-400 whitespace-nowrap">{dayLabel(e.purchase_date)}</td>
                                <td className="p-3 text-slate-200">{e.vendor_name}</td>
                                <td className="p-3 text-slate-300">{e.material_name}</td>
                                <td className="p-3 text-right text-slate-200">
                                    {formatINR(num(e.unit_price) ?? 0)}<span className="text-slate-500">/{e.material_unit}</span>
                                </td>
                                <td className="p-3 text-right text-slate-400">
                                    {e.contract_price == null ? '—' : formatINR(num(e.contract_price) ?? 0)}
                                </td>
                                <td className="p-3 text-right">{varianceBadge(num(e.vs_vendor_avg_pct))}</td>
                                <td className="p-3 text-right">{varianceBadge(num(e.vs_market_avg_pct))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-slate-500">
                On-time delivery is not shown because promised dates are not recorded anywhere yet.
                Amber = more than ±5% off the vendor&apos;s own average, red = more than ±10%.
            </p>
        </PulseSection>
    );
}
