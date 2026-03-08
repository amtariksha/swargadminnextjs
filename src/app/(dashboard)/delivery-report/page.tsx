'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import DateRangePicker from '@/components/DateRangePicker';
import { format, subDays } from 'date-fns';
import { BarChart3, RefreshCw, TrendingUp } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
} from 'recharts';

interface DeliveryReportItem {
    id: number;
    order_id: number;
    entry_user_id: number;
    order_user_id: number;
    name: string;
    s_phone: string;
    title: string;
    qty: number;
    qty_text: string;
    delivered_qty: number;
    date: string;
    order_amount: number;
    pincode: string;
    subscription_type: number;
    order_type: number;
    mark_delivered_time_stamp: string;
    selected_days_for_weekly: string | null;
    created_at: string;
}

interface Product {
    id: number;
    title: string;
}

const getSubscriptionLabel = (type: number) => {
    const types: Record<number, string> = { 1: 'One Time', 2: 'Weekly', 3: 'Daily', 4: 'Alternative' };
    return types[type] || 'N/A';
};

const getOrderTypeLabel = (type: number) => {
    return type === 1 ? 'Prepaid' : type === 2 ? 'Postpaid' : 'N/A';
};

const formatDeliveryTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    try {
        return format(new Date(timestamp), 'dd-MM-yyyy, hh:mm a');
    } catch {
        return '-';
    }
};

