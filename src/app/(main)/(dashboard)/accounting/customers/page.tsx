'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAccountingCustomers, AccountingCustomer } from '@/hooks/useAccounting';
import { CUSTOMER_TYPE_LABELS } from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Edit, BookText, Search } from 'lucide-react';
import { PUT } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

const blankForm = {
    customer_type: 0, legal_name: '', gstin: '', pan: '',
    place_of_supply_state_code: '', billing_address: '', shipping_address: '',
    credit_terms_days: '',
};

export default function AccountingCustomersPage() {
    const [search, setSearch] = useState('');
    const [appliedQ, setAppliedQ] = useState('');
    const { data, isLoading, refetch } = useAccountingCustomers(appliedQ ? { q: appliedQ } : {});
    const customers = data?.data || [];

    const [editItem, setEditItem] = useState<AccountingCustomer | null>(null);
    const [form, setForm] = useState(blankForm);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const openEdit = (c: AccountingCustomer) => {
        setEditItem(c);
        setForm({
            customer_type: Number(c.customer_type ?? 0),
            legal_name: c.legal_name || '',
            gstin: c.gstin || '',
            pan: c.pan || '',
            place_of_supply_state_code: c.place_of_supply_state_code || '',
            billing_address: '', shipping_address: '',
            credit_terms_days: c.credit_terms_days != null ? String(c.credit_terms_days) : '',
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editItem) return;
        setIsSubmitting(true);
        try {
            await PUT(`/accounting/customers/${editItem.user_id}`, {
                customer_type: form.customer_type,
                legal_name: form.legal_name || null,
                gstin: form.gstin.trim().toUpperCase() || null,
                pan: form.pan.trim().toUpperCase() || null,
                place_of_supply_state_code: form.place_of_supply_state_code || null,
                billing_address: form.billing_address || null,
                shipping_address: form.shipping_address || null,
                credit_terms_days: form.credit_terms_days !== '' ? Number(form.credit_terms_days) : null,
            });
            toast.success('Customer GST profile saved');
            setEditItem(null);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    const columns: Column<AccountingCustomer>[] = [
        {
            key: 'edit', header: 'Edit', width: '70px', sortable: false,
            render: (item) => (
                <button onClick={() => openEdit(item)} className="p-2 hover:bg-slate-800/50 rounded-lg">
                    <Edit className="w-4 h-4 text-purple-400" />
                </button>
            ),
        },
        { key: 'user_id', header: 'ID', width: '70px' },
        { key: 'name', header: 'Name' },
        { key: 'phone', header: 'Phone', width: '130px' },
        {
            key: 'customer_type', header: 'Type', width: '80px',
            render: (item) => (
                item.gstin || item.customer_type === 1
                    ? <span className="text-xs px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300">B2B</span>
                    : <span className="text-xs px-2 py-1 rounded-lg bg-slate-700/50 text-slate-400">{CUSTOMER_TYPE_LABELS[Number(item.customer_type ?? 0)]}</span>
            ),
        },
        { key: 'gstin', header: 'GSTIN', render: (item) => item.gstin || <span className="text-slate-600">—</span> },
        {
            key: 'place_of_supply_state_code', header: 'POS', width: '70px',
            render: (item) => item.place_of_supply_state_code || <span className="text-slate-600">—</span>,
        },
        {
            key: 'ledger', header: 'Ledger', width: '80px', sortable: false,
            render: (item) => (
                <Link href={`/accounting/ledgers?user=${item.user_id}`} className="p-2 inline-flex hover:bg-slate-800/50 rounded-lg">
                    <BookText className="w-4 h-4 text-cyan-400" />
                </Link>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Customers</h1>
                <p className="text-slate-400">GST profiles — GSTIN, place of supply, credit terms</p>
            </div>

            <form
                onSubmit={(e) => { e.preventDefault(); setAppliedQ(search.trim()); }}
                className="flex gap-2"
            >
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name / phone / GSTIN (server-side)…"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <button type="submit" className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50">
                    Search
                </button>
                {appliedQ && (
                    <button type="button" onClick={() => { setSearch(''); setAppliedQ(''); }}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-400 rounded-xl text-sm hover:bg-slate-700/50">
                        Clear
                    </button>
                )}
            </form>

            <DataTable data={customers} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter loaded rows..." emptyMessage="No customers found (showing up to 200; use search to narrow)" />

            <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title={`GST profile — ${editItem?.name ?? ''}`} size="lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Customer type</label>
                            <select value={form.customer_type}
                                onChange={(e) => setForm({ ...form, customer_type: Number(e.target.value) })} className={inputCls}>
                                <option value={0}>B2C</option>
                                <option value={1}>B2B</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Credit terms (days)</label>
                            <input type="number" value={form.credit_terms_days}
                                onChange={(e) => setForm({ ...form, credit_terms_days: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Legal name</label>
                        <input type="text" value={form.legal_name}
                            onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">GSTIN (sets B2B)</label>
                            <input type="text" value={form.gstin} maxLength={15} placeholder="29ABCDE1234F1Z5"
                                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">PAN</label>
                            <input type="text" value={form.pan} maxLength={10}
                                onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Place of supply (state code)</label>
                        <input type="text" value={form.place_of_supply_state_code} maxLength={2} placeholder="29"
                            onChange={(e) => setForm({ ...form, place_of_supply_state_code: e.target.value })} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Billing address</label>
                            <textarea value={form.billing_address} rows={2}
                                onChange={(e) => setForm({ ...form, billing_address: e.target.value })} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Shipping address</label>
                            <textarea value={form.shipping_address} rows={2}
                                onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2 justify-end">
                        <button type="button" onClick={() => setEditItem(null)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button type="submit" disabled={isSubmitting}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
