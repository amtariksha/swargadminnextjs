'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays } from 'date-fns';
import { GET } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Eye, Download, Image as ImageIcon, Search as SearchIcon, X as XIcon, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { IMAGE_BASE_URL } from '@/config/tenant';

import { formatApiDate } from '@/lib/dateUtils';

// Small inline component — renders a value next to a one-click copy button.
// Used for the order ID and customer phone in the orders list so the
// operator can paste them into WhatsApp / CRM without retyping.
function CopyableCell({ value, label }: { value: string | number | null | undefined; label?: string }) {
    const str = value == null || value === '' ? '' : String(value);
    if (!str) return <span className="text-slate-500">-</span>;
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(str).then(
                () => toast.success(`${label ? label + ' ' : ''}copied`),
                () => toast.error('Copy failed'),
            );
        }
    };
    return (
        <span className="inline-flex items-center gap-1.5">
            <span>{str}</span>
            <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded hover:bg-slate-800/50 text-slate-400 hover:text-slate-200"
                title={`Copy ${label || ''} ${str}`.trim()}
                aria-label={`Copy ${label || str}`}
            >
                <Copy className="w-3 h-3" />
            </button>
        </span>
    );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderRow = Record<string, any>;

const ORDER_TYPE: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay Now', 4: 'Pay Later' };
const STATUS: Record<number, string> = { 0: 'Pending', 1: 'Confirmed', 2: 'Cancelled' };
const SUB_TYPE: Record<number, string> = { 1: 'One Time Order', 2: 'Weekly', 3: 'Monthly', 4: 'Alternative Days' };

function getOrderStatus(row: OrderRow): string {
    const subType = row.subscription_type;
    if (subType === null || subType === undefined) return 'N/A';
    const subLabel = SUB_TYPE[subType];
    if (!subLabel || subLabel === 'N/A') return row.order_status === 0 ? 'Active' : 'N/A';
    return row.order_status === 0 ? 'Active' : row.order_status === 1 ? 'Stopped' : 'N/A';
}

function getSubTypeLabel(type: number | null | undefined): string {
    if (type === null || type === undefined) return 'N/A';
    return SUB_TYPE[type] || 'N/A';
}

// Filter definitions matching React admin
const INITIAL_FILTERS = {
    holidayActive: false,
    walletBalanceSufficient: false,
    orderNotCancelled: false,
    orderActive: false,
    driverAssign: false,
    delivery_status: false,
    subs_orders: false,
    normal_orders: false,
    not_onetime: false,
    is_back_order: false,
    undelivered_back_order: false,
};

type FilterKey = keyof typeof INITIAL_FILTERS;

const FILTER_LABELS: Record<FilterKey, string> = {
    holidayActive: 'Holiday Active for Next Supply Day',
    walletBalanceSufficient: 'Wallet Balance Insufficient for Tomorrow',
    orderNotCancelled: 'Not Cancelled',
    orderActive: 'Active',
    driverAssign: 'Driver Not Assigned',
    delivery_status: 'Not Delivered',
    subs_orders: 'Subs Orders',
    normal_orders: 'Normal Orders',
    not_onetime: 'Not OneTime',
    is_back_order: 'Back-order orders',
    undelivered_back_order: 'Undelivered back-orders',
};

