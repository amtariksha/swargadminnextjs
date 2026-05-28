'use client';

import { useState } from 'react';
import { useUpcomingOrders, UpcomingOrder, useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Package, Truck, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export default function UpcomingOrdersPage() {
    const { data: orders = [], isLoading } = useUpcomingOrders();
    const { data: drivers = [] } = useDrivers();
    const queryClient = useQueryClient();
    const router = useRouter();
    const [selectedDriver, setSelectedDriver] = useState<string>('');
    const [activeTab, setActiveTab] = useState('orders');

    // Filter orders by driver
    const filteredOrders = selectedDriver
        ? orders.filter(o => o.delivery_boy_name?.includes(selectedDriver))
        : orders;

    // Calculate product quantities for packing list
    const packingList = orders.reduce((acc, order) => {
        const key = order.title;
        if (!acc[key]) {
            acc[key] = { title: key, qty: 0, qty_text: order.qty_text };
        }
        acc[key].qty += order.qty;
        return acc;
    }, {} as Record<string, { title: string; qty: number; qty_text: string }>);

    const columns: Column<UpcomingOrder>[] = [
        { key: 'id', header: 'Order ID', width: '80px' },
        {
            key: 'name',
            header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="text-sm text-slate-400">{item.s_phone}</p>
                </div>
            ),
        },
        {
            key: 'title',
            header: 'Product',
            render: (item) => (
                <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-400" />
                    <span className="text-white">{item.title}</span>
                </div>
            ),
        },
        {
            key: 'qty',
            header: 'Qty',
            render: (item) => (
                <span className="font-medium text-white">{item.qty} {item.qty_text}</span>
            ),
        },
        {
            key: 'delivery_boy_name',
            header: 'Delivery Boy',
            render: (item) => item.delivery_boy_name ? (
                <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-400" />
                    <span className="text-white">{item.delivery_boy_name}</span>
                </div>
            ) : <span className="text-slate-500">Not Assigned</span>,
        },
        {
            key: 'delivery_status',
            header: 'Status',
            render: (item) => item.delivery_status ? (
                <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle className="w-4 h-4" /> Delivered
                </span>
            ) : (
                <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-4 h-4" /> Not Delivered
                </span>
            ),
        },
        {
            key: 'pincode',
            header: 'Pincode',
            render: (item) => <span className="text-slate-400">{item.pincode}</span>,
        },
        {
            key: 'order_type',
            header: 'Type',
            render: (item) => {
                const types: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay Now', 4: 'Pay Later' };
                return <span className="text-slate-300">{types[item.order_type || 0] || '-'}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Upcoming Orders</h1>
                    <p className="text-slate-400">View and manage upcoming deliveries</p>
                </div>
                <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['upcoming-orders'] })}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-white rounded-xl"
                >
                    <RefreshCw className="w-4 h-4" /> Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white"
                >
                    <option value="">All Drivers</option>
                    {drivers.map((driver) => (
                        <option key={driver.id} value={driver.name}>
                            {driver.name} ({driver.phone})
                        </option>
                    ))}
                </select>
                <button
                    onClick={() => setSelectedDriver('')}
                    className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-xl"
                >
                    Reset
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700/50">
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-6 py-3 font-medium transition-colors ${activeTab === 'orders'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-slate-400 hover:text-white'
                        }`}
                >
                    Customer Orders ({filteredOrders.length})
                </button>
                <button
                    onClick={() => setActiveTab('packing')}
                    className={`px-6 py-3 font-medium transition-colors ${activeTab === 'packing'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-slate-400 hover:text-white'
                        }`}
                >
                    Packing List
                </button>
            </div>

            {activeTab === 'orders' ? (
                <DataTable
                    data={filteredOrders}
                    columns={columns}
                    loading={isLoading}
                    searchPlaceholder="Search orders..."
                    onRowClick={(order) => router.push(`/orders/${order.id}`)}
                />
            ) : (
                <div className="glass rounded-2xl overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Product</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Quantity</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.values(packingList).map((item, index) => (
                                <tr key={index} className="border-t border-slate-700/30">
                                    <td className="px-4 py-3 text-white">{item.title}</td>
                                    <td className="px-4 py-3 text-white font-medium">{item.qty}</td>
                                    <td className="px-4 py-3 text-slate-400">{item.qty_text}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
