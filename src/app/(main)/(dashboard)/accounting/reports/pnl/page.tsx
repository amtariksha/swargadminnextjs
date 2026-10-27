'use client';

import { useState } from 'react';
import { usePnl, type BalanceSheetSide, type BooksSource } from '@/hooks/useAccounting';
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
                        <span className="text-emerald-300 italic">{extra.label}</span>
                        <span className="text-emerald-300">{formatINR(extra.amount)}</span>
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

export default function ProfitAndLossPage() {
    const [fy, setFy] = useState(currentFy());
    const [source, setSource] = useState<BooksSource>('tally');
    const { data, isLoading, error } = usePnl({ fy, source });
    const tally = source === 'tally';
    const profit = (data?.netProfit ?? 0) >= 0;
    const range = data ? (tally ? `${formatDate(data.from)} → ${formatDate(data.to)} (Tally, FY to date)` : `${data.from} → ${data.to}`) : 'Current financial year';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Profit &amp; Loss</h1>
                    <p className="text-slate-400">{range}</p>
                </div>
                <select value={fy} onChange={(e) => setFy(e.target.value)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    {fyOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>

            <BooksSourceBar source={source} onSourceChange={setSource} snapshot={data?.snapshot} unclassified={data?.unclassified} />

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : tally && isSnapshotMissing(error) ? (
                <TallySnapshotEmpty message={error.message} fy={fy} />
            ) : tally && error ? (
                <div className="glass rounded-2xl p-6 text-rose-300 text-sm">{error.message}</div>
            ) : data ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Side
                            title="Expenses"
                            rows={data.expense}
                            extra={profit ? { label: 'Net Profit', amount: data.netProfit } : undefined}
                            total={profit ? data.totalIncome : data.totalExpense}
                        />
                        <Side
                            title="Income"
                            rows={data.income}
                            extra={!profit ? { label: 'Net Loss', amount: -data.netProfit } : undefined}
                            total={!profit ? data.totalExpense : data.totalIncome}
                        />
                    </div>
                    <div className="glass rounded-2xl p-4 flex items-center justify-between">
                        <span className="text-slate-300">Net {profit ? 'Profit' : 'Loss'}</span>
                        <span className={`text-lg font-bold ${profit ? 'text-emerald-300' : 'text-rose-300'}`}>{formatINR(Math.abs(data.netProfit))}</span>
                    </div>
                </>
            ) : null}
        </div>
    );
}
