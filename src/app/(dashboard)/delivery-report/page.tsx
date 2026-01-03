'use client';

import { useState } from 'react';
import { useDeliveryReport, DeliveryReportItem } from '@/hooks/useOrders';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { format, subDays } from 'date-fns';
import { Calendar, BarChart3, RefreshCw, User } from 'lucide-react';

export default function DeliveryReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const [startDate, setStartDate] = useState(weekAgo);
    const [endDate, setEndDate] = useState(today);
    const [selectedDriver, setSelectedDriver] = useState<number | undefined>();

    const { data: drivers = [] } = useDrivers();
    const { data: reportItems = [], isLoading, refetch } = useDeliveryReport(startDate, endDate, selectedDriver);

    // Group by date for summary
    const byDate = reportItems.reduce((acc, item) => {
        const date = item.date;
        if (!acc[date]) acc[date] = { count: 0, quantity: 0, amount: 0 };
        acc[date].count += 1;
        acc[date].quantity += item.qty;
        acc[date].amount += item.order_amount || 0;
        return acc;
    }, {} as Record<string, { count: number; quantity: number; amount: number }>);

    // Group by driver for summary
    const byDriver = reportItems.reduce((acc, item) => {
        const name = item.name || 'Unknown';
        if (!acc[name]) acc[name] = { count: 0, quantity: 0, amount: 0 };
        acc[name].count += 1;
        acc[name].quantity += item.qty;
        acc[name].amount += item.order_amount || 0;
        return acc;
    }, {} as Record<string, { count: number; quantity: number; amount: number }>);

    // Totals
    const totals = {
        count: reportItems.length,
        quantity: reportItems.reduce((sum, item) => sum + item.qty, 0),
        amount: reportItems.reduce((sum, item) => sum + (item.order_amount || 0), 0),
    };

    const columns: Column<DeliveryReportItem>[] = [
        { key: 'date', header: 'Date', width: '100px' },
        { key: 'name', header: 'Customer' },
        { key: 's_phone', header: 'Phone', width: '120px' },
        { key: 'title', header: 'Product' },
        {
            key: 'qty',
            header: 'Qty',
            width: '80px',
            render: (item) => (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium">
                    {item.qty}
                </span>
            )
        },
        {
            key: 'order_amount',
            header: 'Amount',
            width: '100px',
            render: (item) => (
                <span className="text-green-400 font-medium">₹{item.order_amount || 0}</span>
            )
        },
        {
            key: 'subscription_type',
            header: 'Type',
            width: '120px',
            render: (item) => {
                const types: Record<number, string> = {
                    1: 'One Time',
                    2: 'Weekly',
                    3: 'Monthly',
                    4: 'Alternate',
                };
                return <span className="text-slate-300">{types[item.subscription_type] || 'N/A'}</span>;
            },
        },
        { key: 'pincode', header: 'Pincode', width: '100px' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Delivery Report</h1>
                    <p className="text-slate-400">Analyze delivery performance</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {/* Driver Filter */}
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            value={selectedDriver || ''}
                            onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : undefined)}
                            className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none min-w-[180px]"
                        >
                            <option value="">All Drivers</option>
                            {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                    {driver.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                        />
                    </div>
                    <button
                        onClick={() => refetch()}
                        className="p-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl transition-colors"
                    >
                        <RefreshCw className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Orders</p>
                    <p className="text-2xl font-bold text-white">{totals.count}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Quantity</p>
                    <p className="text-2xl font-bold text-blue-400">{totals.quantity}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Amount</p>
                    <p className="text-2xl font-bold text-green-400">₹{totals.amount.toLocaleString()}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Unique Drivers</p>
                    <p className="text-2xl font-bold text-purple-400">{Object.keys(byDriver).length}</p>
                </div>
            </div>

            {/* By Driver Summary */}
            <div className="glass rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white">By Delivery Partner</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(byDriver).map(([name, stats]) => (
                        <div key={name} className="bg-slate-800/30 rounded-xl p-4">
                            <p className="font-medium text-white mb-2">{name}</p>
                            <div className="flex gap-4 text-sm">
                                <span className="text-slate-400">Orders: <span className="text-white font-semibold">{stats.count}</span></span>
                                <span className="text-blue-400">Qty: {stats.quantity}</span>
                                <span className="text-green-400">₹{stats.amount.toLocaleString()}</span>
                            </div>
                        </div>
                    ))}
                    {Object.keys(byDriver).length === 0 && !isLoading && (
                        <p className="text-slate-400 col-span-full">No data for selected date range</p>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <DataTable
                data={reportItems}
                columns={columns}
                loading={isLoading}
                title="Delivery Details"
                pageSize={25}
                searchPlaceholder="Search by customer, product, phone..."
            />
        </div>
    );
}
