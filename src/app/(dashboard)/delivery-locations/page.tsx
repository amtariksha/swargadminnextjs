'use client';

import { useDeliveryLocations, DeliveryLocation } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, MapPin, Navigation, Trash2 } from 'lucide-react';
import { DELETE } from '@/lib/api';

export default function DeliveryLocationsPage() {
    const { data: locations = [], isLoading, refetch } = useDeliveryLocations();

    const columns: Column<DeliveryLocation>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'name',
            header: 'Location',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                        <Navigation className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="font-medium text-white">{item.name}</span>
                </div>
            ),
        },
        {
            key: 'address',
            header: 'Address',
            render: (item) => (
                <div className="flex items-center gap-2 text-slate-300 max-w-xs">
                    <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{item.address || '-'}</span>
                </div>
            ),
        },
        { key: 'pincode', header: 'Pincode', render: (item) => <span className="font-mono text-slate-300">{item.pincode || '-'}</span> },
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
                <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete?')) { await DELETE(`/delete_delivery_location/${item.id}`); refetch(); } }}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-red-400">
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
                    <p className="text-slate-400">Manage delivery hub locations</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" />Add Location
                </button>
            </div>

            <DataTable data={locations} columns={columns} loading={isLoading} searchPlaceholder="Search locations..." />
        </div>
    );
}
