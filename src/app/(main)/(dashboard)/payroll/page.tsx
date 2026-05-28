'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Banknote, FileDown, Mail, Download, Edit3, Settings2, RefreshCw } from 'lucide-react';
import { usePayslips, useGeneratePayslips, useEmailPayslip, type PayslipRow } from '@/hooks/useData';
import SalaryMasterModal from '@/components/payroll/SalaryMasterModal';
import EditPayslipModal from '@/components/payroll/EditPayslipModal';
import apiClient from '@/lib/api';
import { ApiError } from '@/lib/api-error';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const inr = (n: number | null | undefined) =>
    '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusBadge = (r: PayslipRow) => {
    let label = 'Generated';
    let cls = 'bg-green-500/20 text-green-400';
    if (!r.has_master) { label = 'No salary master'; cls = 'bg-slate-600/30 text-slate-400'; }
    else if (!r.status) { label = 'Not generated'; cls = 'bg-amber-500/20 text-amber-400'; }
    else if (r.status === 'draft') { label = 'Modified'; cls = 'bg-amber-500/20 text-amber-400'; }
    return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${cls}`}>{label}</span>;
};

export default function PayrollPage() {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const [month, setMonth] = useState(prev.getMonth() + 1);
    const [year, setYear] = useState(prev.getFullYear());
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [masterDriver, setMasterDriver] = useState<{ id: number; name: string } | null>(null);
    const [editPayslip, setEditPayslip] = useState<PayslipRow | null>(null);
    const [emailingId, setEmailingId] = useState<number | null>(null);

    const { data, isLoading, refetch } = usePayslips(month, year);
    const generate = useGeneratePayslips();
    const emailPayslip = useEmailPayslip();
    const rows = useMemo(() => data?.rows ?? [], [data]);

    const summary = useMemo(() => {
        let net = 0;
        let generated = 0;
        for (const r of rows) {
            net += r.net_pay ?? 0;
            if (r.status === 'generated') generated += 1;
        }
        return { net, generated };
    }, [rows]);

    const allSelected = rows.length > 0 && selected.size === rows.length;
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.driver_id)));
    const toggleOne = (id: number) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const handleGenerate = async () => {
        try {
            const ids = [...selected];
            const res = await generate.mutateAsync({ month, year, ...(ids.length ? { driver_ids: ids } : {}) });
            const result = res.data as { generated: number; skipped: string[]; warnings: string[] };
            toast.success(`Generated ${result.generated} payslip(s) for ${MONTHS[month - 1]} ${year}`);
            [...(result.skipped || []), ...(result.warnings || [])].slice(0, 6)
                .forEach((w) => toast.warning(w));
            refetch();
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Payslip generation failed');
        }
    };

    const handleExport = async (kind: 'csv' | 'bank') => {
        try {
            const res = await apiClient.get(
                `/payroll/export/${kind}?month=${month}&year=${year}`, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${kind === 'bank' ? 'bank_transfer' : 'payroll'}_${year}${String(month).padStart(2, '0')}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Export failed');
        }
    };

    const handleEmail = async (r: PayslipRow) => {
        if (!r.payslip_id) return;
        setEmailingId(r.payslip_id);
        try {
            await emailPayslip.mutateAsync(r.payslip_id);
            toast.success(`Payslip emailed to ${r.driver_name}`);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.userMessage : 'Failed to email payslip');
        } finally {
            setEmailingId(null);
        }
    };

    const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Payroll</h1>
                    <p className="text-slate-400">Driver salary master &amp; monthly payslips</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                        {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={() => handleExport('csv')}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white">
                        <FileDown className="w-4 h-4" /> CSV
                    </button>
                    <button onClick={() => handleExport('bank')}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white">
                        <Banknote className="w-4 h-4" /> Bank Export
                    </button>
                    <button onClick={handleGenerate} disabled={generate.isPending || rows.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${generate.isPending ? 'animate-spin' : ''}`} />
                        {generate.isPending ? 'Generating…' : 'Generate Payslips'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Drivers</p>
                    <p className="text-2xl font-bold text-white">{rows.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Payslips Generated</p>
                    <p className="text-2xl font-bold text-green-400">{summary.generated}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Net Pay</p>
                    <p className="text-2xl font-bold text-white">{inr(summary.net)}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Selected</p>
                    <p className="text-2xl font-bold text-white">{selected.size || 'All'}</p>
                </div>
            </div>

            <div className="glass rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-800/50">
                            <th className="px-4 py-3 w-10">
                                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                                    className="w-4 h-4 rounded accent-purple-500" />
                            </th>
                            <th className="px-4 py-3 font-medium">Driver</th>
                            <th className="px-4 py-3 font-medium">Designation</th>
                            <th className="px-4 py-3 font-medium text-right">Total Earning</th>
                            <th className="px-4 py-3 font-medium text-right">Total Deduction</th>
                            <th className="px-4 py-3 font-medium text-right">Net Pay</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                        )}
                        {!isLoading && rows.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No drivers found.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r.driver_id} className="border-b border-slate-800/30 last:border-0 hover:bg-slate-800/20">
                                <td className="px-4 py-3">
                                    <input type="checkbox" checked={selected.has(r.driver_id)}
                                        onChange={() => toggleOne(r.driver_id)}
                                        className="w-4 h-4 rounded accent-purple-500" />
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-white font-medium">{r.driver_name}</span>
                                    <span className="text-xs text-slate-500"> #{r.driver_id}</span>
                                </td>
                                <td className="px-4 py-3 text-slate-400">{r.designation || '-'}</td>
                                <td className="px-4 py-3 text-right text-slate-300">
                                    {r.status ? inr(r.total_earning) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-300">
                                    {r.status ? inr(r.total_deduction) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold">
                                    {r.status
                                        ? <span className={(r.net_pay ?? 0) < 0 ? 'text-red-400' : 'text-green-400'}>{inr(r.net_pay)}</span>
                                        : <span className="text-slate-600">-</span>}
                                </td>
                                <td className="px-4 py-3">{statusBadge(r)}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => setMasterDriver({ id: r.driver_id, name: r.driver_name })}
                                            title="Edit Salary Master"
                                            className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-300">
                                            <Settings2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setEditPayslip(r)} disabled={!r.payslip_id}
                                            title="Edit Current"
                                            className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-300 disabled:opacity-30">
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => r.pdf_url && window.open(r.pdf_url, '_blank')}
                                            disabled={!r.pdf_url} title="Download PDF"
                                            className="p-1.5 hover:bg-slate-700/50 rounded-lg text-blue-400 disabled:opacity-30">
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleEmail(r)}
                                            disabled={!r.payslip_id || emailingId === r.payslip_id}
                                            title="Email payslip"
                                            className="p-1.5 hover:bg-slate-700/50 rounded-lg text-green-400 disabled:opacity-30">
                                            <Mail className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {masterDriver && (
                <SalaryMasterModal
                    driverId={masterDriver.id}
                    driverName={masterDriver.name}
                    onClose={() => setMasterDriver(null)}
                    onSaved={refetch}
                />
            )}
            {editPayslip && (
                <EditPayslipModal
                    payslip={editPayslip}
                    onClose={() => setEditPayslip(null)}
                    onSaved={refetch}
                />
            )}
        </div>
    );
}
