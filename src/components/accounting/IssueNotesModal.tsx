'use client';

/**
 * IssueNotesModal — raise a Credit or Debit Note against a B2B tax invoice.
 *
 * The operator picks an adjusted_qty per line (the returned / extra quantity;
 * 0 = exclude that line), gives a reason, and a note date. We preview the
 * taxable + tax impact client-side (proportional to the line's own rate) and
 * POST { note_type, items:[{invoice_line_item_id, adjusted_qty}], reason,
 * note_date } to /accounting/invoices/:id/issue-note. The backend posts the
 * credit_note / debit_note voucher + ledger entries and is the source of truth
 * for the final amounts; this preview is guidance only.
 *
 * Styling mirrors NewVoucherModal + the invoice detail line-items table.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { formatINR, formatPercent } from '@/lib/accounting';
import { useIssueNote, type InvoiceLine } from '@/hooks/useAccounting';

type NoteType = 'credit' | 'debit';

const NOTE_LABEL: Record<NoteType, string> = { credit: 'Credit Note', debit: 'Debit Note' };
const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);

interface Props {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: number;
    invoiceNumber: string;
    noteType: NoteType;
    lines: InvoiceLine[];
    /** Called after a note is successfully issued (e.g. to refetch the invoice). */
    onIssued?: () => void;
}

