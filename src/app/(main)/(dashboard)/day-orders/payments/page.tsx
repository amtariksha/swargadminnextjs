'use client';

/**
 * Day-order Razorpay payment links — a focused view of every day order that had
 * a payment link generated, with its live status (driven by the Razorpay webhook
 * that flips link_sent → paid). Mirrors the WhatsApp module's payments page.
 *
 * Frontend-only: reuses useDaytimeOrders (the list endpoint already returns the
 * payment_link_id / payment_short_url / paid_at fields) and filters to the rows
 * that carry a link.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useDaytimeOrders, DaytimeOrder } from '@/hooks/useData';
import DataTable, { Column } from '@/components/DataTable';
import { Link2, ArrowLeft, ExternalLink, Copy, IndianRupee } from 'lucide-react';

const PAYMENT_STATUS_STYLE: Record<string, string> = {
    unpaid: 'bg-red-500/20 text-red-300',
    link_sent: 'bg-amber-500/20 text-amber-300',
    paid: 'bg-emerald-500/20 text-emerald-300',
    cash: 'bg-emerald-500/20 text-emerald-300',
    wallet_deducted: 'bg-emerald-500/20 text-emerald-300',
};

const Badge = ({ value }: { value: string }) => (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${PAYMENT_STATUS_STYLE[value] || 'bg-slate-700 text-slate-300'}`}>
        {value.replace(/_/g, ' ')}
    </span>
);

// Only orders that actually had a Razorpay link generated.
const hasLink = (o: DaytimeOrder) => o.payment_mode === 'link' || !!o.payment_link_id;

export default function DayOrderPaymentsPage() {
    const router = useRouter();
    const [statusFilter, setStatusFilter] = useState('');

    const { data: orders = [], isLoading } = useDaytimeOrders({});

    const linkOrders = useMemo(() => {
        const withLink = orders.filter(hasLink);
        return statusFilter ? withLink.filter((o) => o.payment_status === statusFilter) : withLink;
    }, [orders, statusFilter]);

    const stats = useMemo(() => {
        const withLink = orders.filter(hasLink);
        return {
            total: withLink.length,
            paid: withLink.filter((o) => o.payment_status === 'paid').length,
            pending: withLink.filter((o) => o.payment_status === 'link_sent').length,
            collected: withLink
                .filter((o) => o.payment_status === 'paid')
                .reduce((s, o) => s + Number(o.total_amount || 0), 0),
        };
    }, [orders]);

    const copyLink = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Payment link copied');
        } catch {
            toast.error('Could not copy — long-press the Open link instead');
        }
    };

    const columns: Column<DaytimeOrder>[] = [
        { key: 'order_no', header: 'Order #', width: '90px', render: (o) => `#${o.order_no}` },
        {
            key: 'customer_name',
            header: 'Customer',
            render: (o) => (
                <div>
                    <div className="text-white">{o.customer_name}</div>
                    <div className="text-xs text-slate-500">{o.customer_phone}</div>
                </div>
            ),
        },
        {
            key: 'total_amount',
            header: 'Amount',
            width: '110px',
            render: (o) => <span className="text-white">₹{Number(o.total_amount).toFixed(2)}</span>,
        },
        {
            key: 'payment_status',
            header: 'Status',
            width: '120px',
            render: (o) => <Badge value={o.payment_status} />,
        },
        {
            key: 'payment_short_url',
            header: 'Razorpay Link',
            render: (o) =>
                o.payment_short_url ? (
                    <div className="flex items-center gap-2">
                        <a
                            href={o.payment_short_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-purple-300 hover:text-purple-200 text-xs"
                        >
                            <ExternalLink className="w-3.5 h-3.5" /> Open
                        </a>
                        <button
                            onClick={(e) => { e.stopPropagation(); copyLink(o.payment_short_url!); }}
                            className="p-1 rounded-lg hover:bg-slate-800/60"
                            title="Copy payment link"
                        >
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    </div>
                ) : (
                    <span className="text-slate-600 text-xs">—</span>
                ),
        },
        { key: 'created_at', header: 'Created', width: '160px', render: (o) => o.created_at || '—' },
        { key: 'paid_at', header: 'Paid', width: '160px', render: (o) => o.paid_at || '—' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link2 className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Payment Links</h1>
                        <p className="text-slate-400">Razorpay links for day-time orders + live status</p>
                    </div>
                </div>
                <Link href="/day-orders"
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 text-slate-200 rounded-xl font-medium hover:bg-slate-800">
                    <ArrowLeft className="w-5 h-5" /> Day Orders
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Links</p><p className="text-2xl font-bold text-white">{stats.total}</p></div>
                <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Awaiting payment</p><p className="text-2xl font-bold text-amber-300">{stats.pending}</p></div>
                <div className="glass rounded-xl p-4"><p className="text-sm text-slate-400">Paid</p><p className="text-2xl font-bold text-emerald-400">{stats.paid}</p></div>
                <div className="glass rounded-xl p-4">
                    <p className="text-sm text-slate-400">Collected</p>
                    <p className="text-2xl font-bold text-white flex items-center"><IndianRupee className="w-5 h-5" />{stats.collected.toFixed(0)}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    <option value="">All link statuses</option>
                    <option value="link_sent">Awaiting payment</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid / expired</option>
                </select>
                {statusFilter && (
                    <button onClick={() => setStatusFilter('')}
                        className="px-3 py-2 text-sm text-slate-400 hover:text-white">Clear</button>
                )}
            </div>

            <DataTable
                data={linkOrders}
                columns={columns}
                loading={isLoading}
                pageSize={25}
                searchPlaceholder="Search by customer, phone…"
                emptyMessage="No payment links yet"
                onRowClick={(o) => router.push(`/day-orders/${o.id}`)}
            />
        </div>
    );
}
