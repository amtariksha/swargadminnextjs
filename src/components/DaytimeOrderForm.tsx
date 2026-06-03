'use client';

/**
 * DaytimeOrderForm — Feature 10. The create/edit form for a day-time order.
 * Shared by /day-orders/new and /day-orders/[id]. Money shown here is a
 * preview; the backend re-computes total_amount authoritatively from items.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    useDaytimeProducts,
    useUserAddresses,
    DaytimeProduct,
    DaytimeOrder,
    type Address,
} from '@/hooks/useData';
import { useVariants } from '@/hooks/useVariations';
import type { Variant } from '@/lib/types/variations';
import CustomerPicker, { CustomerValue } from '@/components/CustomerPicker';
import AddressMapPicker from '@/components/AddressMapPicker';
import { isMapsConfigured, type PickedPlace } from '@/lib/maps';
import FormField, { inputClassName, selectClassName, textareaClassName, dateInputClassName, timeInputClassName, numericInputClassName, shortSelectClassName } from '@/components/FormField';
import { POST, PUT, ApiError } from '@/lib/api';
import { MapPin, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

/** Compose a saved customer address into a single doorstep line. */
function composeAddress(a: Address): string {
    return [a.flat_no, a.apartment_name, a.area, a.landmark, a.city, a.pincode]
        .filter(Boolean)
        .join(', ');
}

interface ItemRow {
    product_id: number | '';
    variant_id: number | '';
    qty: string;
    unit_price: string;
    is_bulk_rate: boolean;
}

/** Human-readable variant option label, e.g. "Size: 500 g — ₹240". */
function variantLabel(v: Variant): string {
    const text = (v.attribute_pairs || [])
        .filter((p) => p.value)
        .map((p) => `${p.attribute_name}: ${p.value}`)
        .join(', ');
    const price = v.regular_price != null ? ` — ₹${v.regular_price}` : '';
    return (text || v.qty_text || v.slug) + price;
}

/** Local (browser-tz) today as YYYY-MM-DD — the default delivery date. */
const todayLocal = () => new Date().toLocaleDateString('en-CA');

/** A variable product's base qty_text is its placeholder size; the chosen
 *  variant carries the real size, so don't show the base size for those. */
const productLabel = (p: DaytimeProduct) =>
    `${p.title}${p.product_type !== 'variable' && p.qty_text ? ` (${p.qty_text})` : ''}`;

/**
 * Type-to-search product picker — replaces a long <select> so a sales exec can
 * filter by name when there are many products.
 */
