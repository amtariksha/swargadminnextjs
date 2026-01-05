'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import { format, subDays, eachDayOfInterval, parse } from 'date-fns';
import { Calendar, Settings, RefreshCw, Clock, Package, Users, TrendingUp } from 'lucide-react';

interface DeliveryData {
    id: number;
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

interface Driver {
    id: number;
    user_id: number;
    name: string;
    phone: string;
}

const defaultSettings = {
    timeBefore: '07:00',
    timeAfter: '07:30',
    countBefore: 10,
    countAfter: 20,
    qtyBefore: 50,
    qtyAfter: 100,
    colorBefore: '#22c55e', // green
    colorBetween: '#eab308', // yellow
    colorAfter: '#ef4444', // red
    colorDefault: '#64748b', // gray
};

export default function PerformanceReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const [startDate, setStartDate] = useState(weekAgo);
    const [endDate, setEndDate] = useState(today);
    const [selectedDrivers, setSelectedDrivers] = useState<number[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [dataType, setDataType] = useState<'time' | 'quantity' | 'count'>('time');
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState(defaultSettings);

    const { data: drivers = [] } = useDrivers();

    const { data: products = [] } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const response = await GET<Product[]>('/get_product');
            return response.data || [];
        },
    });

    const { data: rawData = [], isLoading, refetch } = useQuery({
        queryKey: ['performance-report', startDate, endDate],
        queryFn: async () => {
            const response = await GET<DeliveryData[]>(`/get_report/delivery/${startDate}/${endDate}`);
            return response.data || [];
        },
        enabled: !!startDate && !!endDate,
    });

    // Filter by selected products
    const filteredData = useMemo(() => {
        if (selectedProducts.length === 0) return rawData;
        return rawData.filter(item =>
            selectedProducts.some(p => item.title.toLowerCase().includes(p.toLowerCase()))
        );
    }, [rawData, selectedProducts]);

    // Get date columns
    const dateColumns = useMemo(() => {
        if (!startDate || !endDate) return [];
        try {
            const start = parse(startDate, 'yyyy-MM-dd', new Date());
            const end = parse(endDate, 'yyyy-MM-dd', new Date());
            return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
        } catch {
            return [];
        }
    }, [startDate, endDate]);

    // Process data for Time view - last delivery time per driver per date
    const timeData = useMemo(() => {
        const result: Record<string, Record<string, string>> = {};

        filteredData.forEach(item => {
            const { name, mark_delivered_time_stamp } = item;
            if (!mark_delivered_time_stamp) return;

            const date = format(new Date(mark_delivered_time_stamp), 'yyyy-MM-dd');
            const time = format(new Date(mark_delivered_time_stamp), 'HH:mm:ss');

            if (!result[name]) result[name] = {};

            if (!result[name][date] || result[name][date] < time) {
                result[name][date] = time;
            }
        });

        return result;
    }, [filteredData]);

    // Process data for Quantity view
    const quantityData = useMemo(() => {
        const result: Record<string, Record<string, number>> = {};

        filteredData.forEach(item => {
            const { name, mark_delivered_time_stamp, delivered_qty } = item;
            if (!mark_delivered_time_stamp) return;

            const date = format(new Date(mark_delivered_time_stamp), 'yyyy-MM-dd');

            if (!result[name]) result[name] = {};
            result[name][date] = (result[name][date] || 0) + (delivered_qty || 0);
        });

        return result;
    }, [filteredData]);

    // Process data for Customer Count view
    const countData = useMemo(() => {
        const result: Record<string, Record<string, Set<number>>> = {};

        filteredData.forEach(item => {
            const { name, mark_delivered_time_stamp, order_user_id } = item;
            if (!mark_delivered_time_stamp) return;

            const date = format(new Date(mark_delivered_time_stamp), 'yyyy-MM-dd');

            if (!result[name]) result[name] = {};
            if (!result[name][date]) result[name][date] = new Set();
            result[name][date].add(order_user_id);
        });

        // Convert Sets to counts
        const countResult: Record<string, Record<string, number>> = {};
        Object.entries(result).forEach(([name, dates]) => {
            countResult[name] = {};
            Object.entries(dates).forEach(([date, set]) => {
                countResult[name][date] = set.size;
            });
        });

        return countResult;
    }, [filteredData]);

    // Get rows for table
    const rows = useMemo(() => {
        let data: Record<string, Record<string, string | number>>;

        switch (dataType) {
            case 'time':
                data = timeData;
                break;
            case 'quantity':
                data = quantityData;
                break;
            case 'count':
                data = countData;
                break;
            default:
                data = timeData;
        }

        let names = Object.keys(data).sort();

        // Filter by selected drivers
        if (selectedDrivers.length > 0) {
            const driverNames = drivers
                .filter(d => selectedDrivers.includes(d.id))
                .map(d => d.name.toLowerCase());
            names = names.filter(n => driverNames.includes(n.toLowerCase()));
        }

        return names.map((name, idx) => ({
            id: idx,
            name,
            ...data[name],
        } as { id: number; name: string;[date: string]: string | number }));
    }, [dataType, timeData, quantityData, countData, selectedDrivers, drivers]);

    // Get cell color based on settings and data type
    const getCellColor = (value: string | number | undefined, type: typeof dataType) => {
        if (!value) return settings.colorDefault;

        if (type === 'time') {
            const timeValue = value as string;
            const [hours, minutes] = timeValue.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes;

            const [beforeH, beforeM] = settings.timeBefore.split(':').map(Number);
            const [afterH, afterM] = settings.timeAfter.split(':').map(Number);
            const beforeMinutes = beforeH * 60 + beforeM;
            const afterMinutes = afterH * 60 + afterM;

            if (totalMinutes < beforeMinutes) return settings.colorBefore;
            if (totalMinutes < afterMinutes) return settings.colorBetween;
            return settings.colorAfter;
        } else if (type === 'quantity') {
            const qty = value as number;
            if (qty > settings.qtyAfter) return settings.colorBefore;
            if (qty > settings.qtyBefore) return settings.colorBetween;
            return settings.colorAfter;
        } else {
            const count = value as number;
            if (count > settings.countAfter) return settings.colorBefore;
            if (count > settings.countBefore) return settings.colorBetween;
            return settings.colorAfter;
        }
    };

    const formatCellValue = (value: string | number | undefined, type: typeof dataType) => {
        if (!value) return '-';
        if (type === 'time') {
            const [h, m] = (value as string).split(':');
            const hour = parseInt(h);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${m} ${ampm}`;
        }
        return value;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <TrendingUp className="w-8 h-8 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Performance Report</h1>
                        <p className="text-slate-400">Driver performance by date</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
                <select
                    multiple
                    value={selectedDrivers.map(String)}
                    onChange={(e) => setSelectedDrivers(
                        Array.from(e.target.selectedOptions, opt => Number(opt.value))
                    )}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white min-w-[200px] max-h-[100px]"
                >
                    {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                    ))}
                </select>
                <select
                    multiple
                    value={selectedProducts}
                    onChange={(e) => setSelectedProducts(
                        Array.from(e.target.selectedOptions, opt => opt.value)
                    )}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white min-w-[200px] max-h-[100px]"
                >
                    {products.map(p => (
                        <option key={p.id} value={p.title}>{p.title}</option>
                    ))}
                </select>
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-4">
                <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-300 hover:bg-slate-700/50"
                >
                    <Settings className="w-4 h-4" /> Settings
                </button>
                <button onClick={() => refetch()} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                    <RefreshCw className="w-5 h-5 text-slate-400" />
                </button>

                <div className="flex gap-2 ml-auto">
                    {([
                        { key: 'time', label: 'Time', icon: Clock },
                        { key: 'quantity', label: 'Quantity', icon: Package },
                        { key: 'count', label: 'Customer Count', icon: Users },
                    ] as const).map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setDataType(key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${dataType === key
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                : 'bg-slate-800/50 text-slate-400 hover:text-white'
                                }`}
                        >
                            <Icon className="w-4 h-4" /> {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Color Legend */}
            <div className="flex items-center gap-6 text-sm">
                <span className="text-slate-400">Legend:</span>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: settings.colorBefore }} />
                    <span className="text-slate-300">
                        {dataType === 'time' ? `Before ${settings.timeBefore}` :
                            dataType === 'quantity' ? `>${settings.qtyAfter}` : `>${settings.countAfter}`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: settings.colorBetween }} />
                    <span className="text-slate-300">
                        {dataType === 'time' ? `${settings.timeBefore} - ${settings.timeAfter}` :
                            dataType === 'quantity' ? `${settings.qtyBefore} - ${settings.qtyAfter}` :
                                `${settings.countBefore} - ${settings.countAfter}`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: settings.colorAfter }} />
                    <span className="text-slate-300">
                        {dataType === 'time' ? `After ${settings.timeAfter}` :
                            dataType === 'quantity' ? `<${settings.qtyBefore}` : `<${settings.countBefore}`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: settings.colorDefault }} />
                    <span className="text-slate-300">No data</span>
                </div>
            </div>

            {/* Performance Table */}
            {isLoading ? (
                <div className="glass rounded-2xl p-8 text-center">
                    <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">Loading performance data...</p>
                </div>
            ) : rows.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center">
                    <p className="text-slate-400">No data available for selected criteria</p>
                </div>
            ) : (
                <div className="glass rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-800/50">
                                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300 sticky left-0 bg-slate-800/50 z-10 min-w-[200px]">
                                        Driver Name
                                    </th>
                                    {dateColumns.map(date => (
                                        <th key={date} className="px-3 py-3 text-center text-xs font-medium text-slate-400 min-w-[80px]">
                                            {format(new Date(date), 'dd/MM')}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-slate-900/30' : ''}>
                                        <td className="px-4 py-3 text-sm font-medium text-white sticky left-0 bg-inherit z-10 border-r border-slate-700/50">
                                            {row.name}
                                        </td>
                                        {dateColumns.map(date => {
                                            const value = row[date];
                                            const color = getCellColor(value, dataType);
                                            return (
                                                <td key={date} className="px-2 py-2 text-center">
                                                    <div
                                                        className="px-2 py-1 rounded text-xs font-medium text-white"
                                                        style={{ backgroundColor: color }}
                                                    >
                                                        {formatCellValue(value, dataType)}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="glass rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-6">Performance Thresholds</h2>

                        <div className="space-y-6">
                            {/* Time Settings */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Time Thresholds
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-400">Good (before)</label>
                                        <input
                                            type="time"
                                            value={settings.timeBefore}
                                            onChange={(e) => setSettings({ ...settings, timeBefore: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">Warning (after)</label>
                                        <input
                                            type="time"
                                            value={settings.timeAfter}
                                            onChange={(e) => setSettings({ ...settings, timeAfter: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Quantity Settings */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                    <Package className="w-4 h-4" /> Quantity Thresholds
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-400">Warning (below)</label>
                                        <input
                                            type="number"
                                            value={settings.qtyBefore}
                                            onChange={(e) => setSettings({ ...settings, qtyBefore: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">Good (above)</label>
                                        <input
                                            type="number"
                                            value={settings.qtyAfter}
                                            onChange={(e) => setSettings({ ...settings, qtyAfter: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Count Settings */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Customer Count Thresholds
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-400">Warning (below)</label>
                                        <input
                                            type="number"
                                            value={settings.countBefore}
                                            onChange={(e) => setSettings({ ...settings, countBefore: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">Good (above)</label>
                                        <input
                                            type="number"
                                            value={settings.countAfter}
                                            onChange={(e) => setSettings({ ...settings, countAfter: Number(e.target.value) })}
                                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Color Settings */}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-300 mb-3">Colors</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-xs text-slate-400">Good</label>
                                        <input
                                            type="color"
                                            value={settings.colorBefore}
                                            onChange={(e) => setSettings({ ...settings, colorBefore: e.target.value })}
                                            className="w-full h-10 rounded-lg cursor-pointer"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">Warning</label>
                                        <input
                                            type="color"
                                            value={settings.colorBetween}
                                            onChange={(e) => setSettings({ ...settings, colorBetween: e.target.value })}
                                            className="w-full h-10 rounded-lg cursor-pointer"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">Bad</label>
                                        <input
                                            type="color"
                                            value={settings.colorAfter}
                                            onChange={(e) => setSettings({ ...settings, colorAfter: e.target.value })}
                                            className="w-full h-10 rounded-lg cursor-pointer"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-400">No Data</label>
                                        <input
                                            type="color"
                                            value={settings.colorDefault}
                                            onChange={(e) => setSettings({ ...settings, colorDefault: e.target.value })}
                                            className="w-full h-10 rounded-lg cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setSettings(defaultSettings)}
                                className="flex-1 px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl"
                            >
                                Reset
                            </button>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
