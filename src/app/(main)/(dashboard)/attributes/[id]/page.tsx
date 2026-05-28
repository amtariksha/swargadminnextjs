'use client';

/**
 * Attribute detail — manage the values of one attribute (e.g. for "Size",
 * the values "Small", "Medium", "Large"). Per OQ-7, archiving a value
 * referenced by an active variant is blocked at the backend.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Edit, Archive } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    useAttribute,
    useAddAttributeValue,
    useUpdateAttributeValue,
    useArchiveAttributeValue,
} from '@/hooks/useVariations';
import type { AttributeValue } from '@/lib/types/variations';
import { ApiError } from '@/lib/api';

export default function AttributeDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const attributeId = parseInt(params.id, 10);

    const { data: attribute, isLoading } = useAttribute(attributeId);
    const addMut = useAddAttributeValue();
    const updateMut = useUpdateAttributeValue();
    const archiveMut = useArchiveAttributeValue();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editValue, setEditValue] = useState<AttributeValue | null>(null);
    const [archiveTarget, setArchiveTarget] = useState<AttributeValue | null>(null);
    const [form, setForm] = useState({
        value: '',
        slug: '',
        swatch_color: '',
        swatch_image_url: '',
        sort_order: 0,
    });

    if (isLoading) {
        return <div className="text-slate-400 p-8">Loading…</div>;
    }
    if (!attribute) {
        return <div className="text-red-400 p-8">Attribute not found.</div>;
    }

    const openAdd = () => {
        setEditValue(null);
        setForm({
            value: '', slug: '', swatch_color: '', swatch_image_url: '',
            sort_order: (attribute.values?.length ?? 0),
        });
        setIsModalOpen(true);
    };

    const openEdit = (v: AttributeValue) => {
        setEditValue(v);
        setForm({
            value: v.value,
            slug: v.slug,
            swatch_color: v.swatch_color || '',
            swatch_image_url: v.swatch_image_url || '',
            sort_order: v.sort_order,
        });
        setIsModalOpen(true);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.value.trim()) return;
        try {
            if (editValue) {
                await updateMut.mutateAsync({
                    attributeId,
                    valueId: editValue.id,
                    value: form.value.trim(),
                    slug: form.slug.trim() || undefined,
                    swatch_color: form.swatch_color.trim() || null,
                    swatch_image_url: form.swatch_image_url.trim() || null,
                    sort_order: form.sort_order,
                });
                toast.success('Value updated');
            } else {
                await addMut.mutateAsync({
                    attributeId,
                    value: form.value.trim(),
                    slug: form.slug.trim() || undefined,
                    swatch_color: form.swatch_color.trim() || null,
                    swatch_image_url: form.swatch_image_url.trim() || null,
                    sort_order: form.sort_order,
                });
                toast.success('Value added');
            }
            setIsModalOpen(false);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Save failed');
        }
    };

    const onArchive = async () => {
        if (!archiveTarget) return;
        try {
            await archiveMut.mutateAsync({ attributeId, valueId: archiveTarget.id });
            toast.success('Value archived');
            setArchiveTarget(null);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Archive failed');
        }
    };

    const values = attribute.values || [];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => router.push('/attributes')}
                    className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">{attribute.name}</h1>
                    <p className="text-slate-400 text-sm">
                        <code className="text-slate-500">{attribute.slug}</code>
                        {' · '}
                        Display: {attribute.display_type}
                        {attribute.is_filterable === 1 && ' · Filterable'}
                    </p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Value
                </button>
            </div>

            <div className="rounded-xl border border-slate-800/50 bg-slate-900/50">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-800/50 text-left text-xs uppercase text-slate-500">
                            <th className="px-4 py-3 font-medium">Value</th>
                            <th className="px-4 py-3 font-medium">Slug</th>
                            <th className="px-4 py-3 font-medium">Swatch</th>
                            <th className="px-4 py-3 font-medium">Sort</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium w-32"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {values.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No values yet. Add the first one.</td></tr>
                        )}
                        {values.map((v) => (
                            <tr key={v.id} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                                <td className="px-4 py-3 text-white font-medium">{v.value}</td>
                                <td className="px-4 py-3"><code className="text-xs text-slate-400">{v.slug}</code></td>
                                <td className="px-4 py-3">
                                    {v.swatch_image_url ? (
                                        <div className="flex items-center gap-2">
                                            <img src={v.swatch_image_url} alt={v.value}
                                                className="w-6 h-6 rounded object-cover border border-slate-700" />
                                            <span className="text-xs text-slate-500">image</span>
                                        </div>
                                    ) : v.swatch_color ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full border border-slate-700"
                                                style={{ backgroundColor: v.swatch_color }} />
                                            <span className="text-xs text-slate-400">{v.swatch_color}</span>
                                        </div>
                                    ) : <span className="text-slate-600">—</span>}
                                </td>
                                <td className="px-4 py-3 text-slate-400">{v.sort_order}</td>
                                <td className="px-4 py-3">
                                    {v.archived_at ? <span className="text-amber-400 text-xs">Archived</span> : <span className="text-emerald-400 text-xs">Active</span>}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => openEdit(v)}
                                            className="p-2 hover:bg-slate-800/50 rounded-lg" title="Edit">
                                            <Edit className="w-4 h-4 text-purple-400" />
                                        </button>
                                        {!v.archived_at && (
                                            <button onClick={() => setArchiveTarget(v)}
                                                className="p-2 hover:bg-amber-500/20 rounded-lg" title="Archive">
                                                <Archive className="w-4 h-4 text-amber-400" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
                title={editValue ? 'Edit Value' : 'Add Value'}>
                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Value *</label>
                        <input type="text" value={form.value} required autoFocus
                            onChange={(e) => setForm({ ...form, value: e.target.value })}
                            placeholder={`e.g. ${attribute.name === 'Size' ? 'Small, 500g, Large' : 'Red, Pista, Cotton'}`}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Slug <span className="text-slate-500 text-xs">(auto from value if blank)</span></label>
                        <input type="text" value={form.slug}
                            onChange={(e) => setForm({ ...form, slug: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Swatch colour
                                <span className="text-slate-500 text-xs ml-1">(hex)</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input type="color"
                                    value={form.swatch_color || '#000000'}
                                    onChange={(e) => setForm({ ...form, swatch_color: e.target.value })}
                                    className="w-10 h-10 bg-slate-800/50 border border-slate-700/50 rounded cursor-pointer" />
                                <input type="text" value={form.swatch_color}
                                    onChange={(e) => setForm({ ...form, swatch_color: e.target.value })}
                                    placeholder="#FF0000"
                                    className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Sort order</label>
                            <input type="number" min={0} value={form.sort_order}
                                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Swatch image URL
                            <span className="text-slate-500 text-xs ml-1">(overrides colour when set)</span>
                        </label>
                        <div className="flex items-center gap-3">
                            {form.swatch_image_url && (
                                <img src={form.swatch_image_url} alt="preview"
                                    className="w-12 h-12 rounded object-cover border border-slate-700"
                                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
                            )}
                            <input type="url" value={form.swatch_image_url}
                                onChange={(e) => setForm({ ...form, swatch_image_url: e.target.value })}
                                placeholder="https://…/red-swatch.jpg"
                                className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <div className="flex-1" />
                        <button type="button" onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                            Cancel
                        </button>
                        <button type="submit" disabled={addMut.isPending || updateMut.isPending}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {addMut.isPending || updateMut.isPending ? 'Saving…' : editValue ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!archiveTarget}
                title="Archive value"
                message={`Archive "${archiveTarget?.value}"? Blocked if any active variant references this value.`}
                onConfirm={onArchive} onCancel={() => setArchiveTarget(null)}
                variant="danger" confirmText="Archive" />
        </div>
    );
}
