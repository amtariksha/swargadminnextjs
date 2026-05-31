'use client';

import { useMemo, useRef, useState } from 'react';
import {
    useStatements, useStatementRows, useInvoices, StatementImport, StatementRow,
} from '@/hooks/useAccounting';
import {
    IMPORT_STATUS_BADGE, MATCH_STATUS_LABELS, MATCH_STATUS_BADGE, DIRECTION,
    formatINR, formatDate, formatDateTime,
} from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import { Upload, CheckCircle2, X, Link2, Loader2, Search } from 'lucide-react';
import { POST } from '@/lib/api';
import { toast } from 'sonner';

type ReconcileItem = { row_id: number; action: 'confirm' | 'manual' | 'ignore'; invoice_id?: number };

export default function BankReconciliationPage() {
    const { data: stmtData, isLoading: loadingStatements, refetch: refetchStatements } = useStatements();
    const statements = stmtData?.data || [];
    const [selectedImport, setSelectedImport] = useState<number | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const upload = async (file: File) => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
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
                <div className="flex items-center gap-4">
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
        key: 'matched', header: 'Suggested match',
        render: (r) => (
            r.matched_invoice_id ? (
                <div className="text-xs">
                    <div className="text-cyan-300">{r.matched_invoice_number} · {formatINR(r.matched_invoice_total)}</div>
                    <div className="text-slate-500">{r.matched_customer_name}{r.match_score != null ? ` · ${Math.round(Number(r.match_score))}% score` : ''}</div>
                    {r.match_reasons && r.match_reasons.length > 0 && (
                        <div className="text-slate-600">{r.match_reasons.join(', ')}</div>
                    )}
                </div>
            ) : <span className="text-xs text-slate-500">No suggestion</span>
        ),
    };

    const actionColumn = (showConfirm: boolean): Column<StatementRow> => ({
        key: 'actions', header: '', width: '210px', sortable: false,
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
            </div>

            <DataTable data={active.rows} columns={active.columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Filter rows..." emptyMessage="Nothing here" exportable={false} />

            {manualRow && (
                <ManualMatchModal
                    row={manualRow}
                    onClose={() => setManualRow(null)}
                    onMatch={(invoiceId) => {
                        reconcile([{ row_id: manualRow.id, action: 'manual', invoice_id: invoiceId }]);
                        setManualRow(null);
                    }}
                />
            )}
        </div>
    );
}

// ── Manual match: pick an issued invoice for a row ───────────────────────────

function ManualMatchModal({
    row, onClose, onMatch,
}: {
    row: StatementRow;
    onClose: () => void;
    onMatch: (invoiceId: number) => void;
}) {
    const [search, setSearch] = useState('');
    const [applied, setApplied] = useState('');
    const { data, isLoading } = useInvoices(applied ? { status: 'issued', q: applied } : { status: 'issued' });
    const invoices = data?.data || [];

    return (
        <Modal isOpen onClose={onClose} title="Match to invoice" size="lg">
            <div className="space-y-4">
                <div className="bg-slate-800/40 rounded-xl px-4 py-3 text-sm">
                    <div className="text-slate-400">Bank row</div>
                    <div className="text-white">{row.narration || '—'}</div>
                    <div className="text-green-400">{formatINR(row.amount)} · {formatDate(row.txn_date)}</div>
                </div>

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
                            <button key={inv.id} onClick={() => onMatch(inv.id)}
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
            </div>
        </Modal>
    );
}
