'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { POST } from '@/lib/api';
import { useVouchers, useLedgerAccounts } from '@/hooks/useAccounting';
import {
    formatINR, formatDate, voucherTypeLabel, MANUAL_VOUCHER_TYPES, VOUCHER_SOURCE_LABELS,
} from '@/lib/accounting';

interface Line { ledger_account_id: string; debit: string; credit: string; }
const blankLine = (): Line => ({ ledger_account_id: '', debit: '', credit: '' });
const n = (v: string) => Number(v) || 0;

export default function VouchersPage() {
    const { data: vouchers, isLoading, refetch } = useVouchers();
    const { data: ledgers } = useLedgerAccounts();
    const [open, setOpen] = useState(false);
    const [type, setType] = useState('journal');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [narration, setNarration] = useState('');
    const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
    const [saving, setSaving] = useState(false);

    const totalDr = Math.round(lines.reduce((s, l) => s + n(l.debit), 0) * 100) / 100;
    const totalCr = Math.round(lines.reduce((s, l) => s + n(l.credit), 0) * 100) / 100;
    const balanced = Math.abs(totalDr - totalCr) <= 0.01 && totalDr > 0;

    const setLine = (i: number, patch: Partial<Line>) =>
        setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

    const reset = () => { setType('journal'); setDate(new Date().toISOString().slice(0, 10)); setNarration(''); setLines([blankLine(), blankLine()]); };

    const submit = async () => {
        const entries = lines
            .filter((l) => l.ledger_account_id && (n(l.debit) > 0 || n(l.credit) > 0))
            .map((l) => ({ ledger_account_id: Number(l.ledger_account_id), debit: n(l.debit), credit: n(l.credit) }));
        if (entries.length < 2 || !balanced) { toast.error('Add at least two lines with equal debit and credit'); return; }
        setSaving(true);
        try {
            await POST('/accounting/vouchers', { voucher_type: type, voucher_date: date, narration, entries });
            toast.success('Voucher posted');
            setOpen(false); reset(); refetch();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to post voucher');
        } finally { setSaving(false); }
    };

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

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
                    <div className="glass rounded-2xl p-6 w-full max-w-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-white">New Voucher</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Type</label>
                                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                                    {MANUAL_VOUCHER_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Date</label>
                                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Narration</label>
                            <input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="optional" className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm" />
                        </div>
                        <div className="space-y-2">
                            {lines.map((l, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2">
                                    <select value={l.ledger_account_id} onChange={(e) => setLine(i, { ledger_account_id: e.target.value })}
                                        className="col-span-6 px-2 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-xs">
                                        <option value="">Select ledger…</option>
                                        {(ledgers || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                    <input type="number" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: '' })} placeholder="Debit"
                                        className="col-span-3 px-2 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-xs text-right" />
                                    <input type="number" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: '' })} placeholder="Credit"
                                        className="col-span-3 px-2 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-xs text-right" />
                                </div>
                            ))}
                            <button onClick={() => setLines((ls) => [...ls, blankLine()])} className="text-xs text-purple-300">+ add line</button>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className={balanced ? 'text-emerald-300' : 'text-rose-300'}>
                                Dr {formatINR(totalDr)} · Cr {formatINR(totalCr)} {balanced ? '· balanced' : `· diff ${formatINR(Math.abs(totalDr - totalCr))}`}
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => setOpen(false)} className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm">Cancel</button>
                                <button disabled={!balanced || saving} onClick={submit}
                                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">
                                    {saving ? 'Posting…' : 'Post voucher'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
