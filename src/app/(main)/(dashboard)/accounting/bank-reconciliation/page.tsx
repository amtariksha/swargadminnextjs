'use client';

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useStatements, useStatementRows, useInvoices, useBankAccounts,
    StatementImport, StatementRow,
} from '@/hooks/useAccounting';
import {
    IMPORT_STATUS_BADGE, MATCH_STATUS_LABELS, MATCH_STATUS_BADGE, DIRECTION,
    formatINR, formatDate, formatDateTime,
} from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import LedgerPicker, { LedgerPickerValue } from '@/components/accounting/LedgerPicker';
import { Upload, CheckCircle2, X, Link2, Loader2, Search, BookText, Plus, Banknote } from 'lucide-react';
import { POST } from '@/lib/api';
import { toast } from 'sonner';

type ReconcileItem = {
    row_id: number;
    action: 'confirm' | 'manual' | 'ignore';
    invoice_id?: number;
    ledger_id?: number;
    to_suspense?: boolean;
};

export default function BankReconciliationPage() {
    const { data: stmtData, isLoading: loadingStatements, refetch: refetchStatements } = useStatements();
    const statements = stmtData?.data || [];
    const { data: bankAccounts = [] } = useBankAccounts();
    const [selectedImport, setSelectedImport] = useState<number | null>(null);
    const [bankAccountId, setBankAccountId] = useState<string>('');
    const [showBankAccounts, setShowBankAccounts] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const upload = async (file: File) => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            if (bankAccountId) fd.append('bank_account_id', bankAccountId);
            const res = await POST<{ import_id: number; row_count: number; suggested: number }>('/accounting/bank/statements', fd);
            toast.success(`Imported ${res.data?.row_count ?? 0} rows · ${res.data?.suggested ?? 0} suggested matches`);
            refetchStatements();
            if (res.data?.import_id) setSelectedImport(res.data.import_id);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const statementColumns: Column<StatementImport>[] = [
        { key: 'created_at', header: 'Imported', width: '160px', render: (s) => formatDateTime(s.created_at) },
        { key: 'filename', header: 'File', render: (s) => s.filename || <span className="text-slate-600">—</span> },
        { key: 'bank', header: 'Bank', width: '120px', render: (s) => s.bank || '—' },
        {
            key: 'period', header: 'Period', width: '180px',
            render: (s) => (s.period_from || s.period_to) ? `${formatDate(s.period_from)} – ${formatDate(s.period_to)}` : '—',
        },
        { key: 'total_rows', header: 'Rows', width: '80px', render: (s) => s.total_rows ?? s.row_count } ,
        { key: 'suggested_rows', header: 'Suggested', width: '100px', render: (s) => s.suggested_rows ?? 0 },
        { key: 'reconciled_rows', header: 'Reconciled', width: '100px', render: (s) => s.reconciled_rows ?? 0 },
        {
            key: 'status', header: 'Status', width: '110px',
            render: (s) => (
                <span className={`text-xs px-2 py-1 rounded-lg ${IMPORT_STATUS_BADGE[s.status] || 'bg-slate-700/50 text-slate-400'}`}>
                    {s.status}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Bank reconciliation</h1>
                <p className="text-slate-400">Upload a statement → AI parses &amp; suggests matches → review and confirm. Nothing posts unreviewed.</p>
            </div>

            {/* Upload */}
            <div className="glass rounded-2xl p-5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-slate-400" />
                        <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
                            className="px-3 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-white text-sm">
                            <option value="">Bank account (optional)…</option>
                            {bankAccounts.filter((b) => b.is_active !== 0).map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}{b.ledger_name ? ` → ${b.ledger_name}` : ' (no ledger)'}
                                </option>
                            ))}
                        </select>
                        <button onClick={() => setShowBankAccounts(true)}
                            className="flex items-center gap-1 px-2.5 py-2 text-xs text-slate-300 bg-slate-800/50 border border-slate-700/50 rounded-xl hover:bg-slate-700/50">
                            <Plus className="w-3.5 h-3.5" /> Manage
                        </button>
                    </div>
                    <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx,.pdf"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
                        className="hidden" />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? 'Uploading…' : 'Upload statement'}
                    </button>
                    <span className="text-xs text-slate-500">CSV / Excel / PDF — parsed into normalized rows, balance-validated before matching.</span>
                </div>
            </div>

            <DataTable data={statements} columns={statementColumns} loading={loadingStatements} pageSize={20}
                title="Statement imports" searchable={false}
                emptyMessage="No statements imported yet"
                rowClassName={(s) => (s.id === selectedImport ? 'bg-purple-500/10' : 'cursor-pointer')}
                onRowClick={(s) => setSelectedImport(s.id)} />

            {selectedImport != null && (
                <RowsReview importId={selectedImport} onReconciled={refetchStatements} />
            )}

            {showBankAccounts && <BankAccountsModal onClose={() => setShowBankAccounts(false)} />}
        </div>
    );
}

