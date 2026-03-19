'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDeliveryList } from '@/hooks/useOrders';
import { CalendarDays, Store, RotateCcw, Download } from 'lucide-react';

// Only these drivers appear in Dairy Pickup (matching React admin)
const DAIRY_PICKUP_DRIVERS = ['00 swarg office', '01  kanakpura', '01 kanakpura'];

interface ProductAgg {
    title: string;
    qty_text: string;
    qty: number;
}

interface DriverGroup {
    driverName: string;
    products: ProductAgg[];
    totalQty: number;
}

export default function DairyPickupPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [date, setDate] = useState(today);
    const { data: items = [], isLoading } = useDeliveryList(date);

    // Group by driver, aggregate products — only dairy pickup drivers
    const driverGroups = useMemo((): DriverGroup[] => {
        const driverMap = new Map<string, Map<string, ProductAgg>>();

        items.forEach((item) => {
            const driver = item.delivery_boy_name || 'Unassigned';

            // Only include dairy pickup drivers
            if (!DAIRY_PICKUP_DRIVERS.some(d => driver.toLowerCase().startsWith(d))) return;

            if (!driverMap.has(driver)) {
                driverMap.set(driver, new Map());
            }
            const products = driverMap.get(driver)!;
            const key = item.product_title;
            if (!key) return;

            const existing = products.get(key);
            if (existing) {
                existing.qty += item.qty || 1;
            } else {
                products.set(key, {
                    title: key,
                    qty_text: item.qty_text || '',
                    qty: item.qty || 1,
                });
            }
        });

        return Array.from(driverMap.entries())
            .map(([driverName, products]) => ({
                driverName,
                products: Array.from(products.values()).sort((a, b) => a.title.localeCompare(b.title)),
                totalQty: Array.from(products.values()).reduce((sum, p) => sum + p.qty, 0),
            }))
            .sort((a, b) => a.driverName.localeCompare(b.driverName));
    }, [items]);

    const totalQty = driverGroups.reduce((sum, g) => sum + g.totalQty, 0);

    const handleExport = () => {
        const rows = [['Pickup Point', 'Product Title', 'Quantity Text', 'Quantity']];
        driverGroups.forEach(g => {
            g.products.forEach(p => {
                rows.push([g.driverName, p.title, p.qty_text, String(p.qty)]);
            });
        });
        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Dairy_Pickup_${date}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Store className="w-7 h-7 text-purple-400" />
                        Dairy Pickup
                    </h1>
                    <p className="text-slate-400">Pickup point product aggregation</p>
                </div>
                <div className="flex items-center gap-3">
                    <CalendarDays className="w-5 h-5 text-slate-400" />
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm"
                    />
                    <button onClick={() => setDate(today)} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 hover:text-white">
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button onClick={handleExport} disabled={driverGroups.length === 0}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white disabled:opacity-40">
                        <Download className="w-4 h-4" /> Export
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Pickup Points</p>
                    <p className="text-2xl font-bold text-white">{driverGroups.length}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Quantity</p>
                    <p className="text-2xl font-bold text-purple-400">{totalQty}</p>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {[...Array(2)].map((_, i) => (
                        <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : driverGroups.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center">
                    <p className="text-slate-400">No dairy pickup data for this date.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {driverGroups.map((group) => (
                        <div key={group.driverName} className="glass rounded-xl overflow-hidden">
                            <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                                <h3 className="font-semibold text-white">{group.driverName}</h3>
                                <span className="text-sm text-purple-400 font-medium">{group.totalQty} qty</span>
                            </div>
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-800/50">
                                        <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product Title</th>
                                        <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium w-32">Qty Text</th>
                                        <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-24">Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {group.products.map((p) => (
                                        <tr key={p.title} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                            <td className="px-4 py-2.5 text-sm text-white">{p.title}</td>
                                            <td className="px-4 py-2.5 text-sm text-slate-400">{p.qty_text}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-bold">
                                                    {p.qty}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