export default function IssueNotesModal({
    isOpen, onClose, invoiceId, invoiceNumber, noteType, lines, onIssued,
}: Props) {
    const issueNote = useIssueNote();
    const [noteDate, setNoteDate] = useState(today());
    const [reason, setReason] = useState('');
    // adjusted_qty keyed by row index (lines preserve backend order).
    const [qtys, setQtys] = useState<Record<number, string>>({});

    const reset = () => {
        setNoteDate(today());
        setReason('');
        setQtys({});
    };
    const close = () => { reset(); onClose(); };

    // Per-line preview: taxable = adjusted_qty × unit_price; tax at the line's
    // own gst_rate. Original qty is the ceiling — you can't adjust more than sold.
    const rows = useMemo(() => lines.map((l, i) => {
        const origQty = num(l.qty);
        const adjQty = round2(num(qtys[i]));
        const rate = num(l.unit_price);
        const gstRate = num(l.gst_rate);
        const taxable = round2(adjQty * rate);
        const tax = round2(taxable * (gstRate / 100));
        return { line: l, index: i, origQty, adjQty, taxable, tax };
    }), [lines, qtys]);

    const totals = useMemo(() => {
        const taxable = round2(rows.reduce((s, r) => s + r.taxable, 0));
        const tax = round2(rows.reduce((s, r) => s + r.tax, 0));
        return { taxable, tax, total: round2(taxable + tax) };
    }, [rows]);

    const overAdjusted = rows.some((r) => r.adjQty > r.origQty);

    const submit = async () => {
        const items = rows
            .filter((r) => r.adjQty > 0 && r.line.invoice_line_item_id != null)
            .map((r) => ({ invoice_line_item_id: r.line.invoice_line_item_id as number, adjusted_qty: r.adjQty }));

        if (!items.length) return toast.error('Set an adjusted quantity on at least one line');
        if (overAdjusted) return toast.error('Adjusted quantity cannot exceed the invoiced quantity');
        if (!reason.trim()) return toast.error('A reason is required');
        if (!noteDate) return toast.error('Pick a note date');

        try {
            await issueNote.mutateAsync({
                invoiceId,
                note_type: noteType,
                items,
                reason: reason.trim(),
                note_date: noteDate,
            });
            toast.success(`${NOTE_LABEL[noteType]} issued`, {
                action: { label: 'View notes', onClick: () => { window.location.href = '/accounting/vouchers'; } },
            });
            onIssued?.();
            close();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : `Failed to issue ${NOTE_LABEL[noteType].toLowerCase()}`);
        }
    };

    const accent = noteType === 'credit' ? 'text-amber-300' : 'text-cyan-300';

    return (
        <Modal isOpen={isOpen} onClose={close} title={`Issue ${NOTE_LABEL[noteType]}`} size="xl">
            <div className="space-y-4">
                <p className="text-sm text-slate-400">
                    Against invoice <span className="font-semibold text-white">{invoiceNumber}</span>.{' '}
                    {noteType === 'credit'
                        ? 'A credit note reduces what the customer owes (returns, rate corrections downward).'
                        : 'A debit note increases what the customer owes (short-billing, supplementary charges).'}
                    {' '}Enter the {noteType === 'credit' ? 'returned' : 'additional'} quantity per line; leave 0 to exclude a line.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Note date</label>
                        <input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Reason <span className="text-red-400">*</span></label>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2 units returned, damaged" className={inputClassName} />
                    </div>
                </div>

                <div className="glass rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-800/50 text-xs text-slate-400 uppercase tracking-wider">
                                    <th className="px-3 py-2.5 text-left">Description</th>
                                    <th className="px-3 py-2.5 text-left">HSN</th>
                                    <th className="px-3 py-2.5 text-right">Inv qty</th>
                                    <th className="px-3 py-2.5 text-right">Rate</th>
                                    <th className="px-3 py-2.5 text-right">GST%</th>
                                    <th className="px-3 py-2.5 text-right">Adj qty</th>
                                    <th className="px-3 py-2.5 text-right">Taxable</th>
                                    <th className="px-3 py-2.5 text-right">Tax</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {rows.map((r) => {
                                    const noId = r.line.invoice_line_item_id == null;
                                    const over = r.adjQty > r.origQty;
                                    return (
                                        <tr key={r.index} className="text-slate-300">
                                            <td className="px-3 py-2.5">{r.line.description || <span className="text-slate-600">—</span>}</td>
                                            <td className="px-3 py-2.5 text-slate-400">{r.line.hsn_code || '—'}</td>
                                            <td className="px-3 py-2.5 text-right">{r.origQty}</td>
                                            <td className="px-3 py-2.5 text-right">{formatINR(r.line.unit_price)}</td>
                                            <td className="px-3 py-2.5 text-right">{formatPercent(r.line.gst_rate)}</td>
                                            <td className="px-3 py-2.5 text-right">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="any"
                                                    disabled={noId}
                                                    value={qtys[r.index] ?? ''}
                                                    placeholder="0"
                                                    onChange={(e) => setQtys((q) => ({ ...q, [r.index]: e.target.value }))}
                                                    className={`${inputClassName} w-24 text-right ${over ? 'border-rose-500/60' : ''} disabled:opacity-40`}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5 text-right">{formatINR(r.taxable)}</td>
                                            <td className="px-3 py-2.5 text-right">{formatINR(r.tax)}</td>
                                        </tr>
                                    );
                                })}
                                {rows.length === 0 && (
                                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No line items on this invoice.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {lines.some((l) => l.invoice_line_item_id == null) && (
                    <p className="text-xs text-amber-400/80">
                        Some lines are missing a line-item id and can&apos;t be adjusted from here.
                    </p>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        {NOTE_LABEL[noteType]} value:{' '}
                        <span className={`font-semibold ${accent}`}>{formatINR(totals.total)}</span>
                        <span className="text-slate-500"> (taxable {formatINR(totals.taxable)} · tax {formatINR(totals.tax)})</span>
                    </p>
                    <div className="flex justify-end gap-2">
                        <Link href="/accounting/vouchers" onClick={close} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700">
                            View notes
                        </Link>
                        <button onClick={close} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-sm hover:bg-slate-700">Cancel</button>
                        <button
                            onClick={submit}
                            disabled={issueNote.isPending}
                            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50"
                        >
                            {issueNote.isPending ? 'Issuing…' : `Issue ${NOTE_LABEL[noteType]}`}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
