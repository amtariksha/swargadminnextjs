'use client';

import { useState } from 'react';
import { usePincodes, Pincode } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Plus, MapPin, Trash2, Edit } from 'lucide-react';
import { POST, PUT, DELETE } from '@/lib/api';

export default function PincodesPage() {
    const { data: pincodes = [], isLoading, refetch } = usePincodes();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Pincode | null>(null);
    const [formData, setFormData] = useState({ pincode: '', area: '', city: '', delivery_charge: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const data = { ...formData, delivery_charge: parseFloat(formData.delivery_charge) };
            if (editItem) {
                await PUT(`/update_pincode/${editItem.id}`, data);
            } else {
                await POST('/add_pincode', data);
            }
            setIsModalOpen(false);
            setEditItem(null);
            setFormData({ pincode: '', area: '', city: '', delivery_charge: '' });
            refetch();
        } catch (error) {
            console.error('Failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns: Column<Pincode>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'pincode',
            header: 'Pincode',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-purple-400" />
                    <span className="font-mono font-medium text-white">{item.pincode}</span>
                </div>
            ),
        },
        { key: 'area', header: 'Area', render: (item) => <span className="text-slate-300">{item.area || '-'}</span> },
        { key: 'city', header: 'City', render: (item) => <span className="text-slate-300">{item.city || '-'}</span> },
        {
            key: 'delivery_charge',
            header: 'Delivery Charge',
            render: (item) => <span className="font-semibold text-green-400">₹{item.delivery_charge}</span>,
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.status === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                    {item.status === 1 ? 'Active' : 'Inactive'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            sortable: false,
            render: (item) => (
                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setEditItem(item); setFormData({ pincode: item.pincode, area: item.area || '', city: item.city || '', delivery_charge: String(item.delivery_charge) }); setIsModalOpen(true); }}
                        className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <Edit className="w-4 h-4 text-slate-400" />
                    </button>
                    <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete?')) { await DELETE(`/delete_pincode/${item.id}`); refetch(); } }}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-400">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Pincodes</h1>
                    <p className="text-slate-400">Manage serviceable areas</p>
                </div>
                <button onClick={() => { setEditItem(null); setFormData({ pincode: '', area: '', city: '', delivery_charge: '' }); setIsModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" />Add Pincode
                </button>
            </div>

            <DataTable data={pincodes} columns={columns} loading={isLoading} searchPlaceholder="Search pincodes..." />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editItem ? 'Edit Pincode' : 'Add Pincode'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Pincode</label>
                            <input type="text" value={formData.pincode} onChange={(e) => setFormData({ ...formData, pincode: e.target.value })} required
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Delivery Charge</label>
                            <input type="number" value={formData.delivery_charge} onChange={(e) => setFormData({ ...formData, delivery_charge: e.target.value })} required
                                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Area</label>
                        <input type="text" value={formData.area} onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">City</label>
                        <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50">
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
