'use client';

/**
 * DaytimeOrderForm — Feature 10. The create/edit form for a day-time order.
 * Shared by /day-orders/new and /day-orders/[id]. Money shown here is a
 * preview; the backend re-computes total_amount authoritatively from items.
 */
import { useMemo, useState } from 'react';
import { useDaytimeProducts, DaytimeOrder } from '@/hooks/useData';
import CustomerPicker, { CustomerValue } from '@/components/CustomerPicker';
import FormField, { inputClassName, selectClassName, textareaClassName } from '@/components/FormField';
import { POST, PUT, ApiError } from '@/lib/api';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface ItemRow {
    product_id: number | '';
    qty: string;
    unit_price: string;
    is_bulk_rate: boolean;
}

interface DaytimeOrderFormProps {
    orderId?: number;
    initial?: DaytimeOrder;
    onSaved: (orderId: number) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function DaytimeOrderForm({ orderId, initial, onSaved }: DaytimeOrderFormProps) {
    const { data: products = [] } = useDaytimeProducts();
    const isEdit = orderId != null;

    const [customer, setCustomer] = useState<CustomerValue | null>(
        initial
            ? { userId: initial.user_id, name: initial.customer_name, phone: initial.customer_phone, isNew: false }
            : null,
    );
    const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date || '');
    const [deliveryAddress, setDeliveryAddress] = useState(initial?.delivery_address || '');
    const [entryType, setEntryType] = useState(initial?.entry_type || '');
    const [discountFlat, setDiscountFlat] = useState(String(initial?.discount_flat ?? ''));
    const [discountReason, setDiscountReason] = useState(initial?.discount_reason || '');
    const [shipping, setShipping] = useState(String(initial?.shipping_charges ?? ''));
    const [instructions, setInstructions] = useState(initial?.additional_instructions || '');
    const [items, setItems] = useState<ItemRow[]>(
        initial?.items?.length
            ? initial.items.map((it) => ({
                  product_id: it.product_id,
                  qty: String(it.qty),
                  unit_price: String(it.unit_price),
                  is_bulk_rate: it.is_bulk_rate,
              }))
            : [{ product_id: '', qty: '1', unit_price: '', is_bulk_rate: false }],
    );
    const [saving, setSaving] = useState(false);

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
            // Default the unit price to the catalogue price on first pick.
            unit_price: items[idx].unit_price || (product ? String(product.price) : ''),
        });
    };
    const addItem = () =>
        setItems((prev) => [...prev, { product_id: '', qty: '1', unit_price: '', is_bulk_rate: false }]);
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
                qty: Number(it.qty),
                unit_price: it.unit_price === '' ? undefined : Number(it.unit_price),
                is_bulk_rate: it.is_bulk_rate,
            }));
        if (cleanItems.length === 0) { toast.error('Add at least one line item'); return; }

        const payload: Record<string, unknown> = {
            delivery_address: deliveryAddress || null,
            delivery_date: deliveryDate,
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
                        className={inputClassName} />
                </FormField>
                <FormField label="Delivery Address">
                    <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                        className={inputClassName} placeholder="Doorstep address" />
                </FormField>
                <FormField label="Entry Type">
                    <input value={entryType} onChange={(e) => setEntryType(e.target.value)}
                        className={inputClassName} placeholder="e.g. WhatsApp group, walk-in" />
                </FormField>
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
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <select
                            value={it.product_id}
                            onChange={(e) => onProductChange(idx, Number(e.target.value))}
                            className={`${selectClassName} col-span-4`}
                        >
                            <option value="">Select product</option>
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.title}{p.qty_text ? ` (${p.qty_text})` : ''}</option>
                            ))}
                        </select>
                        <input type="number" min="0" step="0.01" value={it.qty}
                            onChange={(e) => updateItem(idx, { qty: e.target.value })}
                            placeholder="Qty" className={`${inputClassName} col-span-2`} />
                        <input type="number" min="0" step="0.01" value={it.unit_price}
                            onChange={(e) => updateItem(idx, { unit_price: e.target.value })}
                            placeholder="Unit ₹" className={`${inputClassName} col-span-2`} />
                        <label className="col-span-3 flex items-center gap-1.5 text-xs text-slate-400">
                            <input type="checkbox" checked={it.is_bulk_rate}
                                onChange={(e) => updateItem(idx, { is_bulk_rate: e.target.checked })} />
                            Bulk rate
                        </label>
                        <button type="button" onClick={() => removeItem(idx)}
                            className="col-span-1 p-2 hover:bg-red-500/20 rounded-lg justify-self-end">
                            <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Discount + shipping */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Discount (₹)">
                    <input type="number" min="0" step="0.01" value={discountFlat}
                        onChange={(e) => setDiscountFlat(e.target.value)} className={inputClassName} placeholder="0" />
                </FormField>
                <FormField label="Discount Reason">
                    <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)}
                        className={inputClassName} placeholder="Optional" />
                </FormField>
                <FormField label="Shipping (₹)">
                    <input type="number" min="0" step="0.01" value={shipping}
                        onChange={(e) => setShipping(e.target.value)} className={inputClassName} placeholder="0" />
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
