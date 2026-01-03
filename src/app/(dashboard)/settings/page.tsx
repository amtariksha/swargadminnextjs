'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { Settings as SettingsIcon, Edit, ToggleLeft, ToggleRight } from 'lucide-react';

interface Setting {
    setting_id: number;
    id?: number;
    title: string;
    value: string;
    updated_at?: string;
}

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<Setting | null>(null);
    const [newValue, setNewValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: settings = [], isLoading } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const response = await GET<Setting[]>('/get_settings');
            // Add id field for DataTable
            return (response.data || []).map(s => ({ ...s, id: s.setting_id }));
        },
    });

    const handleEdit = (item: Setting) => {
        setEditItem(item);
        setNewValue(item.value);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        setIsSubmitting(true);
        try {
            await POST('/update_settings', {
                setting_id: editItem.setting_id,
                value: newValue,
            });
            setShowModal(false);
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch (error) {
            console.error('Update failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isBoolean = (value: string) => value === '0' || value === '1';

    const columns: Column<Setting>[] = [
        {
            key: 'actions',
            header: 'Update',
            width: '80px',
            render: (item) => (
                <button
                    onClick={() => handleEdit(item)}
                    className="p-2 hover:bg-slate-800/50 rounded-lg"
                >
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'setting_id', header: 'ID', width: '60px' },
        {
            key: 'title',
            header: 'Title',
            render: (item) => <span className="text-white font-medium">{item.title}</span>,
        },
        {
            key: 'value',
            header: 'Value',
            render: (item) => {
                if (item.value === '0') return <span className="text-red-400">False</span>;
                if (item.value === '1') return <span className="text-green-400">True</span>;
                return <span className="text-slate-300">{item.value}</span>;
            },
        },
        {
            key: 'updated_at',
            header: 'Updated',
            render: (item) => (
                <span className="text-slate-400 text-sm">
                    {item.updated_at ? new Date(item.updated_at).toLocaleString() : 'N/A'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <SettingsIcon className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">General Settings</h1>
                    <p className="text-slate-400">Manage application settings</p>
                </div>
            </div>

            <DataTable data={settings} columns={columns} loading={isLoading} searchPlaceholder="Search settings..." />

            {showModal && editItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Update Setting</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Setting ID</label>
                                <input
                                    type="text"
                                    value={editItem.setting_id}
                                    disabled
                                    className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Title</label>
                                <input
                                    type="text"
                                    value={editItem.title}
                                    disabled
                                    className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Value</label>
                                {isBoolean(editItem.value) ? (
                                    <button
                                        type="button"
                                        onClick={() => setNewValue(newValue === '1' ? '0' : '1')}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full ${newValue === '1' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}
                                    >
                                        {newValue === '1' ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                        <span className="font-medium">{newValue === '1' ? 'True' : 'False'}</span>
                                    </button>
                                ) : (
                                    <input
                                        type="text"
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    />
                                )}
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
                                    {isSubmitting ? 'Updating...' : 'Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
