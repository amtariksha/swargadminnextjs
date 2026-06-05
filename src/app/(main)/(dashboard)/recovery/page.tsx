'use client';

// Recovery report — orders that ever debited ₹0 at delivery (the order_amount=0
// bug). Shortfall = (units delivered × agreed price) − (rupees actually
// debited). "Recover" posts a wallet debit for the outstanding shortfall
// (server-computed, idempotent). Backend: GET /get_report/recovery,
// POST /recovery/charge.

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { IndianRupee, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { useRecoveryReport, useRecoveryCharge, type RecoveryRow } from '@/hooks/useData';

type Filter = 'owed' | 'active' | 'recoverable' | 'recovered';

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function RecoveryPage() {
    const { data, isLoading, isFetching, refetch } = useRecoveryReport();
    const chargeMutation = useRecoveryCharge();
    const [filter, setFilter] = useState<Filter>('owed');
    const [search, setSearch] = useState('');
    const [pendingId, setPendingId] = useState<number | null>(null);

    const rows = data?.rows ?? [];
    const summary = data?.summary;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            const isOwed = r.shortfall > 0.5;
            if (filter === 'recovered') { if (r.recovered <= 0.5) return false; }
            else if (!isOwed) return false;
            if (filter === 'active' && r.order_status !== 1) return false;
            if (filter === 'recoverable' && (r.order_status !== 1 || r.current_wallet < r.shortfall)) return false;
            if (q && !(`${r.name ?? ''}`.toLowerCase().includes(q) || `${r.phone ?? ''}`.includes(q) || `${r.order_id}`.includes(q))) return false;
            return true;
        });
    }, [rows, filter, search]);

    const handleRecover = async (r: RecoveryRow) => {
        const goesNegative = r.current_wallet < r.shortfall;
        const msg = `Debit ${inr(r.shortfall)} from ${r.name || 'customer'} (wallet ${inr(r.current_wallet)})`
            + (goesNegative ? ` — wallet will go NEGATIVE to ${inr(r.current_wallet - r.shortfall)}.` : '.')
            + `\n\nPost recovery debit for order #${r.order_id}?`;
        if (!window.confirm(msg)) return;
        setPendingId(r.order_id);
        try {
            await chargeMutation.mutateAsync(r.order_id);
            toast.success(`Recovered ${inr(r.shortfall)} from ${r.name || 'customer'}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to post recovery');
        } finally {
            setPendingId(null);
        }
    };

    const exportCsv = () => {
        const headers = ['order_id', 'name', 'phone', 'product', 'status', 'units_delivered',
            'unit_price', 'should_have_billed', 'actually_debited', 'recovered', 'shortfall', 'current_wallet'];
        const lines = filtered.map((r) => [
            r.order_id, JSON.stringify(r.name ?? ''), r.phone ?? '', JSON.stringify(r.product ?? ''),
            r.order_status === 1 ? 'active' : 'inactive', r.units_delivered, r.unit_price,
            r.should_have_billed, r.actually_debited, r.recovered, r.shortfall, r.current_wallet,
        ].join(','));
        const csv = [headers.join(','), ...lines].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url; a.download = `recovery-report.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const FILTERS: { key: Filter; label: string }[] = [
        { key: 'owed', label: 'All owed' },
        { key: 'active', label: 'Active orders' },
        { key: 'recoverable', label: 'Recoverable now (wallet covers)' },
        { key: 'recovered', label: 'Already recovered' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Recovery</h1>
                    <p className="text-slate-400 text-sm">
                        Orders under-billed by the ₹0-debit bug. Shortfall = units delivered × agreed price − amount actually charged.
                    </p>
                </div>
                <button onClick={exportCsv} disabled={!filtered.length}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 disabled:opacity-50">
                    <Download className="w-4 h-4" /> CSV
                </button>
                <button onClick={() => refetch()} disabled={isFetching}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="glass rounded-xl p-4">
                        <div className="flex items-center gap-2 text-amber-300 text-sm mb-1"><IndianRupee className="w-4 h-4" /> Total recoverable</div>
                        <div className="text-2xl font-bold text-white">{inr(summary.total_shortfall)}</div>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <div className="text-sm text-slate-400 mb-1">Owed orders</div>
                        <div className="text-2xl font-bold text-white">{summary.owed_orders}<span className="text-sm text-slate-500 ml-1">/ {summary.owed_customers} customers</span></div>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <div className="text-sm text-slate-400 mb-1">Active (still subscribed)</div>
                        <div className="text-2xl font-bold text-emerald-400">{summary.active_owed_orders}</div>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <div className="text-sm text-slate-400 mb-1">Already recovered</div>
                        <div className="text-2xl font-bold text-white">{inr(summary.total_recovered)}</div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm border ${filter === f.key
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                            : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-white'}`}>
                        {f.label}
                    </button>
                ))}
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / phone / order…"
                    className="ml-auto px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm w-64 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
            </div>

            <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-3 py-2 text-left">Customer</th>
                                <th className="px-3 py-2 text-left">Product</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-right">Units</th>
                                <th className="px-3 py-2 text-right">Should bill</th>
                                <th className="px-3 py-2 text-right">Charged</th>
                                <th className="px-3 py-2 text-right">Shortfall</th>
                                <th className="px-3 py-2 text-right">Wallet</th>
                                <th className="px-3 py-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isLoading ? (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No orders match this filter.</td></tr>
                            ) : (
                                filtered.map((r) => {
                                    const goesNegative = r.current_wallet < r.shortfall;
                                    return (
                                        <tr key={r.order_id} className="hover:bg-slate-800/30">
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-white">{r.name || `#${r.user_id}`}</div>
                                                <div className="text-xs text-slate-500">{r.phone} · order #{r.order_id}</div>
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-300">{r.product || '—'}</td>
                                            <td className="px-3 py-2.5">
                                                <span className={`text-xs ${r.order_status === 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {r.order_status === 1 ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right text-slate-300">{r.units_delivered}</td>
                                            <td className="px-3 py-2.5 text-right text-slate-300">{inr(r.should_have_billed)}</td>
                                            <td className="px-3 py-2.5 text-right text-slate-400">{inr(r.actually_debited)}</td>
                                            <td className="px-3 py-2.5 text-right font-semibold text-amber-300">{inr(r.shortfall)}</td>
                                            <td className={`px-3 py-2.5 text-right ${goesNegative ? 'text-red-400' : 'text-slate-300'}`}>{inr(r.current_wallet)}</td>
                                            <td className="px-3 py-2.5 text-right">
                                                {r.shortfall > 0.5 ? (
                                                    <button
                                                        onClick={() => handleRecover(r)}
                                                        disabled={pendingId === r.order_id || chargeMutation.isPending}
                                                        title={goesNegative ? 'Wallet will go negative' : 'Post recovery debit'}
                                                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${goesNegative
                                                            ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                                                            : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>
                                                        {goesNegative && <AlertTriangle className="w-3.5 h-3.5" />}
                                                        {pendingId === r.order_id ? 'Posting…' : `Recover ${inr(r.shortfall)}`}
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-emerald-400">Recovered</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-800/40 text-xs text-slate-500">
                    {filtered.length} order{filtered.length === 1 ? '' : 's'} shown.
                    &quot;Recover&quot; posts a wallet debit for the shortfall (idempotent — re-running does nothing once recovered).
                    A red wallet means the debit takes them negative (they owe us).
                </div>
            </div>
        </div>
    );
}
