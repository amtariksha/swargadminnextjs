'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import {
    useRefundReport,
    useRefundTransactions,
    useUpdateRefundTransaction,
    useReclassifyRefundReason,
    useRefundReasons,
    type RefundTransactionItem,
} from '@/hooks/useData';
import {
    RotateCcw,
    TrendingDown,
    Truck,
    Wallet,
    X,
    Edit2,
    Check,
    FolderSync,
    ChevronRight,
    Search,
} from 'lucide-react';
import { toast } from 'sonner';

const inr = (n: number) =>
    `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function RefundsReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
    const [to, setTo] = useState(today);

    // Active drill-down state
    const [selectedReason, setSelectedReason] = useState<string | null>(null);

    const { data: report, isLoading } = useRefundReport(from, to);
    const summary = report?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Refunds Report</h1>
                    <p className="text-slate-400">
                        Refund causes, driver accountability and loss analysis (cancelled orders excluded)
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="date"
                        value={from}
                        max={to}
                        onChange={(e) => setFrom(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                    <span className="text-slate-500">to</span>
                    <input
                        type="date"
                        value={to}
                        min={from}
                        max={today}
                        onChange={(e) => setTo(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <RotateCcw className="w-4 h-4" /> Total Refunded
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">
                        {inr(summary?.total_amount ?? 0)}
                    </p>
                    <p className="text-xs text-slate-500">{summary?.total_count ?? 0} refunds</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Truck className="w-4 h-4" /> Billed to Drivers
                    </div>
                    <p className="text-2xl font-bold text-amber-400 mt-1">
                        {inr(summary?.billed_amount ?? 0)}
                    </p>
                    <p className="text-xs text-slate-500">recovered via payslip</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <TrendingDown className="w-4 h-4" /> Absorbed (Loss)
                    </div>
                    <p className="text-2xl font-bold text-red-400 mt-1">
                        {inr(summary?.absorbed_amount ?? 0)}
                    </p>
                    <p className="text-xs text-slate-500">company-borne</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Wallet className="w-4 h-4" /> Refund Count
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">
                        {summary?.total_count ?? 0}
                    </p>
                    <p className="text-xs text-slate-500">
                        {from} → {to}
                    </p>
                </div>
            </div>

            {isLoading && <p className="text-slate-400 text-sm">Loading report…</p>}

            {report && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* By Reason Table with Clickable Counts */}
                    <div className="glass rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
                            <h3 className="font-semibold text-white">By Reason</h3>
                            <span className="text-xs text-slate-400">Click count to view & edit records</span>
                        </div>
                        {report.by_reason.length === 0 ? (
                            <p className="px-4 py-6 text-sm text-slate-500">No refunds in this period</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-400 border-b border-slate-800/50">
                                        <th className="px-4 py-2 font-medium">Reason</th>
                                        <th className="px-4 py-2 font-medium text-right">Count</th>
                                        <th className="px-4 py-2 font-medium text-right">Amount</th>
                                        <th className="px-4 py-2 font-medium text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.by_reason.map((r, ri) => (
                                        <tr
                                            key={ri}
                                            className="border-b border-slate-800/30 hover:bg-slate-800/40 transition-colors cursor-pointer group"
                                            onClick={() => setSelectedReason(r.reason)}
                                        >
                                            <td className="px-4 py-2.5 font-medium text-white group-hover:text-purple-300">
                                                {r.reason}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-semibold">
                                                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                    {r.count}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-slate-300 font-mono">
                                                {inr(r.amount)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-slate-400">
                                                <ChevronRight className="w-4 h-4 ml-auto text-slate-500 group-hover:text-purple-400 transition-colors" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* By Driver Table */}
                    <ReportTable
                        title="By Driver (billed)"
                        emptyText="No driver-billed refunds in this period"
                        headers={['Driver', 'Count', 'Amount']}
                        rows={report.by_driver.map((r) => [
                            r.driver_name,
                            String(r.count),
                            inr(r.amount),
                        ])}
                    />

                    {/* By Delivery Day Table */}
                    <div className="lg:col-span-2">
                        <ReportTable
                            title="By Delivery Day"
                            emptyText="No refunds in this period"
                            headers={['Delivery Date', 'Count', 'Amount']}
                            rows={report.by_date.map((r) => [
                                r.date ?? '—',
                                String(r.count),
                                inr(r.amount),
                            ])}
                        />
                    </div>
                </div>
            )}

            {/* Drill-down Drawer for Specific Records by Reason */}
            {selectedReason && (
                <RefundRecordsModal
                    reason={selectedReason}
                    from={from}
                    to={to}
                    onClose={() => setSelectedReason(null)}
                />
            )}
        </div>
    );
}

interface ReportTableProps {
    title: string;
    headers: string[];
    rows: string[][];
    emptyText: string;
}

function ReportTable({ title, headers, rows, emptyText }: ReportTableProps) {
    return (
        <div className="glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800/50">
                <h3 className="font-semibold text-white">{title}</h3>
            </div>
            {rows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">{emptyText}</p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800/50">
                            {headers.map((h, i) => (
                                <th
                                    key={h}
                                    className={`px-4 py-2 font-medium ${
                                        i > 0 ? 'text-right' : ''
                                    }`}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr
                                key={ri}
                                className="border-b border-slate-800/30 last:border-0"
                            >
                                {row.map((cell, ci) => (
                                    <td
                                        key={ci}
                                        className={`px-4 py-2 ${
                                            ci > 0
                                                ? 'text-right text-slate-300'
                                                : 'text-white'
                                        }`}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/**
 * Modal to display and edit specific refund records for a given reason
 */
interface RefundRecordsModalProps {
    reason: string;
    from: string;
    to: string;
    onClose: () => void;
}

function RefundRecordsModal({ reason, from, to, onClose }: RefundRecordsModalProps) {
    const { data: records = [], isLoading } = useRefundTransactions({ from, to, reason });
    const { data: standardReasons = [] } = useRefundReasons(false);
    const updateTx = useUpdateRefundTransaction();
    const reclassifyMutation = useReclassifyRefundReason();

    // Inline edit state
    const [editingTxId, setEditingTxId] = useState<number | null>(null);
    const [inlineReason, setInlineReason] = useState('');

    // Bulk reclassify state
    const [isReclassifying, setIsReclassifying] = useState(false);
    const [targetGroup, setTargetGroup] = useState('');

    const startEditing = (tx: RefundTransactionItem) => {
        setEditingTxId(tx.id);
        setInlineReason(tx.refund_reason || '');
    };

    const saveInlineEdit = async (id: number) => {
        if (!inlineReason.trim()) {
            toast.error('Reason cannot be empty');
            return;
        }
        try {
            await updateTx.mutateAsync({ id, refund_reason: inlineReason.trim() });
            toast.success('Refund reason updated');
            setEditingTxId(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update reason');
        }
    };

    const handleReclassifyAll = async () => {
        const dest = targetGroup.trim();
        if (!dest) {
            toast.error('Please enter or select a target group name');
            return;
        }
        try {
            await reclassifyMutation.mutateAsync({ from_reason: reason, to_reason: dest });
            toast.success(`All records reclassified to "${dest}"`);
            setIsReclassifying(false);
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to reclassify records');
        }
    };

    const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-white">Refund Records</h2>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                {reason}
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            {records.length} record(s) totaling {inr(totalAmount)} ({from} → {to})
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsReclassifying(!isReclassifying)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-medium transition-colors"
                        >
                            <FolderSync className="w-3.5 h-3.5" />
                            <span>Bulk Reclassify</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Bulk Reclassify Bar (Accordion) */}
                {isReclassifying && (
                    <div className="p-4 bg-purple-950/30 border-b border-purple-900/40 flex flex-wrap items-center gap-3">
                        <div className="text-xs text-purple-200">
                            Move all <strong>{records.length}</strong> records from &quot;{reason}&quot; to group:
                        </div>
                        <input
                            type="text"
                            value={targetGroup}
                            onChange={(e) => setTargetGroup(e.target.value)}
                            placeholder="Enter target group name…"
                            list="standard-reasons-list"
                            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 min-w-[240px]"
                        />
                        <datalist id="standard-reasons-list">
                            {standardReasons.map((sr, idx) => (
                                <option key={idx} value={sr.label} />
                            ))}
                        </datalist>
                        <button
                            type="button"
                            onClick={handleReclassifyAll}
                            disabled={reclassifyMutation.isPending}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                            {reclassifyMutation.isPending ? 'Reclassifying…' : 'Apply to All'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsReclassifying(false)}
                            className="px-2.5 py-1.5 text-slate-400 hover:text-white text-xs"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Content Table */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="py-12 text-center text-slate-400 text-sm">
                            Loading refund records…
                        </div>
                    ) : records.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 text-sm">
                            No records found for this reason in this date range.
                        </div>
                    ) : (
                        <div className="rounded-xl border border-slate-800 overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                                    <tr>
                                        <th className="px-4 py-2.5">Date</th>
                                        <th className="px-4 py-2.5">Customer</th>
                                        <th className="px-4 py-2.5">Order #</th>
                                        <th className="px-4 py-2.5">Driver</th>
                                        <th className="px-4 py-2.5 text-right">Refund Amount</th>
                                        <th className="px-4 py-2.5">Reason & Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {records.map((rec) => {
                                        const isEditing = editingTxId === rec.id;
                                        return (
                                            <tr key={rec.id} className="hover:bg-slate-800/20">
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-300 text-xs">
                                                    <div>{rec.delivery_date || rec.created_at?.slice(0, 10) || '—'}</div>
                                                    <div className="text-[10px] text-slate-500">ID: #{rec.id}</div>
                                                </td>

                                                <td className="px-4 py-3 text-slate-200">
                                                    <div className="font-medium text-white">{rec.customer_name}</div>
                                                    {rec.customer_phone && (
                                                        <div className="text-xs text-slate-400">{rec.customer_phone}</div>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 text-slate-300 text-xs">
                                                    {rec.order_id ? (
                                                        <span>Order #{rec.order_id}</span>
                                                    ) : (
                                                        <span className="text-slate-500">—</span>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 text-xs">
                                                    {rec.billed_to_driver === 1 ? (
                                                        <span className="text-amber-400 font-medium">
                                                            {rec.billed_driver_name || `Driver #${rec.billed_driver_id}`}
                                                            <span className="block text-[10px] text-amber-500/80">
                                                                (billed to driver)
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400">Absorbed (Company)</span>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 text-right font-mono font-semibold text-white">
                                                    {inr(rec.amount)}
                                                </td>

                                                <td className="px-4 py-3">
                                                    {isEditing ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="text"
                                                                value={inlineReason}
                                                                onChange={(e) => setInlineReason(e.target.value)}
                                                                list="standard-reasons-list"
                                                                className="px-2.5 py-1 bg-slate-800 border border-purple-500 rounded text-xs text-white focus:outline-none w-48"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => saveInlineEdit(rec.id)}
                                                                disabled={updateTx.isPending}
                                                                className="p-1 bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
                                                                title="Save"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingTxId(null)}
                                                                className="p-1 text-slate-400 hover:text-white rounded"
                                                                title="Cancel"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between gap-2 group/edit">
                                                            <span className="text-xs text-slate-300 truncate max-w-[200px]" title={rec.refund_reason}>
                                                                {rec.refund_reason || '(no reason)'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditing(rec)}
                                                                className="opacity-0 group-hover/edit:opacity-100 p-1 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded transition-all"
                                                                title="Edit reason"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
