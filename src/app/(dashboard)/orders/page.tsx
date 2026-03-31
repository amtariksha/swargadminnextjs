'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, addDays } from 'date-fns';
import { GET } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import DataTable, { Column } from '@/components/DataTable';
import { Plus, Eye, Download, Image as ImageIcon } from 'lucide-react';
import { IMAGE_BASE_URL } from '@/config/tenant';

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

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ['orders-all'],
        queryFn: async () => {
            const response = await GET<OrderRow[]>('/get_order');
            return response.data || [];
        },
    });

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

        return result;
    }, [orders, filters, tomorrow]);

    // Export CSV
    const handleExport = useCallback(() => {
        const headers = ['ID', 'Transaction ID', 'Product', 'Order Type', 'Status', 'Order Status', 'Sub Type', 'Name', 'Phone', 'Wallet', 'Amount', 'Qty', 'Start Date', 'Pincode', 'Last Update'];
        const rows = filteredOrders.map(o => [
            o.id, o.trasation_id || '', o.title || '', ORDER_TYPE[o.order_type] || '',
            STATUS[o.status] || '', getOrderStatus(o), getSubTypeLabel(o.subscription_type),
            o.name || '', o.s_phone || '', o.wallet_amount || 0, o.order_amount || 0,
            o.qty || '', o.start_date || '', o.pincode || '', o.updated_at || ''
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
        { key: 'id', header: 'ID', width: '60px' },
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
        { key: 's_phone', header: 'Phone', width: '110px' },
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
            key: 'updated_at', header: 'Last Update', width: '160px',
            render: (o) => {
                try { return <span className="text-sm text-slate-400">{format(new Date(o.updated_at), 'dd-MM-yyyy HH:mm:ss')}</span>; }
                catch { return <span>-</span>; }
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

            {/* Table */}
            <DataTable data={filteredOrders} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Search orders..."
                onRowClick={(o) => router.push(`/orders/${o.id}`)} />
        </div>
    );
}
