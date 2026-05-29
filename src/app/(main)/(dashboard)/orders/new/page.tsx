'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUsers, useProducts, useUserAddresses, useAddTransaction, useDrivers } from '@/hooks/useData';
import { useCreateOrder, useAssignOrder } from '@/hooks/useOrders';
import { useVariants } from '@/hooks/useVariations';
import type { Variant } from '@/lib/types/variations';
import FormField, { inputClassName, selectClassName } from '@/components/FormField';
import { ArrowLeft, Save, Search } from 'lucide-react';
import { toast } from 'sonner';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Tomorrow's date as YYYY-MM-DD for min date validation
const getTomorrowDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
};

const orderSchema = z.object({
    user_id: z.number().min(1, 'Select a user'),
    product_id: z.number().min(1, 'Select a product'),
    // Variations (migration 030): variant_id is optional. Required when
    // the picked product is product_type='variable'; the form-level
    // validation enforces that via refine() below.
    variant_id: z.number().optional(),
    qty: z.number().min(1, 'Quantity must be at least 1'),
    start_date: z.string().min(1, 'Start date is required'),
    subscription_type: z.number().min(1),
    status: z.number(),
    order_status: z.number(),
    order_type: z.number().min(1),
    address_id: z.number().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

export default function CreateOrderPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const preselectedUserId = searchParams.get('user_id');

    const { data: users = [] } = useUsers();
    const { data: products = [] } = useProducts();
    const { data: drivers = [] } = useDrivers();
    const assignOrder = useAssignOrder();
    // Driver chosen for this order. Optional — the operator can still
    // save without assigning and pick a partner later from the edit page.
    const [driverId, setDriverId] = useState<number | ''>('');

    const [userSearch, setUserSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    // Weekly per-day quantities, keyed by dayCode (0=Sun..6=Sat — JS
    // Date.getDay() convention, matches the delivery cron). A day is
    // "selected" iff its dayCode is a key here. Replicates the old admin
    // panel's per-day quantity steppers (swarg-admin-node/NewOrder.jsx).
    const [weeklyQty, setWeeklyQty] = useState<Record<number, number>>({});

    const createOrder = useCreateOrder();
    const addTxn = useAddTransaction();

    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<OrderFormData>({
        resolver: zodResolver(orderSchema),
        defaultValues: {
            user_id: preselectedUserId ? Number(preselectedUserId) : 0,
            qty: 1,
            subscription_type: 1,
            status: 1,
            order_status: 0,
            order_type: 1,
            start_date: getTomorrowDate(),
        },
    });

    const selectedUserId = watch('user_id');
    const selectedProductId = watch('product_id');
    const selectedVariantId = watch('variant_id');
    const qty = watch('qty');
    const subscriptionType = watch('subscription_type');

    const { data: addresses = [] } = useUserAddresses(selectedUserId || undefined);

    const selectedProduct = useMemo(() => {
        return products.find((p) => p.id === selectedProductId) || null;
    }, [products, selectedProductId]);

    // Variations (migration 030): when the selected product is variable,
    // fetch its variants so the operator can pick one. The hook is gated
    // by productId so simple-product flows skip the network call.
    const isVariableProduct = selectedProduct?.product_type === 'variable';
    const { data: variants = [] } = useVariants(
        isVariableProduct ? selectedProductId : null,
    );
    const activeVariants = useMemo<Variant[]>(
        () => variants.filter((v) => v.is_active === 1 && !v.archived_at),
        [variants],
    );
    const selectedVariant = useMemo<Variant | null>(
        () => activeVariants.find((v) => v.id === selectedVariantId) || null,
        [activeVariants, selectedVariantId],
    );

    // Human label for a variant — "Size: 500g, Pack: Gift Box". Falls
    // back to slug when attribute_pairs aren't enriched.
    const labelForVariant = (v: Variant): string => {
        if (!v.attribute_pairs || v.attribute_pairs.length === 0) return v.slug;
        return v.attribute_pairs
            .map((p) => `${p.attribute_name ?? ''}: ${p.value ?? ''}`)
            .filter((s) => s.trim() !== ':')
            .join(', ');
    };

    const isSubscriptionProduct = selectedProduct?.subscription === 1;
    const isSubscriptionOrder = isSubscriptionProduct && subscriptionType !== 1;

    // When product changes, enforce rules matching React admin
    useEffect(() => {
        if (!selectedProduct) return;
        if (isSubscriptionProduct) {
            // Subscription product: default to Daily, lock order_type to Prepaid
            setValue('order_type', 1);
            if (subscriptionType === 1) {
                setValue('subscription_type', 3); // Default to Daily
            }
        } else {
            // Non-subscription product: lock to One Time + Pay Now
            setValue('subscription_type', 1);
            setValue('order_type', 3);
        }
        // Variations: clear any stale variant pick when the product
        // changes — the previous product's variants are no longer valid.
        setValue('variant_id', undefined);
    }, [selectedProduct?.id]);

    // Variations: when variants land, auto-pick the default (or first
    // in-stock) variant so the operator sees coherent pricing without an
    // extra click. Skips when the operator has already picked.
    useEffect(() => {
        if (!isVariableProduct || activeVariants.length === 0) return;
        if (selectedVariantId) return;
        const def = activeVariants.find((v) => v.is_default === 1);
        const inStock = activeVariants.find((v) => v.stock_status === 'in_stock');
        const chosen = def ?? inStock ?? activeVariants[0];
        if (chosen) setValue('variant_id', chosen.id);
    }, [isVariableProduct, activeVariants, selectedVariantId]);

    // Variations: when a variant is picked, its price overrides the
    // parent product price. Tax stays at the parent's value (the variant
    // schema has no per-variant tax in MVP) so the formula still applies.
    const variantSalePriceLive =
        selectedVariant?.sale_price &&
        selectedVariant.sale_starts_at &&
        selectedVariant.sale_ends_at
            ? new Date() >= new Date(selectedVariant.sale_starts_at) &&
              new Date() <= new Date(selectedVariant.sale_ends_at)
            : false;
    const variantUnitPrice =
        selectedVariant
            ? (variantSalePriceLive
                ? selectedVariant.sale_price
                : selectedVariant.regular_price) ?? selectedProduct?.price ?? 0
            : null;
    const effectivePrice = variantUnitPrice ?? selectedProduct?.price ?? 0;
    const effectiveMrp = selectedVariant?.regular_price ?? selectedProduct?.mrp ?? effectivePrice;
    const effectiveTax = selectedProduct?.tax || 0;

    // Per-unit price incl. tax.
    const unitAmount = selectedProduct
        ? Math.round((effectivePrice + effectivePrice * effectiveTax / 100) * 100) / 100
        : 0;
    // Weekly subscriptions (subscription_type=2) store order_amount as the
    // PER-UNIT price — the per-day quantity lives inside
    // selected_days_for_weekly and the delivery generator multiplies
    // (required = order_amount × per_day_qty). For every other order type,
    // order_amount is the full per-delivery total (unit × qty).
    const orderAmount = subscriptionType === 2 ? unitAmount : unitAmount * qty;

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
            // Weekly orders must have at least one delivery day picked.
            if (data.subscription_type === 2 && Object.keys(weeklyQty).length === 0) {
                toast.error('Select at least one delivery day for a weekly order.');
                return;
            }

            // For Pay Now (type 3): check wallet balance first
            if (data.order_type === 3) {
                const user = users.find((u) => u.id === data.user_id);
                if (!user || (user.wallet_amount || 0) < orderAmount) {
                    toast.error('The user does not have sufficient wallet balance.');
                    return;
                }
            }

            // For Pay Now: deduct wallet BEFORE creating order (matches React admin)
            let transactionId: number | null = null;
            if (data.order_type === 3) {
                const txnResult = await addTxn.mutateAsync({
                    user_id: data.user_id,
                    amount: orderAmount,
                    payment_id: 'xxx-admin',
                    type: 2,
                    description: `Amount debited for ${data.qty} qty of ${selectedProduct?.title || 'product'}${
                        selectedVariant ? ` — ${labelForVariant(selectedVariant)}` : ''
                    }`,
                    payment_mode: 1,
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                transactionId = (txnResult as any)?.id || (txnResult as any)?.data?.id || null;
            }

            // Weekly subscriptions follow a specific storage contract shared
            // with the customer app + Laravel (225 of 227 existing weekly
            // orders use it; the delivery generator + delivery-mark depend
            // on it):
            //   - selected_days_for_weekly: canonical [{dayCode, qty}] — the
            //     operator-entered quantity becomes the per-day qty.
            //   - orders.qty: always 1 (the real quantity is per-day in the
            //     JSON; delivery-mark computes unitPrice = order_amount/qty,
            //     which only works when qty = 1 and order_amount = per-unit).
            // Writing a flat-int array [0,1,3,4,5] (the prior bug) made the
            // generator default the per-day qty to 1 — orders 27286 + 27482
            // were created this way and under-delivered.
            const isWeekly = subscriptionType === 2;
            // Canonical weekly schedule: [{dayCode, qty}] with the operator's
            // per-day quantity from the steppers. dayCode order doesn't
            // matter to the generator; sort ascending for tidy storage.
            const weeklyEntries = Object.entries(weeklyQty)
                .map(([dc, q]) => ({ dayCode: Number(dc), qty: q }))
                .sort((a, b) => a.dayCode - b.dayCode);
            // Variations (migration 030): for a variable product the
            // operator MUST pick a variant. The backend would otherwise
            // auto-resolve to the default variant, which is rarely what
            // the operator intends on a hand-entered order.
            if (isVariableProduct && !selectedVariantId) {
                toast.error('Select a variant for this variable product.');
                return;
            }

            const orderData: Record<string, unknown> = {
                ...data,
                qty: isWeekly ? 1 : data.qty,
                order_amount: orderAmount,
                // Variant price wins when a variant was picked; falls back
                // to parent product price for simple products.
                price: effectivePrice,
                mrp: effectiveMrp,
                tax: effectiveTax,
                variant_id: selectedVariantId || undefined,
                payment_mode: 1,
                selected_days_for_weekly: isWeekly
                    ? JSON.stringify(weeklyEntries)
                    : undefined,
                trasation_id: transactionId,
            };

            const created = await createOrder.mutateAsync(orderData);
            const newOrderId =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (created as any)?.id ?? (created as any)?.data?.id ?? null;

            // If the operator picked a delivery partner on this screen,
            // chain the /add_order_assign call now that the order id
            // exists. Previously the create form punted the operator to
            // the edit page for this — saving a click per order.
            if (driverId && newOrderId) {
                try {
                    await assignOrder.mutateAsync({
                        user_id: Number(driverId),
                        order_id: Number(newOrderId),
                    });
                } catch (assignErr) {
                    // Order is already created — don't roll back. Tell the
                    // operator the assignment fell over so they can retry
                    // from the edit page.
                    const msg = assignErr instanceof Error ? assignErr.message : 'Failed to assign driver';
                    toast.error(`Order created but driver assignment failed: ${msg}`);
                    router.push(`/orders/${newOrderId}`);
                    return;
                }
            }

            toast.success(
                driverId
                    ? 'Order created and driver assigned'
                    : 'Order created successfully',
            );
            router.push('/orders');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create order');
        }
    };

    // Surface zod validation failures — without this, an invalid field
    // (e.g. missing user, missing product) silently swallowed the submit
    // because handleSubmit only fires onSubmit when the schema is clean.
    const onInvalid = (errs: Record<string, unknown>) => {
        const first = Object.values(errs)[0] as { message?: string } | undefined;
        toast.error(first?.message || 'Please check the highlighted fields and try again.');
    };

    const disabledFieldClass = `${inputClassName} !text-slate-500 !bg-slate-800/30 cursor-not-allowed`;

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

            <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="glass rounded-xl p-6 space-y-6">
                {/* User + Product Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* User Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            User <span className="text-red-400">*</span>
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
                                            <button key={u.id} type="button"
                                                onClick={() => { setValue('user_id', u.id); setUserSearch(''); }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-slate-800 text-sm">
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
                        <div className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                            {filteredProducts.map((p) => (
                                <button key={p.id} type="button"
                                    onClick={() => setValue('product_id', p.id)}
                                    className={`p-2 rounded-xl text-left text-sm transition-colors ${
                                        selectedProductId === p.id
                                            ? 'bg-purple-600/20 border border-purple-500/30 text-purple-300'
                                            : 'bg-slate-900/50 border border-slate-700/30 text-slate-300 hover:bg-slate-800/50'
                                    }`}>
                                    <p className="font-medium truncate">{p.title}</p>
                                    <p className="text-xs text-slate-400">₹{p.price} {p.subscription === 1 ? '(Subscription)' : ''}</p>
                                </button>
                            ))}
                        </div>
                        {errors.product_id && <p className="mt-1 text-xs text-red-400">{errors.product_id.message}</p>}
                    </div>
                </div>

                {/* Variations (migration 030): variant picker for variable
                    products. Single-row chip strip — each chip shows the
                    variant's label (e.g. "Size: 500g") + effective unit
                    price + stock status. Default variant is auto-picked
                    above; the operator can override. Hidden entirely for
                    simple products so the legacy UX is unchanged. */}
                {selectedProduct && isVariableProduct && (
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Variant <span className="text-red-400">*</span>
                        </label>
                        {activeVariants.length === 0 ? (
                            <p className="text-sm text-amber-400">
                                This product is marked variable but has no active variants. Add variants on the product editor first.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {activeVariants.map((v) => {
                                    const label = labelForVariant(v);
                                    const price = v.sale_price ?? v.regular_price ?? selectedProduct.price;
                                    const oos = v.stock_status === 'out_of_stock';
                                    const lowStock =
                                        v.manage_stock === 1 &&
                                        typeof v.stock_quantity === 'number' &&
                                        v.stock_quantity > 0 && v.stock_quantity < 5;
                                    const isSelected = selectedVariantId === v.id;
                                    return (
                                        <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => setValue('variant_id', v.id)}
                                            className={`p-2.5 rounded-xl text-left text-sm transition-colors border ${
                                                isSelected
                                                    ? 'bg-purple-600/20 border-purple-500/50 text-purple-200'
                                                    : oos
                                                    ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                                                    : 'bg-slate-900/50 border-slate-700/30 text-slate-300 hover:bg-slate-800/50'
                                            }`}
                                            title={oos ? 'Out of stock' : undefined}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium truncate">{label || v.slug}</span>
                                                {v.is_default === 1 && (
                                                    <span className="text-[10px] uppercase tracking-wide bg-purple-500/20 text-purple-200 px-1.5 py-0.5 rounded">Default</span>
                                                )}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                                                <span>₹{price}</span>
                                                {v.sku && <span className="truncate">SKU: {v.sku}</span>}
                                                {oos ? (
                                                    <span className="text-red-400">Out of stock</span>
                                                ) : v.manage_stock === 1 && typeof v.stock_quantity === 'number' ? (
                                                    <span className={lowStock ? 'text-amber-400' : 'text-emerald-400'}>
                                                        {v.stock_quantity} left
                                                    </span>
                                                ) : null}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Auto-filled product info — all disabled. For variable
                    products these now reflect the picked variant's price
                    / mrp; tax is parent-level (no per-variant tax in MVP). */}
                {selectedProduct && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <FormField label="MRP" required>
                            <input value={effectiveMrp} disabled className={disabledFieldClass} />
                        </FormField>
                        <FormField label="Price" required>
                            <input value={effectivePrice} disabled className={disabledFieldClass} />
                        </FormField>
                        <FormField label="Tax" required>
                            <input value={effectiveTax} disabled className={disabledFieldClass} />
                        </FormField>
                    </div>
                )}

                {/* Order Amount, Quantity, Start Date */}
                {selectedProduct && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Order Amount" required>
                            <input value={orderAmount.toFixed(2)} disabled className={disabledFieldClass} />
                        </FormField>
                        <FormField label="Quantity" error={errors.qty} required>
                            <input {...register('qty', { valueAsNumber: true })} type="number" min={1} className={inputClassName} />
                        </FormField>
                        <FormField label="Start From" error={errors.start_date} required>
                            <input {...register('start_date')} type="date" min={getTomorrowDate()}
                                className={`${inputClassName} cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
                                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()} />
                        </FormField>
                    </div>
                )}

                {/* Subscription Type + Address */}
                {selectedProduct && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Subscription Type" error={errors.subscription_type} required>
                            <select {...register('subscription_type', { valueAsNumber: true })} className={selectClassName}
                                disabled={!isSubscriptionProduct}>
                                <option value={1}>One Time Order</option>
                                {isSubscriptionProduct && (
                                    <>
                                        <option value={2}>Weekly</option>
                                        <option value={3}>Daily</option>
                                        <option value={4}>Alternative Days</option>
                                    </>
                                )}
                            </select>
                        </FormField>
                        {selectedUserId > 0 && addresses.length > 0 && (
                            <FormField label="Address">
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
                    </div>
                )}

                {/* Weekly Day Picker + per-day quantity (replicates the old
                    admin panel's "Set Per Day Quantity" steppers). Toggle a
                    day on/off; each selected day carries its own quantity. */}
                {subscriptionType === 2 && (
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Delivery Days</label>
                        <div className="flex gap-2 flex-wrap">
                            {DAY_LABELS.map((day, i) => {
                                const isSelected = i in weeklyQty;
                                return (
                                    <button key={day} type="button"
                                        onClick={() => setWeeklyQty((prev) => {
                                            const next = { ...prev };
                                            if (i in next) {
                                                delete next[i];           // toggle off
                                            } else {
                                                next[i] = 1;              // toggle on — default qty 1
                                            }
                                            return next;
                                        })}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            isSelected
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                                        }`}>
                                        {day}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Per-day quantity steppers for each selected day */}
                        {Object.keys(weeklyQty).length > 0 && (
                            <div className="mt-4 space-y-2">
                                <p className="text-xs text-slate-500">Quantity per delivery day</p>
                                {DAY_LABELS.map((day, i) => {
                                    if (!(i in weeklyQty)) return null;
                                    const q = weeklyQty[i];
                                    return (
                                        <div key={day} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2">
                                            <span className="text-sm font-medium text-slate-300">{day}</span>
                                            <div className="flex items-center gap-3">
                                                <button type="button"
                                                    aria-label={`Decrease ${day} quantity`}
                                                    onClick={() => setWeeklyQty((prev) => ({
                                                        ...prev, [i]: Math.max(1, (prev[i] || 1) - 1),
                                                    }))}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700">
                                                    −
                                                </button>
                                                <span className="w-8 text-center text-sm font-semibold text-white">{q}</span>
                                                <button type="button"
                                                    aria-label={`Increase ${day} quantity`}
                                                    onClick={() => setWeeklyQty((prev) => ({
                                                        ...prev, [i]: (prev[i] || 1) + 1,
                                                    }))}
                                                    className="w-7 h-7 flex items-center justify-center rounded-md border border-emerald-600 text-emerald-400 hover:bg-slate-700">
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Status + Order Status + Order Type row */}
                {selectedProduct && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormField label="Status">
                            <select {...register('status', { valueAsNumber: true })} className={selectClassName}>
                                <option value={1}>Confirmed</option>
                                <option value={0}>Pending</option>
                            </select>
                        </FormField>

                        {/* Subscription orders: show Order Status toggle + locked Prepaid */}
                        {isSubscriptionOrder && (
                            <>
                                <FormField label="Order Status">
                                    <select {...register('order_status', { valueAsNumber: true })} className={selectClassName}>
                                        <option value={0}>Active</option>
                                        <option value={1}>Stop</option>
                                    </select>
                                </FormField>
                                <FormField label="Order Type">
                                    <input value="Prepaid" disabled className={disabledFieldClass} />
                                </FormField>
                            </>
                        )}

                        {/* Non-subscription / One Time: show locked Pay Now */}
                        {!isSubscriptionOrder && (
                            <FormField label="Order Type">
                                <input value="Pay Now" disabled className={disabledFieldClass} />
                            </FormField>
                        )}
                    </div>
                )}

                {/* Delivery Partner — optional. When set, /add_order_assign
                    fires immediately after /add_order succeeds. Operator
                    can leave blank and assign later from the edit page. */}
                <FormField label="Delivery Partner">
                    <select
                        value={driverId}
                        onChange={(e) => setDriverId(e.target.value === '' ? '' : Number(e.target.value))}
                        className={selectClassName}
                    >
                        <option value="">— Assign later —</option>
                        {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name}{d.phone ? ` · ${d.phone}` : ''}{d.role_label ? ` · ${d.role_label}` : ''}
                            </option>
                        ))}
                    </select>
                </FormField>

                {/* Order Summary */}
                {selectedProduct && (
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                        <h3 className="text-sm font-medium text-slate-300 mb-2">Order Summary</h3>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-400">{selectedProduct.title} x {qty}</span>
                            <span className="text-white font-semibold">₹{orderAmount.toFixed(2)}</span>
                        </div>
                        {!isSubscriptionOrder && selectedUser && (
                            <div className={`mt-2 p-2 rounded-lg text-xs ${
                                (selectedUser.wallet_amount || 0) >= orderAmount
                                    ? 'bg-emerald-900/30 border border-emerald-700/30 text-emerald-400'
                                    : 'bg-red-900/30 border border-red-700/30 text-red-400'
                            }`}>
                                Wallet: ₹{selectedUser.wallet_amount || 0}
                                {(selectedUser.wallet_amount || 0) < orderAmount
                                    ? ' — Insufficient balance! Need ₹' + (orderAmount - (selectedUser.wallet_amount || 0)).toFixed(2) + ' more'
                                    : ' — Sufficient for deduction'}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                    <button type="button" onClick={() => router.back()} className="px-6 py-2.5 text-sm text-slate-300 bg-slate-800/50 rounded-xl hover:bg-slate-800">
                        Cancel
                    </button>
                    <button type="submit" disabled={createOrder.isPending} className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {createOrder.isPending ? 'Creating...' : 'Add New Order'}
                    </button>
                </div>
            </form>
        </div>
    );
}
