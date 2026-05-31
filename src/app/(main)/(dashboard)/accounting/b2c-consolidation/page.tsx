'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConsolidation, ConsolidationLine } from '@/hooks/useAccounting';
import {
    RUN_STATUS_LABELS, RUN_STATUS_BADGE, formatINR, formatPercent, formatDate, currentPeriod,
} from '@/lib/accounting';
import ConfirmDialog from '@/components/ConfirmDialog';
import { CalendarRange, FileText, CheckCircle2 } from 'lucide-react';
import { POST } from '@/lib/api';
import { toast } from 'sonner';

export default function B2cConsolidationPage() {
    const [month, setMonth] = useState(currentPeriod());
    const { data, isLoading, refetch } = useConsolidation(month);
    const [showPost, setShowPost] = useState(false);
    const [posting, setPosting] = useState(false);

    const run = data?.run ?? null;
    const lines = data?.lines || [];
    const totals = data?.totals ?? null;
    const status = run ? Number(run.status) : null;
    const isDraft = status === 1;
    const isPosted = status === 3 || !!run?.invoice_id;

    const post = async () => {
        setPosting(true);
        try {
            const res = await POST<{ invoice_id: number; invoice_number: string }>(`/accounting/b2c/consolidation/${month}/post`, {});
            toast.success(`Posted ${res.data?.invoice_number ?? 'consolidated invoice'}`);
            setShowPost(false);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to post — check the B2C consolidation user setting');
        } finally {
            setPosting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">B2C consolidation</h1>
                    <p className="text-slate-400">Monthly roll-up of B2C-small invoices into one consolidated GST invoice (GSTR-1 B2CS grain)</p>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Period</label>
                    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                        className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
            </div>

            {isLoading ? (
                <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>
            ) : !run ? (
                <div className="glass rounded-2xl p-8 text-center text-slate-400 text-sm">
                    <CalendarRange className="w-8 h-8 mx-auto mb-3 text-slate-600" />
                    No draft for {month}. The consolidation job builds a draft on the 1st of each month for the prior period.
                </div>
            ) : (
                <>
                    {/* Run header */}
                    <div className="glass rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className={`text-xs px-2 py-1 rounded-lg ${RUN_STATUS_BADGE[Number(run.status)] || 'bg-slate-700/50 text-slate-400'}`}>
                                {RUN_STATUS_LABELS[Number(run.status)] || '—'}
                            </span>
                            <div>
                                <div className="text-white font-semibold">{run.period}</div>
                                {run.generated_at && <div className="text-xs text-slate-400">Generated {formatDate(run.generated_at)}</div>}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {isPosted && run.invoice_id && (
                                <Link href={`/accounting/invoices/${run.invoice_id}`}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-cyan-400 rounded-xl text-sm hover:bg-slate-700/50">
                                    <FileText className="w-4 h-4" /> {run.invoice_number || 'View invoice'}
                                </Link>
                            )}
                            {isDraft && (
                                <button onClick={() => setShowPost(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm">
                                    <CheckCircle2 className="w-4 h-4" /> Post consolidated invoice
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Totals */}
                    {totals && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <Stat label="Taxable" value={formatINR(totals.taxable)} />
                            <Stat label="CGST" value={formatINR(totals.cgst)} />
                            <Stat label="SGST" value={formatINR(totals.sgst)} />
                            <Stat label="IGST" value={formatINR(totals.igst)} />
                            <Stat label="Total" value={formatINR(totals.total)} highlight />
                        </div>
                    )}

                    {/* Rate-slab lines */}
                    <div className="glass rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800/50">
                            <h2 className="text-lg font-semibold text-white">Rate-slab summary</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Grouped by place of supply, GST rate, and HSN</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800/50 text-xs text-slate-400 uppercase tracking-wider">
                                        <th className="px-4 py-3 text-left">POS</th>
                                        <th className="px-4 py-3 text-left">HSN</th>
                                        <th className="px-4 py-3 text-right">Rate</th>
                                        <th className="px-4 py-3 text-right">Taxable</th>
                                        <th className="px-4 py-3 text-right">CGST</th>
                                        <th className="px-4 py-3 text-right">SGST</th>
                                        <th className="px-4 py-3 text-right">IGST</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {lines.map((l: ConsolidationLine) => (
                                        <tr key={l.id} className="text-slate-300">
                                            <td className="px-4 py-3">{l.place_of_supply_state_code || '—'}</td>
                                            <td className="px-4 py-3 text-slate-400">{l.hsn_code || '—'}</td>
                                            <td className="px-4 py-3 text-right">{formatPercent(l.gst_rate)}</td>
                                            <td className="px-4 py-3 text-right">{formatINR(l.taxable_value)}</td>
                                            <td className="px-4 py-3 text-right">{formatINR(l.cgst_amount)}</td>
                                            <td className="px-4 py-3 text-right">{formatINR(l.sgst_amount)}</td>
                                            <td className="px-4 py-3 text-right">{formatINR(l.igst_amount)}</td>
                                        </tr>
                                    ))}
                                    {lines.length === 0 && (
                                        <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No B2C lines for this period.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <ConfirmDialog
                isOpen={showPost}
                title="Post consolidated invoice"
                message={`Generate one consolidated B2C invoice for ${month} and queue it to Tally? Once posted this run becomes read-only.`}
                confirmText="Post invoice"
                isLoading={posting}
                onConfirm={post}
                onCancel={() => setShowPost(false)}
            />
        </div>
    );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`glass rounded-2xl p-4 ${highlight ? 'ring-1 ring-purple-500/30' : ''}`}>
            <div className="text-xs text-slate-400">{label}</div>
            <div className="text-lg font-bold text-white mt-1">{value}</div>
        </div>
    );
}
