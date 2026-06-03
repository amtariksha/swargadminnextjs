'use client';

import { useCallback, useEffect, useState } from 'react';
import { GET, POST, DELETE } from '@/lib/api';
import { QualityParam } from '@/hooks/useInventory';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50';

const blankRow = { name: '', unit: '', value_type: 'numeric', min_value: '', max_value: '' };

interface QualityParamsEditorProps {
    rawMaterialId: number;
}

/**
 * Manage the QC parameter definitions for a raw material (e.g. milk → fat %,
 * SNF, CLR, temperature). These rows drive the collection-driver OCR quality
 * prompt and the readings captured against each purchase.
 */
export default function QualityParamsEditor({ rawMaterialId }: QualityParamsEditorProps) {
    const [params, setParams] = useState<QualityParam[]>([]);
    const [loading, setLoading] = useState(false);
    const [row, setRow] = useState(blankRow);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await GET<QualityParam[]>(`/inventory/raw-materials/${rawMaterialId}/quality-params`);
            setParams(res.data || []);
        } catch {
            /* surfaced on add/delete instead */
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
                min_value: row.min_value === '' ? null : Number(row.min_value),
                max_value: row.max_value === '' ? null : Number(row.max_value),
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

    const remove = async (id: number) => {
        try {
            await DELETE(`/inventory/quality-params/${id}`);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to remove parameter');
        }
    };

    return (
        <div className="border border-slate-700/50 rounded-xl p-3 space-y-3">
            <p className="text-sm font-medium text-slate-300">Quality Parameters</p>
            <p className="text-xs text-slate-500">
                Define the QC values captured at collection (e.g. fat %, SNF, temperature). These
                drive the driver-app OCR and the readings stored against each purchase.
            </p>

            {loading ? (
                <p className="text-xs text-slate-500">Loading…</p>
            ) : params.length === 0 ? (
                <p className="text-xs text-slate-500">No parameters yet.</p>
            ) : (
                <ul className="space-y-1">
                    {params.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-1.5">
                            <span className="font-medium">{p.name}</span>
                            {p.unit ? <span className="text-slate-500">({p.unit})</span> : null}
                            <span className="text-xs text-slate-500">
                                {p.value_type}
                                {p.min_value != null || p.max_value != null
                                    ? ` · ${p.min_value ?? '—'}–${p.max_value ?? '—'}`
                                    : ''}
                            </span>
                            <button type="button" onClick={() => remove(p.id)}
                                className="ml-auto p-1 hover:bg-slate-700/50 rounded" title="Remove">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <input type="text" placeholder="Name *" value={row.name}
                    onChange={(e) => setRow({ ...row, name: e.target.value })} className={inputCls} />
                <input type="text" placeholder="Unit" value={row.unit}
                    onChange={(e) => setRow({ ...row, unit: e.target.value })} className={inputCls} />
                <select value={row.value_type}
                    onChange={(e) => setRow({ ...row, value_type: e.target.value })} className={inputCls}>
                    <option value="numeric">numeric</option>
                    <option value="text">text</option>
                </select>
                <input type="number" step="any" placeholder="Min" value={row.min_value}
                    onChange={(e) => setRow({ ...row, min_value: e.target.value })} className={inputCls} />
                <input type="number" step="any" placeholder="Max" value={row.max_value}
                    onChange={(e) => setRow({ ...row, max_value: e.target.value })} className={inputCls} />
            </div>
            <button type="button" onClick={add} disabled={saving || !row.name.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm disabled:opacity-50">
                <Plus className="w-4 h-4" /> Add Parameter
            </button>
        </div>
    );
}
