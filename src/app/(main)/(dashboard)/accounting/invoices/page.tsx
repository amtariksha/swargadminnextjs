'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInvoices, InvoiceRow } from '@/hooks/useAccounting';
import {
    INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, DOCUMENT_TYPE_LABELS,
    formatINR, formatDate,
} from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import { Search } from 'lucide-react';

const STATUS_FILTERS = [
    { value: '', label: 'All' },
    { value: 'issued', label: 'Issued' },
    { value: 'cancelled', label: 'Cancelled' },
];

export default function AccountingInvoicesPage() {
    const router = useRouter();
    const [status, setStatus] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [search, setSearch] = useState('');
    const [applied, setApplied] = useState<Record<string, string>>({});

    const { data, isLoading } = useInvoices(applied);
    const invoices = data?.data || [];
    const total = data?.meta?.total;
    const totalValue = data?.meta?.total_value;

    const applyFilters = (e: React.FormEvent) => {
        e.preventDefault();
        const f: Record<string, string> = {};
        if (status) f.status = status;
        if (from) f.from = from;
        if (to) f.to = to;
        if (search.trim()) f.q = search.trim();
        setApplied(f);
    };

    const columns: Column<InvoiceRow>[] = [
        { key: 'invoice_number', header: 'Invoice #', width: '180px' },
        { key: 'invoice_date', header: 'Date', width: '120px', render: (i) => formatDate(i.invoice_date) },
        { key: 'customer_name', header: 'Customer', render: (i) => i.customer_name || <span className="text-slate-600">—</span> },
        {
            key: 'document_type', header: 'Type', width: '130px',
            render: (i) => <span className="text-xs text-slate-300">{DOCUMENT_TYPE_LABELS[Number(i.document_type)] || '—'}</span>,
        },
        { key: 'taxable_value', header: 'Taxable', width: '120px', render: (i) => formatINR(i.taxable_value) },
        {
            key: 'tax', header: 'Tax', width: '120px', sortable: false,
            render: (i) => formatINR(Number(i.cgst_amount) + Number(i.sgst_amount) + Number(i.igst_amount)),
        },
        { key: 'total_amount', header: 'Total', width: '130px', render: (i) => <span className="font-medium text-white">{formatINR(i.total_amount)}</span> },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (i) => (
                <span className={`text-xs px-2 py-1 rounded-lg ${INVOICE_STATUS_BADGE[Number(i.status)] || 'bg-slate-700/50 text-slate-400'}`}>
                    {INVOICE_STATUS_LABELS[Number(i.status)] || '—'}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Invoices</h1>
                    <p className="text-slate-400">GST system of record — tax invoices &amp; bills of supply</p>
                </div>
                {total != null && (
                    <div className="text-right">
                        <div className="text-sm text-slate-400">{total} invoice(s)</div>
                        {totalValue != null && <div className="text-lg font-bold text-white">{formatINR(totalValue)}</div>}
                    </div>
                )}
            </div>

            <form onSubmit={applyFilters} className="glass rounded-2xl p-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}
                        className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50">
                        {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">From</label>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                        className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">To</label>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                        className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-slate-400 mb-1">Search</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)}
                            placeholder="Invoice # / customer…"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                </div>
                <button type="submit" className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm">
                    Apply
                </button>
            </form>

            <DataTable data={invoices} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter loaded rows..."
                emptyMessage="No invoices found (showing up to 200; use filters to narrow)"
                rowClassName={() => 'cursor-pointer'}
                onRowClick={(i) => router.push(`/accounting/invoices/${i.id}`)} />
        </div>
    );
}
