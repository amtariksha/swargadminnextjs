'use client';

/**
 * Shops Billing — monthly B2B roster (delivered value → invoice → collection)
 * plus the payment-deviations queue (short payments awaiting accept/credit-note).
 *
 * Data: GET /accounting/shops?month=YYYY-MM + GET /accounting/deviations —
 * hooks in @/hooks/useAccounting, typed API functions in @/lib/accounting.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    useShopsBilling, usePaymentDeviations, useGenerateShopInvoice,
    useSendPaymentLink, useSyncInvoicePayment, useSendInvoiceReminder, useResolveDeviation,
} from '@/hooks/useAccounting';
import {
    ShopBillingRow, ShopAgeing, PaymentDeviation, DeviationAction,
    SHOP_INVOICE_STATUS_BADGE, ShopInvoiceStatus,
    formatINR, formatDate, currentPeriod, daysSince,
} from '@/lib/accounting';
import DataTable, { Column } from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import {
    Store, FilePlus2, FileText, Link2, RefreshCw, BellRing, BookText, AlertTriangle,
} from 'lucide-react';

const SHOP_STATUS_LABELS: Record<ShopInvoiceStatus, string> = {
    issued: 'Issued',
    partial: 'Partial',
    paid: 'Paid',
};

/** Non-zero overdue ageing buckets as amber→red chips (current bucket stays unchipped). */
function AgeingChips({ ageing }: { ageing: ShopAgeing | null | undefined }) {
    const buckets = [
        { label: '31-60', value: Number(ageing?.d31_60) || 0, cls: 'bg-amber-500/20 text-amber-300' },
        { label: '61-90', value: Number(ageing?.d61_90) || 0, cls: 'bg-orange-500/20 text-orange-300' },
        { label: '90+', value: Number(ageing?.d90_plus) || 0, cls: 'bg-red-500/20 text-red-400' },
    ].filter((b) => b.value > 0);
    if (buckets.length === 0) return null;
    return (
        <div className="flex gap-1 flex-wrap mt-1">
            {buckets.map((b) => (
                <span key={b.label} className={`text-[10px] px-1.5 py-0.5 rounded-md ${b.cls}`}
                    title={`Outstanding ${b.label} days old`}>
                    {b.label}: {formatINR(b.value)}
                </span>
            ))}
        </div>
    );
}

/** Row-action confirmation being shown (null = none). */
type PendingAction =
    | { kind: 'generate'; row: ShopBillingRow }
    | { kind: 'payment_link'; row: ShopBillingRow }
    | { kind: 'reminder'; row: ShopBillingRow }
    | { kind: 'deviation'; deviation: PaymentDeviation; action: DeviationAction };

const shopDisplayName = (row: ShopBillingRow) => row.shop_name || row.name;

