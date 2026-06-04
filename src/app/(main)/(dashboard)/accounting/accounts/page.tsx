'use client';

import { useChartOfAccounts } from '@/hooks/useAccounting';
import { formatINR, NATURE_LABELS } from '@/lib/accounting';

const NATURE_BADGE: Record<number, string> = {
    1: 'bg-emerald-500/15 text-emerald-300',
    2: 'bg-amber-500/15 text-amber-300',
    3: 'bg-sky-500/15 text-sky-300',
    4: 'bg-rose-500/15 text-rose-300',
    5: 'bg-violet-500/15 text-violet-300',
};

export default function ChartOfAccountsPage() {
    const { data, isLoading } = useChartOfAccounts();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Chart of Accounts</h1>
                    <p className="text-slate-400">Account groups &amp; ledgers with live balances</p>
                </div>
                {data && (
                    <div className="text-right">
                        <div className="text-sm text-slate-400">Total Debit / Credit</div>
                        <div className="text-lg font-bold text-white">
                            {formatINR(data.total_debit)} <span className="text-slate-500">/</span> {formatINR(data.total_credit)}
                        </div>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : (data?.groups?.length ? (
                <div className="space-y-4">
                    {data.groups.map((g) => (
                        <div key={g.group_id} className="glass rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-semibold">{g.group_name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-lg ${NATURE_BADGE[g.nature] || 'bg-slate-700/50 text-slate-300'}`}>
                                        {NATURE_LABELS[g.nature] || '—'}
                                    </span>
                                </div>
                                <span className="text-sm font-semibold text-white">
                                    {formatINR(g.subtotal)} <span className="text-slate-500">{g.subtotal_type}</span>
                                </span>
                            </div>
                            <div className="divide-y divide-slate-700/40">
                                {g.ledgers.map((l) => (
                                    <div key={l.id} className="flex items-center justify-between py-1.5 text-sm">
                                        <span className="text-slate-200">
                                            {l.name}
                                            {l.code && <span className="ml-2 text-xs text-slate-500">{l.code}</span>}
                                        </span>
                                        <span className="text-slate-300">
                                            {formatINR(l.balance)} <span className="text-slate-500">{l.balance_type}</span>
                                        </span>
                                    </div>
                                ))}
                                {g.ledgers.length === 0 && <div className="py-1.5 text-xs text-slate-500">No ledgers</div>}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="glass rounded-2xl p-8 text-center text-slate-400">
                    No accounts yet. Issue an invoice or post a voucher to populate the ledger.
                </div>
            ))}
        </div>
    );
}
