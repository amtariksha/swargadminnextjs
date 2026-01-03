'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import { CreditCard, Edit, ToggleLeft, ToggleRight } from 'lucide-react';

interface PaymentGateway {
    id: number;
    title: string;
    key_id: string;
    secret_id: string;
    active: number;
    updated_at?: string;
}

export default function PaymentSettingsPage() {
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [editItem, setEditItem] = useState<PaymentGateway | null>(null);
    const [formData, setFormData] = useState({ key_id: '', secret_id: '', active: 0 });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: gateways = [], isLoading } = useQuery({
        queryKey: ['payment-gateways'],
        queryFn: async () => {
            const response = await GET<PaymentGateway[]>('/get_payment_getway');
            return response.data || [];
        },
    });

    const handleEdit = (item: PaymentGateway) => {
        setEditItem(item);
        setFormData({
            key_id: item.key_id || '',
            secret_id: item.secret_id || '',
            active: item.active,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        setIsSubmitting(true);
        try {
            await POST('/update_payment_getway', {
                id: editItem.id,
                key_id: formData.key_id,
                secret_id: formData.secret_id,
                active: formData.active,
            });
            setShowModal(false);
            setEditItem(null);
            queryClient.invalidateQueries({ queryKey: ['payment-gateways'] });
        } catch (error) {
            console.error('Update failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns: Column<PaymentGateway>[] = [
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
            header: 'Gateway',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    <span className="text-white font-medium">{item.title}</span>
                </div>
            ),
        },
        {
            key: 'key_id',
            header: 'Key ID',
            render: (item) => (
                <span className="font-mono text-sm text-slate-400">
                    {item.key_id ? `${item.key_id.substring(0, 15)}...` : '-'}
                </span>
            ),
        },
        {
            key: 'secret_id',
            header: 'Secret ID',
            render: (item) => (
                <span className="font-mono text-sm text-slate-400">
                    {item.secret_id ? '••••••••••' : '-'}
                </span>
            ),
        },
        {
            key: 'active',
            header: 'Status',
            render: (item) => (
                <span className={`flex items-center gap-1 ${item.active === 1 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.active === 1 ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {item.active === 1 ? 'Active' : 'Inactive'}
                </span>
            ),
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
                <CreditCard className="w-8 h-8 text-purple-400" />
                <div>
                    <h1 className="text-2xl font-bold text-white">Payment Gateway</h1>
                    <p className="text-slate-400">Manage payment provider credentials</p>
                </div>
            </div>

            <DataTable data={gateways} columns={columns} loading={isLoading} />

            {showModal && editItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Update {editItem.title}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Key ID</label>
                                <input
                                    type="text"
                                    value={formData.key_id}
                                    onChange={(e) => setFormData({ ...formData, key_id: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white font-mono text-sm"
                                    placeholder="Enter Key ID"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Secret ID</label>
                                <input
                                    type="password"
                                    value={formData.secret_id}
                                    onChange={(e) => setFormData({ ...formData, secret_id: e.target.value })}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white font-mono text-sm"
                                    placeholder="Enter Secret ID"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Status</label>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, active: formData.active === 1 ? 0 : 1 })}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full ${formData.active === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                        }`}
                                >
                                    {formData.active === 1 ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                    <span className="font-medium">{formData.active === 1 ? 'Active' : 'Inactive'}</span>
                                </button>
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
