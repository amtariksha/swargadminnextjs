'use client';

import { useState } from 'react';
import {
    usePackagingTypes,
    useCreatePackagingType,
    useUpdatePackagingType,
    useDeletePackagingType,
    PackagingType,
} from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Package, Trash2, Edit, X } from 'lucide-react';
import { ApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { formatApiDate } from '@/lib/dateUtils';

const inr = (n: number | null | undefined) =>
    '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface PackagingFormState {
    name: string;
    refund_amount: string;
}

const emptyForm: PackagingFormState = { name: '', refund_amount: '' };

export default function PackagingTypesPage() {
    const { data: types = [], isLoading } = usePackagingTypes();
    const createType = useCreatePackagingType();
    const updateType = useUpdatePackagingType();
    const deleteType = useDeletePackagingType();

    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<PackagingType | null>(null);
    const [form, setForm] = useState<PackagingFormState>(emptyForm);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setShowModal(true);
    };

    const openEdit = (item: PackagingType) => {
        setEditing(item);
        setForm({ name: item.name, refund_amount: String(item.refund_amount ?? '') });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const refundAmount = Number(form.refund_amount);
        if (!form.name.trim()) {
            toast.error('Name is required');
            return;
        }
        if (!Number.isFinite(refundAmount) || refundAmount < 0) {
            toast.error('Refund amount must be a positive number');
            return;
        }
        try {
            if (editing) {
                await updateType.mutateAsync({
                    id: editing.id,
                    name: form.name.trim(),
                    refund_amount: refundAmount,
                });
                toast.success('Packaging type updated');
            } else {
                await createType.mutateAsync({
                    name: form.name.trim(),
                    refund_amount: refundAmount,
                });
                toast.success('Packaging type added');
            }
            setShowModal(false);
            setForm(emptyForm);
            setEditing(null);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.userMessage : 'Failed to save packaging type');
        }
    };

    const handleToggleActive = async (item: PackagingType) => {
        try {
            await updateType.mutateAsync({
                id: item.id,
                is_active: item.is_active ? 0 : 1,
            });
            toast.success(item.is_active ? 'Packaging type deactivated' : 'Packaging type activated');
        } catch (error) {
            toast.error(error instanceof ApiError ? error.userMessage : 'Failed to update status');
        }
    };

    const handleDelete = async (item: PackagingType) => {
        if (!confirm(`Delete packaging type "${item.name}"?`)) return;
        try {
            await deleteType.mutateAsync({ id: item.id });
            toast.success('Packaging type deleted');
        } catch (error) {
            // Backend returns HTTP 422 / code `packaging_type_in_use` when the
            // type is referenced by a product or an open return.
            toast.error(error instanceof ApiError ? error.userMessage : 'Failed to delete packaging type');
        }
    };

    const columns: Column<PackagingType>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'name',
            header: 'Name',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-400" />
                    <span className="font-medium text-white">{item.name || '-'}</span>
                </div>
            ),
        },
        {
            key: 'refund_amount',
            header: 'Refund Amount',
            render: (item) => <span className="text-white">{inr(item.refund_amount)}</span>,
        },
        {
            key: 'is_active',
            header: 'Status',
            render: (item) => (
                <button
                    onClick={() => handleToggleActive(item)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        item.is_active
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-slate-600/30 text-slate-400 hover:bg-slate-600/50'
                    }`}
                >
                    {item.is_active ? 'Active' : 'Inactive'}
                </button>
            ),
        },
        {
            key: 'created_at',
            header: 'Created',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.created_at ? formatApiDate(item.created_at, 'dd MMM yyyy') : '-'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            width: '110px',
            sortable: false,
            render: (item) => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => openEdit(item)}
                        className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-400"
                        title="Edit"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleDelete(item)}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-400"
                        title="Delete"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    const isSubmitting = createType.isPending || updateType.isPending;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Packaging Types</h1>
                    <p className="text-slate-400">Manage returnable packaging and refund amounts</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                >
                    <Plus className="w-5 h-5" />Add Packaging Type
                </button>
            </div>

            <DataTable
                data={types}
                columns={columns}
                loading={isLoading}
                searchPlaceholder="Search packaging types..."
            />

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-white">
                                {editing ? 'Edit Packaging Type' : 'Add Packaging Type'}
                            </h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-slate-700/50 rounded-lg"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    placeholder="e.g., Glass Bottle 1L"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Refund Amount (₹)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.refund_amount}
                                    onChange={(e) => setForm({ ...form, refund_amount: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                    placeholder="Deposit refunded on return"
                                    required
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Saving...' : editing ? 'Update' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
