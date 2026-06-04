'use client';

import { useBalanceSheet, type BalanceSheetSide } from '@/hooks/useAccounting';
import { formatINR } from '@/lib/accounting';

function Side({ title, rows, extra, total }: { title: string; rows: BalanceSheetSide[]; extra?: { label: string; amount: number }; total: number }) {
    return (
        <div className="glass rounded-2xl overflow-hidden">
            <div className="bg-slate-800/50 px-4 py-2 text-sm font-semibold text-white">{title}</div>
            <div className="divide-y divide-slate-700/40">
                {rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="text-slate-200">{r.ledgerName}<span className="ml-2 text-xs text-slate-500">{r.groupName}</span></span>
                        <span className="text-slate-300">{formatINR(r.amount)}</span>
                    </div>
                ))}
                {extra && (
                    <div className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="text-slate-200 italic">{extra.label}</span>
                        <span className="text-slate-300">{formatINR(extra.amount)}</span>
                    </div>
                )}
                {!rows.length && !extra && <div className="px-4 py-3 text-xs text-slate-500">Nothing here.</div>}
            </div>
            <div className="bg-slate-800/50 px-4 py-2 flex items-center justify-between text-sm font-semibold text-white">
                <span>Total</span><span>{formatINR(total)}</span>
            </div>
        </div>
    );
}

export default function BalanceSheetPage() {
    const { data, isLoading } = useBalanceSheet();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Balance Sheet</h1>
                    <p className="text-slate-400">As on {data?.as_on || 'today'}</p>
                </div>
                {data && (
                    <span className={`text-xs px-2 py-1 rounded-lg ${data.balanced ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                        {data.balanced ? 'Balanced' : 'Out of balance'}
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : data ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Side
                        title="Liabilities & Equity"
                        rows={[...data.liabilities, ...data.equity]}
                        extra={{ label: 'Profit & Loss A/c (net profit)', amount: data.netProfit }}
                        total={data.liabilitiesSide}
                    />
                    <Side title="Assets" rows={data.assets} total={data.totalAssets} />
                </div>
            ) : null}
        </div>
    );
}
