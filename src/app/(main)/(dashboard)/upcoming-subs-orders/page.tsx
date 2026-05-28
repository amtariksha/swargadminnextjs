'use client';

import { useState } from 'react';
import { format, addDays } from 'date-fns';
import { useUpcomingSubOrders, UpcomingSubOrder } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { CalendarDays } from 'lucide-react';

const SUB_TYPE_LABELS: Record<number, string> = { 1: 'One Time', 2: 'Weekly', 3: 'Daily', 4: 'Alternative' };

export default function UpcomingSubsOrdersPage() {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [date, setDate] = useState(tomorrow);
    const { data: orders = [], isLoading } = useUpcomingSubOrders(date);

    const columns: Column<UpcomingSubOrder>[] = [
        { key: 'id', header: 'Order ID', width: '80px' },
        {
            key: 'name', header: 'Customer',
            render: (o) => (
                <div>
                    <p className="text-white font-medium">{o.name}</p>
                    <p className="text-xs text-slate-400">{o.s_phone}</p>
                </div>
            ),
        },
        { key: 'title', header: 'Product' },
        { key: 'qty', header: 'Qty', width: '60px' },
        { key: 'qty_text', header: 'Unit', width: '80px' },
        {
            key: 'order_amount', header: 'Amount',
            render: (o) => <span className="text-emerald-400 font-semibold">₹{o.order_amount}</span>,
        },
        {
            key: 'subscription_type', header: 'Type',
            render: (o) => (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-medium">
                    {SUB_TYPE_LABELS[o.subscription_type] || '-'}
                </span>
            ),
        },
        { key: 'delivery_boy_name', header: 'Driver', render: (o) => o.delivery_boy_name || '-' },
        {
            key: 'wallet_amount', header: 'Wallet',
            render: (o) => <span className={`font-medium ${(o.wallet_amount || 0) < 100 ? 'text-red-400' : 'text-green-400'}`}>₹{o.wallet_amount || 0}</span>,
        },
        {
            key: 'flat_no', header: 'Address',
            render: (o) => (
                <span className="text-slate-400 text-sm truncate max-w-[200px] block">
                    {[o.flat_no, o.apartment_name, o.area].filter(Boolean).join(', ') || '-'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Upcoming Subscription Orders</h1>
                    <p className="text-slate-400">Subscription deliveries for a specific date</p>
                </div>
                <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-slate-400" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Orders</p>
                    <p className="text-2xl font-bold text-white">{orders.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Revenue</p>
                    <p className="text-2xl font-bold text-emerald-400">
                        ₹{orders.reduce((s, o) => s + (o.order_amount || 0), 0)}
                    </p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">On Holiday</p>
                    <p className="text-2xl font-bold text-orange-400">
                        {orders.filter((o) => o.user_holiday && o.user_holiday.some((h) => h.date === date)).length}
                    </p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Low Wallet</p>
                    <p className="text-2xl font-bold text-red-400">
                        {orders.filter((o) => (o.wallet_amount || 0) < 100).length}
                    </p>
                </div>
            </div>

            <DataTable
                data={orders}
                columns={columns}
                loading={isLoading}
                pageSize={20}
                searchPlaceholder="Search orders..."
                emptyMessage="No upcoming subscription orders for this date"
            />
        </div>
    );
}
