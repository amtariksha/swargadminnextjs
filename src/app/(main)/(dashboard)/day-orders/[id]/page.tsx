'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDaytimeOrder, useDrivers } from '@/hooks/useData';
import DaytimeOrderForm from '@/components/DaytimeOrderForm';
import ConfirmDialog from '@/components/ConfirmDialog';
import { POST, PUT, ApiError } from '@/lib/api';
import { ArrowLeft, Sun, Link2, Banknote, Wallet, XCircle, ExternalLink, CheckCircle2, MessageCircle, RotateCcw, UserCog, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

const PAID_STATES = ['paid', 'cash', 'wallet_deducted'];

export default function DaytimeOrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data: order, isLoading } = useDaytimeOrder(id);
    const [busy, setBusy] = useState<string | null>(null);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [confirmPay, setConfirmPay] = useState<'cash' | 'wallet' | null>(null);
    const [confirmDelivered, setConfirmDelivered] = useState(false);
    const [deliveredBy, setDeliveredBy] = useState<number | ''>('');
    // Customer-care override: reason saved with mark-delivered / release / reassign,
    // and the driver to hand the delivery to on a reassign.
    const [reason, setReason] = useState('');
    const [confirmRelease, setConfirmRelease] = useState(false);
    const [reassignTo, setReassignTo] = useState<number | ''>('');
    const [confirmReassign, setConfirmReassign] = useState(false);
    // Reschedule a morning-recovery order to another delivery date.
    const [rescheduleDate, setRescheduleDate] = useState('');
    // Day drivers (role 6) — who can be recorded as having delivered the order.
    const { data: drivers = [] } = useDrivers();
    const dayDrivers = drivers.filter((d) => d.role_id === 6);

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
            mode === 'cash' ? 'Marked paid in cash' : 'Wallet debited')
            .then(() => setConfirmPay(null));

    const cancelOrder = () =>
        runAction('cancel', () => POST(`/daytime/orders/${id}/cancel`), 'Order cancelled')
            .then(() => setConfirmCancel(false));

    const markDelivered = () =>
        runAction('delivered',
            () => POST(`/daytime/orders/${id}/mark_delivered`, { delivery_user_id: deliveredBy, reason: reason || undefined }),
            'Marked delivered')
            .then(() => { setConfirmDelivered(false); setReason(''); });

    const sendReminder = () =>
        runAction('reminder', () => POST(`/daytime/orders/${id}/send_reminder`), 'Payment reminder sent');

    const releaseToPool = () =>
        runAction('release',
            () => POST(`/daytime/orders/${id}/release`, { reason: reason || undefined }),
            'Released back to the pool')
            .then(() => { setConfirmRelease(false); setReason(''); });

    const reassignDelivery = () =>
        runAction('reassign',
            () => POST(`/daytime/orders/${id}/reassign`, { delivery_user_id: reassignTo, reason: reason || undefined }),
            'Delivery reassigned')
            .then(() => { setConfirmReassign(false); setReason(''); });

    const saveReschedule = () =>
        runAction('reschedule',
            () => PUT(`/daytime/orders/${id}`, { delivery_date: rescheduleDate || order?.delivery_date }),
            'Delivery date updated');

    if (isLoading) {
        return <div className="space-y-4"><div className="h-8 w-40 bg-slate-800/50 rounded animate-pulse" />
            <div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" /></div>;
    }
    if (!order) {
        return <div className="text-center py-20"><p className="text-slate-400">Day-time order not found</p>
            <button onClick={() => router.push('/day-orders')} className="mt-4 text-purple-400">Back to Day Orders</button></div>;
    }

    const isPaid = PAID_STATES.includes(order.payment_status);
    const isCancelled = order.order_status === 'cancelled';
    const isDelivered = order.order_status === 'delivered';
    // Morning-recovery (morning_backup) orders are billed by the subscription on
    // delivery — NO day-network payment, and items/amount are frozen. They get a
    // read-only summary + a date-only reschedule, never the full edit form or the
    // payment buttons (which would double-charge / nag the customer).
    const isRecovery = order.entry_type === 'morning_backup';
    const canReschedule = isRecovery && !isCancelled && !isDelivered;
    const todayStr = new Date().toLocaleDateString('en-CA');
    // Line items are only editable on an open, unpaid, non-recovery order. A
    // delivered order's items are frozen — but its PAYMENT is not: a
    // delivered-but-unpaid order must still be collectable.
    const editable = !isCancelled && !isDelivered && !isPaid && !isRecovery;

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
                {isRecovery ? (
                    <p className="text-slate-400 text-sm">
                        Morning-recovery order — billed automatically by the customer&apos;s subscription
                        wallet when it&apos;s delivered. No separate day-network payment is taken here.
                    </p>
                ) : isPaid ? (
                    <p className="text-emerald-300 text-sm">Settled via {order.payment_mode || order.payment_status}.</p>
                ) : isCancelled ? (
                    <p className="text-slate-400 text-sm">This order is cancelled.</p>
                ) : (
                    <div className="space-y-3">
                        {isDelivered && (
                            <p className="text-xs text-amber-300/90">Delivered but unpaid — collect the outstanding payment below.</p>
                        )}
                    <div className="flex flex-wrap gap-2">
                        <button onClick={generateLink} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl disabled:opacity-50">
                            <Link2 className="w-4 h-4" />
                            {busy === 'link' ? 'Generating…' : order.payment_link_id ? 'Resend payment link' : 'Generate & send payment link'}
                        </button>
                        <button onClick={() => setConfirmPay('cash')} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-800/60 text-slate-200 rounded-xl hover:bg-slate-800 disabled:opacity-50">
                            <Banknote className="w-4 h-4" /> {busy === 'cash' ? 'Saving…' : 'Mark cash'}
                        </button>
                        <button onClick={() => setConfirmPay('wallet')} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-800/60 text-slate-200 rounded-xl hover:bg-slate-800 disabled:opacity-50">
                            <Wallet className="w-4 h-4" /> {busy === 'wallet' ? 'Saving…' : 'Pay from wallet'}
                        </button>
                        <button onClick={sendReminder} disabled={busy !== null}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl hover:bg-amber-500/30 disabled:opacity-50">
                            <MessageCircle className="w-4 h-4" /> {busy === 'reminder' ? 'Sending…' : 'Send reminder'}
                        </button>
                        {!isDelivered && (
                            <button onClick={() => setConfirmCancel(true)} disabled={busy !== null}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl hover:bg-red-500/30 disabled:opacity-50">
                                <XCircle className="w-4 h-4" /> Cancel order
                            </button>
                        )}
                    </div>
                    </div>
                )}
                {order.order_status !== 'cancelled' && order.order_status !== 'delivered' && (
                    <div className="border-t border-slate-800/50 pt-3 space-y-3">
                        <p className="text-xs font-semibold text-slate-300">Delivery — customer care</p>
                        {/* Shared reason/note saved with whichever override is taken. */}
                        <input value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason / note (optional — e.g. driver unreachable)"
                            className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500" />
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Mark delivered on behalf of a driver. */}
                            <select value={deliveredBy}
                                onChange={(e) => setDeliveredBy(e.target.value ? Number(e.target.value) : '')}
                                className="px-3 py-2 text-sm bg-slate-900/50 border border-slate-700/50 rounded-xl text-white">
                                <option value="">Delivered by…</option>
                                {dayDrivers.map((d) => (
                                    <option key={d.user_id} value={d.user_id}>{d.name}</option>
                                ))}
                            </select>
                            <button onClick={() => setConfirmDelivered(true)} disabled={busy !== null || deliveredBy === ''}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 disabled:opacity-50">
                                <CheckCircle2 className="w-4 h-4" /> {busy === 'delivered' ? 'Saving…' : 'Mark delivered'}
                            </button>
                            {/* Reassign to another day driver. */}
                            <select value={reassignTo}
                                onChange={(e) => setReassignTo(e.target.value ? Number(e.target.value) : '')}
                                className="px-3 py-2 text-sm bg-slate-900/50 border border-slate-700/50 rounded-xl text-white">
                                <option value="">Reassign to…</option>
                                {dayDrivers.map((d) => (
                                    <option key={d.user_id} value={d.user_id}>{d.name}</option>
                                ))}
                            </select>
                            <button onClick={() => setConfirmReassign(true)} disabled={busy !== null || reassignTo === ''}
                                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl hover:bg-blue-500/30 disabled:opacity-50">
                                <UserCog className="w-4 h-4" /> {busy === 'reassign' ? 'Saving…' : 'Reassign'}
                            </button>
                            {/* Release back to the pool — only meaningful while claimed. */}
                            {order.delivery?.status === 'claimed' && (
                                <button onClick={() => setConfirmRelease(true)} disabled={busy !== null}
                                    className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-800/60 text-slate-200 rounded-xl hover:bg-slate-800 disabled:opacity-50">
                                    <RotateCcw className="w-4 h-4" /> {busy === 'release' ? 'Releasing…' : 'Release to pool'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {order.delivery && (
                    <div className="text-xs text-slate-500 space-y-1">
                        <p>
                            Delivery: <span className="text-slate-300">{order.delivery.status}</span>
                            {order.delivery.claimed_by_name ? ` · ${order.delivery.claimed_by_name}` : ''}
                            {order.delivery.delivered_at ? ` · delivered ${order.delivery.delivered_at}` : ''}
                            {(order.delivery.lat != null && order.delivery.lng != null) && (
                                <>{' · '}<a href={`https://www.google.com/maps/search/?api=1&query=${order.delivery.lat},${order.delivery.lng}`}
                                    target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300">location</a></>
                            )}
                        </p>
                        {order.delivery.admin_note && (
                            <p className="text-amber-400/80">Note: {order.delivery.admin_note}</p>
                        )}
                        {order.delivery.proof_photo_url && (
                            <a href={order.delivery.proof_photo_url} target="_blank" rel="noreferrer"
                                className="inline-block mt-1">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={order.delivery.proof_photo_url} alt="Proof of delivery"
                                    className="w-20 h-20 rounded-lg object-cover border border-slate-700 hover:ring-2 hover:ring-purple-500/50" />
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Reschedule — recovery orders only (date-only; items/amount frozen). */}
            {canReschedule && (
                <div className="glass rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-purple-400" /> Reschedule delivery
                    </h3>
                    <p className="text-xs text-slate-400">
                        Move this recovery to another day. Must be today or later, and not yet picked
                        up by a driver. Items + amount are billed by the morning subscription and
                        can&apos;t be edited here.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <input type="date" min={todayStr}
                            value={rescheduleDate || order.delivery_date || ''}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="px-3 py-2 text-sm bg-slate-900/50 border border-slate-700/50 rounded-xl text-white" />
                        <button onClick={saveReschedule}
                            disabled={busy !== null
                                || !(rescheduleDate || order.delivery_date)
                                || (rescheduleDate || order.delivery_date) === order.delivery_date}
                            className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl hover:bg-purple-500/30 disabled:opacity-50">
                            <CalendarClock className="w-4 h-4" /> {busy === 'reschedule' ? 'Saving…' : 'Save date'}
                        </button>
                    </div>
                </div>
            )}

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

            <ConfirmDialog
                isOpen={confirmDelivered}
                title="Mark order delivered"
                message={`Mark order #${order.order_no} as delivered by ${dayDrivers.find((d) => d.user_id === deliveredBy)?.name || 'the selected driver'}?`}
                onConfirm={markDelivered}
                onCancel={() => setConfirmDelivered(false)}
                confirmText="Mark delivered"
                isLoading={busy === 'delivered'}
            />

            <ConfirmDialog
                isOpen={confirmPay !== null}
                title={confirmPay === 'wallet' ? 'Pay from customer wallet' : 'Mark paid in cash'}
                message={confirmPay === 'wallet'
                    ? `Debit ₹${Number(order.total_amount).toFixed(2)} from ${order.customer_name}'s wallet now? This debits the wallet immediately, logs a debit in their transaction history, and cannot be undone.`
                    : `Mark this ₹${Number(order.total_amount).toFixed(2)} order as paid in cash? This cannot be undone.`}
                onConfirm={() => confirmPay && markPaid(confirmPay)}
                onCancel={() => setConfirmPay(null)}
                confirmText={confirmPay === 'wallet' ? 'Debit wallet' : 'Mark cash'}
                isLoading={busy === confirmPay}
            />

            <ConfirmDialog
                isOpen={confirmReassign}
                title="Reassign delivery"
                message={`Hand order #${order.order_no} to ${dayDrivers.find((d) => d.user_id === reassignTo)?.name || 'the selected driver'}? They become the claimer immediately.`}
                onConfirm={reassignDelivery}
                onCancel={() => setConfirmReassign(false)}
                confirmText="Reassign"
                isLoading={busy === 'reassign'}
            />

            <ConfirmDialog
                isOpen={confirmRelease}
                title="Release back to the pool"
                message={`Release order #${order.order_no} from its current driver and return it to the shared day pool for anyone to re-claim?`}
                onConfirm={releaseToPool}
                onCancel={() => setConfirmRelease(false)}
                confirmText="Release"
                isLoading={busy === 'release'}
            />
        </div>
    );
}
