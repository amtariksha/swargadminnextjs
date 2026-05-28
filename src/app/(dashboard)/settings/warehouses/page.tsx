'use client';

/**
 * Warehouse CRUD page (Phase I — multi-warehouse foundation).
 *
 *   /settings/warehouses
 *
 * Schema lives in migration 034. No application code routes orders by
 * warehouse yet — admin housekeeping only so the operator can seed
 * locations ahead of the future routing project. The primary warehouse
 * cannot be deleted while flagged; warehouses with stock rows are
 * also locked from deletion.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Star, Warehouse as WarehouseIcon } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    useWarehouses,
    useCreateWarehouse,
    useUpdateWarehouse,
    useDeleteWarehouse,
    type Warehouse,
} from '@/hooks/useCurrencyWarehouse';
import { ApiError } from '@/lib/api';

type FormState = {
    code: string;
    name: string;
    address: string;
    city: string;
    pincode: string;
    lat: string;
    lng: string;
    is_active: boolean;
    is_primary: boolean;
};

const EMPTY_FORM: FormState = {
    code: '', name: '', address: '', city: '', pincode: '',
    lat: '', lng: '', is_active: true, is_primary: false,
};

export default function WarehousesPage() {
    const { data: warehouses = [], isLoading } = useWarehouses();
    const createMut = useCreateWarehouse();
    const updateMut = useUpdateWarehouse();
    const deleteMut = useDeleteWarehouse();

    const [isOpen, setIsOpen] = useState(false);
    const [editItem, setEditItem] = useState<Warehouse | null>(null);
    const [deleteItem, setDeleteItem] = useState<Warehouse | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    const openAdd = () => {
        setEditItem(null);
        setForm(EMPTY_FORM);
        setIsOpen(true);
    };

    const openEdit = (w: Warehouse) => {
        setEditItem(w);
        setForm({
            code: w.code,
            name: w.name,
            address: w.address || '',
            city: w.city || '',
            pincode: w.pincode || '',
            lat: w.lat != null ? String(w.lat) : '',
            lng: w.lng != null ? String(w.lng) : '',
            is_active: w.is_active === 1,
            is_primary: w.is_primary === 1,
        });
        setIsOpen(true);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            name: form.name.trim(),
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            pincode: form.pincode.trim() || null,
            lat: form.lat ? parseFloat(form.lat) : null,
            lng: form.lng ? parseFloat(form.lng) : null,
            is_active: form.is_active ? 1 : 0,
            is_primary: form.is_primary ? 1 : 0,
        };
        try {
            if (editItem) {
                await updateMut.mutateAsync({ id: editItem.id, ...payload });
                toast.success('Warehouse updated');
            } else {
                await createMut.mutateAsync({ code: form.code.trim(), ...payload });
                toast.success('Warehouse added');
            }
            setIsOpen(false);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Save failed');
        }
    };

    const onDelete = async () => {
        if (!deleteItem) return;
        try {
            await deleteMut.mutateAsync(deleteItem.id);
            toast.success('Warehouse deleted');
            setDeleteItem(null);
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : (err as Error)?.message || 'Delete failed');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <WarehouseIcon className="w-6 h-6 text-purple-400" />
                        Warehouses
                    </h1>
                    <p className="text-slate-400 text-sm">
                        Foundation schema — admin housekeeping only. Application stock
                        decrements still target the single variant.stock_quantity pool
                        (variations PRD §2.2 non-goal). Operator can seed locations now.
                    </p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Warehouse
                </button>
            </div>

            <div className="rounded-xl border border-slate-800/50 bg-slate-900/50">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-800/50 text-left text-xs uppercase text-slate-500">
                            <th className="px-4 py-3 font-medium">Code</th>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">City</th>
                            <th className="px-4 py-3 font-medium">Pincode</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Primary</th>
                            <th className="px-4 py-3 font-medium w-24"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                        )}
                        {!isLoading && warehouses.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No warehouses. Add the first one.</td></tr>
                        )}
                        {warehouses.map((w) => (
                            <tr key={w.id} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                                <td className="px-4 py-3 text-white font-medium">{w.code}</td>
                                <td className="px-4 py-3 text-slate-300">{w.name}</td>
                                <td className="px-4 py-3 text-slate-400">{w.city || '—'}</td>
                                <td className="px-4 py-3 text-slate-400">{w.pincode || '—'}</td>
                                <td className="px-4 py-3 text-xs">
                                    {w.is_active === 1
                                        ? <span className="text-emerald-400">Active</span>
                                        : <span className="text-slate-500">Inactive</span>}
                                </td>
                                <td className="px-4 py-3">
                                    {w.is_primary === 1 && (
                                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-end gap-1">
                                        <button onClick={() => openEdit(w)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                                            <Edit className="w-4 h-4 text-purple-400" />
                                        </button>
                                        <button onClick={() => setDeleteItem(w)}
                                            disabled={w.is_primary === 1}
                                            className="p-2 hover:bg-red-500/20 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={w.is_primary === 1 ? 'Primary warehouse cannot be deleted' : 'Delete'}>
                                            <Trash2 className="w-4 h-4 text-red-400" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}
                title={editItem ? `Edit ${editItem.code}` : 'Add Warehouse'}>
                <form onSubmit={submit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Code *</label>
                            <input value={form.code} required disabled={!!editItem}
                                onChange={(e) => setForm({ ...form, code: e.target.value })}
                                placeholder="BLR-HUB"
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white disabled:opacity-60" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
                            <input value={form.name} required
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Bangalore Hub"
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Address</label>
                        <textarea value={form.address} rows={2}
                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">City</label>
                            <input value={form.city}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Pincode</label>
                            <input value={form.pincode}
                                onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Latitude</label>
                            <input value={form.lat} type="number" step="any"
                                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Longitude</label>
                            <input value={form.lng} type="number" step="any"
                                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={form.is_active}
                                onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                            Active
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={form.is_primary}
                                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
                            Primary
                        </label>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setIsOpen(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">
                            Cancel
                        </button>
                        <button type="submit" disabled={createMut.isPending || updateMut.isPending}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {(createMut.isPending || updateMut.isPending) ? 'Saving…' : editItem ? 'Update' : 'Add'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!deleteItem}
                title="Delete warehouse"
                message={`Delete ${deleteItem?.code} – ${deleteItem?.name}? Blocked if the warehouse has stock rows.`}
                onConfirm={onDelete} onCancel={() => setDeleteItem(null)}
                variant="danger" confirmText="Delete" />
        </div>
    );
}
