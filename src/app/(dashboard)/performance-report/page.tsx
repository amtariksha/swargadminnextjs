'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import { format, subDays, eachDayOfInterval, parse } from 'date-fns';
import { Calendar, Settings, RefreshCw, Clock, Package, Users, TrendingUp, Search, X } from 'lucide-react';

interface DeliveryData {
    name: string;
    mark_delivered_time_stamp: string;
    delivered_qty: number;
    order_user_id: number;
    title: string;
}

interface Product {
    id: number;
    title: string;
}

type DataType = 'time' | 'quantity' | 'count';

// Default configurable thresholds (stored in localStorage)
function getSettings() {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem('perf-report-settings');
        return stored ? JSON.parse(stored) : null;
    } catch { return null; }
}

function saveSettings(s: Record<string, string>) {
    localStorage.setItem('perf-report-settings', JSON.stringify(s));
}

const DEFAULTS = {
    timeBefore: '07:00',
    timeAfter: '07:30',
    qtyBefore: '50',
    qtyAfter: '100',
    countBefore: '10',
    countAfter: '20',
    colorBefore: '#22c55e',   // green
    colorBetween: '#eab308',  // yellow
    colorAfter: '#ef4444',    // red
    colorDefault: '#64748b',  // gray
};

export default function PerformanceReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const [startDate, setStartDate] = useState(weekAgo);
    const [endDate, setEndDate] = useState(today);
    const [dataType, setDataType] = useState<DataType>('time');
    const [selectedDrivers, setSelectedDrivers] = useState<number[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [driverSearch, setDriverSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [driverDropdown, setDriverDropdown] = useState(false);
    const [productDropdown, setProductDropdown] = useState(false);
    const driverRef = useRef<HTMLDivElement>(null);
    const productRef = useRef<HTMLDivElement>(null);

    const [settings, setSettingsState] = useState({ ...DEFAULTS, ...getSettings() });
    const updateSetting = (key: string, val: string) => {
        const next = { ...settings, [key]: val };
        setSettingsState(next);
        saveSettings(next);
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (driverRef.current && !driverRef.current.contains(e.target as Node)) setDriverDropdown(false);
            if (productRef.current && !productRef.current.contains(e.target as Node)) setProductDropdown(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const { data: drivers = [] } = useDrivers();
    const sortedDrivers = useMemo(() => [...drivers].sort((a, b) => (a.name || '').localeCompare(b.name || '')), [drivers]);
    const filteredDriverList = useMemo(() => {
        if (!driverSearch) return sortedDrivers;
        const q = driverSearch.toLowerCase();
        return sortedDrivers.filter(d => d.name?.toLowerCase().includes(q) || d.phone?.includes(q));
    }, [sortedDrivers, driverSearch]);

    const { data: products = [] } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const r = await GET<Product[]>('/get_product');
            return (r.data || []).sort((a, b) => a.title.localeCompare(b.title));
        },
    });
    const filteredProductList = useMemo(() => {
        if (!productSearch) return products;
        const q = productSearch.toLowerCase();
        return products.filter(p => p.title?.toLowerCase().includes(q));
    }, [products, productSearch]);

    const { data: rawReport = [], isLoading, refetch } = useQuery({
        queryKey: ['perf-report', startDate, endDate],
        queryFn: async () => {
            const r = await GET<DeliveryData[]>(`/get_report/delivery/${startDate}/${endDate}`);
            return r.data || [];
        },
        enabled: !!startDate && !!endDate,
    });

    // Filter by selected products
    const report = useMemo(() => {
        if (selectedProducts.length === 0) return rawReport;
        return rawReport.filter(item =>
            selectedProducts.some(p => item.title?.toLowerCase().includes(p.toLowerCase()))
        );
    }, [rawReport, selectedProducts]);

    // Generate date columns
    const dateColumns = useMemo(() => {
        if (!startDate || !endDate) return [];
        try {
            return eachDayOfInterval({
                start: parse(startDate, 'yyyy-MM-dd', new Date()),
                end: parse(endDate, 'yyyy-MM-dd', new Date()),
            }).map(d => format(d, 'yyyy-MM-dd'));
        } catch { return []; }
    }, [startDate, endDate]);

    // Process TIME data: latest delivery time per driver per date
    const timeData = useMemo(() => {
        const map: Record<string, Record<string, string>> = {};
        report.forEach(item => {
            const { name, mark_delivered_time_stamp } = item;
            if (!name || !mark_delivered_time_stamp) return;
            const dateKey = mark_delivered_time_stamp.slice(0, 10);
            const timeStr = mark_delivered_time_stamp.slice(11, 19);
            if (!map[name]) map[name] = {};
            if (!map[name][dateKey] || map[name][dateKey] < timeStr) {
                map[name][dateKey] = timeStr;
            }
        });
        return map;
    }, [report]);

    // Process QUANTITY data: total delivered qty per driver per date
    const qtyData = useMemo(() => {
        const map: Record<string, Record<string, number>> = {};
        report.forEach(item => {
            const { name, mark_delivered_time_stamp, delivered_qty } = item;
            if (!name || !mark_delivered_time_stamp) return;
            const dateKey = mark_delivered_time_stamp.slice(0, 10);
            if (!map[name]) map[name] = {};
            map[name][dateKey] = (map[name][dateKey] || 0) + (delivered_qty || 0);
        });
        return map;
    }, [report]);

    // Process COUNT data: unique customers per driver per date
    const countData = useMemo(() => {
        const map: Record<string, Record<string, Set<number>>> = {};
        report.forEach(item => {
            const { name, mark_delivered_time_stamp, order_user_id } = item;
            if (!name || !mark_delivered_time_stamp) return;
            const dateKey = mark_delivered_time_stamp.slice(0, 10);
            if (!map[name]) map[name] = {};
            if (!map[name][dateKey]) map[name][dateKey] = new Set();
            map[name][dateKey].add(order_user_id);
        });
        // Convert Sets to counts
        const result: Record<string, Record<string, number>> = {};
        Object.entries(map).forEach(([name, dates]) => {
            result[name] = {};
            Object.entries(dates).forEach(([date, set]) => {
                result[name][date] = set.size;
            });
        });
        return result;
    }, [report]);

    // Get driver names from active data
    const activeData = dataType === 'time' ? timeData : dataType === 'quantity' ? qtyData : countData;
    const driverNames = useMemo(() => {
        let names = Object.keys(activeData).sort((a, b) => a.localeCompare(b));
        if (selectedDrivers.length > 0) {
            const selectedNames = new Set(drivers.filter(d => selectedDrivers.includes(d.id)).map(d => d.name));
            names = names.filter(n => selectedNames.has(n));
        }
        return names;
    }, [activeData, selectedDrivers, drivers]);

    // Color logic
    const getCellColor = (dateKey: string, driverName: string): string => {
        if (dataType === 'time') {
            const val = timeData[driverName]?.[dateKey];
            if (!val || val === '00:00:00') return settings.colorDefault;
            const t = val.substring(0, 5);
            if (t < settings.timeBefore) return settings.colorBefore;
            if (t >= settings.timeBefore && t < settings.timeAfter) return settings.colorBetween;
            return settings.colorAfter;
        }
        const numData = dataType === 'quantity' ? qtyData : countData;
        const val = numData[driverName]?.[dateKey];
        if (!val) return settings.colorDefault;
        const before = parseInt(dataType === 'quantity' ? settings.qtyBefore : settings.countBefore);
        const after = parseInt(dataType === 'quantity' ? settings.qtyAfter : settings.countAfter);
        if (val > after) return settings.colorBefore;
        if (val > before) return settings.colorBetween;
        return settings.colorAfter;
    };

    const getCellValue = (dateKey: string, driverName: string): string => {
        if (dataType === 'time') {
            const val = timeData[driverName]?.[dateKey];
            if (!val) return '';
            try {
                const [h, m] = val.split(':');
                const hour = parseInt(h);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const h12 = hour % 12 || 12;
                return `${h12}:${m} ${ampm}`;
            } catch { return val; }
        }
        const numData = dataType === 'quantity' ? qtyData : countData;
        const val = numData[driverName]?.[dateKey];
        return val ? String(val) : '';
    };

    const toggleDriver = (id: number) => {
        setSelectedDrivers(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    };
    const toggleProduct = (title: string) => {
        setSelectedProducts(prev => prev.includes(title) ? prev.filter(p => p !== title) : [...prev, title]);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <TrendingUp className="w-8 h-8 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Performance Report</h1>
                        <p className="text-slate-400">Driver performance by date</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-start gap-3">
                {/* Multi-select Driver dropdown */}
                <div ref={driverRef} className="relative min-w-[250px]">
                    <button onClick={() => { setDriverDropdown(!driverDropdown); setProductDropdown(false); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                        <span className="truncate">{selectedDrivers.length ? `${selectedDrivers.length} drivers` : 'All Drivers'}</span>
                        {selectedDrivers.length > 0 && <X className="w-3.5 h-3.5 text-slate-400" onClick={(e) => { e.stopPropagation(); setSelectedDrivers([]); }} />}
                    </button>
                    {driverDropdown && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-hidden">
                            <div className="p-2 border-b border-slate-700">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input type="text" value={driverSearch} onChange={(e) => setDriverSearch(e.target.value)}
                                        placeholder="Search drivers..." autoFocus
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500" />
                                </div>
                            </div>
                            <div className="overflow-y-auto max-h-48">
                                {filteredDriverList.map(d => (
                                    <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-slate-700/50 cursor-pointer">
                                        <input type="checkbox" checked={selectedDrivers.includes(d.id)} onChange={() => toggleDriver(d.id)}
                                            className="rounded border-slate-600" />
                                        {d.name} <span className="text-slate-500">({d.phone})</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Multi-select Product dropdown */}
                <div ref={productRef} className="relative min-w-[200px]">
                    <button onClick={() => { setProductDropdown(!productDropdown); setDriverDropdown(false); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white">
                        <span className="truncate">{selectedProducts.length ? `${selectedProducts.length} products` : 'All Products'}</span>
                        {selectedProducts.length > 0 && <X className="w-3.5 h-3.5 text-slate-400" onClick={(e) => { e.stopPropagation(); setSelectedProducts([]); }} />}
                    </button>
                    {productDropdown && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-hidden">
                            <div className="p-2 border-b border-slate-700">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="Search products..." autoFocus
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500" />
                                </div>
                            </div>
                            <div className="overflow-y-auto max-h-48">
                                {filteredProductList.map(p => (
                                    <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-slate-700/50 cursor-pointer">
                                        <input type="checkbox" checked={selectedProducts.includes(p.title)} onChange={() => toggleProduct(p.title)}
                                            className="rounded border-slate-600" />
                                        {p.title}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                    <span className="text-slate-400">-</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setShowSettings(!showSettings)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white">
                    <Settings className="w-4 h-4" /> Settings
                </button>
                <button onClick={() => refetch()}
                    className="flex items-center gap-2 p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 hover:text-white">
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-400">Legend:</span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: settings.colorBefore }} />
                    {dataType === 'time' ? `Before ${settings.timeBefore}` : 'Good'}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: settings.colorBetween }} />
                    {dataType === 'time' ? `${settings.timeBefore} - ${settings.timeAfter}` : 'Average'}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: settings.colorAfter }} />
                    {dataType === 'time' ? `After ${settings.timeAfter}` : 'Below target'}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: settings.colorDefault }} />
                    No data
                </span>
            </div>

            {/* Data type toggle */}
            <div className="flex gap-2">
                {([
                    { key: 'time' as DataType, label: 'Time', icon: Clock },
                    { key: 'quantity' as DataType, label: 'Quantity', icon: Package },
                    { key: 'count' as DataType, label: 'Customer Count', icon: Users },
                ]).map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setDataType(key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                            dataType === key ? 'bg-purple-500 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'
                        }`}>
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="glass rounded-xl p-6 space-y-4">
                    <h3 className="text-lg font-semibold text-white">Configure Thresholds</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Before Time</label>
                            <input type="time" value={settings.timeBefore} onChange={(e) => updateSetting('timeBefore', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">After Time</label>
                            <input type="time" value={settings.timeAfter} onChange={(e) => updateSetting('timeAfter', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Qty Threshold (Low)</label>
                            <input type="number" value={settings.qtyBefore} onChange={(e) => updateSetting('qtyBefore', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Qty Threshold (High)</label>
                            <input type="number" value={settings.qtyAfter} onChange={(e) => updateSetting('qtyAfter', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Count Threshold (Low)</label>
                            <input type="number" value={settings.countBefore} onChange={(e) => updateSetting('countBefore', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Count Threshold (High)</label>
                            <input type="number" value={settings.countAfter} onChange={(e) => updateSetting('countAfter', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { key: 'colorBefore', label: 'Good Color' },
                            { key: 'colorBetween', label: 'Average Color' },
                            { key: 'colorAfter', label: 'Below Target Color' },
                            { key: 'colorDefault', label: 'No Data Color' },
                        ].map(({ key, label }) => (
                            <div key={key}>
                                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                                <input type="color" value={settings[key as keyof typeof settings]}
                                    onChange={(e) => updateSetting(key, e.target.value)}
                                    className="w-full h-10 rounded-xl border border-slate-700/50 cursor-pointer" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Performance Table */}
            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-800/50 rounded animate-pulse" />)}
                </div>
            ) : driverNames.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center">
                    <p className="text-slate-400">No performance data for the selected period</p>
                </div>
            ) : (
                <div className="glass rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-700/50">
                                <th className="text-left px-4 py-3 text-slate-300 font-medium sticky left-0 bg-slate-900/95 z-10 min-w-[200px]">
                                    Driver Name
                                </th>
                                {dateColumns.map(d => (
                                    <th key={d} className="text-center px-3 py-3 text-slate-400 font-medium whitespace-nowrap min-w-[100px]">
                                        {format(new Date(d), 'dd/MM')}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {driverNames.map(name => (
                                <tr key={name} className="border-b border-slate-800/30">
                                    <td className="px-4 py-2.5 font-medium text-white sticky left-0 bg-slate-900/95 z-10">
                                        {name}
                                    </td>
                                    {dateColumns.map(d => {
                                        const val = getCellValue(d, name);
                                        const color = getCellColor(d, name);
                                        return (
                                            <td key={d} className="px-1 py-1 text-center">
                                                <span className="inline-block px-2 py-1 rounded-lg text-xs font-medium min-w-[70px]"
                                                    style={{ backgroundColor: color, color: '#fff' }}>
                                                    {val || '-'}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
