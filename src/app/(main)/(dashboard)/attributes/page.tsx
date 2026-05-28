'use client';

/**
 * Attribute Library — store-wide list of variation attributes (Size,
 * Colour, Flavour, …) reusable across products. Per OQ-7 / D-12, archived
 * values stay queryable but hidden by default.
 *
 * One row per Attribute. Click into /attributes/:id to manage its values.
 */

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Layers, Tag } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAttributes, useCreateAttribute, useUpdateAttribute, useDeleteAttribute } from '@/hooks/useVariations';
import type { Attribute, DisplayType } from '@/lib/types/variations';
import { ApiError } from '@/lib/api';

const DISPLAY_TYPES: { value: DisplayType; label: string }[] = [
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'radio', label: 'Radio buttons' },
    { value: 'swatch_color', label: 'Colour swatch (Phase 3)' },
    { value: 'swatch_image', label: 'Image swatch (Phase 3)' },
    { value: 'button', label: 'Button group (Phase 3)' },
];

export default function AttributesPage() {
    const { data: attributes = [], isLoading } = useAttributes();
    const createMut = useCreateAttribute();
    const updateMut = useUpdateAttribute();
    const deleteMut = useDeleteAttribute();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Attribute | null>(null);
    const [deleteItem, setDeleteItem] = useState<Attribute | null>(null);
    const [form, setForm] = useState({
        name: '',
        slug: '',
        display_type: 'dropdown' as DisplayType,
        is_filterable: false,
        sort_order: 0,
    });

    const openAdd = () => {
        setEditItem(null);
        setForm({ name: '', slug: '', display_type: 'dropdown', is_filterable: false, sort_order: 0 });
        setIsModalOpen(true);
    };

    const openEdit = (item: Attribute) => {
        setEditItem(item);
        setForm({
            name: item.name,
            slug: item.slug,
            display_type: item.display_type,
            is_filterable: item.is_filterable === 1,
            sort_order: item.sort_order ?? 0,
        });
        setIsModalOpen(true);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        try {
            if (editItem) {
                await updateMut.mutateAsync({
                    id: editItem.id,
                    name: form.name.trim(),
                    slug: form.slug.trim() || undefined,
                    display_type: form.display_type,
                    is_filterable: form.is_filterable ? 1 : 0,
                    sort_order: form.sort_order,
                });
                toast.success('Attribute updated');
            } else {
                await createMut.mutateAsync({
                    name: form.name.trim(),
                    slug: form.slug.trim() || undefined,
                    display_type: form.display_type,
                    is_filterable: form.is_filterable ? 1 : 0,
                    sort_order: form.sort_order,
                });
                toast.success('Attribute created');
            }
            setIsModalOpen(false);
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : (err as Error)?.message || 'Save failed';
            toast.error(msg);
        }
    };

    const onDelete = async () => {
        if (!deleteItem) return;
        try {
            await deleteMut.mutateAsync(deleteItem.id);
            toast.success('Attribute deleted');
            setDeleteItem(null);
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : (err as Error)?.message || 'Delete failed';
            toast.error(msg);
        }
    };

    const columns: Column<Attribute>[] = [
        {
            key: 'edit', header: 'Edit', width: '70px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                    className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'name', header: 'Name', width: '200px',
            render: (item) => (
                <Link href={`/attributes/${item.id}`} className="text-purple-300 hover:text-purple-200 font-medium inline-flex items-center gap-2">
                    <Tag className="w-4 h-4" /> {item.name}
                </Link>
            ),
        },
        { key: 'slug', header: 'Slug', width: '180px', render: (item) => (
            <code className="text-xs text-slate-400">{item.slug}</code>
        )},
        { key: 'display_type', header: 'Display', width: '140px' },
        {
            key: 'is_filterable', header: 'Filterable', width: '110px',
            render: (item) => item.is_filterable === 1
                ? <span className="text-emerald-400 text-sm">Yes</span>
                : <span className="text-slate-500 text-sm">—</span>,
        },
        { key: 'sort_order', header: 'Sort', width: '70px' },
        {
            key: 'delete', header: '', width: '60px',
            render: (item) => (
                <button onClick={(e) => { e.stopPropagation(); setDeleteItem(item); }}
                    className="p-2 hover:bg-red-500/20 rounded-lg">
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Attributes</h1>
                    <p className="text-slate-400">Variation dimensions — reusable across products (Size, Colour, Flavour, …)</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Attribute
                </button>
            </div>

            <DataTable data={attributes} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Search attributes…" />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
                title={editItem ? 'Update Attribute' : 'Add Attribute'}>
                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
                        <input type="text" value={form.name} required autoFocus
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. Size, Colour, Flavour"
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Slug <span className="text-slate-500 text-xs">(auto-generated from name if left blank)</span>
                        </label>
                        <input type="text" value={form.slug}
                            onChange={(e) => setForm({ ...form, slug: e.target.value })}
                            placeholder="size"
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Display type</label>
                            <select value={form.display_type}
                                onChange={(e) => setForm({ ...form, display_type: e.target.value as DisplayType })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                                {DISPLAY_TYPES.map((d) => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Sort order</label>
                            <input type="number" min={0} value={form.sort_order}
                                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="is_filterable" checked={form.is_filterable}
                            onChange={(e) => setForm({ ...form, is_filterable: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-700/50 bg-slate-800/50" />
                        <label htmlFor="is_filterable" className="text-sm text-slate-300">
                            Filterable on listing pages (Phase 3)
                        </label>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <div className="flex-1" />
                        <button type="button" onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                            Cancel
                        </button>
                        <button type="submit" disabled={createMut.isPending || updateMut.isPending}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {createMut.isPending || updateMut.isPending ? 'Saving…' : editItem ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!deleteItem}
                title="Delete attribute"
                message={`Delete "${deleteItem?.name}"? This is blocked if any product or variant references this attribute.`}
                onConfirm={onDelete} onCancel={() => setDeleteItem(null)}
                variant="danger" confirmText="Delete" />
        </div>
    );
}
