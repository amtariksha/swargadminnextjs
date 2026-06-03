'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDaytimeOrders, DaytimeOrder } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import DateWithTodayButton from '@/components/DateWithTodayButton';
import { Sun, Plus, BarChart3, Link2, MapPin } from 'lucide-react';

const ORDER_STATUS_STYLE: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-300',
    confirmed: 'bg-blue-500/20 text-blue-300',
    delivered: 'bg-emerald-500/20 text-emerald-300',
    cancelled: 'bg-red-500/20 text-red-300',
};
const PAYMENT_STATUS_STYLE: Record<string, string> = {
    unpaid: 'bg-red-500/20 text-red-300',
    link_sent: 'bg-amber-500/20 text-amber-300',
    paid: 'bg-emerald-500/20 text-emerald-300',
    cash: 'bg-emerald-500/20 text-emerald-300',
    wallet_deducted: 'bg-emerald-500/20 text-emerald-300',
};
const Badge = ({ value, map }: { value: string; map: Record<string, string> }) => (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${map[value] || 'bg-slate-700 text-slate-300'}`}>
        {value.replace(/_/g, ' ')}
    </span>
);

export default function DayOrdersPage() {
    const router = useRouter();
    const [date, setDate] = useState('');
    const [orderStatus, setOrderStatus] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');

    const filters = useMemo(() => {
        const f: Record<string, string> = {};
        if (date) f.date = date;
        if (orderStatus) f.order_status = orderStatus;
        if (paymentStatus) f.payment_status = paymentStatus;
        return f;
    }, [date, orderStatus, paymentStatus]);

    const { data: orders = [], isLoading } = useDaytimeOrders(filters);

    const columns: Column<DaytimeOrder>[] = [
        { key: 'order_no', header: 'Order #', width: '90px', render: (o) => `#${o.order_no}` },
        {
            key: 'customer_name',
            header: 'Customer',
            width: '170px',
            render: (o) => (
                <div>
                    <div className="text-white">{o.customer_name}</div>
                    <div className="text-xs text-slate-500">{o.customer_phone}</div>
                    {o.entry_type === 'morning_backup' && (
                        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-medium"
                            title="Recovered from an undelivered morning order — already paid, not a sales-exec order">
                            Morning recovery
                        </span>
                    )}
                </div>
            ),
        },
        {
            key: 'items',
            header: 'Products',
            width: '190px',
            render: (o) => {
                const items = o.items || [];
                if (!items.length) return <span className="text-slate-500">—</span>;
                return (
                    <div className="space-y-0.5">
                        {items.slice(0, 3).map((it) => (
                            <div key={it.id} className="text-xs text-slate-300">
                                <span className="text-slate-500">{it.qty}×</span>{' '}
                                {it.product_title || it.base_product_title || `Product #${it.product_id}`}
                            </div>
                        ))}
                        {items.length > 3 && (
                            <div className="text-xs text-slate-500">+{items.length - 3} more</div>
                        )}
                    </div>
                );
            },
        },
        { key: 'delivery_date', header: 'Delivery', width: '120px' },
        {
            key: 'total_amount',
            header: 'Total',
            width: '100px',
            render: (o) => <span className="text-white">₹{Number(o.total_amount).toFixed(2)}</span>,
        },
        {
            key: 'order_status',
            header: 'Order',
            width: '110px',
            render: (o) => <Badge value={o.order_status} map={ORDER_STATUS_STYLE} />,
        },
        {
            key: 'payment_status',
            header: 'Payment',
            width: '120px',
            render: (o) => <Badge value={o.payment_status} map={PAYMENT_STATUS_STYLE} />,
        },
        { key: 'created_by_name', header: 'Sales Exec', width: '130px', render: (o) => o.created_by_name || '—' },
        {
            key: 'claimed_by',
            header: 'Claimed by',
            width: '130px',
            render: (o) => o.delivery?.claimed_by_name
                ? <span className="text-slate-300">{o.delivery.claimed_by_name}</span>
                : <span className="text-slate-500">—</span>,
        },
        {
            key: 'delivered_at',
            header: 'Delivered',
            width: '150px',
            render: (o) => o.delivery?.delivered_at
                ? <span className="text-xs text-slate-300">{o.delivery.delivered_at}</span>
                : <span className="text-slate-500">—</span>,
        },
        {
            key: 'delivered_loc',
            header: 'Location',
            width: '90px',
            render: (o) => (o.delivery?.lat != null && o.delivery?.lng != null)
                ? (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${o.delivery.lat},${o.delivery.lng}`}
                        target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs">
                        <MapPin className="w-3.5 h-3.5" /> Map
                    </a>
                )
                : <span className="text-slate-500">—</span>,
        },
        {
            key: 'proof_photo',
            header: 'Photo',
            width: '80px',
            render: (o) => o.delivery?.proof_photo_url
                ? (
                    <a href={o.delivery.proof_photo_url} target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()} className="inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={o.delivery.proof_photo_url} alt="Proof of delivery"
                            className="w-9 h-9 rounded object-cover border border-slate-700 hover:ring-2 hover:ring-purple-500/50" />
                    </a>
                )
                : <span className="text-slate-500">—</span>,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Sun className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Day Orders</h1>
                        <p className="text-slate-400">Day-time delivery network orders</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/day-orders/payments"
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 text-slate-200 rounded-xl font-medium hover:bg-slate-800">
                        <Link2 className="w-5 h-5" /> Payment Links
                    </Link>
                    <Link href="/day-orders/reports"
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 text-slate-200 rounded-xl font-medium hover:bg-slate-800">
                        <BarChart3 className="w-5 h-5" /> Reports
                    </Link>
                    <Link href="/day-orders/new"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25">
                        <Plus className="w-5 h-5" /> New Order
                    </Link>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <DateWithTodayButton value={date} onChange={setDate} />
                <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}
                    className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    <option value="">All order statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}
                    className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    <option value="">All payment statuses</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="link_sent">Link sent</option>
                    <option value="paid">Paid (link)</option>
                    <option value="cash">Cash</option>
                    <option value="wallet_deducted">Wallet</option>
                </select>
                {(date || orderStatus || paymentStatus) && (
                    <button onClick={() => { setDate(''); setOrderStatus(''); setPaymentStatus(''); }}
                        className="px-3 py-2 text-sm text-slate-400 hover:text-white">Clear</button>
                )}
            </div>

            <DataTable
                data={orders}
                columns={columns}
                loading={isLoading}
                pageSize={25}
                searchPlaceholder="Search by customer, phone…"
                emptyMessage="No day-time orders"
                onRowClick={(o) => router.push(`/day-orders/${o.id}`)}
            />
        </div>
    );
}