export default function DeliveryReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const [startDate, setStartDate] = useState(weekAgo);
    const [endDate, setEndDate] = useState(today);
    const [selectedDriver, setSelectedDriver] = useState<number | ''>('');
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [chartType, setChartType] = useState<'count' | 'quantity' | 'amount'>('count');
    const [chartView, setChartView] = useState<'bar' | 'line'>('bar');

    const { data: drivers = [] } = useDrivers();

    const { data: products = [] } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const response = await GET<Product[]>('/get_product');
            return response.data || [];
        },
    });

    const { data: rawReportItems = [], isLoading, refetch } = useQuery({
        queryKey: ['delivery-report', startDate, endDate, selectedDriver],
        queryFn: async () => {
            const driverPath = selectedDriver ? `/${selectedDriver}` : '';
            const response = await GET<DeliveryReportItem[]>(`/get_report/delivery/${startDate}/${endDate}${driverPath}`);
            return response.data || [];
        },
        enabled: !!startDate && !!endDate,
    });

    const reportItems = useMemo(() => {
        if (!selectedProduct) return rawReportItems;
        return rawReportItems.filter(item =>
            item.title.toLowerCase().includes(selectedProduct.toLowerCase())
        );
    }, [rawReportItems, selectedProduct]);

    const chartData = useMemo(() => {
        const grouped: Record<string, { count: number; quantity: number; amount: number }> = {};
        reportItems.forEach(item => {
            if (!grouped[item.date]) {
                grouped[item.date] = { count: 0, quantity: 0, amount: 0 };
            }
            grouped[item.date].count += 1;
            grouped[item.date].quantity += item.qty;
            grouped[item.date].amount += item.order_amount || 0;
        });
        return Object.entries(grouped)
            .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
            .map(([date, values]) => ({
                date: format(new Date(date), 'dd/MM'),
                ...values,
            }));
    }, [reportItems]);

    const totals = useMemo(() => ({
        count: reportItems.length,
        quantity: reportItems.reduce((sum, item) => sum + item.qty, 0),
        amount: reportItems.reduce((sum, item) => sum + (item.order_amount || 0), 0),
    }), [reportItems]);

    const columns: Column<DeliveryReportItem>[] = [
        {
            key: 'name', header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="text-xs text-slate-400">{item.s_phone}</p>
                </div>
            ),
        },
        { key: 'entry_user_id', header: 'User ID', width: '70px' },
        { key: 'title', header: 'Product' },
        { key: 'qty_text', header: 'Qty Text', width: '100px' },
        {
            key: 'qty', header: 'Qty', width: '60px',
            render: (item) => <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-medium">{item.qty}</span>,
        },
        {
            key: 'mark_delivered_time_stamp', header: 'Delivery Time',
            render: (item) => <span className="text-sm">{formatDeliveryTime(item.mark_delivered_time_stamp)}</span>,
        },
        { key: 'order_id', header: 'Order', width: '70px' },
        {
            key: 'subscription_type', header: 'Sub Type',
            render: (item) => <span className="text-xs">{getSubscriptionLabel(item.subscription_type)}</span>,
        },
        {
            key: 'order_type', header: 'Order Type',
            render: (item) => <span className="text-sm">{getOrderTypeLabel(item.order_type)}</span>,
        },
        {
            key: 'order_amount', header: 'Amount', width: '90px',
            render: (item) => <span className="text-green-400 font-medium">₹{item.order_amount || 0}</span>,
        },
        { key: 'pincode', header: 'Pincode', width: '80px' },
        { key: 'date', header: 'Date', width: '100px' },
    ];

    const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm">
                <p className="text-white font-medium">{label}</p>
                <p className="text-purple-400">
                    {chartType === 'amount' ? '₹' : ''}{payload[0].value.toLocaleString()}
                    {chartType === 'count' ? ' deliveries' : chartType === 'quantity' ? ' qty' : ''}
                </p>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <BarChart3 className="w-8 h-8 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Delivery Report</h1>
                        <p className="text-slate-400">Analyze delivery performance</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="glass rounded-xl p-4 space-y-3">
                <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onChange={(start, end) => { setStartDate(start); setEndDate(end); }}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={selectedDriver}
                        onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : '')}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-sm text-white min-w-[180px]"
                    >
                        <option value="">All Drivers</option>
                        {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                        ))}
                    </select>
                    <select
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                        className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-sm text-white min-w-[180px]"
                    >
                        <option value="">All Products</option>
                        {products.map(p => (
                            <option key={p.id} value={p.title}>{p.title}</option>
                        ))}
                    </select>
                    <button onClick={() => refetch()} className="p-2 bg-slate-900/50 border border-slate-700/50 rounded-xl hover:bg-slate-800">
                        <RefreshCw className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Deliveries</p>
                    <p className="text-2xl font-bold text-white">{totals.count}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Quantity</p>
                    <p className="text-2xl font-bold text-blue-400">{totals.quantity}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Total Amount</p>
                    <p className="text-2xl font-bold text-green-400">₹{totals.amount.toLocaleString()}</p>
                </div>
            </div>

            {/* Recharts Chart */}
            <div className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        Daily Trend
                    </h2>
                    <div className="flex gap-2">
                        <div className="flex gap-1 mr-2">
                            {(['bar', 'line'] as const).map(view => (
                                <button
                                    key={view}
                                    onClick={() => setChartView(view)}
                                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${chartView === view ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}
                                >
                                    {view.charAt(0).toUpperCase() + view.slice(1)}
                                </button>
                            ))}
                        </div>
                        {(['count', 'quantity', 'amount'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setChartType(type)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${chartType === type ? 'bg-purple-500 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}
                            >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                        {chartView === 'bar' ? (
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey={chartType} fill="url(#purpleGradient)" radius={[4, 4, 0, 0]} />
                                <defs>
                                    <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#a855f7" />
                                        <stop offset="100%" stopColor="#ec4899" />
                                    </linearGradient>
                                </defs>
                            </BarChart>
                        ) : (
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey={chartType} stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
                            </LineChart>
                        )}
                    </ResponsiveContainer>
                ) : (
                    <div className="h-48 flex items-center justify-center text-slate-400">
                        No data for selected period
                    </div>
                )}
            </div>

            <DataTable
                data={reportItems}
                columns={columns}
                loading={isLoading}
                pageSize={50}
                searchPlaceholder="Search delivery report..."
                emptyMessage="No delivery data found"
            />
        </div>
    );
}
