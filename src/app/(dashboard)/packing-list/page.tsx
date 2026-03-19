'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDeliveryList } from '@/hooks/useOrders';
import DataTable, { Column } from '@/components/DataTable';
import { CalendarDays, Package, RotateCcw } from 'lucide-react';

interface ProductRow {
    title: string;
    qty_text: string;
    qty: number;
}

export default function PackingListPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [date, setDate] = useState(today);
    const { data: items = [], isLoading } = useDeliveryList(date);

    // Aggregate products by title (like React admin PackingList.jsx)
    const productRows = useMemo(() => {
        const map = new Map<string, ProductRow>();
        items.forEach((item) => {
            const key = item.product_title;
            if (!key) return;
            const existing = map.get(key);
            if (existing) {
                existing.qty += item.qty || 1;
            } else {
                map.set(key, {
                    title: key,
                    qty_text: item.qty_text || '',
                    qty: item.qty || 1,
                });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
    }, [items]);

    const totalQty = productRows.reduce((sum, p) => sum + p.qty, 0);

    const columns: Column<ProductRow>[] = [
        { key: 'title', header: 'Product Title' },
        { key: 'qty_text', header: 'Quantity Text', width: '150px' },
        {
            key: 'qty',
            header: 'Quantity',
            width: '100px',
            render: (item) => (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-bold">
                    {item.qty}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Package className="w-7 h-7 text-purple-400" />
                        Packing List
                    </h1>
                    <p className="text-slate-400">Aggregated product quantities for packing</p>
                </div>
                <div className="flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-slate-400" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm"
                    />
                    <button
                        onClick={() => setDate(today)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Products</p>
                    <p className="text-2xl font-bold text-white">{productRows.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Quantity</p>
                    <p className="text-2xl font-bold text-purple-400">{totalQty}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Orders</p>
                    <p className="text-2xl font-bold text-blue-400">{items.length}</p>
                </div>
            </div>

            <DataTable
                data={productRows}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search products..."
                emptyMessage="No items for this date. Generate the delivery list first."
            />
        </div>
    );
}