export default function OrdersPage() {
    const router = useRouter();

    // Load filters from localStorage
    const [filters, setFilters] = useState<typeof INITIAL_FILTERS>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('filters-orders');
                if (saved) return JSON.parse(saved);
            } catch { /* ignore */ }
        }
        return INITIAL_FILTERS;
    });

    // Persist filters
    useEffect(() => {
        localStorage.setItem('filters-orders', JSON.stringify(filters));
    }, [filters]);

    // Server-side search. The backend's GET /get_order has a default
    // 180-day window — orders older than that aren't in the response.
    // When the search box has content, fire a separate query that hits
    // /get_order?search=<q>: the backend bypasses the 180-day cap and
    // matches across order id, transaction id, customer name, customer
    // phone, shipping name, and shipping phone (LIKE %q% for the strings).
    // Results are capped at 100 rows server-side.
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // 300ms debounce so the API isn't hit on every keystroke
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const isSearchActive = debouncedSearch.length > 0;

    const { data: defaultOrders = [], isLoading: defaultLoading } = useQuery({
        queryKey: ['orders-default'],
        queryFn: async () => {
            const response = await GET<OrderRow[]>('/get_order');
            return response.data || [];
        },
        // Don't run the (heavier) default query while the operator is
        // actively searching — saves bandwidth + a 180-day fetch.
        enabled: !isSearchActive,
    });

    const { data: searchOrders = [], isLoading: searchLoading, isFetching: searchFetching } = useQuery({
        queryKey: ['orders-search', debouncedSearch],
        queryFn: async () => {
            const response = await GET<OrderRow[]>(`/get_order?search=${encodeURIComponent(debouncedSearch)}`);
            return response.data || [];
        },
        enabled: isSearchActive,
    });

    const orders = isSearchActive ? searchOrders : defaultOrders;
    const isLoading = isSearchActive ? (searchLoading || searchFetching) : defaultLoading;

    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    // Apply filters (matching React admin logic)
    const filteredOrders = useMemo(() => {
        let result = orders;

        if (filters.holidayActive) {
            result = result.filter(o => {
                const holidays = o.users_holiday || [];
                return holidays.some((h: { date: string }) => h.date === tomorrow);
            });
        }
        if (filters.walletBalanceSufficient) {
            result = result.filter(o => {
                const subLabel = getSubTypeLabel(o.subscription_type);
                return subLabel !== 'N/A' && (o.wallet_amount || 0) < (o.order_amount || 0);
            });
        }
        if (filters.orderNotCancelled) {
            result = result.filter(o => (STATUS[o.status] || '') !== 'Cancelled');
        }
        if (filters.orderActive) {
            result = result.filter(o => getOrderStatus(o) === 'Active');
        }
        if (filters.driverAssign) {
            result = result.filter(o => !o.driver_id);
        }
        if (filters.delivery_status) {
            result = result.filter(o => getSubTypeLabel(o.subscription_type) === 'N/A' && !o.delivery_status);
        }
        if (filters.subs_orders) {
            result = result.filter(o => getSubTypeLabel(o.subscription_type) !== 'N/A');
        }
        if (filters.normal_orders) {
            result = result.filter(o => getSubTypeLabel(o.subscription_type) === 'N/A');
        }
        if (filters.not_onetime) {
            result = result.filter(o => getSubTypeLabel(o.subscription_type) !== 'One Time Order');
        }
        // Feature 17 — back order filters.
        if (filters.is_back_order) {
            result = result.filter(o => o.is_back_order === 1);
        }
        if (filters.undelivered_back_order) {
            result = result.filter(o => o.is_back_order === 1 && !o.delivery_status);
        }

        return result;
    }, [orders, filters, tomorrow]);

    // Export CSV
    const handleExport = useCallback(() => {
        const headers = ['ID', 'Transaction ID', 'Product', 'Order Type', 'Status', 'Order Status', 'Sub Type', 'Name', 'Phone', 'Wallet', 'Amount', 'Qty', 'Start Date', 'Pincode', 'Created', 'Last Update'];
        const rows = filteredOrders.map(o => [
            o.id, o.trasation_id || '', o.title || '', ORDER_TYPE[o.order_type] || '',
            STATUS[o.status] || '', getOrderStatus(o), getSubTypeLabel(o.subscription_type),
            o.name || '', o.s_phone || '', o.wallet_amount || 0, o.order_amount || 0,
            o.qty || '', o.start_date || '', o.pincode || '', o.created_at || '', o.updated_at || ''
        ]);
        const csv = [headers, ...rows.map(r => r.map(c => `"${c}"`))].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${format(new Date(), 'yyyyMMdd')}_Orders.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [filteredOrders]);

    const columns: Column<OrderRow>[] = [
        {
            key: 'view', header: 'View', width: '60px',
            render: (o) => <button onClick={(e) => { e.stopPropagation(); router.push(`/orders/${o.id}`); }} className="p-1.5 hover:bg-slate-800/50 rounded-lg"><Eye className="w-4 h-4 text-purple-400" /></button>,
        },
        { key: 'id', header: 'ID', width: '95px', render: (o) => <CopyableCell value={o.id} label="Order ID" /> },
        { key: 'trasation_id', header: 'Txn ID', width: '80px', render: (o) => <span className="text-xs text-slate-400">{o.trasation_id || '-'}</span> },
        { key: 'title', header: 'Product', width: '180px' },
        {
            key: 'product_image', header: 'Image', width: '70px',
            render: (o) => o.product_image ? (
                <img src={`${IMAGE_BASE_URL}/${o.product_image}`} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : <div className="w-10 h-10 bg-slate-800/50 rounded-lg flex items-center justify-center"><ImageIcon className="w-4 h-4 text-slate-600" /></div>,
        },
        { key: 'order_type', header: 'Order Type', width: '100px', render: (o) => <span className="text-sm">{ORDER_TYPE[o.order_type] || 'N/A'}</span> },
        { key: 'status', header: 'Status', width: '90px', render: (o) => <span className="text-sm">{STATUS[o.status] || 'N/A'}</span> },
        { key: 'order_status', header: 'Order Status', width: '100px', render: (o) => <span className="text-sm">{getOrderStatus(o)}</span> },
        { key: 'subscription_type', header: 'Sub Type', width: '130px', render: (o) => <span className="text-xs">{getSubTypeLabel(o.subscription_type)}</span> },
        { key: 'name', header: 'Name', width: '150px' },
        { key: 's_phone', header: 'Phone', width: '150px', render: (o) => <CopyableCell value={o.s_phone} label="Phone" /> },
        {
            key: 'wallet_amount', header: 'Wallet', width: '90px',
            render: (o) => {
                const amt = o.wallet_amount || 0;
                return <span className={amt < 250 ? 'text-red-400' : 'text-green-400'}>₹{amt}</span>;
            },
        },
        { key: 'order_amount', header: 'Amount', width: '90px', render: (o) => <span>₹{o.order_amount || 0}</span> },
        { key: 'qty', header: 'Qty', width: '60px' },
        { key: 'start_date', header: 'Start Date', width: '100px', render: (o) => <span>{o.start_date ? String(o.start_date).slice(0, 10) : '-'}</span> },
        { key: 'pincode', header: 'Pincode', width: '80px' },
        {
            key: 'created_at', header: 'Created', width: '160px',
            render: (o) => {
                return <span className="text-sm text-slate-400">{formatApiDate(o.created_at, 'dd-MM-yyyy HH:mm:ss')}</span>;
            },
        },
        {
            key: 'updated_at', header: 'Last Update', width: '160px',
            render: (o) => {
                return <span className="text-sm text-slate-400">{formatApiDate(o.updated_at, 'dd-MM-yyyy HH:mm:ss')}</span>;
            },
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Orders</h1>
                    <p className="text-slate-400">Manage all customer orders</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleExport} disabled={filteredOrders.length === 0}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-white disabled:opacity-40">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    <button onClick={() => router.push('/orders/new')}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                        <Plus className="w-5 h-5" /> Add New
                    </button>
                </div>
            </div>

            {/* Search bar — server-side, matches across order id, transaction id,
                customer name, customer phone, shipping name + phone.
                Bypasses the 180-day default window so old orders are reachable. */}
            <div className="glass rounded-xl p-4 space-y-2">
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search by order ID, transaction ID, customer name, or phone number"
                        aria-label="Search orders"
                        className="w-full pl-9 pr-9 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                    {searchInput && (
                        <button
                            type="button"
                            onClick={() => setSearchInput('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-700/50"
                        >
                            <XIcon className="w-4 h-4 text-slate-400" />
                        </button>
                    )}
                </div>
                <p className="text-xs text-slate-500">
                    {isSearchActive ? (
                        <>
                            Searching across <span className="text-slate-300">order ID, transaction ID, customer name, customer phone, shipping name, shipping phone</span>.
                            Search bypasses the 180-day window and returns up to 100 matches.
                            {!isLoading && <> Found <span className="text-slate-300">{orders.length}</span> match{orders.length === 1 ? '' : 'es'} for &quot;{debouncedSearch}&quot;.</>}
                        </>
                    ) : (
                        <>Showing orders from the last 180 days. Type any of: <span className="text-slate-300">order ID, transaction ID, customer name, customer phone</span> to search the entire orders table.</>
                    )}
                </p>
            </div>

            {/* Filters */}
            <div className="glass rounded-xl p-4">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => (
                        <label key={key} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={filters[key]}
                                onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })}
                                className="rounded border-slate-600" />
                            {FILTER_LABELS[key]}
                        </label>
                    ))}
                </div>
            </div>

            {/* Table — DataTable's built-in search is disabled because the
                search above is server-side and bypasses the 180-day cap.
                Keeping the table's internal search would silently filter
                the loaded set and confuse the operator. */}
            <DataTable data={filteredOrders} columns={columns} loading={isLoading} pageSize={50}
                searchable={false}
                onRowClick={(o) => router.push(`/orders/${o.id}`)} />
        </div>
    );
}
