'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import { toast } from 'sonner';
import DriverGroupTable from '@/components/DriverGroupTable';
import DateWithTodayButton from '@/components/DateWithTodayButton';
import {
    type DeliveryItem,
    aggregateAcrossGroups,
    aggregateProducts,
    dedupeDeliveryItems,
    driverGroupsToCsvUrl,
    groupByDriver,
    productsToCsvUrl,
} from '@/lib/deliveryHelpers';
import { Truck, Package, Milk, Download, Boxes, RefreshCw } from 'lucide-react';

type TabId = 'routewise' | 'packing' | 'dairy' | 'prepacking';

interface TabConfig {
    id: TabId;
    label: string;
    icon: React.ReactNode;
}

const TABS: TabConfig[] = [
    { id: 'routewise',  label: 'Delivery Truck',    icon: <Truck className="w-4 h-4" /> },
    { id: 'packing',    label: 'Packing List',      icon: <Package className="w-4 h-4" /> },
    { id: 'prepacking', label: 'Pre-Packing List',  icon: <Boxes className="w-4 h-4" /> },
    { id: 'dairy',      label: 'Dairy Pickup',      icon: <Milk className="w-4 h-4" /> },
];

interface PackingItem { product_id: number | null; product: string; qty: number; }
interface DryRunResult { date: string; considered: number; would_insert: number; packingList: PackingItem[]; }

/**
 * Production-delivery: bundles the three sub-views drivers actually use
 * during a morning route — all backed by the same /get_genrated_order_list
 * endpoint via useDeliveryList(date). Each tab maintains its own date so a
 * driver can flip from "today's routewise" to "tomorrow's packing" without
 * losing either selection.
 */
