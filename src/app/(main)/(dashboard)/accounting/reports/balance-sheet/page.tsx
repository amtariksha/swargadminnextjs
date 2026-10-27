'use client';

import { useState } from 'react';
import { useBalanceSheet, type BalanceSheetSide, type BooksSource } from '@/hooks/useAccounting';
import { formatINR, formatDate, fyOptions, currentFy } from '@/lib/accounting';
import { BooksSourceBar, TallySnapshotEmpty, isSnapshotMissing } from '@/components/accounting/BooksSourceBar';

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
    const [source, setSource] = useState<BooksSource>('tally');
    const [fy, setFy] = useState(currentFy());
    const tally = source === 'tally';
    // Tally's balance sheet is per FY (as of its snapshot); Swarg's stays "as on today".
    const { data, isLoading, error } = useBalanceSheet(undefined, source, tally ? fy : undefined);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Balance Sheet</h1>
                    <p className="text-slate-400">As on {data?.as_on ? (tally ? formatDate(data.as_on) : data.as_on) : 'today'}</p>
                </div>
                <div className="flex items-center gap-3">
                    {data && (
                        <span className={`text-xs px-2 py-1 rounded-lg ${data.balanced ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                            {data.balanced ? 'Balanced' : 'Out of balance'}
                        </span>
                    )}
                    {tally && (
                        <select value={fy} onChange={(e) => setFy(e.target.value)}
                            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                            {fyOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <BooksSourceBar source={source} onSourceChange={setSource} snapshot={data?.snapshot} unclassified={data?.unclassified} />

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : tally && isSnapshotMissing(error) ? (
                <TallySnapshotEmpty message={error.message} fy={fy} />
            ) : tally && error ? (
                <div className="glass rounded-2xl p-6 text-rose-300 text-sm">{error.message}</div>
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
