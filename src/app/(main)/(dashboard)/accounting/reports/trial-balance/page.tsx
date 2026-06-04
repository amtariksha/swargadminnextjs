'use client';

import { useState } from 'react';
import { useTrialBalance } from '@/hooks/useAccounting';
import { formatINR, fyOptions, currentFy } from '@/lib/accounting';

export default function TrialBalancePage() {
    const [fy, setFy] = useState(currentFy());
    const { data, isLoading } = useTrialBalance({ fy });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Trial Balance</h1>
                    <p className="text-slate-400">Closing balance per ledger for the period</p>
                </div>
                <div className="flex items-center gap-3">
                    {data && (
                        <span className={`text-xs px-2 py-1 rounded-lg ${data.balanced ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                            {data.balanced ? 'Balanced' : 'Out of balance'}
                        </span>
                    )}
                    <select value={fy} onChange={(e) => setFy(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                        {fyOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : (
                <div className="glass rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="text-left p-3">Ledger</th>
                                <th className="text-left p-3">Group</th>
                                <th className="text-right p-3">Debit</th>
                                <th className="text-right p-3">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {(data?.ledgers || []).map((l) => (
                                <tr key={l.ledgerId} className="hover:bg-slate-800/30">
                                    <td className="p-3 text-slate-200">{l.ledgerName}</td>
                                    <td className="p-3 text-slate-400">{l.groupName}</td>
                                    <td className="p-3 text-right text-slate-300">{l.closingDebit ? formatINR(l.closingDebit) : ''}</td>
                                    <td className="p-3 text-right text-slate-300">{l.closingCredit ? formatINR(l.closingCredit) : ''}</td>
                                </tr>
                            ))}
                            {!data?.ledgers?.length && (
                                <tr><td colSpan={4} className="p-6 text-center text-slate-500">No postings in this period.</td></tr>
                            )}
                        </tbody>
                        <tfoot className="bg-slate-800/50 font-semibold text-white">
                            <tr>
                                <td className="p-3" colSpan={2}>Total</td>
                                <td className="p-3 text-right">{formatINR(data?.totals?.closingDebit)}</td>
                                <td className="p-3 text-right">{formatINR(data?.totals?.closingCredit)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