export default function ShopsBillingPage() {
    const [month, setMonth] = useState(currentPeriod());
    const [tab, setTab] = useState<'roster' | 'deviations'>('roster');
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [deviationNotes, setDeviationNotes] = useState('');

    const { data, isLoading } = useShopsBilling(month);
    const { data: deviations, isLoading: isLoadingDeviations } = usePaymentDeviations('pending');

    const generateInvoice = useGenerateShopInvoice();
    const sendPaymentLink = useSendPaymentLink();
    const syncPayment = useSyncInvoicePayment();
    const sendReminder = useSendInvoiceReminder();
    const resolveDeviationMut = useResolveDeviation();

    const shops = useMemo(() => data?.shops || [], [data]);
    const summary = data?.summary;

    // Badge: prefer the live deviations fetch; fall back to the roster's counts
    // so the number shows even before the deviations query resolves.
    const pendingDeviationCount = deviations != null
        ? deviations.length
        : shops.reduce((sum, s) => sum + (Number(s.pending_deviations) || 0), 0);

    const actionBusy =
        generateInvoice.isPending || sendPaymentLink.isPending ||
        syncPayment.isPending || sendReminder.isPending || resolveDeviationMut.isPending;

    // ── Action handlers (fire on ConfirmDialog confirm) ─────────────────────

    const runGenerate = (row: ShopBillingRow) => {
        if (!data) return;
        generateInvoice.mutate(
            { userId: row.user_id, from: data.from, to: data.to },
            {
                onSuccess: (result) => {
                    setPending(null);
                    if (result?.nothing_to_bill) {
                        toast.info(`Nothing to bill for ${shopDisplayName(row)} in ${month}`);
                    } else {
                        toast.success(`Invoice ${result?.invoice_number || ''} generated — ${formatINR(result?.total_amount)}`);
                    }
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to generate invoice'),
            },
        );
    };

    const runPaymentLink = (row: ShopBillingRow) => {
        if (!row.invoice) return;
        sendPaymentLink.mutate(row.invoice.id, {
            onSuccess: (result) => {
                setPending(null);
                if (result?.whatsapp?.sent) {
                    toast.success(`Payment link sent on WhatsApp — ${formatINR(result.outstanding)} due`);
                } else {
                    const reason = result?.whatsapp?.skipped || result?.whatsapp?.error || 'unknown reason';
                    toast.error(`Link created (${formatINR(result?.outstanding)} due) but WhatsApp NOT sent: ${reason}`);
                }
            },
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create payment link'),
        });
    };

    const runSyncPayment = (row: ShopBillingRow) => {
        if (!row.invoice) return;
        syncPayment.mutate(row.invoice.id, {
            onSuccess: (result) => {
                toast.success(
                    `${row.invoice?.invoice_number}: ${result?.status || 'checked'} — paid ${formatINR(result?.amount_paid)}` +
                    (result?.receipt_id ? ` · receipt #${result.receipt_id}` : ''),
                );
            },
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to check payment'),
        });
    };

    const runReminder = (row: ShopBillingRow) => {
        if (!row.invoice) return;
        sendReminder.mutate(row.invoice.id, {
            onSuccess: () => {
                setPending(null);
                toast.success(`Reminder sent for ${row.invoice?.invoice_number}`);
            },
            onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to send reminder'),
        });
    };

    const runDeviation = (deviation: PaymentDeviation, action: DeviationAction) => {
        resolveDeviationMut.mutate(
            { id: deviation.id, action, notes: deviationNotes || undefined },
            {
                onSuccess: () => {
                    setPending(null);
                    setDeviationNotes('');
                    toast.success(action === 'accept'
                        ? `Shortfall accepted for ${deviation.invoice_number}`
                        : `Credit note issued for ${deviation.invoice_number}`);
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update deviation'),
            },
        );
    };

    const confirmPending = () => {
        if (!pending) return;
        if (pending.kind === 'generate') runGenerate(pending.row);
        else if (pending.kind === 'payment_link') runPaymentLink(pending.row);
        else if (pending.kind === 'reminder') runReminder(pending.row);
        else runDeviation(pending.deviation, pending.action);
    };

    const pendingDialog = useMemo(() => {
        if (!pending) return null;
        if (pending.kind === 'generate') {
            return {
                title: 'Generate invoice',
                message: `Generate the ${month} invoice for ${shopDisplayName(pending.row)} (deliveries ${data?.from || '?'} → ${data?.to || '?'}, ${formatINR(pending.row.delivered_value)})?`,
                confirmText: 'Generate',
            };
        }
        if (pending.kind === 'payment_link') {
            return {
                title: 'Send payment link',
                message: `Create a Razorpay payment link for ${pending.row.invoice?.invoice_number} (${formatINR(pending.row.invoice?.outstanding)} outstanding) and send it to ${shopDisplayName(pending.row)} on WhatsApp?`,
                confirmText: 'Send link',
            };
        }
        if (pending.kind === 'reminder') {
            return {
                title: 'Send reminder',
                message: `Send a payment reminder for ${pending.row.invoice?.invoice_number} to ${shopDisplayName(pending.row)}?`,
                confirmText: 'Send reminder',
            };
        }
        return {
            title: pending.action === 'accept' ? 'Accept shortfall' : 'Issue credit note',
            message: pending.action === 'accept'
                ? `Accept the ${formatINR(pending.deviation.shortfall)} shortfall on ${pending.deviation.invoice_number} (${pending.deviation.shop_name}) as fully settled?`
                : `Issue a credit note for the ${formatINR(pending.deviation.shortfall)} shortfall on ${pending.deviation.invoice_number} (${pending.deviation.shop_name})?`,
            confirmText: pending.action === 'accept' ? 'Accept' : 'Credit note',
        };
    }, [pending, month, data]);

    // ── Roster columns ──────────────────────────────────────────────────────

    const rosterColumns: Column<ShopBillingRow>[] = [
        {
            key: 'shop_name', header: 'Shop',
            render: (row) => (
                <div>
                    <div className="font-medium text-white">{shopDisplayName(row)}</div>
                    <div className="text-xs text-slate-500">
                        {row.phone || '—'}
                        {row.billing_cycle && <span className="ml-2 text-slate-600">· {row.billing_cycle}</span>}
                    </div>
                </div>
            ),
        },
        {
            key: 'delivered_value', header: 'Delivered', width: '150px',
            render: (row) => (
                <span className="text-slate-300">
                    {Number(row.delivered_qty) || 0} · {formatINR(row.delivered_value)}
                </span>
            ),
        },
        {
            key: 'invoice', header: 'Invoice', width: '190px', sortable: false,
            render: (row) => row.invoice ? (
                <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/accounting/invoices/${row.invoice.id}`} className="text-purple-300 hover:text-purple-200 text-sm">
                        {row.invoice.invoice_number}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded-lg ${SHOP_INVOICE_STATUS_BADGE[row.invoice.status] || 'bg-slate-700/50 text-slate-400'}`}>
                        {SHOP_STATUS_LABELS[row.invoice.status] || row.invoice.status}
                    </span>
                </div>
            ) : (
                <button onClick={() => setPending({ kind: 'generate', row })} disabled={actionBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium hover:bg-purple-500/30 disabled:opacity-50">
                    <FilePlus2 className="w-3.5 h-3.5" /> Generate
                </button>
            ),
        },
        {
            key: 'outstanding_total', header: 'Outstanding', width: '160px',
            render: (row) => (
                <div>
                    <span className={Number(row.outstanding_total) > 0 ? 'font-medium text-white' : 'text-slate-500'}>
                        {formatINR(row.outstanding_total)}
                    </span>
                    <AgeingChips ageing={row.ageing} />
                </div>
            ),
        },
        {
            key: 'pending_deviations', header: 'Deviations', width: '100px',
            render: (row) => Number(row.pending_deviations) > 0 ? (
                <button onClick={() => setTab('deviations')}
                    title="Open the deviations queue"
                    className="text-xs px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30">
                    {row.pending_deviations} pending
                </button>
            ) : (
                <span className="text-slate-600">—</span>
            ),
        },
        {
            key: 'last_receipt_at', header: 'Last payment', width: '120px',
            render: (row) => (
                <span className={row.last_receipt_at ? 'text-slate-300' : 'text-slate-600'}>
                    {formatDate(row.last_receipt_at)}
                </span>
            ),
        },
        {
            key: 'actions', header: 'Actions', width: '170px', sortable: false,
            render: (row) => (
                <div className="flex items-center gap-1">
                    {row.invoice ? (
                        <>
                            <Link href={`/accounting/invoices/${row.invoice.id}`} title="View invoice"
                                className="p-2 hover:bg-slate-800/50 rounded-lg">
                                <FileText className="w-4 h-4 text-slate-300" />
                            </Link>
                            <button onClick={() => setPending({ kind: 'payment_link', row })} disabled={actionBusy}
                                title="Send payment link on WhatsApp"
                                className="p-2 hover:bg-slate-800/50 rounded-lg disabled:opacity-50">
                                <Link2 className="w-4 h-4 text-blue-400" />
                            </button>
                            <button onClick={() => runSyncPayment(row)} disabled={actionBusy}
                                title="Check payment (sync from Razorpay)"
                                className="p-2 hover:bg-slate-800/50 rounded-lg disabled:opacity-50">
                                <RefreshCw className={`w-4 h-4 text-green-400 ${syncPayment.isPending ? 'animate-spin' : ''}`} />
                            </button>
                            <button onClick={() => setPending({ kind: 'reminder', row })} disabled={actionBusy}
                                title="Send payment reminder"
                                className="p-2 hover:bg-slate-800/50 rounded-lg disabled:opacity-50">
                                <BellRing className="w-4 h-4 text-amber-300" />
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setPending({ kind: 'generate', row })} disabled={actionBusy}
                            title={`Generate invoice for ${month}`}
                            className="p-2 hover:bg-slate-800/50 rounded-lg disabled:opacity-50">
                            <FilePlus2 className="w-4 h-4 text-purple-400" />
                        </button>
                    )}
                    <Link href={`/accounting/ledgers?user=${row.user_id}`} title="Customer ledger"
                        className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <BookText className="w-4 h-4 text-slate-400" />
                    </Link>
                </div>
            ),
        },
    ];

    // ── Deviations columns ──────────────────────────────────────────────────

    const deviationColumns: Column<PaymentDeviation>[] = [
        { key: 'shop_name', header: 'Shop', render: (d) => <span className="font-medium text-white">{d.shop_name}</span> },
        {
            key: 'invoice_number', header: 'Invoice', width: '170px',
            render: (d) => (
                <Link href={`/accounting/invoices/${d.invoice_id}`} className="text-purple-300 hover:text-purple-200">
                    {d.invoice_number}
                </Link>
            ),
        },
        { key: 'expected_amount', header: 'Expected', width: '120px', render: (d) => formatINR(d.expected_amount) },
        { key: 'received_amount', header: 'Received', width: '120px', render: (d) => formatINR(d.received_amount) },
        {
            key: 'shortfall', header: 'Shortfall', width: '120px',
            render: (d) => <span className="font-medium text-red-400">{formatINR(d.shortfall)}</span>,
        },
        {
            key: 'created_at', header: 'Age', width: '100px',
            render: (d) => {
                const days = daysSince(d.created_at);
                return <span className="text-slate-300" title={formatDate(d.created_at)}>{days != null ? `${days}d` : '—'}</span>;
            },
        },
        {
            key: 'actions', header: 'Actions', width: '210px', sortable: false,
            render: (d) => (
                <div className="flex items-center gap-2">
                    <button onClick={() => { setDeviationNotes(''); setPending({ kind: 'deviation', deviation: d, action: 'accept' }); }}
                        disabled={actionBusy}
                        className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/30 disabled:opacity-50">
                        Accept
                    </button>
                    <button onClick={() => { setDeviationNotes(''); setPending({ kind: 'deviation', deviation: d, action: 'credit_note' }); }}
                        disabled={actionBusy}
                        className="px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium hover:bg-amber-500/30 disabled:opacity-50">
                        Credit note
                    </button>
                </div>
            ),
        },
    ];

    const summaryCards = [
        { label: 'Billed', value: formatINR(summary?.billed_total), cls: 'text-white' },
        { label: 'Collected', value: formatINR(summary?.collected_total), cls: 'text-green-400' },
        { label: 'Outstanding', value: formatINR(summary?.outstanding_total), cls: 'text-amber-300' },
        { label: 'Overdue', value: formatINR(summary?.overdue_total), cls: 'text-red-400' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                        <Store className="w-6 h-6 text-purple-400" /> Shops Billing
                    </h1>
                    <p className="text-slate-400">B2B roster — delivered value, invoices, collections &amp; deviations</p>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Month</label>
                    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                        className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {summaryCards.map((c) => (
                    <div key={c.label} className="glass rounded-2xl p-4">
                        <div className="text-xs text-slate-400">{c.label}</div>
                        <div className={`text-xl font-bold mt-1 ${c.cls}`}>{c.value}</div>
                    </div>
                ))}
            </div>

            {/* Tab toggle */}
            <div className="flex items-center gap-2">
                <button onClick={() => setTab('roster')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        tab === 'roster'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                    }`}>
                    Roster ({summary?.shops ?? shops.length})
                </button>
                <button onClick={() => setTab('deviations')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                        tab === 'deviations'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50'
                    }`}>
                    <AlertTriangle className="w-4 h-4" /> Deviations
                    {pendingDeviationCount > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                            {pendingDeviationCount}
                        </span>
                    )}
                </button>
            </div>

            {tab === 'roster' ? (
                <DataTable data={shops} columns={rosterColumns} loading={isLoading} pageSize={50}
                    searchPlaceholder="Filter shops..."
                    emptyMessage={`No B2B shops with activity in ${month}`} />
            ) : (
                <DataTable data={deviations || []} columns={deviationColumns} loading={isLoadingDeviations} pageSize={50}
                    searchPlaceholder="Filter deviations..."
                    emptyMessage="No pending deviations" />
            )}

            {/* Confirmations (payment-link / generate / reminder / deviation) */}
            <ConfirmDialog
                isOpen={pending !== null}
                title={pendingDialog?.title || ''}
                message={pendingDialog?.message || ''}
                confirmText={pendingDialog?.confirmText}
                isLoading={actionBusy}
                onConfirm={confirmPending}
                onCancel={() => { setPending(null); setDeviationNotes(''); }}
            >
                {pending?.kind === 'deviation' && (
                    <div className="mt-3">
                        <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
                        <textarea value={deviationNotes} onChange={(e) => setDeviationNotes(e.target.value)} rows={2}
                            placeholder="Why is this being accepted / credited?"
                            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                )}
            </ConfirmDialog>
        </div>
    );
}
