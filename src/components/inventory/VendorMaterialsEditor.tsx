'use client';

import { useCallback, useEffect, useState } from 'react';
import { GET, POST, PUT, DELETE } from '@/lib/api';
import { useRawMaterials } from '@/hooks/useInventory';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface VendorMaterial {
    id: number;
    raw_material_id: number;
    raw_material_name: string;
    raw_material_unit: string;
    default_unit_price?: number | string | null;
    pricing_mode?: 'fixed' | 'per_fat' | null;
    fat_rate?: number | string | null;
}

interface VendorMaterialsEditorProps {
    vendorId: number;
}

/**
 * Manage which raw materials a vendor supplies (with a default price). This is a
 * suggestion list — the collection driver sees these first but may still pick
 * any active raw material ("default + override").
 *
 * Pricing: 'fixed' uses the default price as-is; 'per fat' makes the bill review
 * suggest unit_price = fat reading × fat rate (milk procurement — vendors are
 * paid by fat content). The suggestion is applied by the accountant at review.
 */
export default function VendorMaterialsEditor({ vendorId }: VendorMaterialsEditorProps) {
    const { data: materials = [] } = useRawMaterials();
    const [links, setLinks] = useState<VendorMaterial[]>([]);
    const [loading, setLoading] = useState(false);
    const [rawMaterialId, setRawMaterialId] = useState('');
    const [price, setPrice] = useState('');
    const [pricingMode, setPricingMode] = useState<'fixed' | 'per_fat'>('fixed');
    const [fatRate, setFatRate] = useState('');
    const [saving, setSaving] = useState(false);
    // Inline edit of an existing link's pricing (rate cards change over time).
    const [editId, setEditId] = useState<number | null>(null);
    const [editPrice, setEditPrice] = useState('');
    const [editMode, setEditMode] = useState<'fixed' | 'per_fat'>('fixed');
    const [editFatRate, setEditFatRate] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await GET<VendorMaterial[]>(`/inventory/vendors/${vendorId}/materials`);
            setLinks(res.data || []);
        } catch {
            /* surfaced on add/delete instead */
        } finally {
            setLoading(false);
        }
    }, [vendorId]);

    useEffect(() => { load(); }, [load]);

    const linkedIds = new Set(links.map((l) => l.raw_material_id));
    const available = materials.filter((m) => m.is_active && !linkedIds.has(m.id));

    const add = async () => {
        if (!rawMaterialId) return;
        setSaving(true);
        try {
            await POST(`/inventory/vendors/${vendorId}/materials`, {
                raw_material_id: Number(rawMaterialId),
                default_unit_price: price === '' ? null : Number(price),
                pricing_mode: pricingMode,
                fat_rate: pricingMode === 'per_fat' && fatRate !== '' ? Number(fatRate) : null,
            });
            setRawMaterialId('');
            setPrice('');
            setPricingMode('fixed');
            setFatRate('');
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to link material');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (l: VendorMaterial) => {
        setEditId(l.id);
        setEditPrice(l.default_unit_price != null ? String(l.default_unit_price) : '');
        setEditMode(l.pricing_mode === 'per_fat' ? 'per_fat' : 'fixed');
        setEditFatRate(l.fat_rate != null ? String(l.fat_rate) : '');
    };

    const saveEdit = async () => {
        if (editId == null) return;
        setSaving(true);
        try {
            await PUT(`/inventory/vendor-materials/${editId}`, {
                default_unit_price: editPrice === '' ? null : Number(editPrice),
                pricing_mode: editMode,
                fat_rate: editMode === 'per_fat' && editFatRate !== '' ? Number(editFatRate) : null,
            });
            setEditId(null);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to update material');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: number) => {
        try {
            await DELETE(`/inventory/vendor-materials/${id}`);
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to unlink material');
        }
    };

    return (
        <div className="border border-slate-700/50 rounded-xl p-3 space-y-3">
            <p className="text-sm font-medium text-slate-300">Supplied Materials</p>
            <p className="text-xs text-slate-500">
                Materials this vendor usually supplies (with a default price). Shown first to the
                collection driver — they can still pick any active material. &quot;Per fat&quot; pricing
                makes bill review suggest price = fat reading × rate.
            </p>

            {loading ? (
                <p className="text-xs text-slate-500">Loading…</p>
            ) : links.length === 0 ? (
                <p className="text-xs text-slate-500">No materials linked yet.</p>
            ) : (
                <ul className="space-y-1">
                    {links.map((l) => (
                        <li key={l.id} className="text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-1.5">
                            {editId === l.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{l.raw_material_name}</span>
                                    <select value={editMode} onChange={(e) => setEditMode(e.target.value as 'fixed' | 'per_fat')}
                                        className="px-2 py-1 bg-slate-800/80 border border-slate-700/50 rounded text-xs text-white">
                                        <option value="fixed">Fixed price</option>
                                        <option value="per_fat">Per fat point</option>
                                    </select>
                                    {editMode === 'fixed' ? (
                                        <input type="number" step="any" placeholder="Price / unit" value={editPrice}
                                            onChange={(e) => setEditPrice(e.target.value)}
                                            className="w-28 px-2 py-1 bg-slate-800/80 border border-slate-700/50 rounded text-xs text-white" />
                                    ) : (
                                        <input type="number" step="any" placeholder="₹ per fat point" value={editFatRate}
                                            onChange={(e) => setEditFatRate(e.target.value)}
                                            className="w-28 px-2 py-1 bg-slate-800/80 border border-slate-700/50 rounded text-xs text-white" />
                                    )}
                                    <button type="button" onClick={saveEdit} disabled={saving} className="p-1 hover:bg-slate-700/50 rounded" title="Save">
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    </button>
                                    <button type="button" onClick={() => setEditId(null)} className="p-1 hover:bg-slate-700/50 rounded" title="Cancel">
                                        <X className="w-3.5 h-3.5 text-slate-400" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{l.raw_material_name}</span>
                                    <span className="text-slate-500">({l.raw_material_unit})</span>
                                    {l.pricing_mode === 'per_fat' ? (
                                        <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                                            per fat · ₹{l.fat_rate != null ? Number(l.fat_rate) : '—'}/pt
                                        </span>
                                    ) : l.default_unit_price != null && (
                                        <span className="text-xs text-cyan-400">₹{Number(l.default_unit_price).toFixed(2)}/{l.raw_material_unit}</span>
                                    )}
                                    <button type="button" onClick={() => startEdit(l)}
                                        className="ml-auto p-1 hover:bg-slate-700/50 rounded" title="Edit pricing">
                                        <Pencil className="w-3.5 h-3.5 text-purple-400" />
                                    </button>
                                    <button type="button" onClick={() => remove(l.id)}
                                        className="p-1 hover:bg-slate-700/50 rounded" title="Unlink">
                                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid grid-cols-2 gap-2">
                <select value={rawMaterialId} onChange={(e) => setRawMaterialId(e.target.value)} className={inputCls}>
                    <option value="">— select material —</option>
                    {available.map((m) => (
                        <option key={m.id} value={String(m.id)}>{m.name} ({m.unit})</option>
                    ))}
                </select>
                <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as 'fixed' | 'per_fat')} className={inputCls}>
                    <option value="fixed">Fixed price</option>
                    <option value="per_fat">Per fat point</option>
                </select>
                {pricingMode === 'fixed' ? (
                    <input type="number" step="any" placeholder="Default price / unit" value={price}
                        onChange={(e) => setPrice(e.target.value)} className={inputCls} />
                ) : (
                    <input type="number" step="any" placeholder="₹ per fat point (e.g. 52)" value={fatRate}
                        onChange={(e) => setFatRate(e.target.value)} className={inputCls} />
                )}
            </div>
            <button type="button" onClick={add} disabled={saving || !rawMaterialId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-sm disabled:opacity-50">
                <Plus className="w-4 h-4" /> Link Material
            </button>
        </div>
    );
}
