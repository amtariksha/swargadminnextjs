'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useHolidays, Holiday } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Plus, CalendarOff, Trash2, User } from 'lucide-react';
import { POST, DELETE } from '@/lib/api';

export default function HolidaysPage() {
    const { data: holidays = [], isLoading, refetch } = useHolidays();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        user_id: '',
        from_date: format(new Date(), 'yyyy-MM-dd'),
        to_date: format(new Date(), 'yyyy-MM-dd'),
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await POST('/add_holiday', {
                user_id: parseInt(formData.user_id),
                from_date: formData.from_date,
                to_date: formData.to_date,
            });
            setIsModalOpen(false);
            setFormData({
                user_id: '',
                from_date: format(new Date(), 'yyyy-MM-dd'),
                to_date: format(new Date(), 'yyyy-MM-dd'),
            });
            refetch();
        } catch (error) {
            console.error('Failed to add holiday:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await DELETE(`/delete_holiday/${deleteId}`);
            setDeleteId(null);
            refetch();
        } catch (error) {
            console.error('Failed to delete holiday:', error);
        }
    };

    const columns: Column<Holiday>[] = [
        {
            key: 'id',
            header: 'ID',
            width: '80px',
        },
        {
            key: 'user_name',
            header: 'User',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="font-medium text-white">{item.user_name || `User #${item.user_id}`}</span>
                </div>
            ),
        },
        {
            key: 'from_date',
            header: 'From Date',
            render: (item) => (
                <span className="text-slate-300">
                    {format(new Date(item.from_date), 'dd MMM yyyy')}
                </span>
            ),
        },
        {
            key: 'to_date',
            header: 'To Date',
            render: (item) => (
                <span className="text-slate-300">
                    {format(new Date(item.to_date), 'dd MMM yyyy')}
                </span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => {
                const isActive = item.status === 1;
                return (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                        }`}>
                        {isActive ? 'Active' : 'Inactive'}
                    </span>
                );
            },
        },
        {
            key: 'created_at',
            header: 'Created',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {format(new Date(item.created_at), 'dd MMM yyyy')}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            sortable: false,
            render: (item) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(item.id);
                    }}
                    className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-red-400"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">User Holidays</h1>
                    <p className="text-slate-400">Manage user delivery holidays</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                >
                    <Plus className="w-5 h-5" />
                    Add Holiday
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <CalendarOff className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Total Holidays</p>
                            <p className="text-xl font-bold text-white">{holidays.length}</p>
                        </div>
                    </div>
                </div>
                <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                            <CalendarOff className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Active</p>
                            <p className="text-xl font-bold text-green-400">
                                {holidays.filter(h => h.status === 1).length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={holidays}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search holidays..."
                emptyMessage="No holidays found"
            />

            {/* Add Holiday Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Add User Holiday"
            >
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            User ID
                        </label>
                        <input
                            type="number"
                            value={formData.user_id}
                            onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                            required
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            placeholder="Enter user ID"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                From Date
                            </label>
                            <input
                                type="date"
                                value={formData.from_date}
                                onChange={(e) => setFormData({ ...formData, from_date: e.target.value })}
                                required
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                To Date
                            </label>
                            <input
                                type="date"
                                value={formData.to_date}
                                onChange={(e) => setFormData({ ...formData, to_date: e.target.value })}
                                required
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 rounded-xl font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Adding...' : 'Add Holiday'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={deleteId !== null}
                onClose={() => setDeleteId(null)}
                title="Delete Holiday"
                size="sm"
            >
                <div className="text-center">
                    <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Trash2 className="w-6 h-6 text-red-400" />
                    </div>
                    <p className="text-slate-300 mb-6">
                        Are you sure you want to delete this holiday? This action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setDeleteId(null)}
                            className="flex-1 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 rounded-xl font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
