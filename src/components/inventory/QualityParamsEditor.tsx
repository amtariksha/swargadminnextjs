'use client';

import { useCallback, useEffect, useState } from 'react';
import { GET, POST, PUT, DELETE } from '@/lib/api';
import { QualityParam } from '@/hooks/useInventory';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

const blankRow = { name: '', unit: '', value_type: 'numeric', min_value: '', max_value: '', warn_min: '', warn_max: '' };

type ThresholdForm = { min_value: string; max_value: string; warn_min: string; warn_max: string };

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
const asStr = (v: number | string | null | undefined) => (v == null ? '' : String(v));

interface QualityParamsEditorProps {
    rawMaterialId: number;
}

/**
 * Manage the QC parameter definitions for a raw material (e.g. milk → fat %,
 * SNF, CLR, temperature). These rows drive the collection-driver OCR quality
 * prompt, the readings captured against each purchase, and the green/amber/red
 * bands on the Accounting → Purchases review list.
 *
 * Two threshold pairs, and the difference matters:
 *   Min/Max     the hard spec — outside it a reading renders RED
 *   Target      the inner band — inside it renders GREEN, between the two AMBER
 *
 * Existing rows are editable inline because the milk params ship pre-seeded
 * (migrations 056 + 109): retuning a band must not mean deleting a parameter
 * that already has readings pointing at it.
 */
