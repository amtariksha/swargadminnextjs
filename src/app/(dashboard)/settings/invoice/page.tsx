'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { FileText, Edit } from 'lucide-react';

interface InvoiceSetting {
    id: number;
    title: string;
    value: string;
    updated_at?: string;
}

export default function InvoiceSettingsPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<InvoiceSetting | null>(null);
    const [newValue, setNewValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: settings = [], isLoading } = useQuery({
        queryKey: ['invoice-settings'],
        queryFn: async () => {
            const response = await GET<InvoiceSetting[]>('/get_invoice_settings');
            return response.data || [];
        },
    });

    const handleEdit = (item: InvoiceSetting) => {
        setEditItem(item);
        setNewValue(item.value);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        setIsSubmitting(true);
        try {
            await POST('/update_invoice_settings', {
                id: editItem.id,
                value: newValue,
            });
            setShowModal(false);
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['invoice-settings'] });
        } catch (error) {
            console.error('Update failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns: Column<InvoiceSetting>[] = [
        {
            key: 'actions',
            header: 'Update',
            width: '80px',
            render: (item) => (
                <button onClick={() => handleEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'id', header: 'ID', width: '60px' },
        {
            key: 'title',
            header: 'Field',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span className="text-white font-medium">{item.title}</span>
                </div>
            ),
        },
        {
            key: 'value',
            header: 'Value',
            render: (item) => <span className="text-slate-300">{item.value || '-'}</span>,
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
                <FileText className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Invoice Settings</h1>
                    <p className="text-slate-400">Configure invoice details and company info</p>
                </div>
            </div>

            <DataTable data={settings} columns={columns} loading={isLoading} searchPlaceholder="Search settings..." />

            {showModal && editItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Update {editItem.title}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Field</label>
                                <input type="text" value={editItem.title} disabled className="w-full px-4 py-2 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-500" />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Value</label>
                                <textarea
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    rows={4}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white resize-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
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
