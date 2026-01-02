'use client';

import { useRouter } from 'next/navigation';
import { useDrivers, Driver } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Truck, Phone } from 'lucide-react';

export default function DriversPage() {
    const router = useRouter();
    const { data: drivers = [], isLoading } = useDrivers();

    const columns: Column<Driver>[] = [
        { key: 'id', header: 'ID', width: '80px' },
        {
            key: 'name',
            header: 'Driver',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {item.name?.charAt(0).toUpperCase() || 'D'}
                    </div>
                    <div>
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.email}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'phone',
            header: 'Phone',
            render: (item) => (
                <div className="flex items-center gap-2 text-slate-300">
                    <Phone className="w-4 h-4 text-slate-500" />
                    {item.phone || '-'}
                </div>
            ),
        },
        {
            key: 'vehicle_number',
            header: 'Vehicle',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-400" />
                    <span className="font-mono text-sm">{item.vehicle_number || '-'}</span>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => {
                const isActive = item.status === 1;
                return (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                        {isActive ? 'Active' : 'Inactive'}
                    </span>
                );
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Drivers</h1>
                    <p className="text-slate-400">Manage delivery partners</p>
                </div>
                <button
                    onClick={() => router.push('/drivers/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                >
                    <Plus className="w-5 h-5" />
                    Add Driver
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Drivers</p>
                    <p className="text-2xl font-bold text-white">{drivers.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Active</p>
                    <p className="text-2xl font-bold text-green-400">
                        {drivers.filter(d => d.status === 1).length}
                    </p>
                </div>
            </div>

            <DataTable
                data={drivers}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search drivers..."
            />
        </div>
    );
}
