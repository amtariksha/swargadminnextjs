'use client';

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { useDrivers } from '@/hooks/useData';
import { useDeliveryList, DeliveryItem } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { selectClassName } from '@/components/FormField';
import { CalendarDays, Package } from 'lucide-react';

export default function PackingListPage() {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [date, setDate] = useState(tomorrow);
    const [selectedDriver, setSelectedDriver] = useState('');

    const { data: deliveryItems = [], isLoading } = useDeliveryList(date);
    const { data: drivers = [] } = useDrivers();

    const filteredItems = useMemo(() => {
        if (!selectedDriver) return deliveryItems;
        return deliveryItems.filter((item) => String(item.delivery_boy_id) === selectedDriver);
    }, [deliveryItems, selectedDriver]);

    // Group items by product for summary
    const productSummary = useMemo(() => {
        const map = new Map<string, { title: string; totalQty: number; count: number }>();
        filteredItems.forEach((item) => {
            const key = item.product_title;
            const existing = map.get(key);
            if (existing) {
                existing.totalQty += item.qty || 1;
                existing.count += 1;
            } else {
                map.set(key, { title: key, totalQty: item.qty || 1, count: 1 });
            }
        });
        return Array.from(map.values());
    }, [filteredItems]);

    const columns: Column<DeliveryItem>[] = [
        { key: 'order_id', header: 'Order', width: '70px' },
        {
            key: 'user_name', header: 'Customer',
            render: (i) => (
                <div>
                    <p className="text-white font-medium">{i.user_name || '-'}</p>
                    <p className="text-xs text-slate-400">{i.user_phone || '-'}</p>
                </div>
            ),
        },
        { key: 'product_title', header: 'Product' },
        { key: 'qty', header: 'Qty', width: '60px', render: (i) => <span className="font-semibold text-white">{i.qty}</span> },
        { key: 'delivery_boy_name', header: 'Driver', render: (i) => i.delivery_boy_name || '-' },
        {
            key: 'address', header: 'Address',
            render: (i) => (
                <span className="text-slate-400 text-sm truncate max-w-[200px] block">
                    {i.address || '-'}
                </span>
            ),
        },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (i) => {
                const labels: Record<number, { text: string; class: string }> = {
                    1: { text: 'Pending', class: 'bg-yellow-500/20 text-yellow-400' },
                    2: { text: 'Not Delivered', class: 'bg-red-500/20 text-red-400' },
                    3: { text: 'Delivered', class: 'bg-green-500/20 text-green-400' },
                };
                const status = labels[i.status] || labels[1];
                return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${status.class}`}>{status.text}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Packing List</h1>
                    <p className="text-slate-400">Items to pack for delivery</p>
                </div>
                <div className="flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-slate-400" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                    <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} className={selectClassName} style={{ maxWidth: '200px' }}>
                        <option value="">All Drivers</option>
                        {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Product Summary */}
            {productSummary.length > 0 && (
                <div className="glass rounded-xl p-4">
                    <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <Package className="w-5 h-5 text-purple-400" /> Packing Summary
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
                    <p className="text-sm text-slate-400">Total Items</p>
                    <p className="text-2xl font-bold text-white">{filteredItems.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Quantity</p>
                    <p className="text-2xl font-bold text-purple-400">
                        {filteredItems.reduce((s, i) => s + (i.qty || 1), 0)}
                    </p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Delivered</p>
                    <p className="text-2xl font-bold text-green-400">
                        {filteredItems.filter((i) => i.status === 3).length}
                    </p>
                </div>
            </div>

            <DataTable
                data={filteredItems}
                columns={columns}
                loading={isLoading}
                pageSize={20}
                searchPlaceholder="Search items..."
                emptyMessage="No items for this date"
            />
        </div>
    );
}