export default function ProductionDeliveryPage() {
    const today    = format(new Date(),                'yyyy-MM-dd');
    const tomorrow = format(addDays(new Date(), 1),    'yyyy-MM-dd');

    const [activeTab, setActiveTab]      = useState<TabId>('routewise');

    // Deep-link support: /production-delivery?tab=prepacking opens that tab
    // (used by the sidebar "Pre-Packing List" entry). Read once on mount to
    // avoid a useSearchParams Suspense boundary.
    useEffect(() => {
        const t = new URLSearchParams(window.location.search).get('tab');
        if (t && TABS.some((tab) => tab.id === t)) setActiveTab(t as TabId);
    }, []);

    const [routewiseDate, setRoutewiseDate] = useState(today);
    const [packingDate,   setPackingDate]   = useState(tomorrow);
    const [dairyDate,     setDairyDate]     = useState(today);

    // Pre-Packing List: an on-demand DRY RUN of tomorrow's generation (nothing
    // written), aggregated to total quantity-to-pack per product. Unlike the
    // "Packing List" tab (which reads the already-generated list), this works
    // before the list is generated.
    const [prepackLoading, setPrepackLoading] = useState(false);
    const [prepackResult, setPrepackResult]   = useState<DryRunResult | null>(null);
    const runPrepack = useCallback(async () => {
        setPrepackLoading(true);
        try {
            const res = await POST<DryRunResult>('/genrate_order_list', { date: tomorrow, dryRun: true });
            setPrepackResult(res?.data ?? null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to run quantity check');
        } finally {
            setPrepackLoading(false);
        }
    }, [tomorrow]);
    const prepackItems = prepackResult?.packingList ?? [];
    const prepackTotalUnits = prepackItems.reduce((s, i) => s + (i.qty || 0), 0);

    const dateForActive =
        activeTab === 'routewise' ? routewiseDate :
        activeTab === 'packing'   ? packingDate   :
        dairyDate;

    // Same endpoint as the admin /delivery-list page; the response is the
    // canonical DeliveryItem shape used by deliveryHelpers (group/aggregate
    // helpers operate on it directly).
    const { data: rawItems = [], isLoading } = useQuery({
        queryKey: ['delivery-list', dateForActive],
        queryFn: async () => {
            const response = await GET<DeliveryItem[]>(`/get_genrated_order_list/${dateForActive}`);
            return response.data || [];
        },
    });

    const uniqueItems = useMemo(
        () => dedupeDeliveryItems(rawItems),
        [rawItems]
    );

    const routewiseGroups = useMemo(
        () => groupByDriver(uniqueItems, false),
        [uniqueItems]
    );
    const dairyGroups = useMemo(
        () => groupByDriver(uniqueItems, true),
        [uniqueItems]
    );
    const packingProducts = useMemo(
        () => aggregateProducts(uniqueItems),
        [uniqueItems]
    );
    // Truck-load summary: sum of products across the routewise (non-dairy)
    // groups. Equivalent to packingProducts minus dairyGroups' products.
    // Drives the "what gets loaded onto the truck" table at the top of the
    // Delivery Truck tab.
    const truckSummary = useMemo(
        () => aggregateAcrossGroups(routewiseGroups),
        [routewiseGroups]
    );
    const truckTotalQty = truckSummary.reduce((s, p) => s + p.qty, 0);

    // Pickup summary: same idea as truck-load, but for dairy-pickup drivers.
    // Total of every product to be collected on the dairy pickup runs.
    const pickupSummary = useMemo(
        () => aggregateAcrossGroups(dairyGroups),
        [dairyGroups]
    );
    const pickupTotalQty = pickupSummary.reduce((s, p) => s + p.qty, 0);

    const handleExportRoutewise = useCallback(() => {
        const url = driverGroupsToCsvUrl(routewiseGroups, routewiseDate);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Routewise_${routewiseDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [routewiseGroups, routewiseDate]);

    const handleExportDairy = useCallback(() => {
        const url = driverGroupsToCsvUrl(dairyGroups, dairyDate);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Dairy_Pickup_${dairyDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [dairyGroups, dairyDate]);

    const handleExportPacking = useCallback(() => {
        const url = productsToCsvUrl(packingProducts);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Packing_List_${packingDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [packingProducts, packingDate]);

    const totalPackingQty = packingProducts.reduce((s, p) => s + p.qty, 0);

    return (
        <div className="space-y-4">
            {/* Sticky tab strip */}
            <div className="sticky top-[57px] z-20 -mx-4 lg:mx-0 px-4 lg:px-0 py-2 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/50">
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm whitespace-nowrap border transition-colors flex-shrink-0
                                ${activeTab === t.id
                                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                                    : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:text-white'
                                }`}
                        >
                            {t.icon}
                            <span>{t.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Per-tab body */}
            {activeTab === 'routewise' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Truck className="w-5 h-5 text-purple-400" />
                            Delivery Truck
                        </h2>
                        <DateWithTodayButton
                            value={routewiseDate}
                            onChange={setRoutewiseDate}
                            resetLabel="Today"
                        />
                    </div>
                    {isLoading ? (
                        <div className="glass rounded-xl p-12 text-center">
                            <p className="text-slate-400">Loading…</p>
                        </div>
                    ) : (
                        <>
                            {/* Truck-load summary: total of every product going on the
                                truck for the selected date. Equals the Packing List
                                minus Dairy Pickup. Helps the loader confirm what to
                                pull from cold storage before driving out. */}
                            {truckSummary.length > 0 && (
                                <div className="glass rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                                        <h3 className="font-semibold text-white">Truck Load Summary</h3>
                                        <span className="text-sm text-purple-400 font-medium">
                                            {truckSummary.length} products · {truckTotalQty} qty
                                        </span>
                                    </div>
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-800/50">
                                                <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product</th>
                                                <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium w-24">Qty Text</th>
                                                <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-20">Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {truckSummary.map((p) => (
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
                            )}
                            <DriverGroupTable
                                groups={routewiseGroups}
                                emptyMsg="No routewise deliveries for this date."
                                onExport={handleExportRoutewise}
                            />
                        </>
                    )}
                </div>
            )}

            {activeTab === 'packing' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Package className="w-5 h-5 text-purple-400" />
                            Packing List
                        </h2>
                        <DateWithTodayButton
                            value={packingDate}
                            onChange={setPackingDate}
                            pickerDisabled
                            resetLabel="Today"
                        />
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span><strong className="text-white">{packingProducts.length}</strong> products</span>
                            <span><strong className="text-purple-400">{totalPackingQty}</strong> total qty</span>
                        </div>
                        <button
                            onClick={handleExportPacking}
                            disabled={packingProducts.length === 0}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs text-slate-300 hover:text-white disabled:opacity-40"
                        >
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </button>
                    </div>
                    {isLoading ? (
                        <div className="glass rounded-xl p-12 text-center">
                            <p className="text-slate-400">Loading…</p>
                        </div>
                    ) : packingProducts.length === 0 ? (
                        <div className="glass rounded-xl p-12 text-center">
                            <p className="text-slate-400">No packing items for this date.</p>
                            <p className="text-xs text-slate-500 mt-2">
                                The packing list is generated from the day&apos;s order list — make sure
                                an admin has clicked &quot;Generate List&quot; for this date.
                            </p>
                        </div>
                    ) : (
                        <div className="glass rounded-xl overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-800/50 bg-slate-800/30">
                                        <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product</th>
                                        <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium w-24">Qty Text</th>
                                        <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-20">Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {packingProducts.map((p) => (
                                        <tr key={p.title} className="border-b border-slate-800/30">
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
                    )}
                </div>
            )}

            {activeTab === 'prepacking' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Boxes className="w-5 h-5 text-purple-400" />
                            Pre-Packing List — {tomorrow}
                        </h2>
                        <button onClick={runPrepack} disabled={prepackLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                            {prepackLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                            {prepackLoading ? 'Checking…' : 'Run quantity check'}
                        </button>
                    </div>

                    {!prepackResult && !prepackLoading && (
                        <div className="glass rounded-xl p-10 text-center text-slate-500">
                            Dry run — nothing is saved. Click <span className="text-slate-300 font-medium">Run quantity check</span> to compute tomorrow&apos;s packing quantities.
                        </div>
                    )}

                    {prepackResult && (
                        <>
                            <div className="glass rounded-xl overflow-hidden">
                                <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                                    <h3 className="font-semibold text-white">Quantity to pack</h3>
                                    <span className="text-sm text-purple-400 font-medium">
                                        {prepackItems.length} products · {prepackTotalUnits} units · {prepackResult.would_insert} deliveries
                                    </span>
                                </div>
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-800/50">
                                            <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product</th>
                                            <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-32">Qty to pack</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {prepackItems.length === 0 ? (
                                            <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">Nothing to pack for {tomorrow}.</td></tr>
                                        ) : prepackItems.map((it) => (
                                            <tr key={it.product_id ?? it.product} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                                <td className="px-4 py-2.5 text-sm text-white">{it.product}</td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-sm font-bold">{it.qty}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-xs text-slate-500">
                                Net of wallet allocation — low-balance orders that would be skipped or partially
                                delivered are already reflected, so this is what will actually go out.
                            </p>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'dairy' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Milk className="w-5 h-5 text-purple-400" />
                            Dairy Pickup
                        </h2>
                        <DateWithTodayButton
                            value={dairyDate}
                            onChange={setDairyDate}
                            resetLabel="Today"
                        />
                    </div>
                    {isLoading ? (
                        <div className="glass rounded-xl p-12 text-center">
                            <p className="text-slate-400">Loading…</p>
                        </div>
                    ) : (
                        <>
                            {/* Pickup summary: total of every product to collect on
                                the dairy-pickup runs for the selected date. Mirrors
                                the truck-load summary on the Delivery Truck tab. */}
                            {pickupSummary.length > 0 && (
                                <div className="glass rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
                                        <h3 className="font-semibold text-white">Pickup Summary</h3>
                                        <span className="text-sm text-purple-400 font-medium">
                                            {pickupSummary.length} products · {pickupTotalQty} qty
                                        </span>
                                    </div>
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-800/50">
                                                <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium">Product</th>
                                                <th className="text-left px-4 py-2 text-xs text-slate-400 font-medium w-24">Qty Text</th>
                                                <th className="text-right px-4 py-2 text-xs text-slate-400 font-medium w-20">Qty</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pickupSummary.map((p) => (
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
                            )}
                            <DriverGroupTable
                                groups={dairyGroups}
                                emptyMsg="No dairy pickup routes for this date."
                                onExport={handleExportDairy}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
