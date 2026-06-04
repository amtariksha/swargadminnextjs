'use client';

import { useState } from 'react';
import { useDayBook } from '@/hooks/useAccounting';
import { formatINR, voucherTypeLabel } from '@/lib/accounting';

export default function DayBookPage() {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const { data, isLoading } = useDayBook(date);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Day Book</h1>
                    <p className="text-slate-400">All vouchers posted on a day, with their entries</p>
                </div>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm" />
            </div>

            {isLoading ? <div className="text-slate-400">Loading…</div> : (
                <div className="space-y-3">
                    {(data?.vouchers || []).map((v) => (
                        <div key={v.id} className="glass rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-medium">{v.voucher_number}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700/50 text-slate-300">{voucherTypeLabel(v.voucher_type)}</span>
                                    {v.party_name && <span className="text-xs text-slate-400">{v.party_name}</span>}
                                </div>
                                {v.narration && <span className="text-xs text-slate-500 truncate max-w-xs">{v.narration}</span>}
                            </div>
                            <div className="divide-y divide-slate-700/40">
                                {v.entries.map((e, i) => (
                                    <div key={i} className="grid grid-cols-12 py-1 text-sm">
                                        <span className="col-span-6 text-slate-200">{e.ledger_name}</span>
                                        <span className="col-span-3 text-right text-slate-300">{e.debit ? formatINR(e.debit) : ''}</span>
                                        <span className="col-span-3 text-right text-slate-300">{e.credit ? formatINR(e.credit) : ''}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    {!data?.vouchers?.length && (
                        <div className="glass rounded-2xl p-8 text-center text-slate-400">No vouchers on {date}.</div>
                    )}
                </div>
            )}
        </div>
    );
}
