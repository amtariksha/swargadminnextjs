'use client';

import { useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { POST } from '@/lib/api';
import { toast } from 'sonner';
import { FileSpreadsheet, ScanLine, Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

/** One parsed spreadsheet row as returned by the dry-run endpoint. */
interface DryRunRow {
    rowNumber: number;
    vendorName: string;
    rawMaterialName: string;
    purchaseDate: string;
    qty: number;
    unitPrice: number | null;
    gstRate: number | null;
    hsnCode: string | null;
    invoiceNo: string | null;
    supplyType: number | null;
    unit: string | null;
    vendorId: number | null;
    rawMaterialId: number | null;
    vendorIsNew: boolean;
    materialIsNew: boolean;
    total: number;
    errors: string[];
    warnings: string[];
}
interface DryRunResult {
    format: string;
    rows: DryRunRow[];
    summary: { total: number; valid: number; invalid: number; new_vendors: string[]; new_materials: string[] };
}
interface ConfirmResult { inserted: number; failed: number }
interface OcrFileResult {
    filename: string; ok: boolean; drafts_created: number;
    vendor_name?: string | null; invoice_no?: string | null; confidence?: number | null; error?: string;
}
interface OcrResult { results: OcrFileResult[]; files: number; drafts_created: number }

const btn = 'px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5';

/**
 * Bulk purchase-bill upload (Ask 6) — two modes in one modal:
 *  • Spreadsheet: CSV/XLSX → dry-run preview (per-row errors) → confirm → drafts.
 *  • Scan bills:  N images/PDFs → Gemini OCR → drafts.
 * Both land DRAFTS in the To-review queue; onDone refreshes the list.
 */
export default function BulkPurchaseImportModal({ isOpen, onClose, onDone }: {
    isOpen: boolean; onClose: () => void; onDone: () => void;
}) {
    const [mode, setMode] = useState<'sheet' | 'ocr'>('sheet');
    const sheetRef = useRef<HTMLInputElement>(null);
    const ocrRef = useRef<HTMLInputElement>(null);

    // Spreadsheet state
    const [dry, setDry] = useState<DryRunResult | null>(null);
    const [createMissing, setCreateMissing] = useState(true);
    const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);
    // OCR state
    const [ocr, setOcr] = useState<OcrResult | null>(null);
    const [busy, setBusy] = useState(false);

    const resetAll = () => { setDry(null); setConfirmed(null); setOcr(null); setBusy(false); };
    const close = () => { resetAll(); onClose(); };

    const runDryRun = async (file: File) => {
        setBusy(true); setDry(null); setConfirmed(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await POST<DryRunResult>('/accounting/purchases/bulk-import', fd);
            if (res.data) setDry(res.data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not parse the file');
        } finally {
            setBusy(false);
            if (sheetRef.current) sheetRef.current.value = '';
        }
    };

    const confirmImport = async () => {
        if (!dry) return;
        const rows = dry.rows.filter((r) => r.errors.length === 0);
        if (!rows.length) { toast.error('No valid rows to import'); return; }
        setBusy(true);
        try {
            const res = await POST<ConfirmResult>('/accounting/purchases/bulk-import/confirm',
                { rows, create_missing: createMissing });
            if (res.data) {
                setConfirmed(res.data);
                toast.success(`Created ${res.data.inserted} draft purchase(s)`);
                onDone();
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    const runOcr = async (files: FileList) => {
        setBusy(true); setOcr(null);
        try {
            const fd = new FormData();
            Array.from(files).forEach((f) => fd.append('files', f));
            const res = await POST<OcrResult>('/accounting/purchases/bulk-ocr', fd);
            if (res.data) {
                setOcr(res.data);
                if (res.data.drafts_created > 0) {
                    toast.success(`Created ${res.data.drafts_created} draft(s) from ${res.data.files} file(s)`);
                    onDone();
                } else {
                    toast.error('No bills could be read — try clearer images');
                }
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'OCR failed');
        } finally {
            setBusy(false);
            if (ocrRef.current) ocrRef.current.value = '';
        }
    };

    const validCount = dry ? dry.rows.filter((r) => r.errors.length === 0).length : 0;

    return (
        <Modal isOpen={isOpen} onClose={close} title="Import purchase bills" size="xl">
            <div className="space-y-4">
                {/* Mode switch */}
                <div className="flex gap-2">
                    <button onClick={() => { setMode('sheet'); resetAll(); }}
                        className={`${btn} ${mode === 'sheet' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/50'}`}>
                        <FileSpreadsheet className="w-4 h-4" /> Spreadsheet (CSV/Excel)
                    </button>
                    <button onClick={() => { setMode('ocr'); resetAll(); }}
                        className={`${btn} ${mode === 'ocr' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800/40 text-slate-400 border border-slate-700/50'}`}>
                        <ScanLine className="w-4 h-4" /> Scan bills (photos)
                    </button>
                </div>

                {mode === 'sheet' && (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400">
                            Columns recognised by header name: Vendor, Material, Date, Qty, Unit Price, GST Rate, HSN, Invoice No.
                            Vendor &amp; Material are matched by name.
                        </p>
                        <div className="flex items-center gap-3">
                            <input ref={sheetRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) runDryRun(f); }} />
                            <button onClick={() => sheetRef.current?.click()} disabled={busy}
                                className={`${btn} bg-slate-800/50 border border-slate-700/50 text-slate-200`}>
                                {busy && !dry ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                Choose CSV / Excel
                            </button>
                        </div>

                        {dry && !confirmed && (
                            <>
                                <div className="flex flex-wrap items-center gap-3 text-sm">
                                    <span className="text-slate-300">{dry.summary.total} rows</span>
                                    <span className="text-emerald-400">{dry.summary.valid} valid</span>
                                    {dry.summary.invalid > 0 && <span className="text-red-400">{dry.summary.invalid} with errors</span>}
                                    {dry.summary.new_vendors.length > 0 && (
                                        <span className="text-amber-300">{dry.summary.new_vendors.length} new vendor(s)</span>
                                    )}
                                    {dry.summary.new_materials.length > 0 && (
                                        <span className="text-amber-300">{dry.summary.new_materials.length} new material(s)</span>
                                    )}
                                </div>

                                <div className="max-h-72 overflow-auto border border-slate-700/50 rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-800/60 text-slate-400 sticky top-0">
                                            <tr>
                                                <th className="px-2 py-1.5 text-left">#</th>
                                                <th className="px-2 py-1.5 text-left">Vendor</th>
                                                <th className="px-2 py-1.5 text-left">Material</th>
                                                <th className="px-2 py-1.5 text-right">Qty</th>
                                                <th className="px-2 py-1.5 text-right">Price</th>
                                                <th className="px-2 py-1.5 text-right">Total</th>
                                                <th className="px-2 py-1.5 text-left">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dry.rows.map((r) => (
                                                <tr key={r.rowNumber}
                                                    className={`border-t border-slate-800 ${r.errors.length ? 'bg-red-500/5' : ''}`}>
                                                    <td className="px-2 py-1.5 text-slate-500">{r.rowNumber}</td>
                                                    <td className="px-2 py-1.5 text-slate-200">
                                                        {r.vendorName || <span className="text-red-400">—</span>}
                                                        {r.vendorIsNew && <span className="ml-1 text-[10px] text-amber-300">new</span>}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-slate-200">
                                                        {r.rawMaterialName || <span className="text-red-400">—</span>}
                                                        {r.materialIsNew && <span className="ml-1 text-[10px] text-amber-300">new</span>}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right text-slate-300">{r.qty}</td>
                                                    <td className="px-2 py-1.5 text-right text-slate-300">{r.unitPrice ?? '—'}</td>
                                                    <td className="px-2 py-1.5 text-right text-cyan-400">₹{Number(r.total).toFixed(2)}</td>
                                                    <td className="px-2 py-1.5">
                                                        {r.errors.map((e, i) => (
                                                            <span key={`e${i}`} className="inline-flex items-center gap-1 text-red-400 mr-2">
                                                                <AlertTriangle className="w-3 h-3" />{e}
                                                            </span>
                                                        ))}
                                                        {r.warnings.map((w, i) => (
                                                            <span key={`w${i}`} className="text-amber-300/80 mr-2">{w}</span>
                                                        ))}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <label className="flex items-center gap-2 text-sm text-slate-300">
                                    <input type="checkbox" checked={createMissing} className="accent-purple-500"
                                        onChange={(e) => setCreateMissing(e.target.checked)} />
                                    Auto-create vendors &amp; materials that don&apos;t exist yet
                                </label>

                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setDry(null)} className={`${btn} bg-slate-800/50 border border-slate-700/50 text-slate-300`}>
                                        Back
                                    </button>
                                    <button onClick={confirmImport} disabled={busy || validCount === 0}
                                        className={`${btn} bg-gradient-to-r from-green-500 to-emerald-500 text-white`}>
                                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        Import {validCount} draft(s)
                                    </button>
                                </div>
                            </>
                        )}

                        {confirmed && (
                            <div className="text-sm text-slate-200 bg-slate-800/40 rounded-lg p-4 space-y-1">
                                <p className="text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {confirmed.inserted} draft purchase(s) created.</p>
                                {confirmed.failed > 0 && <p className="text-amber-300">{confirmed.failed} row(s) skipped.</p>}
                                <p className="text-slate-400">They are in the &ldquo;To review&rdquo; tab — approve to post stock &amp; the Purchase voucher.</p>
                            </div>
                        )}
                    </div>
                )}

                {mode === 'ocr' && (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400">
                            Upload up to 20 photos or PDFs of purchase bills. Each is read by OCR and turned into draft
                            purchase(s) — review and correct them in the To-review tab before posting.
                        </p>
                        <div className="flex items-center gap-3">
                            <input ref={ocrRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
                                onChange={(e) => { const fs = e.target.files; if (fs && fs.length) runOcr(fs); }} />
                            <button onClick={() => ocrRef.current?.click()} disabled={busy}
                                className={`${btn} bg-slate-800/50 border border-slate-700/50 text-slate-200`}>
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {busy ? 'Reading bills…' : 'Choose bill images / PDFs'}
                            </button>
                        </div>

                        {ocr && (
                            <div className="max-h-72 overflow-auto border border-slate-700/50 rounded-lg">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-800/60 text-slate-400 sticky top-0">
                                        <tr>
                                            <th className="px-2 py-1.5 text-left">File</th>
                                            <th className="px-2 py-1.5 text-left">Vendor</th>
                                            <th className="px-2 py-1.5 text-left">Invoice</th>
                                            <th className="px-2 py-1.5 text-right">Drafts</th>
                                            <th className="px-2 py-1.5 text-right">Conf.</th>
                                            <th className="px-2 py-1.5 text-left">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ocr.results.map((r, i) => (
                                            <tr key={i} className={`border-t border-slate-800 ${r.ok ? '' : 'bg-red-500/5'}`}>
                                                <td className="px-2 py-1.5 text-slate-300 truncate max-w-[160px]">{r.filename}</td>
                                                <td className="px-2 py-1.5 text-slate-200">{r.vendor_name || '—'}</td>
                                                <td className="px-2 py-1.5 text-slate-400">{r.invoice_no || '—'}</td>
                                                <td className="px-2 py-1.5 text-right text-cyan-400">{r.drafts_created}</td>
                                                <td className="px-2 py-1.5 text-right text-slate-400">
                                                    {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    {r.ok
                                                        ? <span className="text-emerald-400">ok</span>
                                                        : <span className="text-red-400">{r.error || 'failed'}</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
