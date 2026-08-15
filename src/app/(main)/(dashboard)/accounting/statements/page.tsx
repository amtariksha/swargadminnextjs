'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, POST } from '@/lib/api';
import DataTable, { Column } from '@/components/DataTable';
import Modal from '@/components/Modal';
import CustomerPicker, { type CustomerValue } from '@/components/CustomerPicker';
import { formatINR } from '@/lib/accounting';
import { formatApiDate } from '@/lib/dateUtils';
import { FileDown, RefreshCw, Send, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const inputCls =
    'w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50';

interface StatementRow {
    id: number;
    user_id: number;
    customer_name: string;
    legal_name?: string | null;
    customer_phone?: string | null;
    period_from: string;
    period_to: string;
    opening_balance: number | string;
    total_debit: number | string;
    total_credit: number | string;
    closing_balance: number | string;
    entry_count: number;
    status: 'draft' | 'sent';
    pdf_r2_key?: string | null;
    sent_at?: string | null;
}

interface StatementDetail {
    statement: StatementRow & { pdf_url?: string | null; gstin?: string | null };
    live: {
        opening: number; closing: number; totalDebit: number; totalCredit: number;
        entries: {
            id: number; entry_date: string; type_label: string; debit: number | string;
            credit: number | string; balance_after: number | string;
            invoice_number?: string | null; receipt_reference?: string | null; note?: string | null;
        }[];
    };
}

const TABS = [
    { key: 'draft', label: 'To verify' },
    { key: 'sent', label: 'Sent' },
    { key: 'all', label: 'All' },
];

const statusBadge = (s: string) =>
    s === 'sent' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400';

/**
 * Weekly B2B ledger statements.
 *
 * The Sunday cron GENERATES; a human verifies and sends. This page is that
 * middle step — hence "To verify" as the default tab, and a preview that shows
 * the LIVE ledger next to the snapshotted figures so a divergence (a back-dated
 * receipt, a corrected invoice) is visible before anything goes out.
 */
export default function StatementsPage() {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState('draft');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [genOpen, setGenOpen] = useState(false);
    const [genUser, setGenUser] = useState<CustomerValue | null>(null);
    const [genFrom, setGenFrom] = useState('');
    const [genTo, setGenTo] = useState('');

    const { data: rows = [], isLoading } = useQuery({
        queryKey: ['accounting', 'statements', tab],
        queryFn: async () =>
            (await GET<StatementRow[]>('/accounting/statements', tab === 'all' ? undefined : { status: tab })).data || [],
    });

    const { data: detail } = useQuery({
        queryKey: ['accounting', 'statement', selectedId],
        queryFn: async () => (await GET<StatementDetail>(`/accounting/statements/${selectedId}`)).data,
        enabled: selectedId != null,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['accounting', 'statements'] });
        queryClient.invalidateQueries({ queryKey: ['accounting', 'statement', selectedId] });
    };

    const generate = useMutation({
        mutationFn: async () => POST('/accounting/statements/generate', {
            user_id: genUser?.userId,
            period_from: genFrom || undefined,
            period_to: genTo || undefined,
        }),
        onSuccess: (res) => { toast.success(res?.message || 'Statement generated'); setGenOpen(false); invalidate(); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not generate'),
    });

    const regenerate = useMutation({
        mutationFn: async (id: number) => POST(`/accounting/statements/${id}/regenerate`, {}),
        onSuccess: (res) => { toast.success(res?.message || 'Regenerated'); invalidate(); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not regenerate'),
    });

    const send = useMutation({
        mutationFn: async ({ id, force }: { id: number; force?: boolean }) =>
            POST(`/accounting/statements/${id}/send`, force ? { force: true } : {}),
        onSuccess: (res) => { toast.success(res?.message || 'Statement sent'); invalidate(); },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not send'),
    });

    const columns: Column<StatementRow>[] = [
        {
            key: 'customer_name', header: 'Shop',
            render: (r) => (
                <button onClick={() => setSelectedId(r.id)} className="text-left text-purple-300 hover:text-purple-200">
                    {r.legal_name || r.customer_name}
                </button>
            ),
        },
        {
            key: 'period_to', header: 'Week', width: '190px',
            render: (r) => (
                <span className="text-slate-300">
                    {formatApiDate(r.period_from, 'dd MMM')} – {formatApiDate(r.period_to, 'dd MMM yyyy')}
                </span>
            ),
        },
        {
            key: 'entry_count', header: 'Entries', width: '90px',
            render: (r) => <span className="text-slate-400">{r.entry_count}</span>,
        },
        {
            key: 'total_debit', header: 'Billed', width: '110px',
            render: (r) => <span className="text-slate-300">{formatINR(r.total_debit)}</span>,
        },
        {
            key: 'total_credit', header: 'Received', width: '110px',
            render: (r) => <span className="text-slate-300">{formatINR(r.total_credit)}</span>,
        },
        {
            key: 'closing_balance', header: 'Due', width: '120px',
            render: (r) => (
                <span className={Number(r.closing_balance) > 0 ? 'text-amber-400 font-medium' : 'text-slate-400'}>
                    {formatINR(r.closing_balance)}
                </span>
            ),
        },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (r) => <span className={`text-xs px-2 py-1 rounded-lg ${statusBadge(r.status)}`}>{r.status}</span>,
        },
        {
            key: 'actions', header: '', width: '150px', sortable: false,
            render: (r) => (
                <div className="flex items-center gap-1">
                    <button onClick={() => regenerate.mutate(r.id)} disabled={regenerate.isPending}
                        title="Recompute from the ledger and re-render the PDF"
                        className="p-2 hover:bg-slate-800/50 rounded-lg disabled:opacity-50">
                        <RefreshCw className="w-4 h-4 text-cyan-400" />
                    </button>
                    <button
                        onClick={() => {
                            if (r.status === 'sent' && !confirm('Already sent. Send it again?')) return;
                            send.mutate({ id: r.id, force: r.status === 'sent' });
                        }}
                        disabled={send.isPending || !r.customer_phone}
                        title={r.customer_phone
                            ? 'WhatsApp the PDF to the shop — then forward it into the group'
                            : 'That shop has no phone number'}
                        className="p-2 hover:bg-slate-800/50 rounded-lg disabled:opacity-30">
                        <Send className="w-4 h-4 text-emerald-400" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Ledger Statements</h1>
                    <p className="text-slate-400">
                        Weekly B2B statements. Generated automatically on the configured day — check the figures,
                        then send. WhatsApp has no group API, so it goes to the shop&apos;s own number for you to forward.
                    </p>
                </div>
                <button onClick={() => { setGenUser(null); setGenFrom(''); setGenTo(''); setGenOpen(true); }}
                    className="self-start flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium">
                    <Plus className="w-5 h-5" /> Generate
                </button>
            </div>

            <div className="flex gap-2">
                {TABS.map((t) => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === t.key
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : 'bg-slate-800/40 text-slate-400 border border-slate-700/50'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <DataTable data={rows} columns={columns} loading={isLoading} pageSize={50}
                searchPlaceholder="Search statements..." getRowId={(r) => r.id}
                emptyMessage="No statements yet — generate one, or wait for the weekly job." />

            <Modal isOpen={genOpen} onClose={() => setGenOpen(false)} title="Generate a statement" size="lg">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Shop *</label>
                        <CustomerPicker value={genUser} onChange={setGenUser} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">From</label>
                            <input type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">To</label>
                            <input type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Leave the dates blank for the most recently completed week.
                    </p>
                    <button onClick={() => generate.mutate()} disabled={!genUser?.userId || generate.isPending}
                        className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
                        {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Generate
                    </button>
                </div>
            </Modal>

            <Modal isOpen={selectedId != null} onClose={() => setSelectedId(null)} title="Statement" size="xl">
                {!detail ? <p className="text-slate-400 text-sm">Loading…</p> : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-white font-medium">
                                    {detail.statement.legal_name || detail.statement.customer_name}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {formatApiDate(detail.statement.period_from, 'dd MMM yyyy')} –
                                    {' '}{formatApiDate(detail.statement.period_to, 'dd MMM yyyy')}
                                    {detail.statement.gstin ? ` · ${detail.statement.gstin}` : ''}
                                </p>
                            </div>
                            {detail.statement.pdf_url && (
                                <a href={detail.statement.pdf_url} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 text-slate-300 rounded-lg text-sm">
                                    <FileDown className="w-4 h-4" /> PDF
                                </a>
                            )}
                        </div>

                        {/* Snapshot vs live. They agree unless the ledger moved after
                            generation — which is exactly what verification is for. */}
                        {Math.round(Number(detail.statement.closing_balance) * 100)
                            !== Math.round(Number(detail.live.closing) * 100) && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                                The ledger has moved since this statement was generated
                                (now {formatINR(detail.live.closing)} vs {formatINR(detail.statement.closing_balance)}).
                                Regenerate before sending.
                            </div>
                        )}

                        <div className="grid grid-cols-4 gap-3 text-sm">
                            {([
                                ['Opening', detail.live.opening],
                                ['Billed', detail.live.totalDebit],
                                ['Received', detail.live.totalCredit],
                                ['Due', detail.live.closing],
                            ] as [string, number][]).map(([label, value]) => (
                                <div key={label} className="glass rounded-xl p-3">
                                    <p className="text-xs text-slate-500">{label}</p>
                                    <p className="text-white font-medium">{formatINR(value)}</p>
                                </div>
                            ))}
                        </div>

                        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-700/50">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-800/60 sticky top-0">
                                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                                        <th className="px-3 py-2">Date</th>
                                        <th className="px-3 py-2">Particulars</th>
                                        <th className="px-3 py-2 text-right">Debit</th>
                                        <th className="px-3 py-2 text-right">Credit</th>
                                        <th className="px-3 py-2 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detail.live.entries.map((e) => (
                                        <tr key={e.id} className="border-t border-slate-800/50 text-slate-300">
                                            <td className="px-3 py-1.5">{formatApiDate(e.entry_date, 'dd-MM-yyyy')}</td>
                                            <td className="px-3 py-1.5">
                                                {e.type_label}
                                                {e.invoice_number ? ` ${e.invoice_number}` : ''}
                                                {e.receipt_reference ? ` · ${e.receipt_reference}` : ''}
                                            </td>
                                            <td className="px-3 py-1.5 text-right">{Number(e.debit) ? formatINR(e.debit) : ''}</td>
                                            <td className="px-3 py-1.5 text-right">{Number(e.credit) ? formatINR(e.credit) : ''}</td>
                                            <td className="px-3 py-1.5 text-right">{formatINR(e.balance_after)}</td>
                                        </tr>
                                    ))}
                                    {!detail.live.entries.length && (
                                        <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No transactions in this period.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={() => regenerate.mutate(detail.statement.id)} disabled={regenerate.isPending}
                                className="px-4 py-2 bg-slate-800/60 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50">
                                <RefreshCw className="w-4 h-4" /> Regenerate
                            </button>
                            <button
                                onClick={() => {
                                    if (detail.statement.status === 'sent' && !confirm('Already sent. Send it again?')) return;
                                    send.mutate({ id: detail.statement.id, force: detail.statement.status === 'sent' });
                                }}
                                disabled={send.isPending || !detail.statement.customer_phone}
                                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50">
                                <Send className="w-4 h-4" /> Send to shop
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
