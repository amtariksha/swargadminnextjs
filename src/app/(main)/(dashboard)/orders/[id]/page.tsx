'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useDrivers, useUserAddresses } from '@/hooks/useData';
import {
    useOrder, useOrderAssignment, useOrderTransactions, useSubOrderDeliveries,
    useUpdateOrder, useAssignOrder, useDeleteOrderAssignment,
    OrderTransaction, SubOrderDelivery,
} from '@/hooks/useOrders';
import FormField, { inputClassName, selectClassName, dateInputClassName, fieldNumber, fieldDate, fieldSelect, fieldText } from '@/components/FormField';
import DataTable, { Column } from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ArrowLeft, Save, Truck, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

import { formatApiDate } from '@/lib/dateUtils';
import { parseWeeklyDays } from '@/lib/weeklyDays';
const ORDER_TYPE_LABELS: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay Now', 4: 'Pay Later' };
const SUB_TYPE_LABELS: Record<number, string> = { 1: 'One Time', 2: 'Custom', 3: 'Daily', 4: 'Alternative Days' };
const DAY_LABELS = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU'];

const orderUpdateSchema = z.object({
    qty: z.number().min(1),
    order_amount: z.number().min(0),
    status: z.number(),
    order_status: z.number(),
    // Editable cadence for recurring subs — daily (3) ↔ alternate (4) only.
    // Weekly (2) needs the per-day editor on the create form, so it stays
    // read-only here; one-time (1) is fixed.
    subscription_type: z.number().optional(),
    start_date: z.string().optional(),
    // Optional subscription end date (recurring 2/3/4 only). Empty = indefinite.
    // Sent as "end_date" "YYYY-MM-DD"; ignored for one-time orders.
    end_date: z.string().optional(),
    address_id: z.number().optional(),
});

type OrderUpdateData = z.infer<typeof orderUpdateSchema>;

