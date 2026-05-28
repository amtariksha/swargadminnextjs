'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDaytimeSalesReport, useDaytimeIncentives } from '@/hooks/useData';
import { ArrowLeft, BarChart3 } from 'lucide-react';

const StatCard = ({ label, value }: { label: string; value: string }) => (
    <div className="glass rounded-xl p-4">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-xl font-bold text-white mt-1">{value}</p>
    </div>
);

export default function DaytimeReportsPage() {
    const router = useRouter();
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const filters = useMemo(() => {
        const f: Record<string, string> = {};
        if (from) f.from = from;
        if (to) f.to = to;
        return f;
    }, [from, to]);

    const { data: report, isLoading: reportLoading } = useDaytimeSalesReport(filters);
    const { data: incentiveData, isLoading: incentiveLoading } = useDaytimeIncentives(filters);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/day-orders')} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex items-center gap-3">
                    <BarChart3 className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Day-time Sales & Incentive</h1>
                        <p className="text-slate-400">Payment breakdown, per-exec sales, daily incentive</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-400">From
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                        className="ml-2 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm" />
                </label>
                <label className="text-sm text-slate-400">To
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                        className="ml-2 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm" />
                </label>
                <span className="text-xs text-slate-500">Defaults to today when blank</span>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Orders" value={reportLoading ? '…' : String(report?.summary.total_orders ?? 0)} />
                <StatCard label="Paid Orders" value={reportLoading ? '…' : String(report?.summary.paid_orders ?? 0)} />
                <StatCard label="Paid Revenue" value={reportLoading ? '…' : `₹${(report?.summary.paid_revenue ?? 0).toFixed(2)}`} />
                <StatCard label="Unpaid Orders" value={reportLoading ? '…' : String(report?.summary.unpaid_orders ?? 0)} />
            </div>

            {/* Payment breakdown */}
            <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Payment Status Breakdown</h3>
                {reportLoading ? (
                    <p className="text-slate-500 text-sm">Loading…</p>
                ) : !report?.payment_breakdown.length ? (
                    <p className="text-slate-500 text-sm">No orders in range</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead><tr className="text-slate-400 text-left">
                            <th className="py-1.5">Status</th><th>Count</th><th className="text-right">Total</th>
                        </tr></thead>
                        <tbody>
                            {report.payment_breakdown.map((r) => (
                                <tr key={r.payment_status} className="border-t border-slate-800/50">
                                    <td className="py-1.5 text-slate-300">{r.payment_status.replace(/_/g, ' ')}</td>
                                    <td className="text-slate-300">{r.count}</td>
                                    <td className="text-right text-white">₹{r.total.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Per-exec sales */}
            <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Sales by Executive</h3>
                {reportLoading ? (
                    <p className="text-slate-500 text-sm">Loading…</p>
                ) : !report?.per_exec.length ? (
                    <p className="text-slate-500 text-sm">No orders in range</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead><tr className="text-slate-400 text-left">
                            <th className="py-1.5">Executive</th><th>Orders</th>
                            <th className="text-right">Paid Sales</th><th className="text-right">Total Sales</th>
                        </tr></thead>
                        <tbody>
                            {report.per_exec.map((r) => (
                                <tr key={r.exec_id} className="border-t border-slate-800/50">
                                    <td className="py-1.5 text-slate-300">{r.exec_name || `#${r.exec_id}`}</td>
                                    <td className="text-slate-300">{r.orders_count}</td>
                                    <td className="text-right text-white">₹{r.paid_sales.toFixed(2)}</td>
                                    <td className="text-right text-slate-300">₹{r.total_sales.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Daily incentive */}
            <div className="glass rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">Daily Sales Incentive</h3>
                    {incentiveData && (
                        <span className="text-sm text-slate-400">
                            Total: <span className="text-white font-semibold">₹{incentiveData.total_incentive.toFixed(2)}</span>
                        </span>
                    )}
                </div>
                {incentiveLoading ? (
                    <p className="text-slate-500 text-sm">Loading…</p>
                ) : !incentiveData?.incentives.length ? (
                    <p className="text-slate-500 text-sm">No incentive rows in range (the cron writes these daily after cutoff)</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead><tr className="text-slate-400 text-left">
                            <th className="py-1.5">Date</th><th>Executive</th><th>Orders</th>
                            <th>New Cust.</th><th className="text-right">Sales</th><th className="text-right">Incentive</th>
                        </tr></thead>
                        <tbody>
                            {incentiveData.incentives.map((r) => (
                                <tr key={r.id} className="border-t border-slate-800/50">
                                    <td className="py-1.5 text-slate-300">{r.incentive_date}</td>
                                    <td className="text-slate-300">{r.exec_name || `#${r.sales_exec_user_id}`}</td>
                                    <td className="text-slate-300">{r.orders_count}</td>
                                    <td className="text-slate-300">{r.new_customers_count}</td>
                                    <td className="text-right text-slate-300">₹{r.sales_value.toFixed(2)}</td>
                                    <td className="text-right text-white font-medium">₹{r.incentive_amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
