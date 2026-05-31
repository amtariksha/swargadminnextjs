'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    useCustomerLedger, useInvoices, LedgerEntry,
} from '@/hooks/useAccounting';
import {
    LEDGER_ENTRY_TYPE_LABELS, RECEIPT_MODE_OPTIONS, formatINR, formatDate,
} from '@/lib/accounting';
import CustomerPicker, { CustomerValue } from '@/components/CustomerPicker';
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

            <div className="max-w-md">
                <label className="block text-sm font-medium text-slate-300 mb-2">Customer</label>
                <CustomerPicker value={customer} onChange={setCustomer} />
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
