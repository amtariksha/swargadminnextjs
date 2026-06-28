'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useProducts } from '@/hooks/useData';
import { POST } from '@/lib/api';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface Line { product_id: string; qty: string; unit_price: string; }

const blankForm = {
    name: '', phone: '', gstin: '', legal_name: '',
    place_of_supply_state_code: '', billing_address: '', shipping_address: '',
    delivery_address: '', delivery_date: '',
};

/**
 * One-time B2B / catering order (Ask 9). Creates the org as a reusable B2B
 * customer, captures GST details, and places a confirmed day order allotted to
 * the day-delivery pool. The GST invoice issues automatically on delivery and is
 * kept out of the B2C consolidation (customer_type=1).
 */
export default function CateringOrderModal({ isOpen, onClose, onCreated }: {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
}) {
    const { data: products = [] } = useProducts();
    const [form, setForm] = useState(blankForm);
    const [lines, setLines] = useState<Line[]>([{ product_id: '', qty: '1', unit_price: '' }]);
    const [saving, setSaving] = useState(false);

    const setLine = (i: number, patch: Partial<Line>) =>
        setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const addLine = () => setLines((ls) => [...ls, { product_id: '', qty: '1', unit_price: '' }]);
    const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

    const onProduct = (i: number, productId: string) => {
        const p = products.find((x) => String(x.id) === productId);
        const suggested = p?.b2b_price ?? p?.price ?? '';
        setLine(i, { product_id: productId, unit_price: lines[i].unit_price || (suggested !== '' ? String(suggested) : '') });
    };

    const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);

    const reset = () => { setForm(blankForm); setLines([{ product_id: '', qty: '1', unit_price: '' }]); };

    const submit = async () => {
        if (!form.name.trim() || !form.phone.trim()) { toast.error('Organisation name and phone are required'); return; }
        if (!form.delivery_date) { toast.error('Delivery date is required'); return; }
        const items = lines
            .map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty), unit_price: Number(l.unit_price) }))
            .filter((it) => it.product_id && it.qty > 0 && Number.isFinite(it.unit_price));
        if (!items.length) { toast.error('Add at least one valid line item'); return; }
        setSaving(true);
        try {
            await POST('/daytime/b2b-order', {
                customer: { name: form.name.trim(), phone: form.phone.trim() },
                gstin: form.gstin.trim().toUpperCase() || null,
                legal_name: form.legal_name || null,
                place_of_supply_state_code: form.place_of_supply_state_code || null,
                billing_address: form.billing_address || null,
                shipping_address: form.shipping_address || null,
                delivery_address: form.delivery_address || null,
                delivery_date: form.delivery_date,
                items,
            });
            toast.success('Catering order created & allotted to day deliveries');
            reset();
            onCreated?.();
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create order');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New B2B / Catering Order" size="lg">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Organisation name *</label>
                        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Phone *</label>
                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">GSTIN</label>
                        <input value={form.gstin} maxLength={15} placeholder="29ABCDE1234F1Z5"
                            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Legal name</label>
                        <input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Place of supply (state code)</label>
                        <input value={form.place_of_supply_state_code} maxLength={2} placeholder="29"
                            onChange={(e) => setForm({ ...form, place_of_supply_state_code: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Delivery date *</label>
                        <input type="date" value={form.delivery_date}
                            onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs text-slate-400 mb-1">Delivery address</label>
                        <input value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} className={inputCls} />
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-slate-300">Line items (agreed prices)</label>
                        <button type="button" onClick={addLine} className="text-xs text-purple-300 inline-flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Add line
                        </button>
                    </div>
                    <div className="space-y-2">
                        {lines.map((l, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <select value={l.product_id} onChange={(e) => onProduct(i, e.target.value)} className={`${inputCls} flex-1`}>
                                    <option value="">Select product…</option>
                                    {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                                </select>
                                <input type="number" step="any" value={l.qty} placeholder="Qty"
                                    onChange={(e) => setLine(i, { qty: e.target.value })} className={`${inputCls} w-20`} />
                                <input type="number" step="0.01" value={l.unit_price} placeholder="Price"
                                    onChange={(e) => setLine(i, { unit_price: e.target.value })} className={`${inputCls} w-28`} />
                                <button type="button" onClick={() => removeLine(i)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="text-right text-sm text-slate-300 mt-2">Total: <span className="text-white font-medium">₹{total.toFixed(2)}</span></div>
                </div>

                <p className="text-xs text-slate-500">
                    The org is saved as a B2B customer; a GST tax invoice is generated automatically when the day delivery is marked delivered (kept out of the B2C consolidation).
                </p>

                <div className="flex gap-3 pt-1 justify-end">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                    <button type="button" onClick={submit} disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                        {saving ? 'Creating…' : 'Create catering order'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
