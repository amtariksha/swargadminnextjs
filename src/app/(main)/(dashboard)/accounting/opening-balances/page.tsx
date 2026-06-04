'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { POST, PUT } from '@/lib/api';
import { useOpeningBalances, useLedgerAccounts } from '@/hooks/useAccounting';
import { formatINR, currentFy, fyOptions } from '@/lib/accounting';

interface Row { ledger_account_id: number; ledger_name: string; debit: string; credit: string; }
const n = (v: string) => Number(v) || 0;

export default function OpeningBalancesPage() {
    const [fy, setFy] = useState(currentFy());
    const { data, isLoading, refetch } = useOpeningBalances(fy);
    const { data: ledgers } = useLedgerAccounts();
    const [rows, setRows] = useState<Row[]>([]);
    const [addId, setAddId] = useState('');
    const [saving, setSaving] = useState('');

    // Populate the editable grid from the fetched balances (codebase convention).
    useEffect(() => {
        if (data?.rows) {
            setRows(data.rows.map((r) => ({
                ledger_account_id: r.ledger_account_id, ledger_name: r.ledger_name,
                debit: Number(r.debit) ? String(r.debit) : '', credit: Number(r.credit) ? String(r.credit) : '',
            })));
        }
    }, [data]);

    const totalDr = Math.round(rows.reduce((s, r) => s + n(r.debit), 0) * 100) / 100;
    const totalCr = Math.round(rows.reduce((s, r) => s + n(r.credit), 0) * 100) / 100;
    const balanced = Math.abs(totalDr - totalCr) <= 0.01 && totalDr > 0;

    const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    const addRow = () => {
        const id = Number(addId);
        if (!id || rows.some((r) => r.ledger_account_id === id)) return;
        const led = ledgers?.find((l) => l.id === id);
        if (led) setRows((rs) => [...rs, { ledger_account_id: id, ledger_name: led.name, debit: '', credit: '' }]);
        setAddId('');
    };

    const save = async () => {
        setSaving('save');
        try {
            await PUT('/accounting/opening-balances', {
                fy, balances: rows.map((r) => ({ ledger_account_id: r.ledger_account_id, debit: n(r.debit), credit: n(r.credit) })),
            });
            toast.success('Opening balances saved'); refetch();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
        finally { setSaving(''); }
    };

    const finalize = async () => {
        if (!balanced) { toast.error('Balances must be equal before finalising'); return; }
        setSaving('finalize');
        try {
            await PUT('/accounting/opening-balances', { fy, balances: rows.map((r) => ({ ledger_account_id: r.ledger_account_id, debit: n(r.debit), credit: n(r.credit) })) });
            await POST('/accounting/opening-balances/finalize', { fy });
            toast.success('Opening voucher posted'); refetch();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Finalise failed'); }
        finally { setSaving(''); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Opening Balances</h1>
                    <p className="text-slate-400">As on the FY start. Provisional until your CA finalises the prior year.</p>
                </div>
                <select value={fy} onChange={(e) => setFy(e.target.value)} className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    {fyOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>

            {data?.posted && (
                <div className="glass rounded-2xl p-3 text-sm text-amber-300 bg-amber-500/5">
                    An opening voucher is already posted for {fy}. Editing &amp; finalising again will void the prior and re-post.
                </div>
            )}

            {isLoading ? <div className="text-slate-400">Loading…</div> : (
                <div className="glass rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 text-slate-400"><tr>
                            <th className="text-left p-3">Ledger</th><th className="text-right p-3 w-40">Debit</th><th className="text-right p-3 w-40">Credit</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {rows.map((r, i) => (
                                <tr key={r.ledger_account_id}>
                                    <td className="p-2 text-slate-200">{r.ledger_name}</td>
                                    <td className="p-2"><input type="number" value={r.debit} onChange={(e) => setRow(i, { debit: e.target.value, credit: '' })}
                                        className="w-full px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-xs text-right" /></td>
                                    <td className="p-2"><input type="number" value={r.credit} onChange={(e) => setRow(i, { credit: e.target.value, debit: '' })}
                                        className="w-full px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-xs text-right" /></td>
                                </tr>
                            ))}
                            {!rows.length && <tr><td colSpan={3} className="p-4 text-center text-slate-500">Add a ledger below to begin.</td></tr>}
                        </tbody>
                        <tfoot className="bg-slate-800/50 font-semibold text-white"><tr>
                            <td className="p-3">Total ({balanced ? <span className="text-emerald-300">balanced</span> : <span className="text-rose-300">diff {formatINR(Math.abs(totalDr - totalCr))}</span>})</td>
                            <td className="p-3 text-right">{formatINR(totalDr)}</td><td className="p-3 text-right">{formatINR(totalCr)}</td>
                        </tr></tfoot>
                    </table>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <select value={addId} onChange={(e) => setAddId(e.target.value)} className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    <option value="">Add ledger…</option>
                    {(ledgers || []).filter((l) => !rows.some((r) => r.ledger_account_id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button onClick={addRow} disabled={!addId} className="px-3 py-2 bg-slate-700 text-white rounded-xl text-sm disabled:opacity-50">Add</button>
                <div className="flex-1" />
                <button onClick={save} disabled={!!saving} className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm disabled:opacity-50">{saving === 'save' ? 'Saving…' : 'Save draft'}</button>
                <button onClick={finalize} disabled={!balanced || !!saving} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">{saving === 'finalize' ? 'Posting…' : 'Finalise & post'}</button>
            </div>
        </div>
    );
}
