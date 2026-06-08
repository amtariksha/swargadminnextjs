'use client';

/**
 * NewVoucherModal — Phase 3.5 typed voucher entry (BookKeeper-style).
 *
 * Quick forms (Receipt / Payment / Contra / Expense / Income) collect the
 * human-friendly fields and build BALANCED double-entry `entries[]` client-side,
 * then POST to the generic /accounting/vouchers (the server re-asserts balance).
 * Journal stays as the raw Dr/Cr grid for credit/debit notes & adjustments.
 * Receipt-against-invoice allocation lives on the customer Ledgers page, so the
 * Receipt tab guides there rather than posting an unallocated receipt.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { POST } from '@/lib/api';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { formatINR } from '@/lib/accounting';
import LedgerPicker, { type LedgerPickerValue } from '@/components/accounting/LedgerPicker';
import type { LedgerAccount } from '@/hooks/useAccounting';

type Kind = 'receipt' | 'payment' | 'contra' | 'expense' | 'income' | 'journal';

const KINDS: { value: Kind; label: string }[] = [
    { value: 'receipt', label: 'Receipt' },
    { value: 'payment', label: 'Payment' },
    { value: 'contra', label: 'Contra' },
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'journal', label: 'Journal' },
];

// Journal can carry any of these GL document types.
const JOURNAL_TYPES = [
    { value: 'journal', label: 'Journal' },
    { value: 'credit_note', label: 'Credit Note' },
    { value: 'debit_note', label: 'Debit Note' },
];

const isMoney = (l: LedgerAccount) => l.group_name === 'Bank Accounts' || l.group_name === 'Cash-in-hand';
const num = (v: string) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

interface GridLine { ledger: LedgerPickerValue | null; amount: string; }
interface JournalLine { ledger: LedgerPickerValue | null; debit: string; credit: string; }

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onPosted: () => void;
}

export default function NewVoucherModal({ isOpen, onClose, onPosted }: Props) {
    const [kind, setKind] = useState<Kind>('payment');
    const [date, setDate] = useState(today());
    const [narration, setNarration] = useState('');
    const [busy, setBusy] = useState(false);

    // Payment / Contra (single particular + money side).
    const [party, setParty] = useState<LedgerPickerValue | null>(null);  // Paid To / To account
    const [money, setMoney] = useState<LedgerPickerValue | null>(null);  // Paid/Received From, or From account
    const [amount, setAmount] = useState('');

    // Expense / Income (money side + grid of particulars).
    const [lines, setLines] = useState<GridLine[]>([{ ledger: null, amount: '' }]);

    // Journal (raw Dr/Cr grid + sub-type).
    const [journalType, setJournalType] = useState('journal');
    const [jlines, setJlines] = useState<JournalLine[]>([
        { ledger: null, debit: '', credit: '' },
        { ledger: null, debit: '', credit: '' },
    ]);

    const reset = () => {
        setKind('payment'); setDate(today()); setNarration('');
        setParty(null); setMoney(null); setAmount('');
        setLines([{ ledger: null, amount: '' }]);
        setJournalType('journal');
        setJlines([{ ledger: null, debit: '', credit: '' }, { ledger: null, debit: '', credit: '' }]);
    };
    const close = () => { reset(); onClose(); };

    const gridTotal = useMemo(() => round2(lines.reduce((s, l) => s + num(l.amount), 0)), [lines]);
    const jDr = useMemo(() => round2(jlines.reduce((s, l) => s + num(l.debit), 0)), [jlines]);
    const jCr = useMemo(() => round2(jlines.reduce((s, l) => s + num(l.credit), 0)), [jlines]);

    const post = async (voucher_type: string, entries: { ledger_account_id: number; debit: number; credit: number }[]) => {
        setBusy(true);
        try {
            await POST('/accounting/vouchers', { voucher_type, voucher_date: date, narration, entries });
            toast.success('Voucher posted');
            onPosted(); close();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to post voucher');
        } finally {
            setBusy(false);
        }
    };

    const submit = () => {
        const amt = round2(num(amount));
        if (kind === 'payment') {
            if (!party || !money || amt <= 0) return toast.error('Pick both accounts and an amount');
            return post('payment', [
                { ledger_account_id: party.id, debit: amt, credit: 0 },
                { ledger_account_id: money.id, debit: 0, credit: amt },
            ]);
        }
        if (kind === 'contra') {
            if (!party || !money || amt <= 0) return toast.error('Pick both accounts and an amount');
            if (party.id === money.id) return toast.error('From and To must differ');
            return post('contra', [
                { ledger_account_id: party.id, debit: amt, credit: 0 },
                { ledger_account_id: money.id, debit: 0, credit: amt },
            ]);
        }
        if (kind === 'expense' || kind === 'income') {
            if (!money) return toast.error(kind === 'expense' ? 'Pick the paid-from account' : 'Pick the received-into account');
            const valid = lines.filter((l) => l.ledger && num(l.amount) > 0);
            if (!valid.length) return toast.error('Add at least one line');
            // Sum the ALREADY-ROUNDED per-line amounts so the money-side leg equals
            // Σ round2(line) exactly — otherwise round2(Σ raw) can drift 1 paisa and
            // post an imbalanced voucher (the server tolerance is ≤ 0.01).
            const total = round2(valid.reduce((s, l) => s + round2(num(l.amount)), 0));
            const entries = kind === 'expense'
                ? [
                    ...valid.map((l) => ({ ledger_account_id: l.ledger!.id, debit: round2(num(l.amount)), credit: 0 })),
                    { ledger_account_id: money.id, debit: 0, credit: total },
                ]
                : [
                    { ledger_account_id: money.id, debit: total, credit: 0 },
                    ...valid.map((l) => ({ ledger_account_id: l.ledger!.id, debit: 0, credit: round2(num(l.amount)) })),
                ];
            return post(kind, entries);
        }
        if (kind === 'journal') {
            const entries = jlines
                .filter((l) => l.ledger && (num(l.debit) > 0 || num(l.credit) > 0))
                .map((l) => ({ ledger_account_id: l.ledger!.id, debit: round2(num(l.debit)), credit: round2(num(l.credit)) }));
            if (entries.length < 2 || Math.abs(jDr - jCr) > 0.01 || jDr <= 0) {
                return toast.error('Add ≥2 lines with equal debit and credit');
            }
            return post(journalType, entries);
        }
    };

    const moneyLabel = kind === 'income' ? 'Received Into (bank / cash)' : kind === 'contra' ? 'From account' : 'Paid From (bank / cash)';
    const partyLabel = kind === 'contra' ? 'To account' : kind === 'income' ? 'Received From' : 'Paid To';

    return (
        <Modal isOpen={isOpen} onClose={close} title="New Voucher" size="xl">
            <div className="space-y-4">
                {/* Kind tabs */}
                <div className="flex flex-wrap gap-1.5">
                    {KINDS.map((k) => (
                        <button
                            key={k.value}
                            onClick={() => setKind(k.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm ${kind === k.value ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800/60 text-slate-300 border border-slate-700/50'}`}
                        >
                            {k.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Date</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Narration</label>
                        <input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="optional" className={inputClassName} />
                    </div>
                </div>

                {kind === 'receipt' && (
                    <div className="glass rounded-xl p-4 text-sm text-slate-300 space-y-2">
                        <p>Receipts are recorded against a customer&apos;s outstanding invoices so the receivable clears correctly.</p>
                        <Link href="/accounting/ledgers" onClick={close} className="inline-block px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm">
                            Go to Customer Ledgers → record receipt
                        </Link>
                    </div>
                )}

                {(kind === 'payment' || kind === 'contra') && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">{partyLabel}</label>
                            <LedgerPicker value={party?.id ?? null} onChange={setParty} filter={kind === 'contra' ? isMoney : undefined} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">{moneyLabel}</label>
                            <LedgerPicker value={money?.id ?? null} onChange={setMoney} filter={isMoney} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Amount</label>
                            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClassName} placeholder="0" />
                        </div>
                    </div>
                )}

                {(kind === 'expense' || kind === 'income') && (
                    <div className="space-y-3">
                        <div className="w-1/2">
                            <label className="block text-xs text-slate-400 mb-1">{moneyLabel}</label>
                            <LedgerPicker value={money?.id ?? null} onChange={setMoney} filter={isMoney} />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs text-slate-400">{kind === 'expense' ? 'Expense accounts' : 'Income accounts'}</label>
                            {lines.map((l, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-8">
                                        <LedgerPicker
                                            value={l.ledger?.id ?? null}
                                            onChange={(sel) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, ledger: sel } : x))}
                                            excludeIds={lines.filter((_, idx) => idx !== i).map((x) => x.ledger?.id).filter((x): x is number => x != null)}
                                        />
                                    </div>
                                    <input type="number" value={l.amount} placeholder="Amount"
                                        onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                                        className={`col-span-3 ${inputClassName} text-right`} />
                                    <button onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)} className="col-span-1 text-slate-500 hover:text-rose-300 text-lg">×</button>
                                </div>
                            ))}
                            <button onClick={() => setLines((ls) => [...ls, { ledger: null, amount: '' }])} className="text-xs text-purple-300">+ add line</button>
                        </div>
                        <p className="text-sm text-slate-400">Total: <span className="text-white font-semibold">{formatINR(gridTotal)}</span></p>
                    </div>
                )}

                {kind === 'journal' && (
                    <div className="space-y-3">
                        <div className="w-1/2">
                            <label className="block text-xs text-slate-400 mb-1">Document type</label>
                            <select value={journalType} onChange={(e) => setJournalType(e.target.value)} className={inputClassName}>
                                {JOURNAL_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            {jlines.map((l, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-6">
                                        <LedgerPicker
                                            value={l.ledger?.id ?? null}
                                            onChange={(sel) => setJlines((ls) => ls.map((x, idx) => idx === i ? { ...x, ledger: sel } : x))}
                                        />
                                    </div>
                                    <input type="number" value={l.debit} placeholder="Debit"
                                        onChange={(e) => setJlines((ls) => ls.map((x, idx) => idx === i ? { ...x, debit: e.target.value, credit: '' } : x))}
                                        className={`col-span-3 ${inputClassName} text-right`} />
                                    <input type="number" value={l.credit} placeholder="Credit"
                                        onChange={(e) => setJlines((ls) => ls.map((x, idx) => idx === i ? { ...x, credit: e.target.value, debit: '' } : x))}
                                        className={`col-span-3 ${inputClassName} text-right`} />
                                </div>
                            ))}
                            <button onClick={() => setJlines((ls) => [...ls, { ledger: null, debit: '', credit: '' }])} className="text-xs text-purple-300">+ add line</button>
                        </div>
                        <p className={`text-sm ${Math.abs(jDr - jCr) <= 0.01 && jDr > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            Dr {formatINR(jDr)} · Cr {formatINR(jCr)} {Math.abs(jDr - jCr) <= 0.01 && jDr > 0 ? '· balanced' : `· diff ${formatINR(Math.abs(jDr - jCr))}`}
                        </p>
                    </div>
                )}

                {kind !== 'receipt' && (
                    <div className="flex justify-end gap-2 pt-1">
                        <button onClick={close} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button onClick={submit} disabled={busy} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">
                            {busy ? 'Posting…' : 'Post voucher'}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
}
