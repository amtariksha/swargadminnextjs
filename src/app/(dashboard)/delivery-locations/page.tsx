'use client';

import { useState } from 'react';
import { useDeliveryLocations, DeliveryLocation } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Navigation, Trash2 } from 'lucide-react';
import { POST } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function DeliveryLocationsPage() {
    const { data: locations = [], isLoading } = useDeliveryLocations();
    const queryClient = useQueryClient();
    const [showModal, setShowModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await POST('/add_available_delivery_location', { title: newTitle });
            setShowModal(false);
            setNewTitle('');
            queryClient.invalidateQueries({ queryKey: ['delivery-locations'] });
        } catch (error) {
            console.error('Failed to add location:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this location?')) return;
        try {
            await POST('/delete_available_delivery_location', { id });
            queryClient.invalidateQueries({ queryKey: ['delivery-locations'] });
        } catch (error) {
            console.error('Failed to delete:', error);
        }
    };

    const columns: Column<DeliveryLocation>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'title',
            header: 'Location',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-purple-400" />
                    <span className="font-medium text-white">{item.title}</span>
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
            header: 'Actions',
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
                    <h1 className="text-2xl font-bold text-white">Delivery Locations</h1>
                    <p className="text-slate-400">Manage available delivery areas</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                >
                    <Plus className="w-5 h-5" />Add Location
                </button>
            </div>

            <DataTable data={locations} columns={columns} loading={isLoading} searchPlaceholder="Search locations..." />

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4">
                        <h2 className="text-xl font-bold text-white mb-4">Add Delivery Location</h2>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Location Name</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                                    placeholder="Enter location name"
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
                                    {isSubmitting ? 'Adding...' : 'Add'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