// ── Rows review for a selected import ────────────────────────────────────────

function RowsReview({ importId, onReconciled }: { importId: number; onReconciled: () => void }) {
    const [tab, setTab] = useState(0); // 0 = Suggested
    const { data: rows = [], isLoading, refetch } = useStatementRows(importId);
    const [busy, setBusy] = useState(false);
    const [manualRow, setManualRow] = useState<StatementRow | null>(null);

    const groups = useMemo(() => ({
        suggested: rows.filter((r) => r.match_status === 1),
        unmatched: rows.filter((r) => r.match_status === 0),
        done: rows.filter((r) => [2, 3, 4].includes(r.match_status)),
    }), [rows]);

    const reconcile = async (items: ReconcileItem[]) => {
        if (items.length === 0) return;
        setBusy(true);
        try {
            const res = await POST<{ reconciled: number }>('/accounting/bank/reconcile', { items });
            toast.success(`${res.data?.reconciled ?? items.length} row(s) reconciled`);
            refetch();
            onReconciled();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Reconcile failed');
        } finally {
            setBusy(false);
        }
    };

    const confirmAllSuggested = () =>
        reconcile(groups.suggested
            .filter((r) => r.matched_invoice_id)
            .map((r) => ({ row_id: r.id, action: 'confirm' as const })));

    const baseColumns: Column<StatementRow>[] = [
        { key: 'txn_date', header: 'Date', width: '110px', render: (r) => formatDate(r.txn_date) },
        { key: 'narration', header: 'Narration', render: (r) => <span className="text-slate-300">{r.narration || '—'}</span> },
        {
            key: 'amount', header: 'Amount', width: '130px',
            render: (r) => (
                <span className={r.direction === DIRECTION.CREDIT ? 'text-green-400' : 'text-slate-400'}>
                    {r.direction === DIRECTION.CREDIT ? '+' : '−'}{formatINR(r.amount)}
                </span>
            ),
        },
    ];

    const matchInfoColumn: Column<StatementRow> = {
        key: 'matched', header: 'Match / counter-ledger',
        render: (r) => (
            r.matched_invoice_id ? (
                <div className="text-xs">
                    <div className="text-cyan-300">{r.matched_invoice_number} · {formatINR(r.matched_invoice_total)}</div>
                    <div className="text-slate-500">{r.matched_customer_name}{r.match_score != null ? ` · ${Math.round(Number(r.match_score))}% score` : ''}</div>
                    {r.match_reasons && r.match_reasons.length > 0 && (
                        <div className="text-slate-600">{r.match_reasons.join(', ')}</div>
                    )}
                </div>
            ) : r.matched_ledger_id ? (
                <div className="text-xs">
                    <div className="text-amber-300 flex items-center gap-1"><BookText className="w-3 h-3" /> {r.matched_ledger_name}</div>
                    {r.matched_voucher_number && <div className="text-slate-500">{r.matched_voucher_number}</div>}
                </div>
            ) : <span className="text-xs text-slate-500">No suggestion</span>
        ),
    };

    const actionColumn = (showConfirm: boolean): Column<StatementRow> => ({
        key: 'actions', header: '', width: '290px', sortable: false,
        render: (r) => (
            <div className="flex items-center gap-2">
                {showConfirm && r.matched_invoice_id && (
                    <button onClick={() => reconcile([{ row_id: r.id, action: 'confirm' }])} disabled={busy}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 disabled:opacity-50">
                        <CheckCircle2 className="w-3 h-3" /> Confirm
                    </button>
                )}
                <button onClick={() => setManualRow(r)} disabled={busy}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700/50 disabled:opacity-50">
                    <Link2 className="w-3 h-3" /> Match
                </button>
                <button onClick={() => reconcile([{ row_id: r.id, action: 'confirm', to_suspense: true }])} disabled={busy}
                    title="Post Dr/Cr against the Bank Suspense ledger"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/25 disabled:opacity-50">
                    <BookText className="w-3 h-3" /> Suspense
                </button>
                <button onClick={() => reconcile([{ row_id: r.id, action: 'ignore' }])} disabled={busy}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800/50 border border-slate-700/50 text-slate-400 rounded-lg hover:bg-slate-700/50 disabled:opacity-50">
                    <X className="w-3 h-3" /> Ignore
                </button>
            </div>
        ),
    });

    const doneStatusColumn: Column<StatementRow> = {
        key: 'match_status', header: 'Status', width: '120px',
        render: (r) => (
            <span className={`text-xs px-2 py-1 rounded-lg ${MATCH_STATUS_BADGE[r.match_status] || 'bg-slate-700/50 text-slate-400'}`}>
                {MATCH_STATUS_LABELS[r.match_status] || '—'}
            </span>
        ),
    };

    const tabsDef = [
        { label: 'Suggested', count: groups.suggested.length, columns: [...baseColumns, matchInfoColumn, actionColumn(true)], rows: groups.suggested },
        { label: 'Needs review', count: groups.unmatched.length, columns: [...baseColumns, matchInfoColumn, actionColumn(false)], rows: groups.unmatched },
        { label: 'Reconciled / ignored', count: groups.done.length, columns: [...baseColumns, matchInfoColumn, doneStatusColumn], rows: groups.done },
    ];
    const active = tabsDef[tab];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50">
                    {tabsDef.map((t, i) => (
                        <button key={i} onClick={() => setTab(i)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg ${
                                tab === i ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }`}>
                            {t.label}
                            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-slate-800 text-slate-400">{t.count}</span>
                        </button>
                    ))}
                </div>
                {tab === 0 && groups.suggested.some((r) => r.matched_invoice_id) && (
                    <button onClick={confirmAllSuggested} disabled={busy}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                        <CheckCircle2 className="w-4 h-4" /> Confirm all suggested
                    </button>
                )}
                {tab === 1 && groups.unmatched.length > 0 && (
                    <button onClick={() => reconcile(groups.unmatched.map((r) => ({ row_id: r.id, action: 'confirm' as const, to_suspense: true })))}
                        disabled={busy}
                        title="Post every unmatched row against the Bank Suspense ledger"
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-amber-500/30">
                        <BookText className="w-4 h-4" /> Assign all → Suspense ({groups.unmatched.length})
                    </button>
                )}
            </div>

            <DataTable data={active.rows} columns={active.columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter rows..." emptyMessage="Nothing here" exportable={false} />

            {manualRow && (
                <ManualMatchModal
                    row={manualRow}
                    onClose={() => setManualRow(null)}
                    onSubmit={(partial) => {
                        reconcile([{ row_id: manualRow.id, action: 'manual', ...partial }]);
                        setManualRow(null);
                    }}
                />
            )}
        </div>
    );
}

// ── Manual match: pick an issued invoice for a row ───────────────────────────

function ManualMatchModal({
    row, onClose, onSubmit,
}: {
    row: StatementRow;
    onClose: () => void;
    onSubmit: (partial: { invoice_id?: number; ledger_id?: number }) => void;
}) {
    // Credit rows can match an invoice OR a ledger; debit (money-out) rows can
    // only go to a ledger (expense/vendor), so default them to the ledger tab.
    const isCredit = row.direction === DIRECTION.CREDIT;
    const [mode, setMode] = useState<'invoice' | 'ledger'>(isCredit ? 'invoice' : 'ledger');
    const [search, setSearch] = useState('');
    const [applied, setApplied] = useState('');
    const [ledger, setLedger] = useState<LedgerPickerValue | null>(null);
    const { data, isLoading } = useInvoices(applied ? { status: 'issued', q: applied } : { status: 'issued' });
    const invoices = data?.data || [];

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
                    {isCredit && (
                        <button onClick={() => setMode('invoice')}
                            className={`px-4 py-1.5 text-sm rounded-lg ${mode === 'invoice' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400'}`}>
                            Match invoice
                        </button>
                    )}
                    <button onClick={() => setMode('ledger')}
                        className={`px-4 py-1.5 text-sm rounded-lg ${mode === 'ledger' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400'}`}>
                        Assign to ledger
                    </button>
                </div>

                {mode === 'invoice' ? (
                    <>
                        <form onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }} className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search invoice # / customer…"
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
                            ) : (
                                invoices.map((inv) => (
                                    <button key={inv.id} onClick={() => onSubmit({ invoice_id: inv.id })}
                                        className="w-full flex items-center justify-between gap-3 bg-slate-800/40 hover:bg-slate-700/50 rounded-xl px-4 py-3 text-left">
                                        <div>
                                            <div className="text-sm text-white">{inv.invoice_number}</div>
                                            <div className="text-xs text-slate-400">{inv.customer_name || '—'} · {formatDate(inv.invoice_date)}</div>
                                        </div>
                                        <div className="text-sm font-medium text-white">{formatINR(inv.total_amount)}</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400">
                            Posts a voucher {isCredit ? '(Dr Bank / Cr ledger)' : '(Dr ledger / Cr Bank)'} against the chosen ledger.
                            Pick an income/expense/vendor ledger, or use the Suspense quick-action to park it.
                        </p>
                        <LedgerPicker value={ledger?.id ?? null} onChange={setLedger} placeholder="Select a ledger…" />
                        <div className="flex justify-end">
                            <button onClick={() => ledger && onSubmit({ ledger_id: ledger.id })} disabled={!ledger}
                                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                                <CheckCircle2 className="w-4 h-4" /> Assign &amp; post
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ── Bank-account management (name → GL ledger mapping) ───────────────────────

function BankAccountsModal({ onClose }: { onClose: () => void }) {
    const queryClient = useQueryClient();
    const { data: accounts = [] } = useBankAccounts();
    const [name, setName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ledger, setLedger] = useState<LedgerPickerValue | null>(null);
    const [saving, setSaving] = useState(false);

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-accounts'] });

    const create = async () => {
        if (!name.trim()) { toast.error('Name is required'); return; }
        setSaving(true);
        try {
            await POST('/accounting/bank/accounts', {
                name: name.trim(),
                account_number: accountNumber.trim() || null,
                ledger_account_id: ledger?.id ?? null,
            });
            toast.success('Bank account added');
            setName(''); setAccountNumber(''); setLedger(null);
            refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to add');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Bank accounts" size="lg">
            <div className="space-y-4">
                <p className="text-xs text-slate-400">
                    Map each bank account to its GL ledger. When you reconcile a statement uploaded against this
                    account, that ledger is the bank leg of every posted voucher.
                </p>

                <div className="space-y-2">
                    {accounts.length === 0 ? (
                        <p className="text-sm text-slate-500">No bank accounts yet.</p>
                    ) : accounts.map((b) => (
                        <div key={b.id} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2 text-sm">
                            <div>
                                <span className="text-white">{b.name}</span>
                                {b.account_number && <span className="text-slate-500 text-xs"> · {b.account_number}</span>}
                            </div>
                            <span className={b.ledger_name ? 'text-xs text-amber-300' : 'text-xs text-red-400'}>
                                {b.ledger_name || 'no ledger mapped'}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="border-t border-slate-700/50 pt-4 space-y-3">
                    <p className="text-sm font-medium text-slate-300">Add a bank account</p>
                    <div className="grid grid-cols-2 gap-3">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. HDFC Current)"
                            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm" />
                        <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number (optional)"
                            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm" />
                    </div>
                    <LedgerPicker value={ledger?.id ?? null} onChange={setLedger}
                        filter={(l) => /bank|cash/i.test(l.group_name || '')} placeholder="Map to bank ledger…" />
                    <div className="flex justify-end">
                        <button onClick={create} disabled={saving}
                            className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                            <Plus className="w-4 h-4" /> Add account
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
