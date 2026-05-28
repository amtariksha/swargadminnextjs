'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { useRefundReport } from '@/hooks/useData';
import { RotateCcw, TrendingDown, Truck, Wallet } from 'lucide-react';

const inr = (n: number) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function RefundsReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [from, setFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
    const [to, setTo] = useState(today);

    const { data: report, isLoading } = useRefundReport(from, to);
    const summary = report?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Refunds Report</h1>
                    <p className="text-slate-400">Refund causes, driver accountability and loss analysis</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    <span className="text-slate-500">to</span>
                    <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <RotateCcw className="w-4 h-4" /> Total Refunded
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">{inr(summary?.total_amount ?? 0)}</p>
                    <p className="text-xs text-slate-500">{summary?.total_count ?? 0} refunds</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Truck className="w-4 h-4" /> Billed to Drivers
                    </div>
                    <p className="text-2xl font-bold text-amber-400 mt-1">{inr(summary?.billed_amount ?? 0)}</p>
                    <p className="text-xs text-slate-500">recovered via payslip</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <TrendingDown className="w-4 h-4" /> Absorbed (Loss)
                    </div>
                    <p className="text-2xl font-bold text-red-400 mt-1">{inr(summary?.absorbed_amount ?? 0)}</p>
                    <p className="text-xs text-slate-500">company-borne</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Wallet className="w-4 h-4" /> Refund Count
                    </div>
                    <p className="text-2xl font-bold text-white mt-1">{summary?.total_count ?? 0}</p>
                    <p className="text-xs text-slate-500">{from} → {to}</p>
                </div>
            </div>

            {isLoading && <p className="text-slate-400 text-sm">Loading report…</p>}

            {report && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ReportTable
                        title="By Reason"
                        emptyText="No refunds in this period"
                        headers={['Reason', 'Count', 'Amount']}
                        rows={report.by_reason.map((r) => [r.reason, String(r.count), inr(r.amount)])}
                    />
                    <ReportTable
                        title="By Driver (billed)"
                        emptyText="No driver-billed refunds in this period"
                        headers={['Driver', 'Count', 'Amount']}
                        rows={report.by_driver.map((r) => [r.driver_name, String(r.count), inr(r.amount)])}
                    />
                    <div className="lg:col-span-2">
                        <ReportTable
                            title="By Delivery Day"
                            emptyText="No refunds in this period"
                            headers={['Delivery Date', 'Count', 'Amount']}
                            rows={report.by_date.map((r) => [r.date ?? '—', String(r.count), inr(r.amount)])}
                        />
                    </div>
                </div>
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
                                <th key={h} className={`px-4 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri} className="border-b border-slate-800/30 last:border-0">
                                {row.map((cell, ci) => (
                                    <td key={ci} className={`px-4 py-2 ${ci > 0 ? 'text-right text-slate-300' : 'text-white'}`}>
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
