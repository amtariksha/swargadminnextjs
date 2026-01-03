'use client';

import { useState } from 'react';
import { useHolidays, Holiday, useUsers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Calendar, Trash2, User } from 'lucide-react';
import { POST } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function HolidaysPage() {
    const { data: holidays = [], isLoading } = useHolidays();
    const { data: users = [] } = useUsers();
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        user_id: '',
        date: '',
        end_date: '',
    });

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await POST('/add_user_holiday_multiple', {
                user_id: parseInt(formData.user_id),
                date: formData.date,
                end_date: formData.end_date || formData.date,
            });
            setShowModal(false);
            setFormData({ user_id: '', date: '', end_date: '' });
            queryClient.invalidateQueries({ queryKey: ['holidays'] });
        } catch (error) {
            console.error('Failed to add holiday:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this holiday?')) return;
        try {
            await POST('/delete_user_holiday', { id });
            queryClient.invalidateQueries({ queryKey: ['holidays'] });
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    const columns: Column<Holiday>[] = [
        { key: 'id', header: 'ID', width: '60px' },
        { key: 'user_id', header: 'User ID', width: '80px' },
        {
            key: 'name',
            header: 'Name',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-400" />
                    <span className="font-medium text-white">{item.name}</span>
                </div>
            ),
        },
        { key: 'phone', header: 'Phone' },
        {
            key: 'date',
            header: 'Holiday Date',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-400" />
                    <span className="text-white">{item.date}</span>
                </div>
            ),
        },
        {
            key: 'created_at',
            header: 'Created',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Delete',
            width: '80px',
            render: (item) => (
                <button
                    onClick={() => handleDelete(item.id)}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-red-400"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">User Holidays</h1>
                    <p className="text-slate-400">Manage customer delivery holidays</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                >
                    <Plus className="w-5 h-5" />Add Holiday
                </button>
            </div>

            <DataTable data={holidays} columns={columns} loading={isLoading} searchPlaceholder="Search holidays..." />

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Add Holiday</h2>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Select User</label>
                                <select
                                    value={formData.user_id}
                                    onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    required
                                >
                                    <option value="">Select a user...</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name} ({user.phone || user.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                        className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
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
                                    {isSubmitting ? 'Adding...' : 'Add Holiday'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