function ProductPicker({ products, value, onSelect }: {
    products: DaytimeProduct[];
    value: number | '';
    onSelect: (productId: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const selected = products.find((p) => p.id === value);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products;
    }, [products, query]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    return (
        <div className="relative col-span-4" ref={ref}>
            <input
                type="text"
                value={open ? query : (selected ? productLabel(selected) : '')}
                placeholder="Search product…"
                onFocus={() => { setOpen(true); setQuery(''); }}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                className={selectClassName}
            />
            {open && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-700/50 bg-slate-900 shadow-xl">
                    {filtered.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500">No product matches</div>
                    )}
                    {filtered.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => { onSelect(p.id); setOpen(false); setQuery(''); }}
                            className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-slate-800"
                        >
                            {productLabel(p)}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

interface LineItemRowProps {
    item: ItemRow;
    idx: number;
    products: DaytimeProduct[];
    onProductChange: (idx: number, productId: number) => void;
    onChange: (idx: number, patch: Partial<ItemRow>) => void;
    onRemove: (idx: number) => void;
}

/**
 * One line of the order. Split into its own component so `useVariants` can be
 * called per row (hooks can't run inside a `.map`). The variant picker only
 * appears for a `product_type === 'variable'` product that actually has
 * active variants; picking one defaults the unit price to the variant price.
 */
function LineItemRow({ item, idx, products, onProductChange, onChange, onRemove }: LineItemRowProps) {
    const product = products.find((p) => p.id === item.product_id);
    const isVariable = product?.product_type === 'variable';
    const { data: allVariants = [] } = useVariants(
        isVariable && item.product_id !== '' ? Number(item.product_id) : null,
    );
    const variants = useMemo(
        () => allVariants.filter((v) => v.is_active && !v.archived_at),
        [allVariants],
    );

    const onVariantChange = (variantId: number | '') => {
        if (variantId === '') {
            onChange(idx, { variant_id: '' });
            return;
        }
        const variant = variants.find((v) => v.id === variantId);
        // Default the row price to the variant's price; fall back to the base
        // product price when a variant carries no explicit price. Always sets a
        // value so picking a variant visibly updates the unit price.
        const price = variant?.regular_price ?? product?.price;
        onChange(idx, {
            variant_id: variantId,
            ...(price != null ? { unit_price: String(price) } : {}),
        });
    };

    // Live line amount = qty × unit price — updates as the operator edits qty/price.
    const lineAmount = (Number(item.qty) || 0) * (Number(item.unit_price) || 0);

    return (
        <div className="space-y-2 border-b border-slate-800/30 pb-2 last:border-0">
            <div className="grid grid-cols-12 gap-2 items-center">
                <ProductPicker
                    products={products}
                    value={item.product_id}
                    onSelect={(pid) => onProductChange(idx, pid)}
                />
                <input type="number" min="1" step="1" value={item.qty}
                    onChange={(e) => onChange(idx, { qty: e.target.value })}
                    placeholder="Qty" className={`${inputClassName} col-span-2`} />
                <input type="number" min="0" step="0.01" value={item.unit_price}
                    onChange={(e) => onChange(idx, { unit_price: e.target.value })}
                    placeholder="Unit ₹" className={`${inputClassName} col-span-2`} />
                <div className="col-span-3 text-right text-sm font-medium text-white tabular-nums">
                    ₹{lineAmount.toFixed(2)}
                </div>
                <button type="button" onClick={() => onRemove(idx)}
                    className="col-span-1 p-2 hover:bg-red-500/20 rounded-lg justify-self-end">
                    <Trash2 className="w-4 h-4 text-red-400" />
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {isVariable && variants.length > 0 && (
                    <select
                        value={item.variant_id}
                        onChange={(e) => onVariantChange(e.target.value === '' ? '' : Number(e.target.value))}
                        className={`${selectClassName} flex-1 min-w-[12rem]`}
                    >
                        <option value="">Variation — base product</option>
                        {variants.map((v) => (
                            <option key={v.id} value={v.id}>{variantLabel(v)}</option>
                        ))}
                    </select>
                )}
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" checked={item.is_bulk_rate}
                        onChange={(e) => onChange(idx, { is_bulk_rate: e.target.checked })} />
                    Bulk rate
                </label>
            </div>
        </div>
    );
}

interface DaytimeOrderFormProps {
    orderId?: number;
    initial?: DaytimeOrder;
    onSaved: (orderId: number) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Where the order came in from. A curated subset of the LMS LeadSource enum
 * (src/lib/lms/leads/types.ts), trimmed to the channels day-orders actually
 * arrive through. Stored as a VARCHAR — values must match LeadSource so the
 * two modules stay reconcilable.
 */
const DAY_ORDER_ENTRY_TYPES: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'phone', label: 'Phone call' },
    { value: 'stall', label: 'Stall (walk-in)' },
    { value: 'website_form', label: 'Website form' },
    { value: 'app_install', label: 'App' },
    { value: 'referral', label: 'Referral' },
    { value: 'social', label: 'Social media' },
    { value: 'other', label: 'Other' },
];

export default function DaytimeOrderForm({ orderId, initial, onSaved }: DaytimeOrderFormProps) {
    const { data: products = [] } = useDaytimeProducts();
    const isEdit = orderId != null;

    const [customer, setCustomer] = useState<CustomerValue | null>(
        initial
            ? { userId: initial.user_id, name: initial.customer_name, phone: initial.customer_phone, isNew: false }
            : null,
    );
    const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date || todayLocal());
    const [desiredTime, setDesiredTime] = useState(initial?.desired_delivery_time || '');
    const [priority, setPriority] = useState<number>(initial?.priority ?? 0);
    const [deliveryAddress, setDeliveryAddress] = useState(initial?.delivery_address || '');
    const [deliveryLat, setDeliveryLat] = useState(
        initial?.delivery_lat != null ? String(initial.delivery_lat) : '',
    );
    const [deliveryLng, setDeliveryLng] = useState(
        initial?.delivery_lng != null ? String(initial.delivery_lng) : '',
    );
    const [showMap, setShowMap] = useState(false);
    const [savedAddrId, setSavedAddrId] = useState<number | ''>('');
    const [entryType, setEntryType] = useState(initial?.entry_type || '');
    const [discountFlat, setDiscountFlat] = useState(String(initial?.discount_flat ?? ''));
    const [discountReason, setDiscountReason] = useState(initial?.discount_reason || '');
    const [shipping, setShipping] = useState(String(initial?.shipping_charges ?? ''));
    const [instructions, setInstructions] = useState(initial?.additional_instructions || '');
    const [items, setItems] = useState<ItemRow[]>(
        initial?.items?.length
            ? initial.items.map((it) => ({
                  product_id: it.product_id,
                  variant_id: it.variant_id ?? '',
                  qty: String(it.qty),
                  unit_price: String(it.unit_price),
                  is_bulk_rate: it.is_bulk_rate,
              }))
            : [{ product_id: '', variant_id: '', qty: '1', unit_price: '', is_bulk_rate: false }],
    );
    const [saving, setSaving] = useState(false);

    // Saved addresses for the picked customer (disabled for a brand-new customer).
    const savedUserId = customer && !customer.isNew ? customer.userId ?? undefined : undefined;
    const { data: savedAddresses = [] } = useUserAddresses(savedUserId);
    const activeSavedAddresses = useMemo(
        () => savedAddresses.filter((a) => !a.is_deleted),
        [savedAddresses],
    );

    const onSelectSavedAddress = (id: number | '') => {
        setSavedAddrId(id);
        if (id === '') return;
        const a = activeSavedAddresses.find((x) => x.id === id);
        if (!a) return;
        setDeliveryAddress(composeAddress(a));
        setDeliveryLat(a.lat || '');
        setDeliveryLng(a.lng || '');
    };

    const onPickFromMap = (p: PickedPlace) => {
        if (p.formatted) setDeliveryAddress(p.formatted);
        setDeliveryLat(String(p.lat));
        setDeliveryLng(String(p.lng));
        setSavedAddrId(''); // a map pick is no longer "a saved address"
    };

    const subtotal = useMemo(
        () => round2(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0)),
        [items],
    );
    const total = Math.max(0, round2(subtotal - (Number(discountFlat) || 0) + (Number(shipping) || 0)));

    const updateItem = (idx: number, patch: Partial<ItemRow>) => {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    };
    const onProductChange = (idx: number, productId: number) => {
        const product = products.find((p) => p.id === productId);
        updateItem(idx, {
            product_id: productId,
            // Switching the product invalidates any previously-picked variant.
            variant_id: '',
            // Default the unit price to the catalogue price on first pick.
            unit_price: items[idx].unit_price || (product ? String(product.price) : ''),
        });
    };
    const addItem = () =>
        setItems((prev) => [...prev, { product_id: '', variant_id: '', qty: '1', unit_price: '', is_bulk_rate: false }]);
    const removeItem = (idx: number) =>
        setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customer) { toast.error('Select a customer'); return; }
        if (!deliveryDate) { toast.error('Delivery date is required'); return; }
        const cleanItems = items
            .filter((it) => it.product_id !== '' && Number(it.qty) > 0)
            .map((it) => ({
                product_id: Number(it.product_id),
                variant_id: it.variant_id === '' ? undefined : Number(it.variant_id),
                // Day-order quantities are whole units.
                qty: Math.max(1, Math.round(Number(it.qty) || 1)),
                unit_price: it.unit_price === '' ? undefined : Number(it.unit_price),
                is_bulk_rate: it.is_bulk_rate,
            }));
        if (cleanItems.length === 0) { toast.error('Add at least one line item'); return; }

        const payload: Record<string, unknown> = {
            delivery_address: deliveryAddress || null,
            delivery_lat: deliveryLat === '' ? null : Number(deliveryLat),
            delivery_lng: deliveryLng === '' ? null : Number(deliveryLng),
            delivery_date: deliveryDate,
            desired_delivery_time: desiredTime || null,
            priority,
            entry_type: entryType || null,
            discount_flat: Number(discountFlat) || 0,
            discount_reason: discountReason || null,
            shipping_charges: Number(shipping) || 0,
            additional_instructions: instructions || null,
            items: cleanItems,
        };
        if (customer.isNew) {
            payload.customer = { name: customer.name, phone: customer.phone };
        } else {
            payload.user_id = customer.userId;
        }

        setSaving(true);
        try {
            if (isEdit) {
                await PUT(`/daytime/orders/${orderId}`, payload);
                toast.success('Day-time order updated');
                onSaved(orderId);
            } else {
                const res = await POST<unknown>('/daytime/orders', payload);
                const newId = (res as { id?: number }).id;
                toast.success('Day-time order created');
                if (newId) onSaved(newId);
            }
        } catch (error) {
            const msg = error instanceof ApiError ? error.userMessage
                : error instanceof Error ? error.message : 'Could not save order';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Customer" required>
                    <CustomerPicker value={customer} onChange={setCustomer} />
                </FormField>
                <FormField label="Delivery Date" required>
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                        className={dateInputClassName} />
                </FormField>
                <FormField label="Entry Type">
                    <select value={entryType} onChange={(e) => setEntryType(e.target.value)}
                        className={shortSelectClassName}>
                        <option value="">Select source</option>
                        {DAY_ORDER_ENTRY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                        {/* Preserve a legacy free-text value so editing never silently drops it. */}
                        {entryType && !DAY_ORDER_ENTRY_TYPES.some((t) => t.value === entryType) && (
                            <option value={entryType}>{entryType}</option>
                        )}
                    </select>
                </FormField>
                <FormField label="Desired Delivery Time">
                    <input type="time" value={desiredTime} onChange={(e) => setDesiredTime(e.target.value)}
                        className={timeInputClassName} />
                </FormField>
                <FormField label="Priority">
                    <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}
                        className={shortSelectClassName}>
                        <option value={0}>Normal</option>
                        <option value={1}>High (red-flash for drivers)</option>
                    </select>
                </FormField>
            </div>

            {/* Delivery address — saved-address dropdown, optional map picker, manual fallback */}
            <div className="space-y-3 border-t border-slate-800/50 pt-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Delivery Address</h3>
                    {isMapsConfigured() && (
                        <button type="button" onClick={() => setShowMap((s) => !s)}
                            className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
                            <MapPin className="w-4 h-4" /> {showMap ? 'Hide map' : 'Pick on map'}
                        </button>
                    )}
                </div>

                {activeSavedAddresses.length > 0 && (
                    <select
                        value={savedAddrId}
                        onChange={(e) => onSelectSavedAddress(e.target.value === '' ? '' : Number(e.target.value))}
                        className={selectClassName}
                    >
                        <option value="">Use a saved address…</option>
                        {activeSavedAddresses.map((a) => (
                            <option key={a.id} value={a.id}>{composeAddress(a)}</option>
                        ))}
                    </select>
                )}

                {showMap && (
                    <AddressMapPicker
                        lat={deliveryLat ? Number(deliveryLat) : null}
                        lng={deliveryLng ? Number(deliveryLng) : null}
                        onPick={onPickFromMap}
                    />
                )}

                <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                    className={inputClassName} placeholder="Doorstep address" />

                <div className="grid grid-cols-2 gap-2">
                    <input value={deliveryLat} inputMode="decimal"
                        onChange={(e) => setDeliveryLat(e.target.value)}
                        className={inputClassName} placeholder="Latitude" />
                    <input value={deliveryLng} inputMode="decimal"
                        onChange={(e) => setDeliveryLng(e.target.value)}
                        className={inputClassName} placeholder="Longitude" />
                </div>
            </div>

            {/* Line items */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Line Items</h3>
                    <button type="button" onClick={addItem}
                        className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
                        <Plus className="w-4 h-4" /> Add item
                    </button>
                </div>
                {items.map((it, idx) => (
                    <LineItemRow
                        key={idx}
                        item={it}
                        idx={idx}
                        products={products}
                        onProductChange={onProductChange}
                        onChange={updateItem}
                        onRemove={removeItem}
                    />
                ))}
            </div>

            {/* Discount + shipping */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Discount (₹)">
                    <input type="number" min="0" step="0.01" value={discountFlat}
                        onChange={(e) => setDiscountFlat(e.target.value)} className={numericInputClassName} placeholder="0" />
                </FormField>
                <FormField label="Discount Reason">
                    <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)}
                        className={inputClassName} placeholder="Optional" />
                </FormField>
                <FormField label="Shipping (₹)">
                    <input type="number" min="0" step="0.01" value={shipping}
                        onChange={(e) => setShipping(e.target.value)} className={numericInputClassName} placeholder="0" />
                </FormField>
            </div>

            <FormField label="Additional Instructions">
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2}
                    className={textareaClassName} placeholder="Anything the driver should know" />
            </FormField>

            {/* Totals preview */}
            <div className="flex flex-col items-end gap-1 text-sm border-t border-slate-800/50 pt-4">
                <div className="text-slate-400">Subtotal: <span className="text-white">₹{subtotal.toFixed(2)}</span></div>
                <div className="text-slate-400">
                    − Discount ₹{(Number(discountFlat) || 0).toFixed(2)} · + Shipping ₹{(Number(shipping) || 0).toFixed(2)}
                </div>
                <div className="text-lg font-bold text-white">Total: ₹{total.toFixed(2)}</div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <button type="submit" disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm text-white bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Order'}
                </button>
            </div>
        </form>
    );
}
