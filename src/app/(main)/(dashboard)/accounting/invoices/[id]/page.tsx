'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useInvoice, InvoiceLine } from '@/hooks/useAccounting';
import {
    INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, DOCUMENT_TYPE_LABELS, SUPPLY_TYPE_LABELS,
    formatINR, formatPercent, formatDate,
} from '@/lib/accounting';
import Modal from '@/components/Modal';
import IssueNotesModal from '@/components/accounting/IssueNotesModal';
import { ArrowLeft, FileDown, Ban, BookText, Loader2, FileMinus, FilePlus, Pencil } from 'lucide-react';
import { GET, POST } from '@/lib/api';
import { toast } from 'sonner';

export default function InvoiceDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = Number(params.id);
    const { data, isLoading, refetch } = useInvoice(Number.isFinite(id) ? id : null);

    const [pdfLoading, setPdfLoading] = useState(false);
    const [showCancel, setShowCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const [noteType, setNoteType] = useState<'credit' | 'debit' | null>(null);
    const [repricing, setRepricing] = useState(false);
    const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
    const [reprcSaving, setReprcSaving] = useState(false);

    const inv = data?.invoice;
    const lines = data?.lines || [];

    const startReprice = () => {
        const init: Record<number, string> = {};
        lines.forEach((l) => { if (l.product_id != null) init[Number(l.product_id)] = String(l.unit_price ?? ''); });
        setPriceEdits(init);
        setRepricing(true);
    };

    const saveReprice = async () => {
        if (!inv) return;
        const editLines = lines
            .filter((l) => l.product_id != null)
            .map((l) => ({ product_id: Number(l.product_id), unit_price: Number(priceEdits[Number(l.product_id)]) }))
            .filter((x) => Number.isFinite(x.unit_price) && x.unit_price > 0);
        if (!editLines.length) { toast.error('Enter at least one valid price'); return; }
        setReprcSaving(true);
        try {
            const res = await POST(`/accounting/invoices/${inv.id}/reprice`, { lines: editLines });
            const d = (res as { data?: { newInvoiceId?: number; newInvoiceNumber?: string } })?.data;
            toast.success(`Saved as customer price · reissued ${d?.newInvoiceNumber ?? 'new invoice'}`);
            setRepricing(false);
            if (d?.newInvoiceId) router.push(`/accounting/invoices/${d.newInvoiceId}`);
            else refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to reprice');
        } finally {
            setReprcSaving(false);
        }
    };

    const openPdf = async () => {
        if (!inv) return;
        setPdfLoading(true);
        try {
            const res = await GET<{ url: string; key: string }>(`/accounting/invoices/${inv.id}/pdf`);
            if (res.data?.url) window.open(res.data.url, '_blank', 'noopener');
            else toast.error('PDF unavailable');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'PDF unavailable');
        } finally {
            setPdfLoading(false);
        }
    };

    const confirmCancel = async () => {
        if (!inv) return;
        setCancelling(true);
        try {
            await POST(`/accounting/invoices/${inv.id}/cancel`, { reason: cancelReason.trim() || null });
            toast.success('Invoice cancelled');
            setShowCancel(false);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to cancel');
        } finally {
            setCancelling(false);
        }
    };

    if (isLoading) {
        return <div className="text-slate-400 text-sm py-12 text-center">Loading invoice…</div>;
    }
    if (!inv) {
        return (
            <div className="space-y-4">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <div className="glass rounded-2xl p-8 text-center text-slate-400">Invoice not found.</div>
            </div>
        );
    }

    const totalTax = Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount);
    const isCancelled = Number(inv.status) === 2;
    // Credit/Debit notes apply only to real B2B tax invoices (not the B2C
    // consolidated document, document_type 3) that are still issued.
    const canIssueNote = Number(inv.document_type) !== 3 && Number(inv.status) === 1;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.back()} className="p-2 hover:bg-slate-800/50 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-white">{inv.invoice_number}</h1>
                            <span className={`text-xs px-2 py-1 rounded-lg ${INVOICE_STATUS_BADGE[Number(inv.status)] || 'bg-slate-700/50 text-slate-400'}`}>
                                {INVOICE_STATUS_LABELS[Number(inv.status)] || '—'}
                            </span>
                        </div>
                        <p className="text-slate-400 text-sm">
                            {DOCUMENT_TYPE_LABELS[Number(inv.document_type)] || '—'} · {formatDate(inv.invoice_date)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/accounting/ledgers?user=${inv.user_id}`}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-cyan-400 rounded-xl text-sm hover:bg-slate-700/50">
                        <BookText className="w-4 h-4" /> Ledger
                    </Link>
                    <button onClick={openPdf} disabled={pdfLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm hover:bg-slate-700/50 disabled:opacity-50">
                        {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
                    </button>
                    {canIssueNote && (
                        <>
                            <button onClick={() => setNoteType('credit')}
                                className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl text-sm hover:bg-amber-500/30">
                                <FileMinus className="w-4 h-4" /> Issue Credit Note
                            </button>
                            <button onClick={() => setNoteType('debit')}
                                className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-xl text-sm hover:bg-cyan-500/30">
                                <FilePlus className="w-4 h-4" /> Issue Debit Note
                            </button>
                        </>
                    )}
                    {canIssueNote && !repricing && (
                        <button onClick={startReprice}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm hover:bg-emerald-500/30">
                            <Pencil className="w-4 h-4" /> Reprice
                        </button>
                    )}
                    {!isCancelled && (
                        <button onClick={() => setShowCancel(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-sm hover:bg-red-500/30">
                            <Ban className="w-4 h-4" /> Cancel
                        </button>
                    )}
                </div>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Supplier</h2>
                    <Field label="GSTIN" value={inv.supplier_gstin} />
                    <Field label="State code" value={inv.supplier_state_code} />
                </div>
                <div className="glass rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Customer</h2>
                    <Field label="Name" value={inv.customer_name} />
                    <Field label="Phone" value={inv.customer_phone} />
                    <Field label="GSTIN" value={inv.customer_gstin} />
                    <Field label="Place of supply" value={inv.place_of_supply_state_code} />
                    {inv.supply_type != null && (
                        <Field label="Supply type" value={SUPPLY_TYPE_LABELS[Number(inv.supply_type)]} />
                    )}
                </div>
            </div>

            {/* Line items */}
            <div className="glass rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800/50">
                    <h2 className="text-lg font-semibold text-white">Line items</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800/50 text-xs text-slate-400 uppercase tracking-wider">
                                <th className="px-4 py-3 text-left">Description</th>
                                <th className="px-4 py-3 text-left">HSN</th>
                                <th className="px-4 py-3 text-right">Qty</th>
                                <th className="px-4 py-3 text-right">Rate</th>
                                <th className="px-4 py-3 text-right">Taxable</th>
                                <th className="px-4 py-3 text-right">GST%</th>
                                <th className="px-4 py-3 text-right">CGST</th>
                                <th className="px-4 py-3 text-right">SGST</th>
                                <th className="px-4 py-3 text-right">IGST</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {lines.map((l: InvoiceLine, idx) => (
                                <tr key={idx} className="text-slate-300">
                                    <td className="px-4 py-3">{l.description || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-3 text-slate-400">{l.hsn_code || '—'}</td>
                                    <td className="px-4 py-3 text-right">{Number(l.qty)}</td>
                                    <td className="px-4 py-3 text-right">
                                        {repricing && l.product_id != null ? (
                                            <input type="number" step="0.01"
                                                value={priceEdits[Number(l.product_id)] ?? ''}
                                                onChange={(e) => setPriceEdits((p) => ({ ...p, [Number(l.product_id)]: e.target.value }))}
                                                className="w-24 px-2 py-1 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                                        ) : formatINR(l.unit_price)}
                                    </td>
                                    <td className="px-4 py-3 text-right">{formatINR(l.taxable_amount)}</td>
                                    <td className="px-4 py-3 text-right">{formatPercent(l.gst_rate)}</td>
                                    <td className="px-4 py-3 text-right">{formatINR(l.cgst_amount)}</td>
                                    <td className="px-4 py-3 text-right">{formatINR(l.sgst_amount)}</td>
                                    <td className="px-4 py-3 text-right">{formatINR(l.igst_amount)}</td>
                                </tr>
                            ))}
                            {lines.length === 0 && (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No line items.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {repricing && (
                <div className="glass rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs text-slate-400 max-w-xl">
                        Editing prices saves them as this customer&apos;s agreed price (future bills use it) and reissues a corrected GST invoice — the current one is cancelled with a reversing ledger entry.
                    </p>
                    <div className="flex gap-2">
                        <button onClick={() => setRepricing(false)}
                            className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Cancel</button>
                        <button onClick={saveReprice} disabled={reprcSaving}
                            className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                            {reprcSaving ? 'Reissuing…' : 'Save & reissue'}
                        </button>
                    </div>
                </div>
            )}

            {/* Totals */}
            <div className="flex justify-end">
                <div className="glass rounded-2xl p-5 w-full md:w-80 space-y-2">
                    <Row label="Taxable value" value={formatINR(inv.taxable_value)} />
                    {Number(inv.cgst_amount) > 0 && <Row label="CGST" value={formatINR(inv.cgst_amount)} />}
                    {Number(inv.sgst_amount) > 0 && <Row label="SGST" value={formatINR(inv.sgst_amount)} />}
                    {Number(inv.igst_amount) > 0 && <Row label="IGST" value={formatINR(inv.igst_amount)} />}
                    {totalTax > 0 && Number(inv.igst_amount) === 0 && <Row label="Total tax" value={formatINR(totalTax)} />}
                    {Number(inv.round_off) !== 0 && <Row label="Round off" value={formatINR(inv.round_off)} />}
                    <div className="border-t border-slate-700/50 pt-2 flex justify-between items-center">
                        <span className="font-semibold text-white">Total</span>
                        <span className="text-xl font-bold text-white">{formatINR(inv.total_amount)}</span>
                    </div>
                </div>
            </div>

            {noteType && (
                <IssueNotesModal
                    isOpen={noteType !== null}
                    onClose={() => setNoteType(null)}
                    invoiceId={inv.id}
                    invoiceNumber={inv.invoice_number}
                    noteType={noteType}
                    lines={lines}
                    onIssued={refetch}
                />
            )}

            <Modal isOpen={showCancel} onClose={() => setShowCancel(false)} title="Cancel invoice" size="md">
                <div className="space-y-4">
                    <p className="text-sm text-slate-400">
                        Cancelling keeps the invoice number (it is never reused) and posts a reversing ledger entry.
                        This cannot be undone.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Reason (optional)</label>
                        <textarea value={cancelReason} rows={2}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => setShowCancel(false)}
                            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl text-sm">Keep invoice</button>
                        <button onClick={confirmCancel} disabled={cancelling}
                            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50 text-sm">
                            {cancelling ? 'Cancelling…' : 'Cancel invoice'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex justify-between py-1 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-200">{value || '—'}</span>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-sm">
            <span className="text-slate-400">{label}</span>
            <span className="text-slate-200">{value}</span>
        </div>
    );
}
