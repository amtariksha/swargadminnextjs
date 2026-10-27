'use client';

import { useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import Modal from '@/components/Modal';
import LedgerPicker, { LedgerPickerValue } from '@/components/accounting/LedgerPicker';
import { useInvoices, StatementRow } from '@/hooks/useAccounting';
import { useVendors } from '@/hooks/useInventory';
import { DIRECTION, formatDate, formatINR } from '@/lib/accounting';

export interface BankRowMatch { invoice_id?: number; ledger_id?: number; vendor_id?: number }

type Mode = 'invoice' | 'vendor' | 'ledger';

const tabCls = (on: boolean) =>
    `px-4 py-1.5 text-sm rounded-lg ${on ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400'}`;
const submitCls =
    'flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50';

/**
 * Reconcile one bank row by hand. A credit matches an invoice (a customer
 * receipt) or a ledger; a debit pays a vendor (records the vendor payment from
 * this account) or goes to a ledger — rent, salary, a staff member's
 * reimbursement ledger.
 */
export default function BankRowMatchModal({
    row, onClose, onSubmit,
}: { row: StatementRow; onClose: () => void; onSubmit: (match: BankRowMatch) => void }) {
    const isCredit = row.direction === DIRECTION.CREDIT;
    const [mode, setMode] = useState<Mode>(isCredit ? 'invoice' : 'vendor');

    return (
        <Modal isOpen onClose={onClose} title="Reconcile bank row" size="lg">
            <div className="space-y-4">
                <div className="bg-slate-800/40 rounded-xl px-4 py-3 text-sm">
                    <div className="text-slate-400">Bank row</div>
                    <div className="text-white">{row.narration || '—'}</div>
                    <div className={isCredit ? 'text-green-400' : 'text-slate-300'}>
                        {isCredit ? '+' : '−'}{formatINR(row.amount)} · {formatDate(row.txn_date)}
                    </div>
                </div>

                <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50 w-fit">
                    {isCredit
                        ? <button onClick={() => setMode('invoice')} className={tabCls(mode === 'invoice')}>Match invoice</button>
                        : <button onClick={() => setMode('vendor')} className={tabCls(mode === 'vendor')}>Pay a vendor</button>}
                    <button onClick={() => setMode('ledger')} className={tabCls(mode === 'ledger')}>Assign to ledger</button>
                </div>

                {mode === 'invoice' && <InvoicePick onPick={(id) => onSubmit({ invoice_id: id })} />}
                {mode === 'vendor' && <VendorPick suggested={row.matched_vendor_id ?? null} onPick={(id) => onSubmit({ vendor_id: id })} />}
                {mode === 'ledger' && <LedgerPick isCredit={isCredit} onPick={(id) => onSubmit({ ledger_id: id })} />}
            </div>
        </Modal>
    );
}

function InvoicePick({ onPick }: { onPick: (invoiceId: number) => void }) {
    const [search, setSearch] = useState('');
    const [applied, setApplied] = useState('');
    const { data, isLoading } = useInvoices(applied ? { status: 'issued', q: applied } : { status: 'issued' });
    const invoices = data?.data || [];
    return (
        <>
            <form onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }} className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice # / customer…"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <button type="submit" className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50">
                    Search
                </button>
            </form>
            <div className="max-h-72 overflow-y-auto space-y-2">
                {isLoading ? (
                    <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
                ) : invoices.length === 0 ? (
                    <div className="text-slate-500 text-sm py-6 text-center">No issued invoices found.</div>
                ) : invoices.map((inv) => (
                    <button key={inv.id} onClick={() => onPick(inv.id)}
                        className="w-full flex items-center justify-between gap-3 bg-slate-800/40 hover:bg-slate-700/50 rounded-xl px-4 py-3 text-left">
                        <div>
                            <div className="text-sm text-white">{inv.invoice_number}</div>
                            <div className="text-xs text-slate-400">{inv.customer_name || '—'} · {formatDate(inv.invoice_date)}</div>
                        </div>
                        <div className="text-sm font-medium text-white">{formatINR(inv.total_amount)}</div>
                    </button>
                ))}
            </div>
        </>
    );
}

function VendorPick({ suggested, onPick }: { suggested: number | null; onPick: (vendorId: number) => void }) {
    const { data: vendors = [] } = useVendors();
    const [vendorId, setVendorId] = useState<string>(suggested != null ? String(suggested) : '');
    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-400">
                Records a vendor payment for this amount, dated this day, from this statement&rsquo;s bank account
                (Dr vendor / Cr bank). It reduces what you owe the vendor and goes to Tally as a Payment.
            </p>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} aria-label="Vendor paid"
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                <option value="">Select the vendor this paid…</option>
                {vendors.filter((v) => v.is_active !== 0).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <div className="flex justify-end">
                <button onClick={() => vendorId && onPick(Number(vendorId))} disabled={!vendorId} className={submitCls}>
                    <CheckCircle2 className="w-4 h-4" /> Record payment
                </button>
            </div>
        </div>
    );
}

function LedgerPick({ isCredit, onPick }: { isCredit: boolean; onPick: (ledgerId: number) => void }) {
    const [ledger, setLedger] = useState<LedgerPickerValue | null>(null);
    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-400">
                Posts a voucher {isCredit ? '(Dr Bank / Cr ledger)' : '(Dr ledger / Cr Bank)'} against the chosen ledger —
                e.g. rent, salary, or a staff member&rsquo;s reimbursement ledger when paying them back.
            </p>
            <LedgerPicker value={ledger?.id ?? null} onChange={setLedger} placeholder="Select a ledger…" />
            <div className="flex justify-end">
                <button onClick={() => ledger && onPick(ledger.id)} disabled={!ledger} className={submitCls}>
                    <CheckCircle2 className="w-4 h-4" /> Assign &amp; post
                </button>
            </div>
        </div>
    );
}
