'use client';

import { useState, useMemo, useCallback } from 'react';
import { format, addDays } from 'date-fns';
import { useUpcomingSubOrders, useUpcomingOrders, UpcomingSubOrder } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { CalendarDays, Package, Download, RotateCcw } from 'lucide-react';

import { parseApiDate } from '@/lib/dateUtils';
interface ProductRow {
    title: string;
    qty_text: string;
    qty: number;
}

// Get day code (0=Sunday, 1=Monday, ..., 6=Saturday)
function getDayCode(dateStr: string): number {
    return new Date(dateStr).getDay();
}

// Parse weekly day schedule JSON (handles malformed JSON from Laravel)
function parseWeeklyDays(str: string | undefined): Array<{ dayCode: number; qty: number }> {
    if (!str) return [];
    try {
        const fixed = str.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
        return JSON.parse(fixed);
    } catch {
        return [];
    }
}

// Filter subscription orders based on holidays, wallet, subscription eligibility
function filterSubscriptionOrders(data: UpcomingSubOrder[], date: string): UpcomingSubOrder[] {
    // Filter 1: holidays, wallet checks, subscription type validation
    const filter1 = data.filter((el) => {
        // Check user holidays
        const holiday = el.user_holiday?.find((h) => h.date === date);
        if (holiday) return false;

        if (el.order_type === 1) { // Prepaid
            if (el.subscription_type === 2) { // Weekly
                const dayCode = getDayCode(date);
                const days = parseWeeklyDays(el.selected_days_for_weekly);
                const matchingDay = days.find((d) => d.dayCode === dayCode);
                return matchingDay !== undefined && (el.wallet_amount || 0) >= matchingDay.qty * el.order_amount;
            } else if ([1, 3, 4].includes(el.subscription_type)) {
                return (el.wallet_amount || 0) >= el.order_amount;
            }
        } else if (el.order_type === 2) { // Postpaid
            return true;
        }
        return false;
    });

    // Filter 2: date checks, subscription patterns
    const filter2 = filter1.filter((el) => {
        const startDate = parseApiDate(el.start_date);
        if (!startDate) return false;
        const targetDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);

        if (targetDate < startDate) return false;

        if (el.subscription_type === 1) { // One Time
            return startDate.getTime() === targetDate.getTime();
        }
        if (el.subscription_type === 3) { // Daily
            return true;
        }
        if (el.subscription_type === 4) { // Alternative Days (every 2 days from start)
            const diffDays = Math.round((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays % 2 === 0;
        }
        if (el.subscription_type === 2) { // Weekly
            const dayCode = getDayCode(date);
            const days = parseWeeklyDays(el.selected_days_for_weekly);
            return days.some((d) => d.dayCode === dayCode);
        }
        return false;
    });

    return filter2;
}

// Aggregate products by title and sum quantities
function groupByProduct(items: Array<{ title: string; qty: number; qty_text: string }>): ProductRow[] {
    const map = new Map<string, ProductRow>();
    items.forEach(({ title, qty, qty_text }) => {
        if (!title) return;
        const existing = map.get(title);
        if (existing) {
            existing.qty += qty || 1;
        } else {
            map.set(title, { title, qty_text: qty_text || '', qty: qty || 1 });
        }
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export default function PrePackingListPage() {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const [date, setDate] = useState(tomorrow);

    const { data: subOrders = [], isLoading: subLoading } = useUpcomingSubOrders(date);
    const { data: normalOrders = [], isLoading: normalLoading } = useUpcomingOrders();

    const isLoading = subLoading || normalLoading;

    // Apply subscription filtering logic (matching React admin PrePackingList.jsx)
    const filteredSubOrders = useMemo(
        () => filterSubscriptionOrders(subOrders, date),
        [subOrders, date]
    );

    // Aggregate subscription orders by product
    const subProducts = useMemo(
        () => groupByProduct(filteredSubOrders),
        [filteredSubOrders]
    );

    // Aggregate normal orders by product
    const normalProducts = useMemo(
        () => groupByProduct(normalOrders.map(o => ({ title: o.title, qty: o.qty || 1, qty_text: o.qty_text }))),
        [normalOrders]
    );

    // Merge both lists (sum quantities for same product titles)
    const mergedProducts = useMemo(() => {
        const map = new Map<string, ProductRow>();
        [...subProducts, ...normalProducts].forEach(p => {
            const existing = map.get(p.title);
            if (existing) {
                existing.qty += p.qty;
            } else {
                map.set(p.title, { ...p });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
    }, [subProducts, normalProducts]);

    const totalQty = mergedProducts.reduce((sum, p) => sum + p.qty, 0);

    const handleExport = useCallback(() => {
        const rows = [['Product Title', 'Quantity Text', 'Quantity']];
        mergedProducts.forEach(p => rows.push([p.title, p.qty_text, String(p.qty)]));
        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Pre_Packing_List_${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [mergedProducts, date]);

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
                        Pre-Packing List
                    </h1>
                    <p className="text-slate-400">Tomorrow&apos;s delivery forecast (subscription + normal orders)</p>
                </div>
                <div className="flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-slate-400" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm"
                    />
                    <button onClick={() => setDate(tomorrow)} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 hover:text-white">
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={handleExport} disabled={mergedProducts.length === 0}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white disabled:opacity-40">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Products</p>
                    <p className="text-2xl font-bold text-white">{mergedProducts.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Quantity</p>
                    <p className="text-2xl font-bold text-purple-400">{totalQty}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Subscription Orders</p>
                    <p className="text-2xl font-bold text-blue-400">{filteredSubOrders.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Normal Orders</p>
                    <p className="text-2xl font-bold text-green-400">{normalOrders.length}</p>
                </div>
            </div>

            <DataTable
                data={mergedProducts}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search products..."
                emptyMessage="No upcoming orders for this date"
            />
        </div>
    );
}
