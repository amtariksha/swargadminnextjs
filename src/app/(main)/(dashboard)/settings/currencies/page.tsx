'use client';

/**
 * Currency CRUD page (Phase I — multi-currency foundation).
 *
 *   /settings/currencies
 *
 * Schema lives in migration 034. No customer-facing code path consumes
 * the rows yet — admin housekeeping only so the operator can seed
 * USD/EUR/etc. ahead of the future i18n project. INR is auto-seeded as
 * default; the row cannot be deleted while default.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Star, Globe } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
    useCurrencies,
    useCreateCurrency,
    useUpdateCurrency,
    useDeleteCurrency,
    type Currency,
} from '@/hooks/useCurrencyWarehouse';
import { ApiError } from '@/lib/api';

export default function CurrenciesPage() {
    const { data: currencies = [], isLoading } = useCurrencies();
    const createMut = useCreateCurrency();
    const updateMut = useUpdateCurrency();
    const deleteMut = useDeleteCurrency();

    const [isOpen, setIsOpen] = useState(false);
    const [editItem, setEditItem] = useState<Currency | null>(null);
    const [deleteItem, setDeleteItem] = useState<Currency | null>(null);
    const [form, setForm] = useState({
        code: '',
        symbol: '',
        name: '',
        exchange_rate_to_inr: '1',
        is_active: true,
        is_default: false,
    });

    const openAdd = () => {
        setEditItem(null);
        setForm({ code: '', symbol: '', name: '', exchange_rate_to_inr: '1', is_active: true, is_default: false });
        setIsOpen(true);
    };

    const openEdit = (c: Currency) => {
        setEditItem(c);
        setForm({
            code: c.code,
            symbol: c.symbol,
            name: c.name,
            exchange_rate_to_inr: String(c.exchange_rate_to_inr),
            is_active: c.is_active === 1,
            is_default: c.is_default === 1,
        });
        setIsOpen(true);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            symbol: form.symbol.trim(),
            name: form.name.trim(),
            exchange_rate_to_inr: parseFloat(form.exchange_rate_to_inr) || 1,
            is_active: form.is_active ? 1 : 0,
            is_default: form.is_default ? 1 : 0,
        };
        try {
            if (editItem) {
                await updateMut.mutateAsync({ id: editItem.id, ...payload });
                toast.success('Currency updated');
            } else {
                await createMut.mutateAsync({ code: form.code.trim().toUpperCase(), ...payload });
                toast.success('Currency added');
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
            toast.success('Currency deleted');
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
                        <Globe className="w-6 h-6 text-purple-400" />
                        Currencies
                    </h1>
                    <p className="text-slate-400 text-sm">
                        Foundation schema — admin housekeeping only. No customer-facing
                        consumer renders these rates yet (variations PRD §2.2 non-goal).
                    </p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Add Currency
                </button>
            </div>

            <div className="rounded-xl border border-slate-800/50 bg-slate-900/50">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-800/50 text-left text-xs uppercase text-slate-500">
                            <th className="px-4 py-3 font-medium">Code</th>
                            <th className="px-4 py-3 font-medium">Symbol</th>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Rate → INR</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Default</th>
                            <th className="px-4 py-3 font-medium w-24"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                        )}
                        {!isLoading && currencies.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No currencies. Add one.</td></tr>
                        )}
                        {currencies.map((c) => (
                            <tr key={c.id} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                                <td className="px-4 py-3 text-white font-medium">{c.code}</td>
                                <td className="px-4 py-3 text-slate-200 text-lg">{c.symbol}</td>
                                <td className="px-4 py-3 text-slate-300">{c.name}</td>
                                <td className="px-4 py-3 text-slate-400">{c.exchange_rate_to_inr}</td>
                                <td className="px-4 py-3 text-xs">
                                    {c.is_active === 1 ? (
                                        <span className="text-emerald-400">Active</span>
                                    ) : (
                                        <span className="text-slate-500">Inactive</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    {c.is_default === 1 && (
                                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-end gap-1">
                                        <button onClick={() => openEdit(c)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                                            <Edit className="w-4 h-4 text-purple-400" />
                                        </button>
                                        <button onClick={() => setDeleteItem(c)}
                                            disabled={c.is_default === 1}
                                            className="p-2 hover:bg-red-500/20 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={c.is_default === 1 ? 'Default currency cannot be deleted' : 'Delete'}>
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
                title={editItem ? `Edit ${editItem.code}` : 'Add Currency'}>
                <form onSubmit={submit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Code *</label>
                            <input value={form.code} required disabled={!!editItem}
                                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                maxLength={8} placeholder="USD"
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 uppercase tracking-wider disabled:opacity-60" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Symbol *</label>
                            <input value={form.symbol} required
                                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                                maxLength={8} placeholder="$"
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-lg" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Name *</label>
                        <input value={form.name} required
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="US Dollar"
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Exchange rate to INR *</label>
                        <input value={form.exchange_rate_to_inr} required type="number" step="0.0001" min={0.0001}
                            onChange={(e) => setForm({ ...form, exchange_rate_to_inr: e.target.value })}
                            placeholder="83.0"
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white" />
                        <p className="text-xs text-slate-500 mt-1">1 {form.code || 'unit'} = how many ₹? INR row stays at 1.0.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={form.is_active}
                                onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                            Active
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                            <input type="checkbox" checked={form.is_default}
                                onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                            Default
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
                title="Delete currency"
                message={`Delete ${deleteItem?.code} – ${deleteItem?.name}? This cannot be undone.`}
                onConfirm={onDelete} onCancel={() => setDeleteItem(null)}
                variant="danger" confirmText="Delete" />
        </div>
    );
}
