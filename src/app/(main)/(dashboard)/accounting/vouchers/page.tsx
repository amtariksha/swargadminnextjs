'use client';

import { useState } from 'react';
import { useVouchers } from '@/hooks/useAccounting';
import { formatINR, formatDate, voucherTypeLabel, VOUCHER_SOURCE_LABELS } from '@/lib/accounting';
import NewVoucherModal from '@/components/accounting/NewVoucherModal';

export default function VouchersPage() {
    const { data: vouchers, isLoading, refetch } = useVouchers();
    const [open, setOpen] = useState(false);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Vouchers</h1>
                    <p className="text-slate-400">All journal entries — auto-posted &amp; manual</p>
                </div>
                <button onClick={() => setOpen(true)} className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm">
                    + New Voucher
                </button>
            </div>

            {isLoading ? <div className="text-slate-400">Loading…</div> : (
                <div className="glass rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="text-left p-3">Date</th><th className="text-left p-3">Number</th>
                                <th className="text-left p-3">Type</th><th className="text-left p-3">Party</th>
                                <th className="text-left p-3">Narration</th><th className="text-left p-3">Source</th>
                                <th className="text-right p-3">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {(vouchers || []).map((v) => (
                                <tr key={v.id} className="hover:bg-slate-800/30">
                                    <td className="p-3 text-slate-300">{formatDate(v.voucher_date)}</td>
                                    <td className="p-3 text-slate-200">{v.voucher_number}</td>
                                    <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-300">{voucherTypeLabel(v.voucher_type)}</span></td>
                                    <td className="p-3 text-slate-400">{v.party_name || '—'}</td>
                                    <td className="p-3 text-slate-400 max-w-xs truncate">{v.narration || '—'}</td>
                                    <td className="p-3 text-xs text-slate-500">{VOUCHER_SOURCE_LABELS[v.source] || '—'}</td>
                                    <td className="p-3 text-right text-slate-300">{formatINR(v.amount)}</td>
                                </tr>
                            ))}
                            {!vouchers?.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No vouchers yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            <NewVoucherModal isOpen={open} onClose={() => setOpen(false)} onPosted={refetch} />
        </div>
    );
}
