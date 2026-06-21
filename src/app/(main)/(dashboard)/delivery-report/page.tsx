'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';
import { useDrivers } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { format, subDays, addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { Calendar, BarChart3, RefreshCw, User, TrendingUp, Search, ChevronDown, X } from 'lucide-react';

import { formatApiDate, apiDateMs } from '@/lib/dateUtils';
interface DeliveryReportItem {
    id: number;
    order_id: number;
    entry_user_id: number;
    order_user_id: number;
    name: string;
    s_phone: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_id: number | null;
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

interface PerformanceDriverRow {
    driver_id: number | null;
    driver_name: string | null;
    delivery_boy: number;
    customer_care: number;
    packaging: number;
    driver: number;
    total: number;
}

interface PerformanceReport {
    buckets: { delivery_boy: number; customer_care: number; packaging: number; driver: number };
    perDriver: PerformanceDriverRow[];
}

interface OrdersBreakdownRow {
    category: string;
    label: string;
    count: number;
    value: number;
    qty: number;
}

interface OrdersBreakdownResponse {
    rows: OrdersBreakdownRow[];
    totals: { count: number; value: number; qty: number };
}

interface DeliveryDetailRow {
    delivery_id: number;
    order_id: number;
    user_id: number;
    customer_name: string | null;
    customer_phone: string | null;
    product_title: string | null;
    qty: number;
    delivered_qty: number;
    price: number;
    order_amount: number;
    delivery_date: string | null;
    driver_name: string | null;
    subscription_type: number | null;
    status: number;
}

const REASON_BUCKETS = [
    { key: 'delivery_boy', label: 'Delivery Boy', color: 'from-purple-600 to-pink-500', text: 'text-purple-300' },
    { key: 'customer_care', label: 'Customer Care', color: 'from-blue-600 to-cyan-500', text: 'text-blue-300' },
    { key: 'packaging', label: 'Packaging', color: 'from-amber-600 to-orange-500', text: 'text-amber-300' },
    { key: 'driver', label: 'Driver', color: 'from-emerald-600 to-green-500', text: 'text-emerald-300' },
] as const;

const getSubscriptionLabel = (type: number) => {
    const types: Record<number, string> = {
        1: 'One Time Order',
        2: 'Custom',
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
    return formatApiDate(timestamp, 'dd-MM-yyyy, hh:mm a');
};

export default function DeliveryReportPage() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

    const [activeTab, setActiveTab] = useState<'deliveries' | 'performance' | 'orders'>('deliveries');
    const [drillCategory, setDrillCategory] = useState<{ category: string; label: string } | null>(null);
    const [startDate, setStartDate] = useState(weekAgo);
    const [endDate, setEndDate] = useState(today);

    // ◀ / ▶ shift the whole range by its own length (inclusive), so the new
    // window is adjacent to the old one: 5/6→12/6 then ◀ gives 28/5→4/6
    // (new window ENDS the day before the old start).
    const shiftRange = (direction: 1 | -1) => {
        if (!startDate || !endDate) return;
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const spanDays = Math.abs(differenceInCalendarDays(end, start)) + 1;
        setStartDate(format(addDays(start, direction * spanDays), 'yyyy-MM-dd'));
        setEndDate(format(addDays(end, direction * spanDays), 'yyyy-MM-dd'));
    };
    const [selectedDriver, setSelectedDriver] = useState<number | ''>('');
    const [selectedProduct, setSelectedProduct] = useState<string>('');
    const [chartType, setChartType] = useState<'count' | 'quantity' | 'amount'>('count');
    const [driverSearch, setDriverSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
    const [productDropdownOpen, setProductDropdownOpen] = useState(false);
    const driverDropdownRef = useRef<HTMLDivElement>(null);
    const productDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (driverDropdownRef.current && !driverDropdownRef.current.contains(e.target as Node)) {
                setDriverDropdownOpen(false);
            }
            if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
                setProductDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const { data: drivers = [] } = useDrivers();

    // Sort drivers by name with route number prefix
    const sortedDrivers = useMemo(() => {
        return [...drivers].sort((a, b) => {
            const aNum = parseInt(a.name?.match(/^(\d+)/)?.[1] || '999');
            const bNum = parseInt(b.name?.match(/^(\d+)/)?.[1] || '999');
            if (aNum !== bNum) return aNum - bNum;
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [drivers]);

    const filteredDrivers = useMemo(() => {
        if (!driverSearch) return sortedDrivers;
        const q = driverSearch.toLowerCase();
        return sortedDrivers.filter(d =>
            d.name?.toLowerCase().includes(q) || d.phone?.includes(q)
        );
    }, [sortedDrivers, driverSearch]);

    const { data: products = [] } = useQuery({
        queryKey: ['products'],
        queryFn: async () => {
            const response = await GET<Product[]>('/get_product');
            return response.data || [];
        },
    });

    const sortedProducts = useMemo(() => {
        return [...products].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }, [products]);

    const filteredProducts = useMemo(() => {
        if (!productSearch) return sortedProducts;
        const q = productSearch.toLowerCase();
        return sortedProducts.filter(p => p.title?.toLowerCase().includes(q));
    }, [sortedProducts, productSearch]);

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

    // ── Performance tab (Item 5) — non-delivery reason aggregation ──────────
    const { data: performance, isLoading: perfLoading, refetch: refetchPerf } = useQuery({
        queryKey: ['delivery-performance', startDate, endDate, selectedDriver],
        queryFn: async () => {
            const driverPath = selectedDriver ? `/${selectedDriver}` : '';
            const response = await GET<PerformanceReport>(`/get_report/delivery_performance/${startDate}/${endDate}${driverPath}`);
            return response.data;
        },
        enabled: activeTab === 'performance' && !!startDate && !!endDate,
    });

    const perfBuckets = performance?.buckets ?? { delivery_boy: 0, customer_care: 0, packaging: 0, driver: 0 };
    const perfMax = Math.max(perfBuckets.delivery_boy, perfBuckets.customer_care, perfBuckets.packaging, perfBuckets.driver, 1);
    const perfDrivers = performance?.perDriver ?? [];

    // ── Orders tab (Part C) — order count/value/qty by category ─────────────
    // Date range only (an orders-by-type rollup; driver/product filters don't apply).
    const { data: ordersBreakdown, isLoading: obLoading } = useQuery({
        queryKey: ['orders-breakdown', startDate, endDate],
        queryFn: async () => {
            const response = await GET<OrdersBreakdownResponse>(`/get_report/orders_breakdown/${startDate}/${endDate}`);
            return response.data;
        },
        enabled: activeTab === 'orders' && !!startDate && !!endDate,
    });
    const obRows = ordersBreakdown?.rows ?? [];
    const obTotals = ordersBreakdown?.totals ?? { count: 0, value: 0, qty: 0 };

    // Drill-down — the deliveries behind one category row (fetched when the modal opens).
    const { data: drillData, isLoading: drillLoading } = useQuery({
        queryKey: ['orders-breakdown-detail', startDate, endDate, drillCategory?.category],
        queryFn: async () => {
            const response = await GET<{ category: string; label: string; deliveries: DeliveryDetailRow[] }>(
                `/get_report/orders_breakdown/detail/${startDate}/${endDate}/${drillCategory!.category}`,
            );
            return response.data;
        },
        enabled: !!drillCategory && !!startDate && !!endDate,
    });
    const drillDeliveries = drillData?.deliveries ?? [];

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
            .sort(([a], [b]) => apiDateMs(a) - apiDateMs(b))
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
            key: 'customer_name',
            header: 'Customer',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.customer_name || '-'}</p>
                    <p className="text-xs text-slate-400">{item.customer_phone || '-'}</p>
                </div>
            ),
        },
        { key: 'customer_id', header: 'Customer ID', width: '90px', render: (item) => item.customer_id ?? '-' },
        {
            key: 'name',
            header: 'Delivery Boy',
            render: (item) => (
                <div>
                    <p className="font-medium text-white">{item.name || '-'}</p>
                    <p className="text-xs text-slate-400">{item.s_phone || '-'}</p>
                </div>
            ),
        },
        { key: 'entry_user_id', header: 'Delivery Boy ID', width: '110px' },
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

    const perfColumns: Column<PerformanceDriverRow>[] = [
        { key: 'driver_name', header: 'Name', render: (r) => <span className="font-medium text-white">{r.driver_name || 'Unassigned'}</span> },
        { key: 'delivery_boy', header: 'Delivery Boy', width: '120px', render: (r) => <span className="text-purple-300">{r.delivery_boy}</span> },
        { key: 'customer_care', header: 'Customer Care', width: '130px', render: (r) => <span className="text-blue-300">{r.customer_care}</span> },
        { key: 'packaging', header: 'Packaging', width: '110px', render: (r) => <span className="text-amber-300">{r.packaging}</span> },
        { key: 'driver', header: 'Driver', width: '90px', render: (r) => <span className="text-emerald-300">{r.driver}</span> },
        { key: 'total', header: 'Total', width: '90px', render: (r) => <span className="font-semibold text-white">{r.total}</span> },
    ];

    const obColumns: Column<OrdersBreakdownRow>[] = [
        { key: 'label', header: 'Category', render: (r) => <span className="font-medium text-white">{r.label}</span> },
        { key: 'count', header: 'Deliveries', width: '120px', render: (r) => <span className="text-purple-300 font-semibold">{r.count}</span> },
        { key: 'qty', header: 'Qty', width: '100px', render: (r) => <span className="text-blue-300">{r.qty}</span> },
        { key: 'value', header: 'Value', width: '140px', render: (r) => <span className="text-green-400 font-medium">₹{r.value.toLocaleString()}</span> },
        {
            key: 'category',
            header: '',
            width: '130px',
            render: (r) => (
                <button
                    onClick={() => setDrillCategory({ category: r.category, label: r.label })}
                    disabled={r.count === 0}
                    className="px-3 py-1 text-xs rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    View orders
                </button>
            ),
        },
    ];

    const drillColumns: Column<DeliveryDetailRow>[] = [
        {
            key: 'customer_name',
            header: 'Customer',
            render: (r) => (
                <div>
                    <p className="font-medium text-white">{r.customer_name || '-'}</p>
                    <p className="text-xs text-slate-400">{r.customer_phone || '-'}</p>
                </div>
            ),
        },
        { key: 'product_title', header: 'Product', render: (r) => r.product_title || '-' },
        { key: 'delivered_qty', header: 'Delivered', width: '90px', render: (r) => <span className="text-blue-300">{r.delivered_qty}</span> },
        { key: 'order_amount', header: 'Amount', width: '100px', render: (r) => <span className="text-green-400 font-medium">₹{r.order_amount}</span> },
        { key: 'delivery_date', header: 'Delivery Date', width: '120px', render: (r) => r.delivery_date || '-' },
        { key: 'driver_name', header: 'Driver', render: (r) => r.driver_name || '-' },
        { key: 'order_id', header: 'Order', width: '80px' },
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

            {/* Tab bar */}
            <div className="flex gap-2 border-b border-slate-800">
                {([['deliveries', 'Deliveries'], ['performance', 'Performance'], ['orders', 'Orders']] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                            activeTab === key
                                ? 'border-purple-500 text-purple-300'
                                : 'border-transparent text-slate-400 hover:text-white'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <button
                        onClick={() => shiftRange(-1)}
                        title="Previous period (shift back by the range length)"
                        className="px-2 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-700/50"
                    >
                        ◀
                    </button>
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
                    <button
                        onClick={() => shiftRange(1)}
                        title="Next period (shift forward by the range length)"
                        className="px-2 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-slate-700/50"
                    >
                        ▶
                    </button>
                </div>
                {/* Searchable Driver Dropdown */}
                <div ref={driverDropdownRef} className="relative min-w-[220px]">
                    <button
                        onClick={() => { setDriverDropdownOpen(!driverDropdownOpen); setProductDropdownOpen(false); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    >
                        <span className="truncate">
                            {selectedDriver
                                ? sortedDrivers.find(d => d.id === selectedDriver)?.name || 'Unknown'
                                : 'All Drivers'}
                        </span>
                        <div className="flex items-center gap-1">
                            {selectedDriver && (
                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" onClick={(e) => { e.stopPropagation(); setSelectedDriver(''); }} />
                            )}
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                        </div>
                    </button>
                    {driverDropdownOpen && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-hidden">
                            <div className="p-2 border-b border-slate-700">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={driverSearch}
                                        onChange={(e) => setDriverSearch(e.target.value)}
                                        placeholder="Search drivers..."
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto max-h-48">
                                <button
                                    onClick={() => { setSelectedDriver(''); setDriverDropdownOpen(false); setDriverSearch(''); }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 ${!selectedDriver ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
                                >
                                    All Drivers
                                </button>
                                {filteredDrivers.map(d => (
                                    <button
                                        key={d.id}
                                        onClick={() => { setSelectedDriver(d.id); setDriverDropdownOpen(false); setDriverSearch(''); }}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 ${selectedDriver === d.id ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
                                    >
                                        {d.name} <span className="text-slate-400">({d.phone})</span>
                                    </button>
                                ))}
                                {filteredDrivers.length === 0 && (
                                    <p className="px-3 py-2 text-sm text-slate-500">No drivers found</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Searchable Product Dropdown */}
                <div ref={productDropdownRef} className="relative min-w-[180px]">
                    <button
                        onClick={() => { setProductDropdownOpen(!productDropdownOpen); setDriverDropdownOpen(false); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-white"
                    >
                        <span className="truncate">{selectedProduct || 'All Products'}</span>
                        <div className="flex items-center gap-1">
                            {selectedProduct && (
                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" onClick={(e) => { e.stopPropagation(); setSelectedProduct(''); }} />
                            )}
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                        </div>
                    </button>
                    {productDropdownOpen && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-hidden">
                            <div className="p-2 border-b border-slate-700">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="Search products..."
                                        className="w-full pl-8 pr-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto max-h-48">
                                <button
                                    onClick={() => { setSelectedProduct(''); setProductDropdownOpen(false); setProductSearch(''); }}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 ${!selectedProduct ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
                                >
                                    All Products
                                </button>
                                {filteredProducts.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSelectedProduct(p.title); setProductDropdownOpen(false); setProductSearch(''); }}
                                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 ${selectedProduct === p.title ? 'bg-purple-500/20 text-purple-300' : 'text-white'}`}
                                    >
                                        {p.title}
                                    </button>
                                ))}
                                {filteredProducts.length === 0 && (
                                    <p className="px-3 py-2 text-sm text-slate-500">No products found</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <button onClick={() => (activeTab === 'performance' ? refetchPerf() : refetch())} className="p-2 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                    <RefreshCw className="w-5 h-5 text-slate-400" />
                </button>
            </div>

            {activeTab === 'deliveries' && (<>
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
                                        {formatApiDate(d.date, 'dd/MM')}
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
            </>)}

            {activeTab === 'performance' && (<>
                {/* Bucket stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {REASON_BUCKETS.map((b) => (
                        <div key={b.key} className="glass rounded-xl p-4">
                            <p className="text-sm text-slate-400">{b.label}</p>
                            <p className={`text-2xl font-bold ${b.text}`}>{perfBuckets[b.key]}</p>
                        </div>
                    ))}
                </div>

                {/* Bucket bar viz */}
                <div className="glass rounded-2xl p-6">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        Non-delivery reasons by category
                    </h2>
                    {perfLoading ? (
                        <div className="h-48 flex items-center justify-center text-slate-400">Loading…</div>
                    ) : perfBuckets.delivery_boy + perfBuckets.customer_care + perfBuckets.packaging + perfBuckets.driver === 0 ? (
                        <div className="h-48 flex items-center justify-center text-slate-400">No reasons recorded for selected period</div>
                    ) : (
                        <div className="flex items-end gap-8 h-48 px-4">
                            {REASON_BUCKETS.map((b) => {
                                const val = perfBuckets[b.key];
                                const height = Math.max((val / perfMax) * 100, 4);
                                return (
                                    <div key={b.key} className="flex flex-col items-center flex-1">
                                        <span className="text-sm text-slate-300 mb-1">{val}</span>
                                        <div className={`w-full max-w-[80px] bg-gradient-to-t ${b.color} rounded-t-lg transition-all`} style={{ height: `${height}%` }} />
                                        <span className="text-xs text-slate-500 mt-2 text-center">{b.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Per-delivery-boy table */}
                <DataTable
                    data={perfDrivers}
                    columns={perfColumns}
                    loading={perfLoading}
                    pageSize={50}
                    searchPlaceholder="Search drivers..."
                    emptyMessage="No performance data found"
                />
            </>)}

            {activeTab === 'orders' && (<>
                {/* Stat cards */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-slate-400">Total Deliveries</p>
                        <p className="text-2xl font-bold text-white">{obTotals.count}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-slate-400">Total Quantity</p>
                        <p className="text-2xl font-bold text-blue-400">{obTotals.qty}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-slate-400">Total Value</p>
                        <p className="text-2xl font-bold text-green-400">₹{obTotals.value.toLocaleString()}</p>
                    </div>
                </div>

                <p className="text-xs text-slate-500">
                    Deliveries by delivery date (set both dates the same for a single day) · click a row to see the deliveries behind it.
                </p>

                {/* Breakdown table */}
                <DataTable
                    data={obRows}
                    columns={obColumns}
                    loading={obLoading}
                    pageSize={10}
                    emptyMessage="No deliveries in selected period"
                />
            </>)}

            {/* Drill-down modal: orders behind a category */}
            {drillCategory && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setDrillCategory(null)}
                >
                    <div
                        className="glass rounded-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-slate-800">
                            <h2 className="text-lg font-semibold text-white">{drillCategory.label} — Orders</h2>
                            <button onClick={() => setDrillCategory(null)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            <DataTable
                                data={drillDeliveries}
                                columns={drillColumns}
                                loading={drillLoading}
                                pageSize={50}
                                searchPlaceholder="Search deliveries..."
                                emptyMessage="No deliveries in this category"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
