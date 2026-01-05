'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { format, subDays } from 'date-fns';
import { Calendar, BarChart3, RefreshCw, User, TrendingUp } from 'lucide-react';

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
    const types: Record<number, string> = {
        1: 'One Time Order',
        2: 'Weekly',
        3: 'Daily',
        4: 'Alternative Days',
    };
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

    // Filter by product
    const reportItems = useMemo(() => {
        if (!selectedProduct) return rawReportItems;
        return rawReportItems.filter(item =>
            item.title.toLowerCase().includes(selectedProduct.toLowerCase())
        );
    }, [rawReportItems, selectedProduct]);

    // Group data by date for chart
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
            .map(([date, values]) => ({ date, ...values }));
    }, [reportItems]);

    // Totals
    const totals = useMemo(() => ({
        count: reportItems.length,
        quantity: reportItems.reduce((sum, item) => sum + item.qty, 0),
        amount: reportItems.reduce((sum, item) => sum + (item.order_amount || 0), 0),
    }), [reportItems]);

    // Max value for chart scaling
    const maxValue = useMemo(() => {
        if (chartData.length === 0) return 100;
        return Math.max(...chartData.map(d => d[chartType])) || 100;
    }, [chartData, chartType]);

    const columns: Column<DeliveryReportItem>[] = [
        {
            key: 'name',
            header: 'Customer',
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
            key: 'qty',
            header: 'Qty',
            width: '60px',
            render: (item) => (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm font-medium">
                    {item.qty}
                </span>
            ),
        },
        {
            key: 'mark_delivered_time_stamp',
            header: 'Delivery Time',
            render: (item) => <span className="text-sm">{formatDeliveryTime(item.mark_delivered_time_stamp)}</span>,
        },
        { key: 'order_id', header: 'Order', width: '70px' },
        {
            key: 'subscription_type',
            header: 'Sub Type',
            render: (item) => <span className="text-xs">{getSubscriptionLabel(item.subscription_type)}</span>,
        },
        {
            key: 'order_type',
            header: 'Order Type',
            render: (item) => <span className="text-sm">{getOrderTypeLabel(item.order_type)}</span>,
        },
        {
            key: 'order_amount',
            header: 'Amount',
            width: '90px',
            render: (item) => <span className="text-green-400 font-medium">₹{item.order_amount || 0}</span>,
        },
        { key: 'pincode', header: 'Pincode', width: '80px' },
        { key: 'date', header: 'Date', width: '100px' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
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
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    />
                </div>
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value ? Number(e.target.value) : '')}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white min-w-[180px]"
                >
                    <option value="">All Drivers</option>
                    {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                    ))}
                </select>
                <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white min-w-[180px]"
                >
                    <option value="">All Products</option>
                    {products.map(p => (
                        <option key={p.id} value={p.title}>{p.title}</option>
                    ))}
                </select>
                <button onClick={() => refetch()} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                    <RefreshCw className="w-5 h-5 text-slate-400" />
                </button>
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

            {/* Chart */}
            <div className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        Daily Trend
                    </h2>
                    <div className="flex gap-2">
                        {(['count', 'quantity', 'amount'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setChartType(type)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${chartType === type
                                        ? 'bg-purple-500 text-white'
                                        : 'bg-slate-800/50 text-slate-400 hover:text-white'
                                    }`}
                            >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {chartData.length > 0 ? (
                    <div className="flex items-end gap-2 h-48 overflow-x-auto pb-2">
                        {chartData.map((d, i) => {
                            const height = Math.max((d[chartType] / maxValue) * 100, 5);
                            return (
                                <div key={i} className="flex flex-col items-center min-w-[40px]">
                                    <span className="text-xs text-slate-400 mb-1">{d[chartType]}</span>
                                    <div
                                        className="w-8 bg-gradient-to-t from-purple-600 to-pink-500 rounded-t-lg transition-all"
                                        style={{ height: `${height}%` }}
                                    />
                                    <span className="text-xs text-slate-500 mt-1 rotate-45 origin-left whitespace-nowrap">
                                        {format(new Date(d.date), 'dd/MM')}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="h-48 flex items-center justify-center text-slate-400">
                        No data for selected period
                    </div>
                )}
            </div>

            {/* Data Table */}
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
