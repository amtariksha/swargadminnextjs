'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Save } from 'lucide-react';
import { PUT } from '@/lib/api';
import { TallyRateLedgerRow } from '@/hooks/useAccounting';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface TallyRateLedgersProps {
    rows: TallyRateLedgerRow[];
    /** Lower-cased Tally ledger names after "Check against Tally"; null = not checked. */
    tallyNames: Set<string> | null;
    datalistId: string;
    onSaved: () => void;
}

/**
 * GST rate → the Tally sales ledger its sales post to. The books keep one sales
 * ledger per rate (Tally works GST out from the ledger), so each Sales voucher
 * splits its taxable value across these. A blank rate stays on the default
 * sales ledger (System ledgers → Sales).
 */
export default function TallyRateLedgers({ rows, tallyNames, datalistId, onSaved }: TallyRateLedgersProps) {
    const saved = Object.fromEntries(rows.map((r) => [r.rate, r.tally_ledger_name || '']));
    const [values, setValues] = useState<Record<string, string>>(saved);
    const [saving, setSaving] = useState(false);
    const dirty = rows.some((r) => (values[r.rate] || '').trim() !== (r.tally_ledger_name || ''));

    const save = async () => {
        setSaving(true);
        try {
            const ledgers = Object.fromEntries(Object.entries(values).map(([rate, name]) => [rate, name.trim()]));
            await PUT('/accounting/tally/sales-rate-ledgers', { ledgers });
            toast.success('Sales ledgers by GST rate saved');
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-white font-medium">Sales ledger by GST rate <span className="text-slate-500 text-sm">({rows.length})</span></div>
                    <div className="text-xs text-slate-500">
                        Each sales voucher splits its value across these. Leave a rate blank to use the default Sales ledger.
                    </div>
                </div>
                {dirty && (
                    <button type="button" onClick={save} disabled={saving}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-sm disabled:opacity-50">
                        <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save rates'}
                    </button>
                )}
            </div>
            <div className="divide-y divide-slate-700/40">
                {rows.map((r) => {
                    const value = values[r.rate] || '';
                    return (
                        <div key={r.rate} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-3 items-center px-5 py-3">
                            <div className="text-sm text-white">{r.rate}% GST sales</div>
                            <input value={value} list={tallyNames ? datalistId : undefined} maxLength={180}
                                placeholder="Default Sales ledger" aria-label={`Tally sales ledger for ${r.rate}%`}
                                onChange={(e) => setValues((v) => ({ ...v, [r.rate]: e.target.value }))}
                                className={inputCls} />
                            <RateStatus name={value.trim()} tallyNames={tallyNames} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function RateStatus({ name, tallyNames }: { name: string; tallyNames: Set<string> | null }) {
    if (!tallyNames || !name) return <span className="text-xs text-slate-600 whitespace-nowrap">—</span>;
    return tallyNames.has(name.toLowerCase())
        ? <span className="flex items-center gap-1 text-xs text-emerald-400 whitespace-nowrap"><CheckCircle2 className="w-4 h-4" /> In Tally</span>
        : <span className="flex items-center gap-1 text-xs text-red-400 whitespace-nowrap"><XCircle className="w-4 h-4" /> Not in Tally</span>;
}
