'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { POST } from '@/lib/api';
import { useTallyReconcile, useTallyImportRuns } from '@/hooks/useAccounting';
import { formatINR, formatDateTime } from '@/lib/accounting';

const RUN_TYPE: Record<number, string> = { 1: 'Day Book', 2: 'Trial Balance' };
const RUN_BADGE: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-300',
    running: 'bg-sky-500/15 text-sky-300',
    failed: 'bg-rose-500/15 text-rose-300',
};

export default function ReconcilePage() {
    const { data: recon, isLoading, refetch } = useTallyReconcile();
    const { data: runs, refetch: refetchRuns } = useTallyImportRuns();
    const [busy, setBusy] = useState('');

    const run = async (label: string, path: string, body: Record<string, unknown>) => {
        setBusy(label);
        try {
            const r = await POST<{ skipped?: boolean }>(path, body);
            if ((r.data as { skipped?: boolean })?.skipped) toast('Tally import is disabled — flip tally_import_enabled once the bridge is verified');
            else toast.success(`${label} complete`);
            refetch(); refetchRuns();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Request failed');
        } finally { setBusy(''); }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Tally Reconciliation</h1>
                <p className="text-slate-400">Pull from Tally and diff Swarg&apos;s trial balance against it</p>
            </div>

            <div className="glass rounded-2xl p-4 flex flex-wrap gap-3">
                <button disabled={!!busy} onClick={() => run('Seed import', '/accounting/tally/import', { mode: 'seed' })}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">
                    Pull Day Book (seed)
                </button>
                <button disabled={!!busy} onClick={() => run('Sync import', '/accounting/tally/import', { mode: 'sync' })}
                    className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm disabled:opacity-50">
                    Pull CA edits (sync)
                </button>
                <button disabled={!!busy} onClick={() => run('Trial balance snapshot', '/accounting/tally/trial-balance-snapshot', {})}
                    className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm disabled:opacity-50">
                    Snapshot Trial Balance
                </button>
                {busy && <span className="text-sm text-slate-400 self-center">{busy}…</span>}
            </div>

            <div className="glass rounded-2xl overflow-hidden">
                <div className="bg-slate-800/50 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">Swarg vs Tally (as on {recon?.as_on || 'today'})</span>
                    {recon && (
                        <span className={`text-xs px-2 py-1 rounded-lg ${recon.matched ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                            {!recon.has_tally_snapshot ? 'No Tally snapshot yet' : recon.matched ? 'Reconciled' : `${recon.mismatches.length} mismatch(es)`}
                        </span>
                    )}
                </div>
                {isLoading ? <div className="p-4 text-slate-400">Loading…</div> : (
                    <table className="w-full text-sm">
                        <thead className="text-slate-400"><tr>
                            <th className="text-left p-3">Ledger</th><th className="text-right p-3">Swarg</th>
                            <th className="text-right p-3">Tally</th><th className="text-right p-3">Diff</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {(recon?.rows || []).map((r, i) => (
                                <tr key={i} className={Math.abs(r.diff) > 0.01 ? 'bg-rose-500/5' : ''}>
                                    <td className="p-3 text-slate-200">{r.ledgerName}</td>
                                    <td className="p-3 text-right text-slate-300">{formatINR(r.swarg)}</td>
                                    <td className="p-3 text-right text-slate-300">{formatINR(r.tally)}</td>
                                    <td className={`p-3 text-right ${Math.abs(r.diff) > 0.01 ? 'text-rose-300 font-medium' : 'text-slate-500'}`}>{formatINR(r.diff)}</td>
                                </tr>
                            ))}
                            {!recon?.rows?.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nothing to reconcile yet.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="glass rounded-2xl overflow-hidden">
                <div className="bg-slate-800/50 px-4 py-2 text-sm font-semibold text-white">Import runs</div>
                <table className="w-full text-sm">
                    <thead className="text-slate-400"><tr>
                        <th className="text-left p-3">Type</th><th className="text-left p-3">Range</th>
                        <th className="text-left p-3">Status</th><th className="text-right p-3">Seen</th>
                        <th className="text-right p-3">Imported</th><th className="text-left p-3">When</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {(runs || []).map((r, i) => {
                            const row = r as Record<string, string | number>;
                            return (
                                <tr key={i}>
                                    <td className="p-3 text-slate-200">{RUN_TYPE[Number(row.run_type)] || row.run_type}</td>
                                    <td className="p-3 text-slate-400 text-xs">{row.from_date || row.as_of_date || '—'}{row.to_date ? ` → ${row.to_date}` : ''}</td>
                                    <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-lg ${RUN_BADGE[String(row.status)] || 'bg-slate-700/50 text-slate-300'}`}>{row.status}</span></td>
                                    <td className="p-3 text-right text-slate-400">{row.vouchers_seen ?? 0}</td>
                                    <td className="p-3 text-right text-slate-400">{row.vouchers_imported ?? 0}</td>
                                    <td className="p-3 text-xs text-slate-500">{formatDateTime(String(row.created_at))}</td>
                                </tr>
                            );
                        })}
                        {!runs?.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No import runs yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
