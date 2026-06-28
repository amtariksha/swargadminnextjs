'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    useCustomerLedger, useInvoices, LedgerEntry,
    useAccountingCustomers, AccountingCustomer,
} from '@/hooks/useAccounting';
import {
    LEDGER_ENTRY_TYPE_LABELS, RECEIPT_MODE_OPTIONS, formatINR, formatDate,
} from '@/lib/accounting';
import type { CustomerValue } from '@/components/CustomerPicker';
import Modal from '@/components/Modal';
import DataTable, { Column } from '@/components/DataTable';
import { Receipt } from 'lucide-react';
import { POST } from '@/lib/api';
import { toast } from 'sonner';

const inputCls =
    'w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50';

export default function AccountingLedgersPage() {
    return (
        <Suspense fallback={<div className="text-slate-400 text-sm py-12 text-center">Loading…</div>}>
            <LedgersInner />
        </Suspense>
    );
}

function LedgersInner() {
    const searchParams = useSearchParams();
    const [customer, setCustomer] = useState<CustomerValue | null>(null);

    // Deep-link: ?user=<id> sets the initial customer (we only know the id;
    // name fills in once the ledger loads).
    const userParam = searchParams.get('user');
    useEffect(() => {
        if (userParam && !customer) {
            const uid = Number(userParam);
            if (Number.isFinite(uid)) setCustomer({ userId: uid, name: '', phone: '', isNew: false });
        }
    }, [userParam, customer]);

    const userId = customer?.userId ?? null;
    const { data: ledger, isLoading, refetch } = useCustomerLedger(userId);
    const [showReceipt, setShowReceipt] = useState(false);

    // Pick a customer type first (default B2B), then the customer from that set.
    const [custType, setCustType] = useState<'b2b' | 'b2c'>('b2b');
    const { data: custData } = useAccountingCustomers({ type: custType, limit: '1000' });
    const customers = custData?.data ?? [];

    const columns: Column<LedgerEntry>[] = [
        { key: 'entry_date', header: 'Date', width: '120px', render: (e) => formatDate(e.entry_date) },
        {
            key: 'entry_type', header: 'Type', width: '110px',
            render: (e) => <span className="text-xs text-slate-300">{LEDGER_ENTRY_TYPE_LABELS[Number(e.entry_type)] || '—'}</span>,
        },
        {
            key: 'note', header: 'Particulars',
            render: (e) => (
                <span>
                    {e.note || (e.invoice_id ? `Invoice #${e.invoice_id}` : e.receipt_id ? `Receipt #${e.receipt_id}` : '—')}
                </span>
            ),
        },
        { key: 'debit', header: 'Debit', width: '120px', render: (e) => (Number(e.debit) ? formatINR(e.debit) : <span className="text-slate-600">—</span>) },
        { key: 'credit', header: 'Credit', width: '120px', render: (e) => (Number(e.credit) ? formatINR(e.credit) : <span className="text-slate-600">—</span>) },
        { key: 'balance_after', header: 'Balance', width: '130px', render: (e) => <span className="font-medium text-white">{formatINR(e.balance_after)}</span> },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Customer ledgers</h1>
                    <p className="text-slate-400">Running statement &amp; ageing — receipts post against open invoices</p>
                </div>
                {userId != null && (
                    <button onClick={() => setShowReceipt(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm">
                        <Receipt className="w-4 h-4" /> Record receipt
                    </button>
                )}
            </div>

            <div className="max-w-md space-y-2">
                <label className="block text-sm font-medium text-slate-300">Customer</label>
                <div className="inline-flex rounded-xl bg-slate-800/40 border border-slate-700/50 p-1">
                    {(['b2b', 'b2c'] as const).map((t) => (
                        <button key={t} type="button"
                            onClick={() => { setCustType(t); setCustomer(null); }}
                            className={`px-4 py-1.5 rounded-lg text-sm ${custType === t ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-slate-200'}`}>
                            {t.toUpperCase()}
                        </button>
                    ))}
                </div>
                <TypedCustomerPicker customers={customers} value={customer} onChange={setCustomer} />
            </div>

            {userId == null ? (
                <div className="glass rounded-2xl p-8 text-center text-slate-400 text-sm">
                    Select a customer to view their ledger.
                </div>
            ) : isLoading ? (
                <div className="text-slate-400 text-sm py-8 text-center">Loading ledger…</div>
            ) : ledger ? (
                <>
                    {/* Outstanding + ageing */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <StatCard label="Outstanding" value={formatINR(ledger.outstanding)} highlight />
                        <StatCard label="Current" value={formatINR(ledger.ageing.current)} />
                        <StatCard label="31–60 d" value={formatINR(ledger.ageing.d31_60)} />
                        <StatCard label="61–90 d" value={formatINR(ledger.ageing.d61_90)} />
                        <StatCard label="90+ d" value={formatINR(ledger.ageing.d90_plus)} danger />
                    </div>

                    <DataTable data={ledger.entries} columns={columns} pageSize={50}
                        title={`${ledger.customer.name || 'Customer'} — statement`}
                        searchPlaceholder="Filter entries..." emptyMessage="No ledger entries yet" />
                </>
            ) : (
                <div className="glass rounded-2xl p-8 text-center text-slate-400 text-sm">No ledger found.</div>
            )}

            {userId != null && (
                <ReceiptModal
                    isOpen={showReceipt}
                    userId={userId}
                    customerName={ledger?.customer.name || customer?.name || ''}
                    onClose={() => setShowReceipt(false)}
                    onSaved={() => { setShowReceipt(false); refetch(); }}
                />
            )}
        </div>
    );
}

// Searchable customer picker fed by a typed (B2B/B2C) accounting-customers list.
// Kept local (not the shared CustomerPicker) — that one is coupled to useUsers()
// + inline customer creation for the day-order flow.
function TypedCustomerPicker({ customers, value, onChange }: {
    customers: AccountingCustomer[];
    value: CustomerValue | null;
    onChange: (c: CustomerValue | null) => void;
}) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const needle = q.trim().toLowerCase();
    const filtered = needle
        ? customers.filter((c) => `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(needle))
        : customers;
    return (
        <div className="relative">
            <input
                value={value && !open ? `${value.name || `#${value.userId}`}${value.phone ? ` · ${value.phone}` : ''}` : q}
                onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Search customer by name / phone…"
                className={inputCls}
            />
            {open && (
                <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto glass rounded-xl border border-slate-700/50">
                    {filtered.slice(0, 100).map((c) => (
                        <button key={c.user_id} type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onChange({ userId: c.user_id, name: c.name, phone: c.phone ?? '', isNew: false }); setOpen(false); setQ(''); }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-800/50 text-sm text-slate-200">
                            {c.name} {c.phone && <span className="text-slate-500">· {c.phone}</span>}
                        </button>
                    ))}
                    {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No customers</div>}
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
    return (
        <div className={`glass rounded-2xl p-4 ${highlight ? 'ring-1 ring-purple-500/30' : ''}`}>
            <div className="text-xs text-slate-400">{label}</div>
            <div className={`text-lg font-bold mt-1 ${danger ? 'text-red-400' : 'text-white'}`}>{value}</div>
        </div>
    );
}

// ── Record receipt (with optional allocation to open invoices) ───────────────

function ReceiptModal({
    isOpen, userId, customerName, onClose, onSaved,
}: {
    isOpen: boolean;
    userId: number;
    customerName: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('1');
    const [reference, setReference] = useState('');
    const [allocations, setAllocations] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState(false);

    // Open (issued) invoices for this customer — allocation targets.
    const { data: invData } = useInvoices(
        isOpen ? { user_id: String(userId), status: 'issued' } : {},
    );
    const openInvoices = invData?.data || [];

    const setAlloc = (invoiceId: number, val: string) =>
        setAllocations((prev) => ({ ...prev, [invoiceId]: val }));

    const allocatedTotal = Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0);

    const save = async () => {
        const amt = Number(amount);
        if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
        const allocList = Object.entries(allocations)
            .map(([invoice_id, v]) => ({ invoice_id: Number(invoice_id), amount: Number(v) || 0 }))
            .filter((a) => a.amount > 0);
        if (allocatedTotal > amt + 0.01) {
            toast.error('Allocated amount exceeds receipt amount');
            return;
        }
        setSaving(true);
        try {
            await POST('/accounting/receipts', {
                user_id: userId,
                amount: amt,
                mode: Number(mode),
                reference: reference.trim() || null,
                allocations: allocList,
            });
            toast.success('Receipt recorded');
            setAmount(''); setReference(''); setAllocations({});
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to record receipt');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Record receipt — ${customerName}`} size="lg">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Amount *</label>
                        <input type="number" step="0.01" value={amount}
                            onChange={(e) => setAmount(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Mode</label>
                        <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
                            {RECEIPT_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Reference</label>
                    <input type="text" value={reference} placeholder="UTR / cheque no / txn id"
                        onChange={(e) => setReference(e.target.value)} className={inputCls} />
                </div>

                {openInvoices.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-slate-300">Allocate to open invoices</label>
                            <span className="text-xs text-slate-500">Allocated {formatINR(allocatedTotal)}</span>
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                            {openInvoices.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white truncate">{inv.invoice_number}</div>
                                        <div className="text-xs text-slate-400">{formatDate(inv.invoice_date)} · {formatINR(inv.total_amount)}</div>
                                    </div>
                                    <input type="number" step="0.01" placeholder="0.00"
                                        value={allocations[inv.id] ?? ''}
                                        onChange={(e) => setAlloc(inv.id, e.target.value)}
                                        className="w-28 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            Leave allocations blank to record an on-account receipt.
                        </p>
                    </div>
                )}

                <div className="flex gap-3 pt-2 justify-end">
                    <button onClick={onClose}
                        className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                    <button onClick={save} disabled={saving}
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                        {saving ? 'Saving…' : 'Record receipt'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
