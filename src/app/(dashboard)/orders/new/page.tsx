'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUsers, useProducts, useDrivers, useUserAddresses, useAddAddress, useAddTransaction } from '@/hooks/useData';
import { useCreateOrder, useAssignOrder } from '@/hooks/useOrders';
import FormField, { inputClassName, selectClassName } from '@/components/FormField';
import { ArrowLeft, Save, Search } from 'lucide-react';
import { toast } from 'sonner';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const orderSchema = z.object({
    user_id: z.number().min(1, 'Select a user'),
    product_id: z.number().min(1, 'Select a product'),
    qty: z.number().min(1, 'Quantity must be at least 1'),
    start_date: z.string().min(1, 'Start date is required'),
    subscription_type: z.number().min(1),
    status: z.number(),
    order_status: z.number(),
    order_type: z.number().min(1),
    address_id: z.number().optional(),
    payment_mode: z.number().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

export default function CreateOrderPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedUserId = searchParams.get('user_id');

    const { data: users = [] } = useUsers();
    const { data: products = [] } = useProducts();
    const { data: drivers = [] } = useDrivers();

    const [userSearch, setUserSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [selectedDays, setSelectedDays] = useState<number[]>([]);
    const [driverId, setDriverId] = useState('');

    const createOrder = useCreateOrder();
    const assignOrder = useAssignOrder();
    const addTxn = useAddTransaction();

    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<OrderFormData>({
        resolver: zodResolver(orderSchema),
        defaultValues: {
            user_id: preselectedUserId ? Number(preselectedUserId) : 0,
            qty: 1,
            subscription_type: 1,
            status: 1,
            order_status: 1,
            order_type: 1,
        },
    });

    const selectedUserId = watch('user_id');
    const selectedProductId = watch('product_id');
    const qty = watch('qty');
    const subscriptionType = watch('subscription_type');
    const orderType = watch('order_type');

    const { data: addresses = [] } = useUserAddresses(selectedUserId || undefined);

    const selectedProduct = useMemo(
        () => products.find((p) => p.id === selectedProductId),
        [products, selectedProductId]
    );

    const orderAmount = selectedProduct
        ? Math.round((selectedProduct.price + selectedProduct.price * (selectedProduct.tax || 0) / 100) * qty * 100) / 100
        : 0;

    const filteredUsers = useMemo(
        () => userSearch.length >= 2
            ? users.filter((u) => u.name?.toLowerCase().includes(userSearch.toLowerCase()) || u.phone?.includes(userSearch))
            : [],
        [users, userSearch]
    );

    const filteredProducts = useMemo(
        () => productSearch.length >= 2
            ? products.filter((p) => p.title?.toLowerCase().includes(productSearch.toLowerCase()))
            : products.slice(0, 20),
        [products, productSearch]
    );

    const selectedUser = users.find((u) => u.id === selectedUserId);

    const onSubmit = async (data: OrderFormData) => {
        try {
            const orderData: Record<string, unknown> = {
                ...data,
                order_amount: orderAmount,
                selected_days_for_weekly: subscriptionType === 2 ? JSON.stringify(selectedDays) : undefined,
            };

            const result = await createOrder.mutateAsync(orderData);
            const orderId = (result as { data?: { id?: number } })?.data?.id;

            // Assign driver if selected
            if (driverId && orderId) {
                await assignOrder.mutateAsync({ user_id: Number(driverId), order_id: orderId });
            }

            // Create transaction for Pay Now orders
            if (data.order_type === 3 && orderId) {
                await addTxn.mutateAsync({
                    user_id: data.user_id,
                    amount: orderAmount,
                    payment_id: 'xxx-admin',
                    type: 2,
                    description: `Order #${orderId} - Admin Created`,
                    payment_mode: data.payment_mode || 1,
                });
            }

            toast.success('Order created successfully');
            router.push('/orders');
        } catch {
            toast.error('Failed to create order');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <ArrowLeft className="w-5 h-5 text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">Create Order</h1>
                    <p className="text-slate-400">Create a new order for a customer</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="glass rounded-xl p-6 space-y-6">
                {/* User Selection */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Customer <span className="text-red-400">*</span>
                    </label>
                    {selectedUser ? (
                        <div className="flex items-center justify-between p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl">
                            <div>
                                <p className="text-white font-medium">{selectedUser.name}</p>
                                <p className="text-xs text-slate-400">{selectedUser.phone} &middot; Wallet: ₹{selectedUser.wallet_amount}</p>
                            </div>
                            <button type="button" onClick={() => { setValue('user_id', 0); setUserSearch(''); }} className="text-sm text-red-400 hover:text-red-300">Change</button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                placeholder="Search by name or phone..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                className={`${inputClassName} pl-10`}
                            />
                            {filteredUsers.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                    {filteredUsers.slice(0, 10).map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => { setValue('user_id', u.id); setUserSearch(''); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-sm"
                                        >
                                            <p className="text-white">{u.name}</p>
                                            <p className="text-xs text-slate-400">{u.phone} &middot; ₹{u.wallet_amount}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {errors.user_id && <p className="mt-1 text-xs text-red-400">{errors.user_id.message}</p>}
                </div>

                {/* Product Selection */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        Product <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            placeholder="Search products..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            className={`${inputClassName} pl-10`}
                        />
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                        {filteredProducts.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setValue('product_id', p.id)}
                                className={`p-2 rounded-xl text-left text-sm transition-colors ${
                                    selectedProductId === p.id
                                        ? 'bg-purple-600/20 border border-purple-500/30 text-purple-300'
                                        : 'bg-slate-900/50 border border-slate-700/30 text-slate-300 hover:bg-slate-800/50'
                                }`}
                            >
                                <p className="font-medium truncate">{p.title}</p>
                                <p className="text-xs text-slate-400">₹{p.price} &middot; {p.qty_text || p.unit || ''} {p.subscription === 1 ? '📦' : ''}</p>
                            </button>
                        ))}
                    </div>
                    {errors.product_id && <p className="mt-1 text-xs text-red-400">{errors.product_id.message}</p>}
                </div>

                {/* Auto-filled product info */}
                {selectedProduct && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">MRP</label>
                            <input value={`₹${selectedProduct.mrp || selectedProduct.price}`} disabled className={`${inputClassName} !text-slate-500 !bg-slate-800/30`} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Price</label>
                            <input value={`₹${selectedProduct.price}`} disabled className={`${inputClassName} !text-slate-500 !bg-slate-800/30`} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Tax %</label>
                            <input value={`${selectedProduct.tax || 0}%`} disabled className={`${inputClassName} !text-slate-500 !bg-slate-800/30`} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Order Amount</label>
                            <input value={`₹${orderAmount}`} disabled className={`${inputClassName} !text-emerald-400 !bg-slate-800/30 font-semibold`} />
                        </div>
                    </div>
                )}

                {/* Order Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField label="Quantity" error={errors.qty} required>
                        <input {...register('qty', { valueAsNumber: true })} type="number" min={1} className={inputClassName} />
                    </FormField>
                    <FormField label="Start Date" error={errors.start_date} required>
                        <input {...register('start_date')} type="date" className={inputClassName} />
                    </FormField>
                    <FormField label="Subscription Type" error={errors.subscription_type} required>
                        <select {...register('subscription_type', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>One Time</option>
                            <option value={2}>Weekly</option>
                            <option value={3}>Daily</option>
                            <option value={4}>Alternative Days</option>
                        </select>
                    </FormField>
                </div>

                {/* Weekly Day Picker */}
                {subscriptionType === 2 && (
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Delivery Days</label>
                        <div className="flex gap-2">
                            {DAY_LABELS.map((day, i) => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => setSelectedDays((prev) =>
                                        prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i]
                                    )}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        selectedDays.includes(i)
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                                    }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField label="Order Type" error={errors.order_type} required>
                        <select {...register('order_type', { valueAsNumber: true })} className={selectClassName}>
                            <option value={1}>Prepaid</option>
                            <option value={2}>Postpaid</option>
                            <option value={3}>Pay Now</option>
                            <option value={4}>Pay Later</option>
                        </select>
                    </FormField>
                    {orderType === 3 && (
                        <FormField label="Payment Mode">
                            <select {...register('payment_mode', { valueAsNumber: true })} className={selectClassName}>
                                <option value={1}>Online</option>
                                <option value={2}>Cash</option>
                            </select>
                        </FormField>
                    )}
                    <FormField label="Status">
                        <select {...register('status', { valueAsNumber: true })} className={selectClassName}>
                            <option value={0}>Pending</option>
                            <option value={1}>Confirmed</option>
                        </select>
                    </FormField>
                </div>

                {/* Address */}
                {selectedUserId > 0 && addresses.length > 0 && (
                    <FormField label="Delivery Address">
                        <select {...register('address_id', { valueAsNumber: true })} className={selectClassName}>
                            <option value="">Select address</option>
                            {addresses.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {[a.flat_no, a.apartment_name, a.area, a.city].filter(Boolean).join(', ')}
                                </option>
                            ))}
                        </select>
                    </FormField>
                )}

                {/* Driver Assignment */}
                <FormField label="Delivery Partner">
                    <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={selectClassName}>
                        <option value="">Select delivery partner (optional)</option>
                        {[...drivers].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                            <option key={d.id} value={d.id}>{d.name} - {d.phone}</option>
                        ))}
                    </select>
                </FormField>

                {/* Order Summary */}
                {selectedProduct && (
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                        <h3 className="text-sm font-medium text-slate-300 mb-2">Order Summary</h3>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">{selectedProduct.title} x {qty}</span>
                            <span className="text-white font-semibold">₹{orderAmount}</span>
                        </div>
                    </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                    <button type="button" onClick={() => router.back()} className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-800">
                        Cancel
                    </button>
                    <button type="submit" disabled={createOrder.isPending} className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {createOrder.isPending ? 'Creating...' : 'Create Order'}
                    </button>
                </div>
            </form>
        </div>
    );
}
