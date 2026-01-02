'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useDeliveryList, DeliveryItem } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { Calendar, RefreshCw, Plus, Truck, Package } from 'lucide-react';

export default function DeliveryListPage() {
    const router = useRouter();
    const today = format(new Date(), 'yyyy-MM-dd');
    const [selectedDate, setSelectedDate] = useState(today);

    const { data: deliveryItems = [], isLoading, refetch } = useDeliveryList(selectedDate);

    const columns: Column<DeliveryItem>[] = [
        {
            key: 'id',
            header: 'ID',
            width: '80px',
        },
        {
            key: 'product_title',
            header: 'Product',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="font-medium text-white">{item.product_title}</span>
                </div>
            ),
        },
        {
            key: 'qty',
            header: 'Qty',
            width: '80px',
            render: (item) => (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium">
                    {item.qty}
                </span>
            ),
        },
        {
            key: 'user_name',
            header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.user_name || '-'}</p>
                    <p className="text-xs text-slate-400">{item.user_phone}</p>
                </div>
            ),
        },
        {
            key: 'delivery_boy_name',
            header: 'Delivery Partner',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-slate-400" />
                    <span>{item.delivery_boy_name || 'Unassigned'}</span>
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => {
                const statusMap: Record<number, { label: string; color: string }> = {
                    0: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-400' },
                    1: { label: 'Delivered', color: 'bg-green-500/20 text-green-400' },
                    2: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400' },
                };
                const status = statusMap[item.status] || statusMap[0];
                return (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${status.color}`}>
                        {status.label}
                    </span>
                );
            },
        },
    ];

    // Stats
    const stats = {
        total: deliveryItems.length,
        delivered: deliveryItems.filter(d => d.status === 1).length,
        pending: deliveryItems.filter(d => d.status === 0).length,
        cancelled: deliveryItems.filter(d => d.status === 2).length,
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Delivery List</h1>
                    <p className="text-slate-400">Manage today&apos;s deliveries</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="p-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl transition-colors"
                    >
                        <RefreshCw className="w-5 h-5 text-slate-400" />
                    </button>
                    <button
                        onClick={() => router.push('/orders/new')}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                    >
                        <Plus className="w-5 h-5" />
                        New Order
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total</p>
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Delivered</p>
                    <p className="text-2xl font-bold text-green-400">{stats.delivered}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Pending</p>
                    <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Cancelled</p>
                    <p className="text-2xl font-bold text-red-400">{stats.cancelled}</p>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={deliveryItems}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search deliveries..."
                emptyMessage="No deliveries found for this date"
                onRowClick={(item) => router.push(`/orders/${item.order_id}`)}
            />
        </div>
    );
}
