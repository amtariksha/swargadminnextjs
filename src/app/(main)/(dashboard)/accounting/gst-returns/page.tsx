'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { GET, POST } from '@/lib/api';
import { useGstReturns } from '@/hooks/useAccounting';
import { formatINR, formatDateTime, RETURN_TYPE_LABELS, currentPeriod } from '@/lib/accounting';

export default function GstReturnsPage() {
    const { data, isLoading, refetch } = useGstReturns();
    const [period, setPeriod] = useState(currentPeriod());
    const [busy, setBusy] = useState('');

    const generate = async (which: 'gstr1' | 'gstr3b') => {
        setBusy(which);
        try {
            await POST(`/accounting/gst/${which}/generate`, { period });
            toast.success(`${which.toUpperCase()} generated for ${period}`);
            refetch();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Generation failed');
        } finally { setBusy(''); }
    };

    const download = async (id: number, type: number, periodKey: string) => {
        try {
            const res = await GET<{ sections?: unknown }>(`/accounting/gst/returns/${id}`);
            const payload = (res.data as { sections?: unknown })?.sections ?? res.data;
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${RETURN_TYPE_LABELS[type] || 'return'}-${periodKey}.json`; a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Download failed');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">GST Returns</h1>
                <p className="text-slate-400">Generate GSTR-1 &amp; GSTR-3B portal JSON, natively (no Tally)</p>
            </div>

            <div className="glass rounded-2xl p-4 flex flex-wrap items-end gap-3">
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Period (YYYY-MM)</label>
                    <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-05"
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm" />
                </div>
                <button disabled={busy === 'gstr1'} onClick={() => generate('gstr1')}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">
                    {busy === 'gstr1' ? 'Generating…' : 'Generate GSTR-1'}
                </button>
                <button disabled={busy === 'gstr3b'} onClick={() => generate('gstr3b')}
                    className="px-4 py-2 bg-gradient-to-r from-sky-500 to-cyan-500 text-white rounded-xl text-sm disabled:opacity-50">
                    {busy === 'gstr3b' ? 'Generating…' : 'Generate GSTR-3B'}
                </button>
            </div>

            {isLoading ? <div className="text-slate-400">Loading…</div> : (
                <div className="glass rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-800/50 text-slate-400">
                            <tr>
                                <th className="text-left p-3">Return</th><th className="text-left p-3">Period</th>
                                <th className="text-right p-3">Taxable</th><th className="text-right p-3">Tax</th>
                                <th className="text-right p-3">Invoices</th><th className="text-left p-3">Generated</th>
                                <th className="text-right p-3">JSON</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/40">
                            {(data || []).map((r) => (
                                <tr key={r.id} className="hover:bg-slate-800/30">
                                    <td className="p-3 text-slate-200">{RETURN_TYPE_LABELS[r.return_type] || r.return_type}</td>
                                    <td className="p-3 text-slate-300">{r.period_key}</td>
                                    <td className="p-3 text-right text-slate-300">{formatINR(r.total_taxable)}</td>
                                    <td className="p-3 text-right text-slate-300">{formatINR(r.total_tax)}</td>
                                    <td className="p-3 text-right text-slate-400">{r.invoice_count}</td>
                                    <td className="p-3 text-xs text-slate-500">{formatDateTime(r.generated_at)}</td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => download(r.id, r.return_type, r.period_key)} className="text-xs text-purple-300">Download</button>
                                    </td>
                                </tr>
                            ))}
                            {!data?.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No returns generated yet.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
