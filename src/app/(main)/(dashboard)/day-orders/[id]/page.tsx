'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDaytimeOrder } from '@/hooks/useData';
import DaytimeOrderForm from '@/components/DaytimeOrderForm';
import ConfirmDialog from '@/components/ConfirmDialog';
import { POST, ApiError } from '@/lib/api';
import { ArrowLeft, Sun, Link2, Banknote, Wallet, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const PAID_STATES = ['paid', 'cash', 'wallet_deducted'];

export default function DaytimeOrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: order, isLoading } = useDaytimeOrder(id);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmCancel, setConfirmCancel] = useState(false);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['daytime-order', id] });
        queryClient.invalidateQueries({ queryKey: ['daytime-orders'] });
    };

    const runAction = async (key: string, fn: () => Promise<unknown>, successMsg: string) => {
        setBusy(key);
        try {
            await fn();
            toast.success(successMsg);
            refresh();
        } catch (error) {
            const msg = error instanceof ApiError ? error.userMessage
                : error instanceof Error ? error.message : 'Action failed';
            toast.error(msg);
        } finally {
            setBusy(null);
        }
    };

    const generateLink = () =>
        runAction('link', async () => {
            const res = await POST<{ short_url?: string; whatsapp?: { sent?: boolean } }>(
                `/daytime/orders/${id}/payment_link`,
            );
            const sent = (res as { data?: { whatsapp?: { sent?: boolean } } })?.data?.whatsapp?.sent;
            return sent;
        }, 'Payment link generated' );

    const markPaid = (mode: 'cash' | 'wallet') =>
        runAction(mode, () => POST(`/daytime/orders/${id}/mark_paid`, { payment_mode: mode }),
            mode === 'cash' ? 'Marked paid in cash' : 'Wallet debited');

    const cancelOrder = () =>
        runAction('cancel', () => POST(`/daytime/orders/${id}/cancel`), 'Order cancelled')
            .then(() => setConfirmCancel(false));

    if (isLoading) {
        return <div className="space-y-4"><div className="h-8 w-40 bg-slate-800/50 rounded animate-pulse" />
            <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" /></div>;
    }
    if (!order) {
        return <div className="text-center py-20"><p className="text-slate-400">Day-time order not found</p>
            <button onClick={() => router.push('/day-orders')} className="mt-4 text-purple-400">Back to Day Orders</button></div>;
    }

    const isPaid = PAID_STATES.includes(order.payment_status);
    const isClosed = ['cancelled', 'delivered'].includes(order.order_status);
    const editable = !isClosed && !isPaid;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/day-orders')} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex items-center gap-3">
                    <Sun className="w-7 h-7 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold text-white">Order #{order.order_no}</h1>
                        <p className="text-slate-400">
                            {order.customer_name} · {order.customer_phone} · {order.order_status} / {order.payment_status.replace(/_/g, ' ')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Payment + lifecycle panel */}
            <div className="glass rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">Payment — ₹{Number(order.total_amount).toFixed(2)}</h3>
                {order.payment_short_url && (
                    <a href={order.payment_short_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300">
                        <ExternalLink className="w-4 h-4" /> {order.payment_short_url}
                    </a>
                )}
                {isPaid ? (
                    <p className="text-emerald-300 text-sm">Settled via {order.payment_mode || order.payment_status}.</p>
                ) : isClosed ? (
                    <p className="text-slate-400 text-sm">This order is {order.order_status}.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        <button onClick={generateLink} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl disabled:opacity-50">
                            <Link2 className="w-4 h-4" />
                            {busy === 'link' ? 'Generating…' : order.payment_link_id ? 'Resend payment link' : 'Generate & send payment link'}
                        </button>
                        <button onClick={() => markPaid('cash')} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-800/60 text-slate-200 rounded-xl hover:bg-slate-800 disabled:opacity-50">
                            <Banknote className="w-4 h-4" /> {busy === 'cash' ? 'Saving…' : 'Mark cash'}
                        </button>
                        <button onClick={() => markPaid('wallet')} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-800/60 text-slate-200 rounded-xl hover:bg-slate-800 disabled:opacity-50">
                            <Wallet className="w-4 h-4" /> {busy === 'wallet' ? 'Saving…' : 'Pay from wallet'}
                        </button>
                        <button onClick={() => setConfirmCancel(true)} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl hover:bg-red-500/30 disabled:opacity-50">
                            <XCircle className="w-4 h-4" /> Cancel order
                        </button>
                    </div>
                )}
                {order.delivery && (
                    <p className="text-xs text-slate-500">
                        Delivery: {order.delivery.status}
                        {order.delivery.delivered_at ? ` · delivered ${order.delivery.delivered_at}` : ''}
                    </p>
                )}
            </div>

            {/* Edit form (editable orders) or read-only summary */}
            {editable ? (
                <DaytimeOrderForm orderId={order.id} initial={order} onSaved={refresh} />
            ) : (
                <div className="glass rounded-xl p-6 space-y-2">
                    <h3 className="text-sm font-semibold text-white mb-2">Items</h3>
                    {order.items.map((it) => (
                        <div key={it.id} className="flex justify-between text-sm text-slate-300">
                            <span>{it.product_title} × {it.qty}{it.is_bulk_rate ? ' (bulk)' : ''}</span>
                            <span>₹{Number(it.line_total).toFixed(2)}</span>
                        </div>
                    ))}
                    <div className="border-t border-slate-800/50 pt-2 flex justify-between text-sm">
                        <span className="text-slate-400">Subtotal</span>
                        <span className="text-white">₹{Number(order.subtotal).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Discount / Shipping</span>
                        <span className="text-white">
                            −₹{Number(order.discount_flat).toFixed(2)} / +₹{Number(order.shipping_charges).toFixed(2)}
                        </span>
                    </div>
                    <div className="flex justify-between text-base font-bold">
                        <span className="text-white">Total</span>
                        <span className="text-white">₹{Number(order.total_amount).toFixed(2)}</span>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={confirmCancel}
                title="Cancel day-time order"
                message="Cancel this order? Any unpaid payment link will be revoked."
                onConfirm={cancelOrder}
                onCancel={() => setConfirmCancel(false)}
                variant="danger"
                confirmText="Cancel order"
            />
        </div>
    );
}
