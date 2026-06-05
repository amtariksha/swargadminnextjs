'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
    useTransactionDescriptions,
    useUpdateTransactionDescriptions,
    type TransactionDescription,
    type TransactionDescriptionType,
} from '@/hooks/useData';
import { inputClassName } from '@/components/FormField';
import { ApiError } from '@/lib/api-error';

const TYPE_OPTIONS: { value: TransactionDescriptionType; label: string }[] = [
    { value: 'credit', label: 'Credit' },
    { value: 'debit', label: 'Debit' },
    { value: 'both', label: 'Both' },
];

export default function TransactionDescriptionsPage() {
    const { data, isLoading } = useTransactionDescriptions(false);
    const updateMutation = useUpdateTransactionDescriptions();

    const [rows, setRows] = useState<TransactionDescription[]>([]);
    const [newLabel, setNewLabel] = useState('');
    const [newType, setNewType] = useState<TransactionDescriptionType>('credit');
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (data) {
            setRows(data);
            setDirty(false);
        }
    }, [data]);

    const duplicateLabels = useMemo(() => {
        const seen = new Set<string>();
        const dups = new Set<string>();
        for (const r of rows) {
            const key = r.label.trim().toLowerCase();
            if (key && seen.has(key)) dups.add(key);
            seen.add(key);
        }
        return dups;
    }, [rows]);

    const hasEmpty = rows.some((r) => !r.label.trim());
    const canSave = dirty && !hasEmpty && duplicateLabels.size === 0 && !updateMutation.isPending;

    const mutate = (next: TransactionDescription[]) => {
        setRows(next);
        setDirty(true);
    };

    const updateRow = (i: number, patch: Partial<TransactionDescription>) =>
        mutate(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    const removeRow = (i: number) => mutate(rows.filter((_, idx) => idx !== i));

    const moveRow = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= rows.length) return;
        const next = [...rows];
        [next[i], next[j]] = [next[j], next[i]];
        mutate(next);
    };

    const addRow = () => {
        const label = newLabel.trim();
        if (!label) return;
        mutate([...rows, { label, active: true, type: newType }]);
        setNewLabel('');
    };

    const handleSave = async () => {
        try {
            await updateMutation.mutateAsync(
                rows.map((r) => ({ label: r.label.trim(), active: r.active, type: r.type })),
            );
            toast.success('Transaction descriptions saved');
            setDirty(false);
        } catch (err) {
            const msg = err instanceof ApiError ? err.userMessage
                : err instanceof Error ? err.message : 'Failed to save';
            toast.error(msg);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Transaction Descriptions</h1>
                    <p className="text-slate-400">
                        Presets shown in the Add-Transaction Description dropdown. Type controls
                        which appear for Credit vs Debit.
                    </p>
                </div>
                <button onClick={handleSave} disabled={!canSave}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                    <Save className="w-4 h-4" /> {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="glass rounded-2xl p-4 md:p-6 space-y-3">
                {isLoading && <p className="text-sm text-slate-400">Loading…</p>}

                {!isLoading && rows.length === 0 && (
                    <p className="text-sm text-slate-500">No descriptions yet — add one below.</p>
                )}

                {rows.map((r, i) => {
                    const isDup = r.label.trim() !== '' &&
                        duplicateLabels.has(r.label.trim().toLowerCase());
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <div className="flex flex-col">
                                <button onClick={() => moveRow(i, -1)} disabled={i === 0}
                                    className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30">
                                    <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}
                                    className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30">
                                    <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <input
                                value={r.label}
                                onChange={(e) => updateRow(i, { label: e.target.value })}
                                placeholder="Description label"
                                className={`flex-1 ${inputClassName} ${isDup ? 'border-red-500/60' : ''}`}
                            />
                            <select
                                value={r.type}
                                onChange={(e) => updateRow(i, { type: e.target.value as TransactionDescriptionType })}
                                className={`${inputClassName} w-28`}
                            >
                                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button
                                onClick={() => updateRow(i, { active: !r.active })}
                                className={`px-3 py-2 rounded-xl text-xs font-medium border ${r.active
                                    ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                    : 'bg-slate-700/30 border-slate-600/50 text-slate-400'}`}
                            >
                                {r.active ? 'Active' : 'Inactive'}
                            </button>
                            <button onClick={() => removeRow(i)}
                                className="p-2 text-red-400 hover:bg-red-500/15 rounded-lg" title="Delete">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    );
                })}

                {duplicateLabels.size > 0 && (
                    <p className="text-xs text-red-400">Duplicate labels are not allowed.</p>
                )}
                {hasEmpty && (
                    <p className="text-xs text-red-400">Labels cannot be empty.</p>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50">
                    <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addRow(); }}
                        placeholder="Add a new description…"
                        className={`flex-1 ${inputClassName}`}
                    />
                    <select value={newType} onChange={(e) => setNewType(e.target.value as TransactionDescriptionType)}
                        className={`${inputClassName} w-28`}>
                        {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={addRow} disabled={!newLabel.trim()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm disabled:opacity-50">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
            </div>

            <p className="text-xs text-slate-500">
                Type = Credit shows only when adding a credit, Debit only for debits, Both always.
                Inactive descriptions are hidden from the dropdown but stay on past transactions.
            </p>
        </div>
    );
}
