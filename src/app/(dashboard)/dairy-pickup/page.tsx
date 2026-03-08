'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDeliveryList, DeliveryItem } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { CalendarDays, Store } from 'lucide-react';

export default function DairyPickupPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [date, setDate] = useState(today);
    const { data: items = [], isLoading } = useDeliveryList(date);

    // Filter for pickup items (those with specific pickup routes/locations)
    // Pickup items typically have specific route names or delivery_boy_name indicating pickup points
    const pickupItems = useMemo(
        () => items.filter((i) => {
            const route = (i.route || '').toLowerCase();
            const driver = (i.delivery_boy_name || '').toLowerCase();
            return route.includes('pickup') || route.includes('dairy') || route.includes('store') ||
                driver.includes('pickup') || driver.includes('dairy') || driver.includes('store');
        }),
        [items]
    );

    // If no pickup-specific items found, show all items (fallback behavior matching old admin)
    const displayItems = pickupItems.length > 0 ? pickupItems : items;

    // Product summary
    const productSummary = useMemo(() => {
        const map = new Map<string, { title: string; totalQty: number; count: number }>();
        displayItems.forEach((item) => {
            const existing = map.get(item.product_title);
            if (existing) {
                existing.totalQty += item.qty || 1;
                existing.count += 1;
            } else {
                map.set(item.product_title, { title: item.product_title, totalQty: item.qty || 1, count: 1 });
            }
        });
        return Array.from(map.values());
    }, [displayItems]);

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
        {
            key: 'address', header: 'Address',
            render: (i) => <span className="text-slate-400 text-sm truncate max-w-[200px] block">{i.address || '-'}</span>,
        },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (i) => {
                const labels: Record<number, { text: string; cls: string }> = {
                    1: { text: 'Pending', cls: 'bg-yellow-500/20 text-yellow-400' },
                    2: { text: 'Not Delivered', cls: 'bg-red-500/20 text-red-400' },
                    3: { text: 'Picked Up', cls: 'bg-green-500/20 text-green-400' },
                };
                const s = labels[i.status] || labels[1];
                return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${s.cls}`}>{s.text}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Dairy Pickup</h1>
                    <p className="text-slate-400">Store pickup orders</p>
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
                        <Store className="w-5 h-5 text-purple-400" /> Pickup Summary
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

            <div className="grid grid-cols-2 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Pickups</p>
                    <p className="text-2xl font-bold text-white">{displayItems.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Completed</p>
                    <p className="text-2xl font-bold text-green-400">
                        {displayItems.filter((i) => i.status === 3).length}
                    </p>
                </div>
            </div>

            <DataTable
                data={displayItems}
                columns={columns}
                loading={isLoading}
                pageSize={20}
                searchPlaceholder="Search orders..."
                emptyMessage="No pickup orders for this date"
            />
        </div>
    );
}
