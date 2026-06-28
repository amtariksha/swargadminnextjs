'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccountingCustomer, useCustomerPrices, ProductPriceOffer } from '@/hooks/useAccounting';
import { useProducts } from '@/hooks/useData';
import { useQueryClient } from '@tanstack/react-query';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { formatINR, formatDate } from '@/lib/accounting';
import { PUT, DELETE } from '@/lib/api';
import { Plus, Edit, Trash2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const blankForm = { product_id: '', price: '', mrp: '', batch_start_date: '', batch_end_date: '' };

export default function CustomerPricesPage() {
    const params = useParams<{ id: string }>();
    const userId = Number(params.id);
    const queryClient = useQueryClient();

    const { data: customer } = useAccountingCustomer(userId);
    const { data: offers = [], isLoading } = useCustomerPrices(userId);
    const { data: products = [] } = useProducts();

    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState(blankForm);
    const [saving, setSaving] = useState(false);

    const isB2b = customer?.profile?.customer_type === 1 || !!customer?.profile?.gstin;
    const selectedProduct = products.find((p) => String(p.id) === form.product_id);

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['accounting', 'customer-prices', userId] });

    const openAdd = () => { setForm(blankForm); setModalOpen(true); };
    const openEdit = (o: ProductPriceOffer) => {
        setForm({
            product_id: String(o.product_id),
            price: String(o.price ?? ''),
            mrp: o.mrp != null ? String(o.mrp) : '',
            batch_start_date: o.batch_start_date ? String(o.batch_start_date).slice(0, 10) : '',
            batch_end_date: o.batch_end_date ? String(o.batch_end_date).slice(0, 10) : '',
        });
        setModalOpen(true);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.product_id || !form.price) { toast.error('Product and price are required'); return; }
        setSaving(true);
        try {
            // PUT upserts by (customer, product), so editing an existing override
            // and adding a new one both use the same call.
            await PUT(`/accounting/customers/${userId}/prices`, {
                product_id: Number(form.product_id),
                price: Number(form.price),
                mrp: form.mrp !== '' ? Number(form.mrp) : null,
                batch_start_date: form.batch_start_date || null,
                batch_end_date: form.batch_end_date || null,
            });
            toast.success('B2B price saved');
            setModalOpen(false);
            invalidate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (o: ProductPriceOffer) => {
        if (!confirm(`Remove the agreed price for ${o.product_title ?? 'this product'}?`)) return;
        try {
            await DELETE(`/accounting/customers/${userId}/prices/${o.id}`);
            toast.success('Price override removed');
            invalidate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to remove');
        }
    };

    const columns: Column<ProductPriceOffer>[] = [
        { key: 'product_title', header: 'Product', render: (o) => o.product_title || `#${o.product_id}` },
        {
            key: 'product_mrp', header: 'MRP', width: '110px',
            render: (o) => o.product_mrp != null ? formatINR(o.product_mrp) : <span className="text-slate-600">—</span>,
        },
        {
            key: 'product_b2b_price', header: 'B2B default', width: '120px',
            render: (o) => o.product_b2b_price != null ? formatINR(o.product_b2b_price) : <span className="text-slate-600">—</span>,
        },
        {
            key: 'price', header: 'Agreed price', width: '130px',
            render: (o) => <span className="text-emerald-400 font-medium">{formatINR(o.price)}</span>,
        },
        {
            key: 'effective', header: 'Effective', width: '190px', sortable: false,
            render: (o) => (o.batch_start_date || o.batch_end_date)
                ? <span className="text-slate-300">{o.batch_start_date ? formatDate(o.batch_start_date) : '—'} → {o.batch_end_date ? formatDate(o.batch_end_date) : '—'}</span>
                : <span className="text-slate-400">Always</span>,
        },
        {
            key: 'actions', header: '', width: '90px', sortable: false,
            render: (o) => (
                <div className="flex gap-1">
                    <button onClick={() => openEdit(o)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <Edit className="w-4 h-4 text-purple-400" />
                    </button>
                    <button onClick={() => remove(o)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/accounting/customers" className="text-sm text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 mb-1">
                        <ArrowLeft className="w-4 h-4" /> Customers
                    </Link>
                    <h1 className="text-2xl font-bold text-white">B2B Prices — {customer?.user?.name ?? `#${userId}`}</h1>
                    <p className="text-slate-400">Agreed per-product prices (GST-inclusive). These override the product&apos;s default B2B price on this customer&apos;s bills.</p>
                </div>
                <button onClick={openAdd}
                    className="px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium inline-flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Add price
                </button>
            </div>

            {!isB2b && customer && (
                <div className="glass rounded-2xl p-4 text-sm text-amber-300/90 border border-amber-500/20">
                    This customer isn&apos;t marked B2B. Per-customer pricing only applies to B2B customers (set GSTIN / type = B2B on the customer).
                </div>
            )}

            <DataTable data={offers} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter products..." emptyMessage="No agreed prices yet — add one." />

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Agreed B2B price" size="lg">
                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Product</label>
                        <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className={inputCls}>
                            <option value="">Select a product…</option>
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.title}{p.b2b_price != null ? ` — B2B ₹${p.b2b_price}` : (p.mrp != null ? ` — MRP ₹${p.mrp}` : '')}
                                </option>
                            ))}
                        </select>
                        {selectedProduct && (
                            <p className="text-xs text-slate-500 mt-1">
                                MRP {selectedProduct.mrp != null ? formatINR(selectedProduct.mrp) : '—'}
                                {selectedProduct.b2b_price != null ? ` · B2B default ${formatINR(selectedProduct.b2b_price)}` : ''}
                            </p>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Agreed price (GST-incl) *</label>
                            <input type="number" step="0.01" value={form.price}
                                onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">MRP (optional)</label>
                            <input type="number" step="0.01" value={form.mrp}
                                onChange={(e) => setForm({ ...form, mrp: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Effective from (optional)</label>
                            <input type="date" value={form.batch_start_date}
                                onChange={(e) => setForm({ ...form, batch_start_date: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Effective to (optional)</label>
                            <input type="date" value={form.batch_end_date}
                                onChange={(e) => setForm({ ...form, batch_end_date: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2 justify-end">
                        <button type="button" onClick={() => setModalOpen(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button type="submit" disabled={saving}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
