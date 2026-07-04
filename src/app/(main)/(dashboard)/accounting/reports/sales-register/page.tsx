'use client';

import { useState } from 'react';
import { useSalesRegister } from '@/hooks/useAccounting';
import {
    formatINR, formatDate, DOCUMENT_TYPE_LABELS, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE,
} from '@/lib/accounting';
import MonthRangePicker, { currentMonthRange } from '@/components/MonthRangePicker';

export default function SalesRegisterPage() {
    const [range, setRange] = useState(currentMonthRange());
    const { data, isLoading } = useSalesRegister({ from_date: range.from, to_date: range.to });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-white">Sales Register</h1>
                    <p className="text-slate-400">All invoices issued in the period, with GST break-up</p>
                </div>
                <MonthRangePicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
            </div>

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : (
                <div className="glass rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-800/50 text-slate-400">
                                <tr>
                                    <th className="text-left p-3">Date</th>
                                    <th className="text-left p-3">Invoice #</th>
                                    <th className="text-left p-3">Customer</th>
                                    <th className="text-left p-3">Type</th>
                                    <th className="text-right p-3">Taxable</th>
                                    <th className="text-right p-3">CGST</th>
                                    <th className="text-right p-3">SGST</th>
                                    <th className="text-right p-3">IGST</th>
                                    <th className="text-right p-3">Total</th>
                                    <th className="text-left p-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/40">
                                {(data?.invoices || []).map((inv) => (
                                    <tr key={inv.id} className="hover:bg-slate-800/30">
                                        <td className="p-3 text-slate-300 whitespace-nowrap">{formatDate(inv.invoice_date)}</td>
                                        <td className="p-3 text-slate-200 whitespace-nowrap">{inv.invoice_number}</td>
                                        <td className="p-3">
                                            <div className="text-slate-200">{inv.customer_name || '—'}</div>
                                            {inv.customer_gstin && <div className="text-xs text-slate-500">{inv.customer_gstin}</div>}
                                        </td>
                                        <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{DOCUMENT_TYPE_LABELS[Number(inv.document_type)] || '—'}</td>
                                        <td className="p-3 text-right text-slate-300">{formatINR(inv.taxable_value)}</td>
                                        <td className="p-3 text-right text-slate-300">{Number(inv.cgst_amount) ? formatINR(inv.cgst_amount) : ''}</td>
                                        <td className="p-3 text-right text-slate-300">{Number(inv.sgst_amount) ? formatINR(inv.sgst_amount) : ''}</td>
                                        <td className="p-3 text-right text-slate-300">{Number(inv.igst_amount) ? formatINR(inv.igst_amount) : ''}</td>
                                        <td className="p-3 text-right text-slate-200 font-medium">{formatINR(inv.total_amount)}</td>
                                        <td className="p-3">
                                            <span className={`text-xs px-2 py-1 rounded-lg ${INVOICE_STATUS_BADGE[Number(inv.status)] || 'bg-slate-700/50 text-slate-400'}`}>
                                                {INVOICE_STATUS_LABELS[Number(inv.status)] || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {!data?.invoices?.length && (
                                    <tr><td colSpan={10} className="p-6 text-center text-slate-500">No invoices in this period.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-800/50 font-semibold text-white">
                                <tr>
                                    <td className="p-3" colSpan={4}>Total (issued only)</td>
                                    <td className="p-3 text-right">{formatINR(data?.totals?.taxable)}</td>
                                    <td className="p-3 text-right">{formatINR(data?.totals?.cgst)}</td>
                                    <td className="p-3 text-right">{formatINR(data?.totals?.sgst)}</td>
                                    <td className="p-3 text-right">{formatINR(data?.totals?.igst)}</td>
                                    <td className="p-3 text-right">{formatINR(data?.totals?.total)}</td>
                                    <td className="p-3" />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="px-3 py-2 text-xs text-slate-500">Totals include issued invoices only — cancelled invoices are listed but excluded.</p>
                </div>
            )}
        </div>
    );
}
