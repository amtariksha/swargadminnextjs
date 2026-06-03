'use client';

import { useCallback, useEffect, useState } from 'react';
import { GET, POST, DELETE } from '@/lib/api';
import { useRawMaterials } from '@/hooks/useInventory';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface VendorMaterial {
    id: number;
    raw_material_id: number;
    raw_material_name: string;
    raw_material_unit: string;
    default_unit_price?: number | string | null;
}

interface VendorMaterialsEditorProps {
    vendorId: number;
}

/**
 * Manage which raw materials a vendor supplies (with a default price). This is a
 * suggestion list — the collection driver sees these first but may still pick
 * any active raw material ("default + override").
 */
export default function VendorMaterialsEditor({ vendorId }: VendorMaterialsEditorProps) {
    const { data: materials = [] } = useRawMaterials();
    const [links, setLinks] = useState<VendorMaterial[]>([]);
    const [loading, setLoading] = useState(false);
    const [rawMaterialId, setRawMaterialId] = useState('');
    const [price, setPrice] = useState('');
    const [saving, setSaving] = useState(false);

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
            });
            setRawMaterialId('');
            setPrice('');
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to link material');
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
                collection driver — they can still pick any active material.
            </p>

            {loading ? (
                <p className="text-xs text-slate-500">Loading…</p>
            ) : links.length === 0 ? (
                <p className="text-xs text-slate-500">No materials linked yet.</p>
            ) : (
                <ul className="space-y-1">
                    {links.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-1.5">
                            <span className="font-medium">{l.raw_material_name}</span>
                            <span className="text-slate-500">({l.raw_material_unit})</span>
                            {l.default_unit_price != null && (
                                <span className="text-xs text-cyan-400">₹{Number(l.default_unit_price).toFixed(2)}/{l.raw_material_unit}</span>
                            )}
                            <button type="button" onClick={() => remove(l.id)}
                                className="ml-auto p-1 hover:bg-slate-700/50 rounded" title="Unlink">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
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
                <input type="number" step="any" placeholder="Default price / unit" value={price}
                    onChange={(e) => setPrice(e.target.value)} className={inputCls} />
            </div>
            <button type="button" onClick={add} disabled={saving || !rawMaterialId}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-sm disabled:opacity-50">
                <Plus className="w-4 h-4" /> Link Material
            </button>
        </div>
    );
}
