'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useDaytimeOrders, DaytimeOrder } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import DateWithTodayButton from '@/components/DateWithTodayButton';
import { PodImage } from '@/components/PodImage';
import CateringOrderModal from '@/components/accounting/CateringOrderModal';
import { Sun, Plus, BarChart3, Link2, MapPin, Utensils } from 'lucide-react';

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

/** Settled states, mirroring PAID_STATES in the backend. UPI settles as 'paid'
 *  with payment_mode='upi', so there is no 'upi' status to match on. */
const PAID = ['paid', 'cash', 'wallet_deducted'];

const SplitCard = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div className="glass rounded-2xl p-4">
        <p className="text-xs text-slate-400">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${tone}`}>₹{value.toFixed(0)}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">collected</p>
    </div>
);

/** Local calendar date as YYYY-MM-DD (en-CA formats that way natively). */
const todayLocal = () => new Date().toLocaleDateString('en-CA');

export default function DayOrdersPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [showCatering, setShowCatering] = useState(false);
    /**
     * Stall counter sales are hidden by DEFAULT.
     *
     * There are hundreds of them on a market day against ~30 real hyperlocal
     * day orders, and this screen is what customer care works to chase
     * deliveries and payments — burying that under a till roll makes the page
     * useless. But hidden with no way to show them made the sales invisible in
     * the admin entirely, which is worse. Hence the toggle.
     */
    const [showStall, setShowStall] = useState(false);
    // Default to TODAY, not "everything". The list endpoint is capped, so an
    // unfiltered first load was both the slowest query in the module and the one
    // most likely to come back truncated. Today's orders are what this page is
    // actually for; clearing the date still works and now says when it truncates.
    const [date, setDate] = useState(todayLocal);
    const [orderStatus, setOrderStatus] = useState('');
    const [paymentStatus, setPaymentStatus] = useState('');

    const filters = useMemo(() => {
        const f: Record<string, string> = {};
        if (date) f.date = date;
        if (orderStatus) f.order_status = orderStatus;
        if (paymentStatus) f.payment_status = paymentStatus;
        if (showStall) f.include_stall = '1';
        return f;
    }, [date, orderStatus, paymentStatus, showStall]);

    const { data, isLoading } = useDaytimeOrders(filters);
    const orders = useMemo(() => data?.orders ?? [], [data]);
    const listMeta = data?.meta;

    // Summary cards — computed from the (filtered) order list, so they track the
    // date / status filters above. Every tile excludes cancelled orders (they
    // aren't revenue, aren't pending delivery, and don't count toward the order
    // tally).
    const stats = useMemo(() => {
        const live = orders.filter((o) => o.order_status !== 'cancelled');
        const sum = (list: DaytimeOrder[]) => list.reduce((s, o) => s + Number(o.total_amount || 0), 0);
        const isPaid = (o: DaytimeOrder) => PAID.includes(o.payment_status);
        return {
            count: live.length,
            revenue: sum(live),
            notDelivered: live.filter((o) => o.order_status !== 'delivered').length,
            collected: sum(live.filter(isPaid)),
            outstanding: sum(live.filter((o) => !isPaid(o))),
        };
    }, [orders]);

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
            width: '170px',
            render: (o) => {
                // Transferred to the morning/last-mile list — show where it went
                // and which morning driver carries it now.
                if (o.pool === 'last_mile') {
                    return (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 inline-block leading-snug"
                            title={o.pool_moved_at ? `Moved ${o.pool_moved_at}` : undefined}>
                            Shifted to morning delivery
                            {o.last_mile_driver_name ? ` · ${o.last_mile_driver_name}` : ''}
                        </span>
                    );
                }
                return o.delivery?.claimed_by_name
                    ? <span className="text-slate-300">{o.delivery.claimed_by_name}</span>
                    : <span className="text-slate-500">—</span>;
            },
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
                    <span onClick={(e) => e.stopPropagation()} className="inline-block">
                        <PodImage refValue={o.delivery.proof_photo_url}
                            className="w-9 h-9 rounded object-cover border border-slate-700 hover:ring-2 hover:ring-purple-500/50" />
                    </span>
                )
                : <span className="text-slate-500">—</span>,
        },
    ];

    // How the money came in. Only meaningful once stall sales are in view — a
    // normal day order is a delivery, and its payment mode is a detail. At a
    // counter it is the number you reconcile the cash box against.
    const paymentSplit = useMemo(() => {
        const live = orders.filter((o) => o.order_status !== 'cancelled');
        const by = (...modes: string[]) => live
            .filter((o) => PAID.includes(o.payment_status) && modes.includes(o.payment_mode || ''))
            .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        return {
            cash: by('cash'),
            upi: by('upi'),
            link: by('link', 'razorpay'),
            stallOrders: live.filter((o) => o.entry_type === 'stall').length,
        };
    }, [orders]);

    return (
        <div className="space-y-6">
            {listMeta?.truncated && (
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
                    <span aria-hidden="true">&#9888;</span>
                    <p>
                        Showing the first <strong>{listMeta.limit}</strong> orders only — more match your
                        filters than this view loads. The totals below count only what is shown; pick a
                        date to see a complete picture.
                    </p>
                </div>
            )}
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
                    <button onClick={() => setShowCatering(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 text-white rounded-xl font-medium hover:bg-emerald-600">
                        <Utensils className="w-5 h-5" /> B2B / Catering
                    </button>
                    <Link href="/day-orders/new"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25">
                        <Plus className="w-5 h-5" /> New Order
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Orders</p>
                    <p className="text-2xl font-bold text-white">{stats.count}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Revenue</p>
                    <p className="text-2xl font-bold text-white">₹{stats.revenue.toFixed(0)}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Not delivered</p>
                    <p className="text-2xl font-bold text-amber-300">{stats.notDelivered}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Collected</p>
                    <p className="text-2xl font-bold text-emerald-400">₹{stats.collected.toFixed(0)}</p>
                </div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">To collect</p>
                    <p className="text-2xl font-bold text-red-300">₹{stats.outstanding.toFixed(0)}</p>
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
                <button
                    onClick={() => setShowStall((v) => !v)}
                    title="Counter sales rung up at a market stall. Hidden by default because there can be hundreds a day."
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                        showStall
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                >
                    {showStall ? '✓ ' : ''}Stall sales
                </button>
                {(date || orderStatus || paymentStatus || showStall) && (
                    <button onClick={() => { setDate(''); setOrderStatus(''); setPaymentStatus(''); setShowStall(false); }}
                        className="px-3 py-2 text-sm text-slate-400 hover:text-white">Clear</button>
                )}
            </div>

            {showStall && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <SplitCard label="Cash" value={paymentSplit.cash} tone="text-emerald-300" />
                    <SplitCard label="UPI" value={paymentSplit.upi} tone="text-sky-300" />
                    <SplitCard label="Payment link" value={paymentSplit.link} tone="text-violet-300" />
                    <div className="glass rounded-2xl p-4">
                        <p className="text-xs text-slate-400">Stall sales</p>
                        <p className="text-2xl font-bold mt-1">{paymentSplit.stallOrders}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">counter orders in view</p>
                    </div>
                </div>
            )}

            <DataTable
                data={orders}
                columns={columns}
                loading={isLoading}
                pageSize={25}
                searchPlaceholder="Search by customer, phone…"
                emptyMessage="No day-time orders"
                onRowClick={(o) => router.push(`/day-orders/${o.id}`)}
            />

            <CateringOrderModal
                isOpen={showCatering}
                onClose={() => setShowCatering(false)}
                onCreated={() => queryClient.invalidateQueries({ queryKey: ['daytime-orders'] })}
            />
        </div>
    );
}
