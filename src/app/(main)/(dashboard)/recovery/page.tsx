'use client';

// Recovery report — money owed back to us, two kinds:
//   under_billed     — delivered but charged ₹0 (the order_amount=0 bug)
//   duplicate_credit — one Razorpay payment credited 2×+ (double recharge)
// "Recover" posts a wallet debit for the outstanding amount (server-computed,
// idempotent). Backend: GET /get_report/recovery, POST /recovery/charge.

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { IndianRupee, RefreshCw, Download, AlertTriangle, Receipt } from 'lucide-react';
import { useRecoveryReport, useRecoveryCharge, useRecoveryResolve, type RecoveryRow } from '@/hooks/useData';

type Filter = 'owed' | 'under_billed' | 'duplicate' | 'active' | 'recoverable' | 'recovered' | 'resolved';

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const rowKey = (r: RecoveryRow) => `${r.kind}:${r.order_id ?? r.payment_id}`;

export default function RecoveryPage() {
    const { data, isLoading, isFetching, refetch } = useRecoveryReport();
    const chargeMutation = useRecoveryCharge();
    const resolveMutation = useRecoveryResolve();
    const [filter, setFilter] = useState<Filter>('owed');
    const [search, setSearch] = useState('');
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    const rows = data?.rows ?? [];
    const summary = data?.summary;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            // Resolved ("already recovered") rows are no longer owed — they only
            // surface under the dedicated 'resolved' filter.
            const isOwed = r.recoverable > 0.5 && !r.resolved;
            if (filter === 'resolved') { if (!r.resolved) return false; }
            else if (filter === 'recovered') { if (r.recovered <= 0.5) return false; }
            else if (!isOwed) return false;
            if (filter === 'under_billed' && r.kind !== 'under_billed') return false;
            if (filter === 'duplicate' && r.kind !== 'duplicate_credit') return false;
            if (filter === 'active' && r.order_status !== 1) return false;
            if (filter === 'recoverable' && r.current_wallet < r.recoverable) return false;
            if (q && !(`${r.name ?? ''}`.toLowerCase().includes(q)
                || `${r.phone ?? ''}`.includes(q)
                || `${r.order_id ?? ''}`.includes(q)
                || `${r.payment_id ?? ''}`.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [rows, filter, search]);

    const handleRecover = async (r: RecoveryRow) => {
        const goesNegative = r.current_wallet < r.recoverable;
        const what = r.kind === 'duplicate_credit'
            ? `the duplicate recharge on ${r.payment_id}`
            : `the under-billed deliveries on order #${r.order_id}`;
        const msg = `Debit ${inr(r.recoverable)} from ${r.name || 'customer'} (wallet ${inr(r.current_wallet)}) for ${what}.`
            + (goesNegative ? `\n\n⚠ Wallet will go NEGATIVE to ${inr(r.current_wallet - r.recoverable)}.` : '')
            + `\n\nProceed?`;
        if (!window.confirm(msg)) return;
        setPendingKey(rowKey(r));
        try {
            await chargeMutation.mutateAsync(
                r.kind === 'duplicate_credit' ? { payment_id: r.payment_id ?? undefined } : { order_id: r.order_id ?? undefined },
            );
            toast.success(`Recovered ${inr(r.recoverable)} from ${r.name || 'customer'}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to post recovery');
        } finally {
            setPendingKey(null);
        }
    };

    const refOf = (r: RecoveryRow) =>
        r.kind === 'duplicate_credit'
            ? { payment_id: r.payment_id ?? undefined }
            : { order_id: r.order_id ?? undefined };

    // Mark a row "already recovered" — removes it from owed WITHOUT a wallet debit.
    const handleMarkRecovered = async (r: RecoveryRow) => {
        const what = r.kind === 'duplicate_credit'
            ? `the duplicate recharge on ${r.payment_id}`
            : `the under-billed deliveries on order #${r.order_id}`;
        const ok = window.confirm(
            `Mark ${what} as ALREADY RECOVERED?\n\n`
            + `This only removes it from the owed list — it does NOT debit the wallet. `
            + `Use it when the ${inr(r.recoverable)} was already clawed back outside the system `
            + `(manual debit, refund accepted, offline settlement).`,
        );
        if (!ok) return;
        const note = (window.prompt('Optional note (how/when it was recovered):', '') ?? '').trim();
        setPendingKey(rowKey(r));
        try {
            await resolveMutation.mutateAsync({ kind: r.kind, ...refOf(r), amount: r.recoverable, note: note || undefined });
            toast.success(`Marked ${inr(r.recoverable)} as already recovered`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to mark recovered');
        } finally {
            setPendingKey(null);
        }
    };

    const handleUndoResolve = async (r: RecoveryRow) => {
        setPendingKey(rowKey(r));
        try {
            await resolveMutation.mutateAsync({ kind: r.kind, ...refOf(r), undo: true });
            toast.success('Un-marked — back to the owed list');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to undo');
        } finally {
            setPendingKey(null);
        }
    };

    const exportCsv = () => {
        const headers = ['kind', 'order_id', 'payment_id', 'name', 'phone', 'txn_date', 'detail',
            'status', 'recoverable', 'recovered', 'current_wallet'];
        const lines = filtered.map((r) => [
            r.kind, r.order_id ?? '', r.payment_id ?? '', JSON.stringify(r.name ?? ''), r.phone ?? '',
            r.txn_date ?? '',
            JSON.stringify(r.detail ?? ''), r.order_status === 1 ? 'active' : (r.order_status == null ? '' : 'inactive'),
            r.recoverable, r.recovered, r.current_wallet,
        ].join(','));
        const csv = [headers.join(','), ...lines].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url; a.download = `recovery-report.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const FILTERS: { key: Filter; label: string }[] = [
        { key: 'owed', label: 'All owed' },
        { key: 'under_billed', label: 'Under-billed' },
        { key: 'duplicate', label: 'Double recharge' },
        { key: 'active', label: 'Active orders' },
        { key: 'recoverable', label: 'Recoverable now (wallet covers)' },
        { key: 'recovered', label: 'Already recovered' },
        { key: 'resolved', label: 'Marked recovered' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Recovery</h1>
                    <p className="text-slate-400 text-sm">
                        Money owed back: under-billed (₹0-debit) deliveries and double Razorpay recharges.
                        &quot;Recover&quot; posts a wallet debit for the outstanding amount (idempotent).
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
                        <div className="text-2xl font-bold text-white">{inr(summary.total_recoverable)}</div>
                        <div className="text-xs text-slate-500 mt-1">{summary.owed_rows} rows · {summary.owed_customers} customers</div>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <div className="text-sm text-slate-400 mb-1">Under-billed deliveries</div>
                        <div className="text-2xl font-bold text-white">{inr(summary.under_billed_total)}</div>
                        <div className="text-xs text-slate-500 mt-1">{summary.under_billed_orders} orders · {summary.active_owed_orders} active</div>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <div className="text-sm text-slate-400 mb-1">Double recharges</div>
                        <div className="text-2xl font-bold text-white">{inr(summary.duplicate_total)}</div>
                        <div className="text-xs text-slate-500 mt-1">{summary.duplicate_payments} payments</div>
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
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / phone / order / payment…"
                    className="ml-auto px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm w-64 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
            </div>

            <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase text-xs tracking-wide">
                            <tr>
                                <th className="px-3 py-2 text-left">Customer</th>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Detail</th>
                                <th className="px-3 py-2 text-right">Recoverable</th>
                                <th className="px-3 py-2 text-right">Wallet</th>
                                <th className="px-3 py-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No items match this filter.</td></tr>
                            ) : (
                                filtered.map((r) => {
                                    const goesNegative = r.current_wallet < r.recoverable;
                                    const isDup = r.kind === 'duplicate_credit';
                                    return (
                                        <tr key={rowKey(r)} className="hover:bg-slate-800/30">
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-white">{r.name || `#${r.user_id}`}</div>
                                                <div className="text-xs text-slate-500">{r.phone}{r.order_id ? ` · order #${r.order_id}` : ''}</div>
                                                <Link
                                                    href={`/transactions?user_id=${r.user_id}&from=${r.txn_date ?? '2024-01-01'}`}
                                                    className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200">
                                                    <Receipt className="w-3 h-3" /> View txns
                                                </Link>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${isDup
                                                    ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                                    {isDup ? 'Double recharge' : 'Under-billed'}
                                                </span>
                                                {r.kind === 'under_billed' && (
                                                    <span className={`ml-1 text-[11px] ${r.order_status === 1 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                        {r.order_status === 1 ? 'active' : 'inactive'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                                                {r.txn_date || '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-300">
                                                <div>{r.detail}</div>
                                                <div className="text-xs text-slate-500">
                                                    {isDup
                                                        ? `total credited ${inr(r.total_credited ?? 0)}`
                                                        : `${r.units_delivered ?? 0} units · should ${inr(r.should_have_billed ?? 0)} / charged ${inr(r.actually_debited ?? 0)}`}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-semibold text-amber-300">{inr(r.recoverable)}</td>
                                            <td className={`px-3 py-2.5 text-right ${goesNegative ? 'text-red-400' : 'text-slate-300'}`}>{inr(r.current_wallet)}</td>
                                            <td className="px-3 py-2.5 text-right">
                                                {r.resolved ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs text-sky-300"
                                                            title={r.resolved_note || 'Marked as already recovered (no wallet debit)'}>
                                                            Resolved (manual)
                                                        </span>
                                                        <button
                                                            onClick={() => handleUndoResolve(r)}
                                                            disabled={pendingKey === rowKey(r) || resolveMutation.isPending}
                                                            className="text-xs text-slate-400 hover:text-white underline disabled:opacity-50">
                                                            {pendingKey === rowKey(r) ? '…' : 'Undo'}
                                                        </button>
                                                    </div>
                                                ) : r.recoverable > 0.5 ? (
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleRecover(r)}
                                                            disabled={pendingKey === rowKey(r) || chargeMutation.isPending}
                                                            title={goesNegative ? 'Wallet will go negative' : 'Post recovery debit'}
                                                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${goesNegative
                                                                ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                                                                : 'bg-purple-600 hover:bg-purple-700 text-white'}`}>
                                                            {goesNegative && <AlertTriangle className="w-3.5 h-3.5" />}
                                                            {pendingKey === rowKey(r) ? 'Posting…' : `Recover ${inr(r.recoverable)}`}
                                                        </button>
                                                        <button
                                                            onClick={() => handleMarkRecovered(r)}
                                                            disabled={pendingKey === rowKey(r) || resolveMutation.isPending}
                                                            title="Already recovered outside the system — mark it without a debit"
                                                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 disabled:opacity-50">
                                                            Mark recovered
                                                        </button>
                                                    </div>
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
                    {filtered.length} item{filtered.length === 1 ? '' : 's'} shown.
                    &quot;Recover&quot; posts a wallet debit for the outstanding amount (idempotent — re-running does nothing once recovered).
                    &quot;Mark recovered&quot; only removes a row from the owed list (no debit) — for money already settled outside the system; Undo brings it back.
                    A red wallet means the debit takes them negative (they owe us).
                </div>
            </div>
        </div>
    );
}
