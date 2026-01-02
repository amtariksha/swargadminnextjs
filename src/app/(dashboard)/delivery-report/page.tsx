'use client';

import { useDeliveryList } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { format } from 'date-fns';
import { useState } from 'react';
import { Calendar, BarChart3 } from 'lucide-react';

interface DeliveryReportItem {
    id: number;
    product_title: string;
    qty: number;
    delivery_boy_name: string | null;
    status: number;
    delivery_date: string;
}

export default function DeliveryReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [selectedDate, setSelectedDate] = useState(today);
    const { data: deliveryItems = [], isLoading } = useDeliveryList(selectedDate);

    // Group by delivery boy
    const byDeliveryBoy = deliveryItems.reduce((acc, item) => {
        const name = item.delivery_boy_name || 'Unassigned';
        if (!acc[name]) acc[name] = { total: 0, delivered: 0, pending: 0 };
        acc[name].total += 1;
        if (item.status === 1) acc[name].delivered += 1;
        else acc[name].pending += 1;
        return acc;
    }, {} as Record<string, { total: number; delivered: number; pending: number }>);

    const columns: Column<DeliveryReportItem>[] = [
        { key: 'product_title', header: 'Product' },
        { key: 'qty', header: 'Qty', render: (item) => <span className="font-semibold">{item.qty}</span> },
        { key: 'delivery_boy_name', header: 'Driver', render: (item) => item.delivery_boy_name || 'Unassigned' },
        {
            key: 'status',
            header: 'Status',
            render: (item) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${item.status === 1 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                    {item.status === 1 ? 'Delivered' : 'Pending'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Delivery Report</h1>
                    <p className="text-slate-400">Daily delivery performance summary</p>
                </div>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                </div>
            </div>

            {/* Summary by Driver */}
            <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white">By Delivery Partner</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(byDeliveryBoy).map(([name, stats]) => (
                        <div key={name} className="bg-slate-800/30 rounded-xl p-4">
                            <p className="font-medium text-white mb-2">{name}</p>
                            <div className="flex gap-4 text-sm">
                                <span className="text-slate-400">Total: <span className="text-white font-semibold">{stats.total}</span></span>
                                <span className="text-green-400">Done: {stats.delivered}</span>
                                <span className="text-yellow-400">Pending: {stats.pending}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <DataTable data={deliveryItems} columns={columns} loading={isLoading} title="Delivery Details" />
        </div>
    );
}
