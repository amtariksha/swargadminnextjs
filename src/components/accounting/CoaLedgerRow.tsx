'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Check, X } from 'lucide-react';
import { PUT } from '@/lib/api';
import { formatINR } from '@/lib/accounting';
import type { ChartLedger } from '@/hooks/useAccounting';

/**
 * One Chart-of-Accounts ledger line: name + balance, plus the Tally ledger it
 * posts to (ledger_account.tally_ledger_name) with an inline editor. Editable
 * on every ledger — system ledgers included — since it only changes the Tally
 * side, never the ledger itself.
 */
export default function CoaLedgerRow({ ledger }: { ledger: ChartLedger }) {
    const queryClient = useQueryClient();
    const tallyName = ledger.tally_ledger_name || ledger.name;
    const mapped = tallyName !== ledger.name;
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(tallyName);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        try {
            await PUT(`/accounting/gl/ledgers/${ledger.id}/tally-name`, { tally_ledger_name: value.trim() || null });
            toast.success('Tally ledger saved');
            setEditing(false);
            queryClient.invalidateQueries({ queryKey: ['accounting', 'chart'] });
            queryClient.invalidateQueries({ queryKey: ['accounting', 'tally-ledger-mapping'] });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => { setValue(tallyName); setEditing(false); };

    return (
        <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
            <div className="min-w-0 flex-1">
                <span className="text-slate-200">
                    {ledger.name}
                    {ledger.code && <span className="ml-2 text-xs text-slate-500">{ledger.code}</span>}
                </span>
                {editing ? (
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-slate-500 shrink-0">Tally:</span>
                        <input autoFocus value={value} maxLength={180} aria-label={`Tally ledger for ${ledger.name}`}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                            className="flex-1 min-w-0 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        <button onClick={save} disabled={saving} title="Save" className="p-1 text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
                            <Check className="w-4 h-4" />
                        </button>
                        <button onClick={cancel} title="Cancel" className="p-1 text-slate-400 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setEditing(true)} title="Set the Tally ledger this posts to"
                        className="group flex items-center gap-1 text-xs mt-0.5 text-left">
                        <span className={mapped ? 'text-purple-300' : 'text-slate-500'}>
                            Tally: {mapped ? tallyName : 'same name'}
                        </span>
                        <Pencil className="w-3 h-3 text-slate-600 group-hover:text-slate-300" />
                    </button>
                )}
            </div>
            <span className="text-slate-300 whitespace-nowrap">
                {formatINR(ledger.balance)} <span className="text-slate-500">{ledger.balance_type}</span>
            </span>
        </div>
    );
}