export default function QualityParamsEditor({ rawMaterialId }: QualityParamsEditorProps) {
    const [params, setParams] = useState<QualityParam[]>([]);
    const [loading, setLoading] = useState(false);
    const [row, setRow] = useState(blankRow);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<ThresholdForm>({ min_value: '', max_value: '', warn_min: '', warn_max: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await GET<QualityParam[]>(`/inventory/raw-materials/${rawMaterialId}/quality-params`);
            setParams(res.data || []);
        } catch {
            /* surfaced on add/edit/delete instead */
        } finally {
            setLoading(false);
        }
    }, [rawMaterialId]);

    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!row.name.trim()) return;
        setSaving(true);
        try {
            await POST(`/inventory/raw-materials/${rawMaterialId}/quality-params`, {
                name: row.name.trim(),
                unit: row.unit || null,
                value_type: row.value_type,
                min_value: numOrNull(row.min_value),
                max_value: numOrNull(row.max_value),
                warn_min: numOrNull(row.warn_min),
                warn_max: numOrNull(row.warn_max),
                sort_order: params.length,
            });
            setRow(blankRow);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to add parameter');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (p: QualityParam) => {
        setEditingId(p.id);
        setEditForm({
            min_value: asStr(p.min_value), max_value: asStr(p.max_value),
            warn_min: asStr(p.warn_min), warn_max: asStr(p.warn_max),
        });
    };

    const saveEdit = async (id: number) => {
        setSaving(true);
        try {
            await PUT(`/inventory/quality-params/${id}`, {
                min_value: numOrNull(editForm.min_value),
                max_value: numOrNull(editForm.max_value),
                warn_min: numOrNull(editForm.warn_min),
                warn_max: numOrNull(editForm.warn_max),
            });
            setEditingId(null);
            await load();
        } catch (e) {
            // The API rejects a broken ladder (min <= target min <= target max <= max)
            // — keep the row open so the operator can correct it in place.
            toast.error(e instanceof Error ? e.message : 'Failed to save thresholds');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: number) => {
        try {
            await DELETE(`/inventory/quality-params/${id}`);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to remove parameter');
        }
    };

    const rangeLabel = (lo: unknown, hi: unknown) =>
        lo != null || hi != null ? `${lo ?? '—'}–${hi ?? '—'}` : null;

    return (
        <div className="border border-slate-700/50 rounded-xl p-3 space-y-3">
            <p className="text-sm font-medium text-slate-300">Quality Parameters</p>
            <p className="text-xs text-slate-500">
                Define the QC values captured at collection (e.g. fat %, SNF, temperature). These
                drive the driver-app OCR and the readings stored against each purchase.
                <span className="block mt-1">
                    <span className="text-slate-400">Min/Max</span> is the hard spec — outside it a reading shows
                    <span className="text-red-400"> red</span>. <span className="text-slate-400">Target</span> is the
                    inner band — inside it shows <span className="text-green-400">green</span>, in between
                    <span className="text-amber-400"> amber</span>.
                </span>
            </p>

            {loading ? (
                <p className="text-xs text-slate-500">Loading…</p>
            ) : params.length === 0 ? (
                <p className="text-xs text-slate-500">No parameters yet.</p>
            ) : (
                <ul className="space-y-1">
                    {params.map((p) => (
                        <li key={p.id} className="bg-slate-800/40 rounded-lg px-3 py-1.5 text-sm text-slate-300">
                            {editingId === p.id ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{p.name}</span>
                                        {p.unit ? <span className="text-slate-500">({p.unit})</span> : null}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {([
                                            ['min_value', 'Min'], ['warn_min', 'Target min'],
                                            ['warn_max', 'Target max'], ['max_value', 'Max'],
                                        ] as [keyof ThresholdForm, string][]).map(([field, label]) => (
                                            <input key={field} type="number" step="any" placeholder={label}
                                                aria-label={`${p.name} ${label}`} value={editForm[field]}
                                                onChange={(e) => setEditForm({ ...editForm, [field]: e.target.value })}
                                                className={inputCls} />
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => saveEdit(p.id)} disabled={saving}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs disabled:opacity-50">
                                            <Check className="w-3.5 h-3.5" /> Save
                                        </button>
                                        <button type="button" onClick={() => setEditingId(null)}
                                            className="flex items-center gap-1.5 px-3 py-1 text-slate-400 hover:text-slate-200 text-xs">
                                            <X className="w-3.5 h-3.5" /> Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{p.name}</span>
                                    {p.unit ? <span className="text-slate-500">({p.unit})</span> : null}
                                    <span className="text-xs text-slate-500">
                                        {p.value_type}
                                        {rangeLabel(p.min_value, p.max_value) ? ` · spec ${rangeLabel(p.min_value, p.max_value)}` : ''}
                                        {rangeLabel(p.warn_min, p.warn_max) ? ` · target ${rangeLabel(p.warn_min, p.warn_max)}` : ''}
                                    </span>
                                    <button type="button" onClick={() => startEdit(p)}
                                        className="ml-auto p-1 hover:bg-slate-700/50 rounded" title="Edit thresholds">
                                        <Pencil className="w-3.5 h-3.5 text-purple-400" />
                                    </button>
                                    <button type="button" onClick={() => remove(p.id)}
                                        className="p-1 hover:bg-slate-700/50 rounded" title="Remove">
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <input type="text" placeholder="Name *" value={row.name}
                    onChange={(e) => setRow({ ...row, name: e.target.value })} className={inputCls} />
                <input type="text" placeholder="Unit" value={row.unit}
                    onChange={(e) => setRow({ ...row, unit: e.target.value })} className={inputCls} />
                <select value={row.value_type} aria-label="Value type"
                    onChange={(e) => setRow({ ...row, value_type: e.target.value })} className={inputCls}>
                    <option value="numeric">numeric</option>
                    <option value="text">text</option>
                </select>
                <input type="number" step="any" placeholder="Min" aria-label="Min" value={row.min_value}
                    onChange={(e) => setRow({ ...row, min_value: e.target.value })} className={inputCls} />
                <input type="number" step="any" placeholder="Target min" aria-label="Target min" value={row.warn_min}
                    onChange={(e) => setRow({ ...row, warn_min: e.target.value })} className={inputCls} />
                <input type="number" step="any" placeholder="Target max" aria-label="Target max" value={row.warn_max}
                    onChange={(e) => setRow({ ...row, warn_max: e.target.value })} className={inputCls} />
                <input type="number" step="any" placeholder="Max" aria-label="Max" value={row.max_value}
                    onChange={(e) => setRow({ ...row, max_value: e.target.value })} className={inputCls} />
            </div>
            <button type="button" onClick={add} disabled={saving || !row.name.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm disabled:opacity-50">
                <Plus className="w-4 h-4" /> Add Parameter
            </button>
        </div>
    );
}
