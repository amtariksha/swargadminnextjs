'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Printer, Scale, Save } from 'lucide-react';
import { PUT } from '@/lib/api';
import { formatINR } from '@/lib/accounting';
import { usePulseShopOutstanding, ShopOutstandingRow } from '@/hooks/usePulse';
import { PulseSection } from './shared';
import { ddmmyyyy, shopOutstandingCsv, downloadCsv, printShopOutstanding } from './shopOutstandingExport';

/** IST calendar date — the server clock is not IST. */
const istToday = (): string => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const amountCls = (n: number) => (n < 0 ? 'text-emerald-300' : n > 0 ? 'text-white' : 'text-slate-500');

/**
 * Shop Outstanding as of a date — the operator's weekly sheet (S.No / Shop /
 * amount / Total), read from the AR ledger. Reconcile mode carries in dues
 * from the books: type a shop's figure per your sheet and the backend books
 * the difference as a "Balance brought forward", so that date matches exactly.
 */
export function ShopOutstandingSection() {
    const [asOf, setAsOf] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'name' | 'amount'>('name');
    const [reconcile, setReconcile] = useState(false);
    const { data, isLoading } = usePulseShopOutstanding(asOf);
    const date = asOf ?? data?.as_of ?? '';

    // Re-number in the displayed order, like the sheet.
    const rows = useMemo(() => {
        const list = [...(data?.rows ?? [])];
        if (sortBy === 'amount') list.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
        return list.map((r, i) => ({ ...r, s_no: i + 1 }));
    }, [data, sortBy]);
    const total = data?.total ?? 0;

    const actions = (
        <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={date} max={istToday()} aria-label="Outstanding as of"
                onChange={(e) => e.target.value && setAsOf(e.target.value)}
                className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white" />
            <div className="flex gap-1">
                {(['name', 'amount'] as const).map((s) => (
                    <button key={s} onClick={() => setSortBy(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs ${sortBy === s
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
                        {s === 'name' ? 'A–Z' : 'Highest first'}
                    </button>
                ))}
            </div>
            <button onClick={() => setReconcile((v) => !v)} title="Match shops to your books"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ${reconcile
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}>
                <Scale className="w-3.5 h-3.5" /> Reconcile
            </button>
            <button disabled={!rows.length} title="Download CSV"
                onClick={() => downloadCsv(`shop-outstanding-${date}.csv`, shopOutstandingCsv(rows, total, date))}
                className="p-1.5 rounded-lg bg-slate-800/50 text-slate-300 hover:text-white disabled:opacity-40">
                <Download className="w-4 h-4" />
            </button>
            <button disabled={!rows.length} title="Print / save as PDF"
                onClick={() => printShopOutstanding(rows, total, date)}
                className="p-1.5 rounded-lg bg-slate-800/50 text-slate-300 hover:text-white disabled:opacity-40">
                <Printer className="w-4 h-4" />
            </button>
        </div>
    );

    return (
        <PulseSection
            title={`Shop Outstanding${date ? ` — as of ${ddmmyyyy(date)}` : ''}`}
            subtitle="What each B2B shop owes at the end of the chosen day (default: last Sunday) — post this before Tuesday's payment follow-up."
            isLoading={isLoading}
            isEmpty={rows.length === 0}
            emptyText="No B2B shops yet. Mark a customer as a B2B shop (Users → edit → B2B shop) and their outstanding appears here."
            actions={actions}
        >
            {reconcile && (
                <p className="text-sm text-slate-400 rounded-xl bg-purple-500/10 border border-purple-500/20 px-4 py-3">
                    Type each shop&rsquo;s outstanding <span className="text-slate-200">per your books as of {ddmmyyyy(date)}</span> and
                    save. Swarg books the difference from its own ledger as a &ldquo;Balance brought forward&rdquo;, so this date
                    then matches your sheet exactly. Re-saving replaces it. It does not touch Tally.
                </p>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-800/50 text-slate-400">
                        <tr>
                            <th className="text-center p-3 w-14">S.No</th>
                            <th className="text-left p-3">Shop Name</th>
                            <th className="text-right p-3">{date ? ddmmyyyy(date) : 'Outstanding'}</th>
                            {reconcile && <>
                                <th className="text-right p-3">Swarg ledger</th>
                                <th className="text-right p-3">Brought forward</th>
                                <th className="text-left p-3">Per your books</th>
                            </>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {rows.map((r) => (
                            <tr key={r.user_id} className="hover:bg-slate-800/30">
                                <td className="text-center p-3 text-slate-400">{r.s_no}</td>
                                <td className="p-3 text-slate-200">
                                    {r.name}
                                    {!r.is_shop && <span className="ml-2 text-[10px] text-slate-500">B2B billing</span>}
                                </td>
                                <td className={`p-3 text-right font-medium ${amountCls(r.balance)}`}>{formatINR(r.balance)}</td>
                                {reconcile && <ReconcileCells row={r} asOf={date} />}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-800/50">
                        <tr>
                            <td />
                            <td className="p-3 text-right font-semibold text-slate-300">Total Outstanding</td>
                            <td className="p-3 text-right font-bold text-white">{formatINR(total)}</td>
                            {reconcile && <td colSpan={3} />}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </PulseSection>
    );
}

/** Swarg vs books for one shop, and the save that books the difference. */
function ReconcileCells({ row, asOf }: { row: ShopOutstandingRow; asOf: string }) {
    const queryClient = useQueryClient();
    const [books, setBooks] = useState('');
    const [saving, setSaving] = useState(false);

    const save = async () => {
        const balance = Number(books);
        if (books.trim() === '' || !Number.isFinite(balance)) {
            toast.error('Enter the amount from your books (use a minus sign if the shop is in credit).');
            return;
        }
        setSaving(true);
        try {
            const res = await PUT<{ opening: number }>(`/accounting/customers/${row.user_id}/opening-balance`, { as_of: asOf, balance });
            const opening = Number(res.data?.opening ?? 0);
            toast.success(opening === 0
                ? `${row.name}: Swarg already matches your books`
                : `${row.name}: brought forward ${formatINR(opening)}`);
            setBooks('');
            queryClient.invalidateQueries({ queryKey: ['pulse', 'shop-outstanding'] });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <td className="p-3 text-right text-slate-400">{formatINR(row.ledger_balance)}</td>
            <td className="p-3 text-right text-slate-400" title={row.opening_date ? `Booked on ${ddmmyyyy(row.opening_date)}` : undefined}>
                {row.opening ? formatINR(row.opening) : '—'}
            </td>
            <td className="p-3">
                <div className="flex items-center gap-1.5">
                    <input type="number" step="0.01" value={books} placeholder={String(row.balance)}
                        aria-label={`${row.name} outstanding per your books`}
                        onChange={(e) => setBooks(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                        className="w-32 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-right text-white text-sm" />
                    <button onClick={save} disabled={saving || books.trim() === ''} title="Save"
                        className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 disabled:opacity-40">
                        <Save className="w-4 h-4" />
                    </button>
                </div>
            </td>
        </>
    );
}
