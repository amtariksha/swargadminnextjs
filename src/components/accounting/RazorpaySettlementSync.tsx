'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Landmark } from 'lucide-react';
import { POST } from '@/lib/api';
import { SettlementSyncResult } from '@/hooks/useAccounting';

const inputCls = 'px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm';
const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Book Razorpay settlements (the B2C money reaching the bank) for a period —
 * e.g. everything since the cutover. Each is booked from Razorpay's recon with
 * the commission, or corrected if it was booked without it. The webhook and a
 * nightly run do this on their own; this is the backfill.
 */
export default function RazorpaySettlementSync({ defaultFrom }: { defaultFrom?: string }) {
    const queryClient = useQueryClient();
    const [from, setFrom] = useState(defaultFrom || todayIst());
    const [to, setTo] = useState(todayIst());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<SettlementSyncResult | null>(null);

    const run = async () => {
        setBusy(true);
        try {
            const res = await POST<SettlementSyncResult>('/accounting/razorpay/settlements/sync', { from_date: from, to_date: to });
            setResult(res.data);
            toast.success(res.message || 'Settlements booked');
            queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-sync'] });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Fetch failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <Landmark className="w-4 h-4 text-slate-400" />
                <div className="text-sm text-white font-medium">Razorpay settlements (B2C receipts)</div>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} aria-label="From" />
                <span className="text-slate-500 text-sm">to</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} aria-label="To" />
                <button type="button" onClick={run} disabled={busy || !from || !to}
                    className="px-3 py-2 text-sm rounded-xl border bg-slate-800/50 text-slate-300 border-slate-700/50 disabled:opacity-40">
                    {busy ? 'Fetching…' : 'Fetch Razorpay settlements'}
                </button>
            </div>
            <p className="text-xs text-slate-500">
                Books each settlement with Razorpay&rsquo;s commission (from its recon); one booked without it is corrected —
                reversed and re-sent if it already reached Tally. Runs on its own nightly at 00:30; use this for past dates.
            </p>
            {result && (
                <div className="text-xs text-slate-300">
                    {result.fetched} found · {result.posted} booked · {result.revised} corrected · {result.unchanged} already right
                    {result.failed ? ` · ${result.failed} failed` : ''}
                    {result.without_recon ? ` · ${result.without_recon} without recon yet (fetch again tomorrow)` : ''}
                </div>
            )}
        </div>
    );
}