export default function OrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [showRemoveDriver, setShowRemoveDriver] = useState(false);
    const [newDriverId, setNewDriverId] = useState('');

    const { data: order, isLoading } = useOrder(id);
    const { data: assignment } = useOrderAssignment(id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderData = order as Record<string, any> | null;
    const subType = orderData?.subscription_type;
    const isSubscription = subType !== null && subType !== undefined && subType !== 1;
    const isOneTime = subType === null || subType === undefined || subType === 1;

    const { data: transactions = [] } = useOrderTransactions(id, isSubscription);
    // Fetch deliveries for every order type. One-time / daily orders also get a
    // subscribed_order_delivery row at mark-delivered, so the SOD endpoint returns
    // their delivery history too — previously gated to subscriptions, which is why
    // delivered one-time orders showed "No delivery records".
    const { data: deliveries = [] } = useSubOrderDeliveries(id);
    const { data: drivers = [] } = useDrivers();
    const { data: addresses = [] } = useUserAddresses(orderData?.user_id);

    const updateOrder = useUpdateOrder();
    const assignOrder = useAssignOrder();
    const deleteAssignment = useDeleteOrderAssignment();

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<OrderUpdateData>({
        resolver: zodResolver(orderUpdateSchema),
    });

    useEffect(() => {
        if (orderData) {
            reset({
                qty: orderData.qty || orderData.quantity || 1,
                order_amount: orderData.order_amount || orderData.final_amount || 0,
                status: orderData.status ?? 0,
                order_status: orderData.order_status ?? 0,
                subscription_type: subType ?? 1,
                start_date: orderData.start_date || orderData.delivery_date || '',
                // Normalize stored end_date to yyyy-MM-dd for the date input;
                // empty when null/indefinite. Backend may return either a bare
                // date or a timestamp, so route through formatApiDate.
                end_date: orderData.end_date
                    ? formatApiDate(orderData.end_date, 'yyyy-MM-dd', '')
                    : '',
                address_id: orderData.address_id || undefined,
            });
        }
    }, [orderData, reset]);

    // Quantity editing: keep the (read-only) Amount consistent by recomputing
    // it = per-unit-incl-tax × qty whenever the operator changes qty — the
    // backend update_order takes order_amount as-passed (no recompute), so the
    // form must send the right total. Per-unit is derived from the order's
    // snapshotted price + tax (robust to a corrupted stored order_amount).
    // Skipped for weekly (its order_amount is per-unit; per-day qty lives in the
    // create-form day picker). Only fires when qty actually differs from the
    // stored value, so a custom/override amount isn't clobbered on load.
    const qty = watch('qty');
    const unitAmount = useMemo(() => {
        const price = Number(orderData?.price) || 0;
        const tax = Number(orderData?.tax) || 0;
        return Math.round((price + (price * tax) / 100) * 100) / 100;
    }, [orderData?.price, orderData?.tax]);
    useEffect(() => {
        if (!orderData || subType === 2) return;
        const q = Number(qty) || 0;
        const originalQty = Number(orderData.qty) || 0;
        if (q > 0 && q !== originalQty && unitAmount > 0) {
            setValue('order_amount', Math.round(unitAmount * q * 100) / 100);
        }
    }, [qty, unitAmount, subType, orderData, setValue]);

    const onSubmit = async (data: OrderUpdateData) => {
        try {
            // end_date applies only to recurring subscriptions (2/3/4). For
            // one-time orders drop it entirely. For subscriptions, send it
            // even when empty so an operator can clear it → back to indefinite.
            const { end_date, subscription_type, ...rest } = data;
            const payload: Record<string, unknown> = { id: Number(id), ...rest };
            if (isSubscription) {
                payload.end_date = end_date ?? '';
                // Only daily (3) ↔ alternate (4) cadence is editable here.
                // Weekly stays read-only (needs the per-day editor on create).
                if ((subType === 3 || subType === 4) &&
                    (subscription_type === 3 || subscription_type === 4)) {
                    payload.subscription_type = subscription_type;
                }
            }
            await updateOrder.mutateAsync(payload);
            toast.success('Order updated');
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to update order'); }
    };

    const handleAssignDriver = async () => {
        if (!newDriverId) return;
        try {
            await assignOrder.mutateAsync({ user_id: Number(newDriverId), order_id: Number(id) });
            toast.success('Driver assigned');
            setNewDriverId('');
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to assign driver'); }
    };

    const handleRemoveDriver = async () => {
        try {
            // Backend expects { id: assignmentId }, not order_id
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const assignmentId = (assignment as any)?.id;
            if (!assignmentId) {
                toast.error('No assignment found to remove');
                return;
            }
            await deleteAssignment.mutateAsync({ id: assignmentId, order_id: Number(id) });
            toast.success('Driver removed');
            setShowRemoveDriver(false);
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to remove driver'); }
    };

    // Parse weekly delivery days into a label→qty map.
    //
    // dayCode follows JS Date.getDay() — 0=Sun, 1=Mon, …, 6=Sat. The
    // shared `parseWeeklyDays` helper accepts every shape the column has
    // shipped in (canonical, Flutter unquoted-key, flat-int, flat-string).
    //
    // DAY_LABELS = ['M','T','W','TH','F','S','SU'] starts at Monday, so
    // the mapping is `labelIndex = dayCode === 0 ? 6 : dayCode - 1`.
    const weeklyDayQty: Map<string, number> = (() => {
        const entries = parseWeeklyDays(orderData?.selected_days_for_weekly);
        const out = new Map<string, number>();
        for (const { dayCode, qty } of entries) {
            const idx = dayCode === 0 ? 6 : dayCode - 1;
            if (idx >= 0 && idx < DAY_LABELS.length) out.set(DAY_LABELS[idx], qty);
        }
        return out;
    })();

    const txnColumns: Column<OrderTransaction>[] = [
        { key: 'payment_id', header: 'Payment ID', render: (t) => <span className="text-xs text-slate-400">{t.payment_id || 'N/A'}</span> },
        {
            key: 'type', header: 'Type',
            render: (t) => <span className={`px-2 py-1 rounded-lg text-xs font-medium ${t.type === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{t.type === 1 ? 'Credit' : 'Debit'}</span>,
        },
        { key: 'payment_mode', header: 'Mode', render: (t) => <span className="text-sm">{t.payment_mode === 1 ? 'Online' : t.payment_mode === 2 ? 'Cash' : 'N/A'}</span> },
        { key: 'amount', header: 'Amount', render: (t) => <span className={t.type === 1 ? 'text-green-400' : 'text-red-400'}>₹{t.amount}</span> },
        { key: 'created_at', header: 'Date', render: (t) => { return formatApiDate(t.created_at, 'dd MMM yy HH:mm'); } },
    ];

    const deliveryColumns: Column<SubOrderDelivery>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'date', header: 'Date', render: (d) => { return formatApiDate(d.date, 'dd MMM yyyy'); } },
        { key: 'qty', header: 'Qty', render: (d) => String(d.qty || '-') },
        { key: 'created_at', header: 'Recorded', render: (d) => { return formatApiDate(d.created_at, 'dd MMM yy HH:mm'); } },
    ];

    if (isLoading) return <div className="space-y-6"><div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" /><div className="h-96 bg-slate-800/50 rounded-xl animate-pulse" /></div>;
    if (!orderData) return <div className="text-center py-20"><p className="text-slate-400">Order not found</p><button onClick={() => router.push('/orders')} className="mt-4 text-purple-400">Back to Orders</button></div>;

    // Check if one-time order is delivered
    const isOneTimeDelivered = isOneTime && orderData.delivery_status === 1;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Order #{id}</h1>
                    <p className="text-slate-400">{orderData.title || orderData.product_title || '-'}</p>
                </div>
                {isOneTimeDelivered && (
                    <span className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium">
                        <CheckCircle className="w-4 h-4" /> Order Delivered
                    </span>
                )}
                <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${orderData.status === 1 ? 'bg-green-500/20 text-green-400' : orderData.status === 2 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {orderData.status === 1 ? 'Confirmed' : orderData.status === 2 ? 'Cancelled' : 'Pending'}
                </span>
            </div>

            {/* Order Info */}
            <div className="glass rounded-xl p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div>
                        <p className="text-xs text-slate-500">Customer</p>
                        <p className="text-white font-medium">{orderData.user_name || orderData.name || '-'}</p>
                        <p className="text-xs text-slate-400">{orderData.user_phone || orderData.s_phone || '-'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Amount</p>
                        <p className="text-emerald-400 font-bold text-lg">₹{orderData.order_amount || orderData.final_amount || 0}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Order Type</p>
                        <p className="text-white">{ORDER_TYPE_LABELS[orderData.order_type] || '-'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Subscription</p>
                        <p className="text-white">{SUB_TYPE_LABELS[subType] || '-'}</p>
                    </div>
                </div>

                {/* Weekly Days Display — each active day shows its per-day qty */}
                {subType === 2 && (
                    <div className="mb-6">
                        <p className="text-xs text-slate-500 mb-2">Weekly Delivery Days &amp; Quantity</p>
                        <div className="flex gap-2 flex-wrap">
                            {DAY_LABELS.map((day) => {
                                const qty = weeklyDayQty.get(day);
                                const isActive = qty !== undefined;
                                return (
                                    <span key={day} className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 ${isActive ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50' : 'bg-slate-800/30 text-slate-600'}`}>
                                        <span className="text-xs font-bold">{day}</span>
                                        <span className="text-[11px] font-medium">{isActive ? `×${qty}` : '—'}</span>
                                    </span>
                                );
                            })}
                        </div>
                        {weeklyDayQty.size === 0 && (
                            <p className="text-xs text-slate-500 mt-2 italic">No delivery days set on this order.</p>
                        )}
                    </div>
                )}

                {/* Driver Assignment.
                    Both branches (assigned / unassigned) keep the dropdown
                    visible so the operator can change the driver in one
                    click — calling /add_order_assign with a new user_id
                    just inserts a fresh row, and the backend uses
                    `MAX(id) per order_id` to pick the active assignment
                    (see deliveryController.getGeneratedOrderListByDate).
                    No need to delete-then-add. The X button stays as an
                    explicit "remove all assignments" affordance. */}
                {/* B2B orders auto-assign to the truck driver — hide the manual
                    driver picker and show a read-only note instead. */}
                {orderData.is_b2b ? (
                    <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/50">
                        <div className="flex items-center gap-2 mb-1">
                            <Truck className="w-4 h-4 text-purple-400" />
                            <h3 className="text-sm font-medium text-slate-300">Delivery Partner</h3>
                        </div>
                        <p className="text-xs text-slate-500">Auto-assigned to truck driver (B2B)</p>
                    </div>
                ) : (
                <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                        <Truck className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-medium text-slate-300">Delivery Partner</h3>
                    </div>
                    {assignment && (
                        <div className="flex items-center justify-between mb-3 p-2 bg-slate-800/40 rounded-lg">
                            <div>
                                <p className="text-xs text-slate-500">Currently assigned</p>
                                <p className="text-white">
                                    {(assignment as Record<string, unknown>).name as string ||
                                     (assignment as Record<string, unknown>).delivery_boy_name as string ||
                                     `Driver #${assignment.user_id}`}
                                    {(assignment as Record<string, unknown>).phone ? (
                                        <span className="text-slate-400 text-sm ml-2">{(assignment as Record<string, unknown>).phone as string}</span>
                                    ) : null}
                                </p>
                            </div>
                            <button onClick={() => setShowRemoveDriver(true)} className="p-1.5 hover:bg-red-500/20 rounded-lg" title="Remove driver">
                                <X className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <select value={newDriverId} onChange={(e) => setNewDriverId(e.target.value)} className={`flex-1 ${selectClassName}`}>
                            <option value="">{assignment ? 'Change driver…' : 'Select driver'}</option>
                            {[...drivers].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                                <option key={d.id} value={d.user_id}>{d.name} - {d.phone}</option>
                            ))}
                        </select>
                        <button onClick={handleAssignDriver} disabled={!newDriverId || assignOrder.isPending} className="px-4 py-2 bg-purple-600 text-white text-sm rounded-xl disabled:opacity-50">
                            {assignment ? 'Update' : 'Assign'}
                        </button>
                    </div>
                </div>
                )}
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-4 max-w-5xl">
                <h2 className="text-lg font-semibold text-white">Edit Order</h2>
                <div className="flex flex-wrap gap-4">
                    {/* Qty editable for one-time + daily/alternate orders.
                        Locked for weekly (per-day qty lives in the create form)
                        and for an already-delivered one-time order (correct a
                        delivered order via Recovery / Credit Note, not here). */}
                    <FormField label="Quantity" error={errors.qty} className={fieldNumber}>
                        <input {...register('qty', { valueAsNumber: true })} type="number" min={1}
                            disabled={subType === 2 || isOneTimeDelivered} className={inputClassName} />
                    </FormField>
                    {/* Read-only — auto-recomputed from qty (see effect above). */}
                    <FormField label="Amount (₹)" error={errors.order_amount} className={fieldNumber}
                        hint="Auto-calculated from quantity">
                        <input {...register('order_amount', { valueAsNumber: true })} type="number" step="0.01"
                            readOnly className={`${inputClassName} !text-slate-500`} />
                    </FormField>
                    <FormField label="Start Date" error={errors.start_date} className={fieldDate}>
                        <input {...register('start_date')} type="date" className={dateInputClassName} />
                    </FormField>
                    {/* End date — optional, recurring subscriptions only.
                        Blank = runs indefinitely; clearing it reverts to indefinite. */}
                    {isSubscription && (
                        <FormField label="End Date" error={errors.end_date} className={fieldDate}
                            hint="Optional — leave blank for indefinite">
                            <input {...register('end_date')} type="date" className={dateInputClassName} />
                        </FormField>
                    )}
                    <FormField label="Status" error={errors.status} className={fieldSelect}>
                        <select {...register('status', { valueAsNumber: true })} className={selectClassName}>
                            <option value={0}>Pending</option>
                            <option value={1}>Confirmed</option>
                            <option value={2}>Cancelled</option>
                        </select>
                    </FormField>
                    {isSubscription && (
                        <FormField label="Order Status" error={errors.order_status} className={fieldSelect}>
                            <select {...register('order_status', { valueAsNumber: true })} className={selectClassName}>
                                <option value={0}>Active</option>
                                <option value={1}>Stopped</option>
                            </select>
                        </FormField>
                    )}
                    {isSubscription && (subType === 3 || subType === 4) ? (
                        <FormField label="Subscription Type" className={fieldSelect}
                            hint="Switch cadence (daily ↔ alternate). Custom needs a new order.">
                            <select {...register('subscription_type', { valueAsNumber: true })} className={selectClassName}>
                                <option value={3}>Daily</option>
                                <option value={4}>Alternative Days</option>
                            </select>
                        </FormField>
                    ) : (
                        <FormField label="Subscription Type" className={fieldSelect}>
                            <input value={SUB_TYPE_LABELS[subType] || 'N/A'} disabled className={`${inputClassName} !text-slate-500`} />
                        </FormField>
                    )}
                    {addresses.length > 0 && (
                        <FormField label="Address" className={fieldText}>
                            <select {...register('address_id', { valueAsNumber: true })} className={selectClassName}>
                                <option value="">Select address</option>
                                {addresses.map((a) => (
                                    <option key={a.id} value={a.id}>{[a.flat_no, a.apartment_name, a.area, a.city, a.pincode].filter(Boolean).join(', ')}</option>
                                ))}
                            </select>
                        </FormField>
                    )}
                </div>
                <button type="submit" disabled={updateOrder.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl disabled:opacity-50">
                    <Save className="w-4 h-4" /> {updateOrder.isPending ? 'Saving...' : 'Update Order'}
                </button>
            </form>

            {/* Transactions */}
            <div className="glass rounded-xl p-4">
                <h2 className="text-lg font-semibold text-white mb-4">Transaction History</h2>
                <DataTable data={transactions} columns={txnColumns} pageSize={10} emptyMessage="No transactions" />
            </div>

            {/* Deliveries */}
            <div className="glass rounded-xl p-4">
                <h2 className="text-lg font-semibold text-white mb-4">Delivery Details</h2>
                <DataTable data={deliveries} columns={deliveryColumns} pageSize={10} emptyMessage="No delivery records" />
            </div>

            <ConfirmDialog isOpen={showRemoveDriver} title="Remove Driver" message="Remove the delivery partner from this order?"
                onConfirm={handleRemoveDriver} onCancel={() => setShowRemoveDriver(false)} variant="danger" confirmText="Remove" isLoading={deleteAssignment.isPending} />
        </div>
    );
}
