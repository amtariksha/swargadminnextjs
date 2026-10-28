'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SearchCheck } from 'lucide-react';
import { GET, POST } from '@/lib/api';
import { formatDate } from '@/lib/accounting';

const inputCls = 'px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm';
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface DuplicateBill {
    record_id: number;
    status: string;
    invoice_number: string;
    date: string;
    customer: string | null;
    party: string;
    total: number;
    in_tally: { voucher_number: string | null; voucher_type: string | null; amount: number; same_amount: boolean } | null;
}

interface DuplicateCheck {
    from: string;
    to: string;
    company: string | null;
    tally_error: string | null;
    bills: DuplicateBill[];
    duplicates: number;
}

/**
 * Before Swarg's shop bills post to a company that was kept by hand: read its
 * Day Book and list the bills Tally already has (same party, same day), so
 * they can be skipped instead of booked twice.
 */
export default function TallyDuplicateCheck({ defaultFrom, defaultCompany }: { defaultFrom?: string; defaultCompany?: string }) {
    const queryClient = useQueryClient();
    const [from, setFrom] = useState(defaultFrom || todayIst());
    const [to, setTo] = useState(todayIst());
    const [company, setCompany] = useState(defaultCompany || '');
    const [busy, setBusy] = useState<'check' | 'skip' | null>(null);
    const [result, setResult] = useState<DuplicateCheck | null>(null);
    const [picked, setPicked] = useState<Set<number>>(new Set());

    const check = async () => {
        setBusy('check');
        try {
            const res = await GET<DuplicateCheck>('/accounting/tally/sync-records/duplicates', {
                from, to, ...(company.trim() ? { company: company.trim() } : {}),
            });
            setResult(res.data);
            const skippable = res.data.bills.filter((b) => b.in_tally && b.status !== 'confirmed');
            setPicked(new Set(skippable.map((b) => b.record_id)));
            if (res.data.tally_error) toast.error(res.data.tally_error);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Check failed');
        } finally {
            setBusy(null);
        }
    };

    const skipPicked = async () => {
        if (!picked.size) return;
        if (!window.confirm(`Skip ${picked.size} bill(s)? They stay in Swarg but are never sent to Tally.`)) return;
        setBusy('skip');
        try {
            const res = await POST<{ skipped: number }>('/accounting/tally/sync-records/skip-pending', {
                ids: [...picked], reason: `Already in Tally (${result?.company || 'entered by hand'})`,
            });
            toast.success(`${res.data?.skipped ?? 0} skipped`);
            queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-sync'] });
            await check();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Skip failed');
        } finally {
            setBusy(null);
        }
    };

    const toggle = (id: number) => setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const found = result?.bills.filter((b) => b.in_tally) || [];

    return (
        <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <SearchCheck className="w-4 h-4 text-slate-400" />
                <div className="text-sm text-white font-medium">Check bills against Tally</div>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label="From" />
                <span className="text-slate-500 text-sm">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label="To" />
                <input value={company} onChange={(e) => setCompany(e.target.value)} className={`${inputCls} w-56`}
                    placeholder="Company (blank = configured)" aria-label="Tally company" />
                <button type="button" onClick={check} disabled={busy !== null || !from || !to}
                    className="px-3 py-2 text-sm rounded-xl border bg-slate-800/50 text-slate-300 border-slate-700/50 disabled:opacity-40">
                    {busy === 'check' ? 'Reading Tally…' : 'Check'}
                </button>
            </div>
            <p className="text-xs text-slate-500">
                Reads the company&rsquo;s Day Book (nothing is written to Tally) and lists Swarg&rsquo;s shop bills that already
                have a hand-entered Sales voucher for the same party on the same day. Name the live company here to check it
                while posting still goes to the test copy.
            </p>
            {result && !result.tally_error && (
                <div className="space-y-2">
                    <div className="text-xs text-slate-300">
                        {result.company}: {result.bills.length} shop bill(s) from {formatDate(result.from)} to {formatDate(result.to)} ·{' '}
                        <span className={result.duplicates ? 'text-amber-300' : 'text-emerald-300'}>
                            {result.duplicates ? `${result.duplicates} already in Tally` : 'none already in Tally'}
                        </span>
                    </div>
                    {found.length > 0 && (
                        <>
                            <div className="max-h-80 overflow-auto rounded-lg border border-slate-700/50">
                                <table className="w-full text-xs">
                                    <thead className="text-slate-400 bg-slate-800/50">
                                        <tr>
                                            <th className="p-2" />
                                            <th className="p-2 text-left">Date</th>
                                            <th className="p-2 text-left">Party</th>
                                            <th className="p-2 text-left">Swarg bill</th>
                                            <th className="p-2 text-right">Swarg</th>
                                            <th className="p-2 text-left">Tally voucher</th>
                                            <th className="p-2 text-right">Tally</th>
                                            <th className="p-2 text-left">Queue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-300">
                                        {found.map((b) => {
                                            const confirmed = b.status === 'confirmed';
                                            return (
                                                <tr key={b.record_id} className="border-t border-slate-800">
                                                    <td className="p-2">
                                                        <input type="checkbox" disabled={confirmed} checked={picked.has(b.record_id)}
                                                            onChange={() => toggle(b.record_id)} aria-label={`Skip ${b.invoice_number}`} />
                                                    </td>
                                                    <td className="p-2">{formatDate(b.date)}</td>
                                                    <td className="p-2">{b.party}</td>
                                                    <td className="p-2 font-mono">{b.invoice_number}</td>
                                                    <td className="p-2 text-right">{rupees(b.total)}</td>
                                                    <td className="p-2">{b.in_tally?.voucher_type} {b.in_tally?.voucher_number || ''}</td>
                                                    <td className={`p-2 text-right ${b.in_tally?.same_amount ? '' : 'text-amber-300'}`}
                                                        title={b.in_tally?.same_amount ? undefined : 'Different amount — check before skipping'}>
                                                        {rupees(b.in_tally?.amount ?? 0)}
                                                    </td>
                                                    <td className="p-2">{confirmed ? 'already sent' : b.status}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" onClick={skipPicked} disabled={busy !== null || !picked.size}
                                className="px-3 py-2 text-sm rounded-xl border bg-amber-500/10 text-amber-300 border-amber-500/30 disabled:opacity-40">
                                {busy === 'skip' ? 'Skipping…' : `Skip ${picked.size} — don't send to Tally`}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
