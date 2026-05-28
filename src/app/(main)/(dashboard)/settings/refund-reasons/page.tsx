'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useRefundReasons, useUpdateRefundReasons, type RefundReason } from '@/hooks/useData';
import { inputClassName } from '@/components/FormField';
import { ApiError } from '@/lib/api-error';

export default function RefundReasonsPage() {
    const { data, isLoading } = useRefundReasons(false);
    const updateMutation = useUpdateRefundReasons();

    const [reasons, setReasons] = useState<RefundReason[]>([]);
    const [newLabel, setNewLabel] = useState('');
    const [dirty, setDirty] = useState(false);

    // Sync local editing copy whenever the server list changes.
    useEffect(() => {
        if (data) {
            setReasons(data);
            setDirty(false);
        }
    }, [data]);

    const duplicateLabels = useMemo(() => {
        const seen = new Set<string>();
        const dups = new Set<string>();
        for (const r of reasons) {
            const key = r.label.trim().toLowerCase();
            if (key && seen.has(key)) dups.add(key);
            seen.add(key);
        }
        return dups;
    }, [reasons]);

    const hasEmpty = reasons.some((r) => !r.label.trim());
    const canSave = dirty && !hasEmpty && duplicateLabels.size === 0 && !updateMutation.isPending;

    const mutate = (next: RefundReason[]) => {
        setReasons(next);
        setDirty(true);
    };

    const updateRow = (i: number, patch: Partial<RefundReason>) =>
        mutate(reasons.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    const removeRow = (i: number) => mutate(reasons.filter((_, idx) => idx !== i));

    const moveRow = (i: number, dir: -1 | 1) => {
        const j = i + dir;
        if (j < 0 || j >= reasons.length) return;
        const next = [...reasons];
        [next[i], next[j]] = [next[j], next[i]];
        mutate(next);
    };

    const addReason = () => {
        const label = newLabel.trim();
        if (!label) return;
        mutate([...reasons, { label, active: true }]);
        setNewLabel('');
    };

    const handleSave = async () => {
        try {
            await updateMutation.mutateAsync(
                reasons.map((r) => ({ label: r.label.trim(), active: r.active }))
            );
            toast.success('Refund reasons saved');
            setDirty(false);
        } catch (err) {
            const msg = err instanceof ApiError ? err.userMessage
                : err instanceof Error ? err.message : 'Failed to save refund reasons';
            toast.error(msg);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Refund Reasons</h1>
                    <p className="text-slate-400">The reason list shown in the refund popup</p>
                </div>
                <button onClick={handleSave} disabled={!canSave}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                    <Save className="w-4 h-4" /> {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="glass rounded-2xl p-4 md:p-6 space-y-3">
                {isLoading && <p className="text-sm text-slate-400">Loading…</p>}

                {!isLoading && reasons.length === 0 && (
                    <p className="text-sm text-slate-500">No refund reasons yet — add one below.</p>
                )}

                {reasons.map((r, i) => {
                    const isDup = r.label.trim() !== '' &&
                        duplicateLabels.has(r.label.trim().toLowerCase());
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <div className="flex flex-col">
                                <button onClick={() => moveRow(i, -1)} disabled={i === 0}
                                    className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30">
                                    <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => moveRow(i, 1)} disabled={i === reasons.length - 1}
                                    className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30">
                                    <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <input
                                value={r.label}
                                onChange={(e) => updateRow(i, { label: e.target.value })}
                                placeholder="Reason label"
                                className={`flex-1 ${inputClassName} ${isDup ? 'border-red-500/60' : ''}`}
                            />
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
                    <p className="text-xs text-red-400">Duplicate reason labels are not allowed.</p>
                )}
                {hasEmpty && (
                    <p className="text-xs text-red-400">Reason labels cannot be empty.</p>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/50">
                    <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addReason(); }}
                        placeholder="Add a new reason…"
                        className={`flex-1 ${inputClassName}`}
                    />
                    <button onClick={addReason} disabled={!newLabel.trim()}
                        className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm disabled:opacity-50">
                        <Plus className="w-4 h-4" /> Add
                    </button>
                </div>
            </div>

            <p className="text-xs text-slate-500">
                Inactive reasons stay on past refunds but are hidden from the refund popup.
                &quot;Other&quot; free-text is always available regardless of this list.
            </p>
        </div>
    );
}
