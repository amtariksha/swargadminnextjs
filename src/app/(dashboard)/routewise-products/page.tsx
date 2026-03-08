'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDeliveryList, DeliveryItem } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { CalendarDays, MapPin } from 'lucide-react';

export default function RoutewiseProductsPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [date, setDate] = useState(today);
    const { data: items = [], isLoading } = useDeliveryList(date);

    // Group items by driver (route)
    const routeGroups = useMemo(() => {
        const map = new Map<string, { driverName: string; items: DeliveryItem[]; totalQty: number }>();
        items.forEach((item) => {
            const driver = item.delivery_boy_name || 'Unassigned';
            const existing = map.get(driver);
            if (existing) {
                existing.items.push(item);
                existing.totalQty += item.qty || 1;
            } else {
                map.set(driver, { driverName: driver, items: [item], totalQty: item.qty || 1 });
            }
        });
        return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
    }, [items]);

    const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

    const displayItems = selectedRoute
        ? items.filter((i) => (i.delivery_boy_name || 'Unassigned') === selectedRoute)
        : items;

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
        { key: 'delivery_boy_name', header: 'Driver', render: (i) => i.delivery_boy_name || 'Unassigned' },
        {
            key: 'address', header: 'Address',
            render: (i) => <span className="text-slate-400 text-sm truncate max-w-[200px] block">{i.address || '-'}</span>,
        },
        { key: 'route', header: 'Route', render: (i) => i.route || '-' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Routewise Products</h1>
                    <p className="text-slate-400">Products grouped by delivery route</p>
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

            {/* Route Cards */}
            {routeGroups.length > 0 && (
                <div className="glass rounded-xl p-4">
                    <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-purple-400" /> Routes
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedRoute(null)}
                            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                                !selectedRoute
                                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                            }`}
                        >
                            All ({items.length})
                        </button>
                        {routeGroups.map((g) => (
                            <button
                                key={g.driverName}
                                onClick={() => setSelectedRoute(g.driverName)}
                                className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                                    selectedRoute === g.driverName
                                        ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                        : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                                }`}
                            >
                                {g.driverName} ({g.items.length} / {g.totalQty} qty)
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <DataTable
                data={displayItems}
                columns={columns}
                loading={isLoading}
                pageSize={20}
                searchPlaceholder="Search items..."
                emptyMessage="No items for this date"
            />
        </div>
    );
}
