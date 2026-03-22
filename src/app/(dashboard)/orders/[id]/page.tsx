'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import FormField, { inputClassName, selectClassName } from '@/components/FormField';
import DataTable, { Column } from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ArrowLeft, Save, Truck, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const ORDER_TYPE_LABELS: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay Now', 4: 'Pay Later' };
const SUB_TYPE_LABELS: Record<number, string> = { 1: 'One Time', 2: 'Weekly', 3: 'Daily', 4: 'Alternative Days' };
const DAY_LABELS = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU'];

const orderUpdateSchema = z.object({
    qty: z.number().min(1),
    order_amount: z.number().min(0),
    status: z.number(),
    order_status: z.number(),
    start_date: z.string().optional(),
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
    const { data: deliveries = [] } = useSubOrderDeliveries(isSubscription ? id : undefined);
    const { data: drivers = [] } = useDrivers();
    const { data: addresses = [] } = useUserAddresses(orderData?.user_id);

    const updateOrder = useUpdateOrder();
    const assignOrder = useAssignOrder();
    const deleteAssignment = useDeleteOrderAssignment();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<OrderUpdateData>({
        resolver: zodResolver(orderUpdateSchema),
    });

    useEffect(() => {
        if (orderData) {
            reset({
                qty: orderData.qty || orderData.quantity || 1,
                order_amount: orderData.order_amount || orderData.final_amount || 0,
                status: orderData.status ?? 0,
                order_status: orderData.order_status ?? 0,
                start_date: orderData.start_date || orderData.delivery_date || '',
                address_id: orderData.address_id || undefined,
            });
        }
    }, [orderData, reset]);

    const onSubmit = async (data: OrderUpdateData) => {
        try {
            await updateOrder.mutateAsync({ id: Number(id), ...data });
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
            await deleteAssignment.mutateAsync({ order_id: Number(id) });
            toast.success('Driver removed');
            setShowRemoveDriver(false);
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to remove driver'); }
    };

    // Parse weekly days
    const weeklyDays: string[] = (() => {
        try {
            const raw = orderData?.selected_days_for_weekly;
            if (!raw) return [];
            if (typeof raw === 'string') return JSON.parse(raw);
            return raw;
        } catch { return []; }
    })();

    const txnColumns: Column<OrderTransaction>[] = [
        { key: 'payment_id', header: 'Payment ID', render: (t) => <span className="text-xs text-slate-400">{t.payment_id || 'N/A'}</span> },
        {
            key: 'type', header: 'Type',
            render: (t) => <span className={`px-2 py-1 rounded-lg text-xs font-medium ${t.type === 1 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{t.type === 1 ? 'Credit' : 'Debit'}</span>,
        },
        { key: 'payment_mode', header: 'Mode', render: (t) => <span className="text-sm">{t.payment_mode === 1 ? 'Online' : t.payment_mode === 2 ? 'Cash' : 'N/A'}</span> },
        { key: 'amount', header: 'Amount', render: (t) => <span className={t.type === 1 ? 'text-green-400' : 'text-red-400'}>₹{t.amount}</span> },
        { key: 'created_at', header: 'Date', render: (t) => { try { return format(new Date(t.created_at), 'dd MMM yy HH:mm'); } catch { return '-'; } } },
    ];

    const deliveryColumns: Column<SubOrderDelivery>[] = [
        { key: 'id', header: 'ID', width: '70px' },
        { key: 'date', header: 'Date', render: (d) => { try { return format(new Date(d.date), 'dd MMM yyyy'); } catch { return '-'; } } },
        { key: 'qty', header: 'Qty', render: (d) => String(d.qty || '-') },
        { key: 'created_at', header: 'Recorded', render: (d) => { try { return format(new Date(d.created_at), 'dd MMM yy HH:mm'); } catch { return '-'; } } },
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

                {/* Weekly Days Display */}
                {subType === 2 && weeklyDays.length > 0 && (
                    <div className="mb-6">
                        <p className="text-xs text-slate-500 mb-2">Weekly Delivery Days</p>
                        <div className="flex gap-2">
                            {DAY_LABELS.map((day, i) => {
                                const isActive = weeklyDays.includes(day) || weeklyDays.includes(String(i));
                                return (
                                    <span key={day} className={`w-9 h-9 flex items-center justify-center rounded-lg text-xs font-bold ${isActive ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50' : 'bg-slate-800/30 text-slate-600'}`}>
                                        {day}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Driver Assignment */}
                <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                        <Truck className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-medium text-slate-300">Delivery Partner</h3>
                    </div>
                    {assignment ? (
                        <div className="flex items-center justify-between">
                            <p className="text-white">{assignment.delivery_boy_name || `Driver #${assignment.user_id}`}</p>
                            <button onClick={() => setShowRemoveDriver(true)} className="p-1.5 hover:bg-red-500/20 rounded-lg">
                                <X className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <select value={newDriverId} onChange={(e) => setNewDriverId(e.target.value)} className={`flex-1 ${selectClassName}`}>
                                <option value="">Select driver</option>
                                {[...drivers].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                                    <option key={d.id} value={d.id}>{d.name} - {d.phone}</option>
                                ))}
                            </select>
                            <button onClick={handleAssignDriver} disabled={!newDriverId || assignOrder.isPending} className="px-4 py-2 bg-purple-600 text-white text-sm rounded-xl disabled:opacity-50">Assign</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Edit Order</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField label="Quantity" error={errors.qty}>
                        <input {...register('qty', { valueAsNumber: true })} type="number" min={1}
                            disabled={isOneTime} className={inputClassName} />
                    </FormField>
                    <FormField label="Amount (₹)" error={errors.order_amount}>
                        <input {...register('order_amount', { valueAsNumber: true })} type="number" step="0.01"
                            disabled className={`${inputClassName} !text-slate-500`} />
                    </FormField>
                    <FormField label="Start Date" error={errors.start_date}>
                        <input {...register('start_date')} type="date" className={inputClassName} />
                    </FormField>
                    <FormField label="Status" error={errors.status}>
                        <select {...register('status', { valueAsNumber: true })} className={selectClassName}>
                            <option value={0}>Pending</option>
                            <option value={1}>Confirmed</option>
                            <option value={2}>Cancelled</option>
                        </select>
                    </FormField>
                    {isSubscription && (
                        <FormField label="Order Status" error={errors.order_status}>
                            <select {...register('order_status', { valueAsNumber: true })} className={selectClassName}>
                                <option value={0}>Active</option>
                                <option value={1}>Stopped</option>
                            </select>
                        </FormField>
                    )}
                    <FormField label="Subscription Type">
                        <input value={SUB_TYPE_LABELS[subType] || 'N/A'} disabled className={`${inputClassName} !text-slate-500`} />
                    </FormField>
                    {addresses.length > 0 && (
                        <FormField label="Address">
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
