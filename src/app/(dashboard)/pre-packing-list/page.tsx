'use client';

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { useUpcomingSubOrders, useUpcomingOrders, UpcomingSubOrder, UpcomingOrder } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { CalendarDays, Package } from 'lucide-react';

type CombinedOrder = {
    id: number;
    name: string;
    s_phone: string;
    title: string;
    qty: number;
    qty_text: string;
    order_amount?: number;
    subscription_type: number;
    delivery_boy_name?: string | null;
    flat_no?: string;
    apartment_name?: string;
    area?: string;
    city?: string;
    source: 'subscription' | 'normal';
};

const SUB_TYPE_LABELS: Record<number, string> = { 1: 'One Time', 2: 'Weekly', 3: 'Daily', 4: 'Alternative' };

export default function PrePackingListPage() {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [date, setDate] = useState(tomorrow);

    const { data: subOrders = [], isLoading: subLoading } = useUpcomingSubOrders(date);
    const { data: normalOrders = [], isLoading: normalLoading } = useUpcomingOrders();

    const isLoading = subLoading || normalLoading;

    // Combine subscription + normal orders
    const combinedOrders: CombinedOrder[] = useMemo(() => {
        const subItems: CombinedOrder[] = subOrders.map((o: UpcomingSubOrder) => ({
            id: o.id,
            name: o.name,
            s_phone: o.s_phone,
            title: o.title,
            qty: o.qty || 1,
            qty_text: o.qty_text,
            order_amount: o.order_amount,
            subscription_type: o.subscription_type,
            delivery_boy_name: o.delivery_boy_name,
            flat_no: o.flat_no,
            apartment_name: o.apartment_name,
            area: o.area,
            city: o.city,
            source: 'subscription',
        }));

        const normalItems: CombinedOrder[] = normalOrders.map((o: UpcomingOrder) => ({
            id: o.id,
            name: o.name,
            s_phone: o.s_phone,
            title: o.title,
            qty: o.qty || 1,
            qty_text: o.qty_text,
            order_amount: undefined,
            subscription_type: 1,
            delivery_boy_name: o.delivery_boy_name,
            flat_no: o.flat_no,
            apartment_name: o.apartment_name,
            area: o.area,
            city: o.city,
            source: 'normal',
        }));

        return [...subItems, ...normalItems];
    }, [subOrders, normalOrders]);

    // Product summary for packing
    const productSummary = useMemo(() => {
        const map = new Map<string, { title: string; totalQty: number; count: number }>();
        combinedOrders.forEach((o) => {
            const existing = map.get(o.title);
            if (existing) {
                existing.totalQty += o.qty;
                existing.count += 1;
            } else {
                map.set(o.title, { title: o.title, totalQty: o.qty, count: 1 });
            }
        });
        return Array.from(map.values());
    }, [combinedOrders]);

    const columns: Column<CombinedOrder>[] = [
        { key: 'id', header: 'Order', width: '70px' },
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
        { key: 'qty', header: 'Qty', width: '60px', render: (o) => <span className="font-semibold text-white">{o.qty}</span> },
        { key: 'qty_text', header: 'Unit', width: '80px' },
        {
            key: 'subscription_type', header: 'Type',
            render: (o) => (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${o.source === 'normal' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {o.source === 'normal' ? 'Normal' : SUB_TYPE_LABELS[o.subscription_type]}
                </span>
            ),
        },
        { key: 'delivery_boy_name', header: 'Driver', render: (o) => o.delivery_boy_name || '-' },
        {
            key: 'flat_no', header: 'Address',
            render: (o) => (
                <span className="text-slate-400 text-sm truncate max-w-[180px] block">
                    {[o.flat_no, o.apartment_name, o.area].filter(Boolean).join(', ') || '-'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Pre-Packing List</h1>
                    <p className="text-slate-400">Preview all upcoming orders before generating delivery list</p>
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

            {/* Product Summary */}
            {productSummary.length > 0 && (
                <div className="glass rounded-xl p-4">
                    <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <Package className="w-5 h-5 text-purple-400" /> Products to Pack
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {productSummary.map((p) => (
                            <div key={p.title} className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/30">
                                <p className="text-sm font-medium text-white truncate">{p.title}</p>
                                <div className="flex justify-between mt-1">
                                    <span className="text-xs text-slate-400">{p.count} orders</span>
                                    <span className="text-sm font-bold text-purple-400">{p.totalQty} qty</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Orders</p>
                    <p className="text-2xl font-bold text-white">{combinedOrders.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Subscription</p>
                    <p className="text-2xl font-bold text-purple-400">
                        {combinedOrders.filter((o) => o.source === 'subscription').length}
                    </p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Normal</p>
                    <p className="text-2xl font-bold text-blue-400">
                        {combinedOrders.filter((o) => o.source === 'normal').length}
                    </p>
                </div>
            </div>

            <DataTable
                data={combinedOrders}
                columns={columns}
                loading={isLoading}
                pageSize={20}
                searchPlaceholder="Search orders..."
                emptyMessage="No upcoming orders for this date"
            />
        </div>
    );
}
