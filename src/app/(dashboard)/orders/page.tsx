'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrders, Order } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { format } from 'date-fns';
import { Plus, ShoppingCart, Eye, Calendar } from 'lucide-react';

const getOrderTypeLabel = (type: number) => {
    const types: Record<number, { label: string; color: string }> = {
        0: { label: 'One-time', color: 'bg-blue-500/20 text-blue-400' },
        1: { label: 'Subscription', color: 'bg-purple-500/20 text-purple-400' },
    };
    return types[type] || types[0];
};

const getStatusLabel = (status: number) => {
    const statuses: Record<number, { label: string; color: string }> = {
        0: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-400' },
        1: { label: 'Confirmed', color: 'bg-blue-500/20 text-blue-400' },
        2: { label: 'Delivered', color: 'bg-green-500/20 text-green-400' },
        3: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400' },
    };
    return statuses[status] || statuses[0];
};

export default function OrdersPage() {
    const router = useRouter();
    const [filterDate, setFilterDate] = useState('');

    const { data: orders = [], isLoading } = useOrders(filterDate || undefined);

    const columns: Column<Order>[] = [
        {
            key: 'id',
            header: 'Order ID',
            width: '100px',
            render: (item) => (
                <span className="font-mono text-purple-400">#{item.id}</span>
            ),
        },
        {
            key: 'product_title',
            header: 'Product',
            render: (item) => (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-800 rounded-lg overflow-hidden">
                        {item.product_photo ? (
                            <img
                                src={item.product_photo}
                                alt={item.product_title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <ShoppingCart className="w-5 h-5 text-slate-500" />
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="font-medium text-white">{item.product_title}</p>
                        <p className="text-xs text-slate-400">Qty: {item.quantity}</p>
                    </div>
                </div>
            ),
        },
        {
            key: 'user_name',
            header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.user_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{item.user_phone}</p>
                </div>
            ),
        },
        {
            key: 'order_type',
            header: 'Type',
            render: (item) => {
                const type = getOrderTypeLabel(item.order_type);
                return (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${type.color}`}>
                        {type.label}
                    </span>
                );
            },
        },
        {
            key: 'delivery_date',
            header: 'Delivery Date',
            render: (item) => (
                <span className="text-slate-300">
                    {item.delivery_date ? format(new Date(item.delivery_date), 'dd MMM yyyy') : '-'}
                </span>
            ),
        },
        {
            key: 'final_amount',
            header: 'Amount',
            render: (item) => (
                <span className="font-semibold text-green-400">₹{item.final_amount}</span>
            ),
        },
        {
            key: 'status',
            header: 'Status',
            render: (item) => {
                const status = getStatusLabel(item.status);
                return (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${status.color}`}>
                        {status.label}
                    </span>
                );
            },
        },
        {
            key: 'actions',
            header: 'Actions',
            sortable: false,
            render: (item) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/orders/${item.id}`);
                    }}
                    className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
                >
                    <Eye className="w-4 h-4 text-slate-400" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Orders</h1>
                    <p className="text-slate-400">Manage all customer orders</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                    </div>
                    <button
                        onClick={() => router.push('/orders/new')}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
                    >
                        <Plus className="w-5 h-5" />
                        New Order
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={orders}
                columns={columns}
                loading={isLoading}
                pageSize={15}
                searchPlaceholder="Search orders..."
                emptyMessage="No orders found"
                onRowClick={(item) => router.push(`/orders/${item.id}`)}
            />
        </div>
    );
}
