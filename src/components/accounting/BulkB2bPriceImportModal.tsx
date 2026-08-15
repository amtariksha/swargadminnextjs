'use client';

import { useMemo, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { POST } from '@/lib/api';
import { getApiUrl } from '@/config/tenant';
import { formatINR } from '@/lib/accounting';
import { toast } from 'sonner';
import { FileSpreadsheet, Download, Upload, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

type RowAction = 'create' | 'update' | 'unchanged' | 'skip' | 'error';

interface DryRunRow {
    rowNumber: number;
    shopName: string;
    productName: string;
    price: number | null;
    mrp: number | null;
    batchStartDate: string | null;
    batchEndDate: string | null;
    userId: number | null;
    productId: number | null;
    tier: 'shop' | 'common' | null;
    action: RowAction;
    reason: string | null;
    currentPrice: number | null;
}

interface DryRunResult {
    format: string;
    columns: string[];
    warnings: string[];
    summary: Record<RowAction, number>;
    rows: DryRunRow[];
}

interface ConfirmResult {
    applied: number;
    shop_prices: number;
    common_prices: number;
    skipped: number;
    errors: { rowNumber: number; reason: string }[];
}

const btn = 'px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5';

const ACTION_CLS: Record<RowAction, string> = {
    create: 'bg-green-500/20 text-green-400',
    update: 'bg-amber-500/20 text-amber-400',
    unchanged: 'bg-slate-700/50 text-slate-400',
    skip: 'bg-slate-700/50 text-slate-500',
    error: 'bg-red-500/20 text-red-400',
};

/**
 * Bulk B2B price upload — export → edit → dry-run preview → confirm.
 *
 * One sheet covers every shop and the common tier: a blank Shop cell sets the
 * catalog-wide B2B default, a named shop sets that shop's agreed price. Both
 * are what the backend's price resolver already reads, in that precedence.
 *
 * The export is the starting point on purpose — an operator edits the prices
 * that exist rather than retyping a catalog, and an unedited round-trip applies
 * nothing (every untouched row comes back "unchanged").
 */
export default function BulkB2bPriceImportModal({ isOpen, onClose, onDone }: {
    isOpen: boolean; onClose: () => void; onDone: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [dry, setDry] = useState<DryRunResult | null>(null);
    const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);
    const [busy, setBusy] = useState(false);

    const close = () => { setDry(null); setConfirmed(null); setBusy(false); onClose(); };

    const writable = useMemo(
        () => (dry?.rows || []).filter((r) => r.action === 'create' || r.action === 'update'),
        [dry],
    );

    const runDryRun = async (file: File) => {
        setBusy(true); setDry(null); setConfirmed(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await POST<DryRunResult>('/accounting/b2b-prices/bulk-import', fd);
            if (res.data) setDry(res.data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not read the file');
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const confirmImport = async () => {
        if (!writable.length) { toast.error('Nothing to apply'); return; }
        setBusy(true);
        try {
            const res = await POST<ConfirmResult>('/accounting/b2b-prices/bulk-import/confirm', { rows: writable });
            if (res.data) {
                setConfirmed(res.data);
                toast.success(`Applied ${res.data.applied} price(s)`);
                onDone();
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setBusy(false);
        }
    };

    // The export streams a CSV with a Content-Disposition header, so it is a
    // plain navigation rather than an axios call — the axios instance would
    // buffer it and strip the filename.
    const exportHref = `${getApiUrl()}/accounting/b2b-prices/export`;

    return (
        <Modal isOpen={isOpen} onClose={close} title="Bulk B2B prices" size="xl">
            <div className="space-y-4">
                <div className="text-sm text-slate-400 space-y-1">
                    <p>
                        Columns: <span className="text-slate-300">Shop, Product, Price</span> (required) plus optional
                        <span className="text-slate-300"> Shop ID, Product ID, MRP, From, To</span>.
                    </p>
                    <p>
                        Leave <span className="text-slate-300">Shop</span> blank to set the
                        <span className="text-slate-300"> common B2B price</span> for that product; name a shop to set
                        that shop&apos;s agreed price. A blank <span className="text-slate-300">Price</span> leaves the
                        line alone.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <a href={exportHref} className={`${btn} bg-slate-800/60 text-cyan-300 border border-cyan-500/30`}>
                        <Download className="w-4 h-4" /> Download current prices
                    </a>
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                        className={`${btn} bg-gradient-to-r from-purple-500 to-pink-500 text-white`}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload edited sheet
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) runDryRun(f); }} />
                </div>

                {dry?.warnings?.length ? (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                        {dry.warnings.map((w, i) => <p key={i}>{w}</p>)}
                    </div>
                ) : null}

                {dry && (
                    <>
                        <div className="flex flex-wrap gap-2 text-xs">
                            {(['create', 'update', 'unchanged', 'skip', 'error'] as RowAction[]).map((a) => (
                                <span key={a} className={`px-2 py-1 rounded-lg ${ACTION_CLS[a]}`}>
                                    {a}: {dry.summary?.[a] ?? 0}
                                </span>
                            ))}
                        </div>

                        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-700/50">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-800/60 sticky top-0">
                                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                                        <th className="px-3 py-2">Row</th>
                                        <th className="px-3 py-2">Shop</th>
                                        <th className="px-3 py-2">Product</th>
                                        <th className="px-3 py-2">Now</th>
                                        <th className="px-3 py-2">New</th>
                                        <th className="px-3 py-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dry.rows.map((r) => (
                                        <tr key={r.rowNumber} className="border-t border-slate-800/50 text-slate-300">
                                            <td className="px-3 py-1.5 text-slate-500">{r.rowNumber}</td>
                                            <td className="px-3 py-1.5">
                                                {r.tier === 'common'
                                                    ? <span className="text-cyan-300">All shops</span>
                                                    : (r.shopName || '—')}
                                            </td>
                                            <td className="px-3 py-1.5">{r.productName || '—'}</td>
                                            <td className="px-3 py-1.5 text-slate-500">
                                                {r.currentPrice != null ? formatINR(r.currentPrice) : '—'}
                                            </td>
                                            <td className="px-3 py-1.5">{r.price != null ? formatINR(r.price) : '—'}</td>
                                            <td className="px-3 py-1.5">
                                                <span className={`text-xs px-2 py-0.5 rounded-lg ${ACTION_CLS[r.action]}`}
                                                    title={r.reason || undefined}>
                                                    {r.action}
                                                </span>
                                                {r.reason && r.action === 'error' && (
                                                    <span className="ml-2 text-xs text-red-400">{r.reason}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {!confirmed && (
                            <div className="flex items-center gap-3">
                                <button type="button" onClick={confirmImport} disabled={busy || !writable.length}
                                    className={`${btn} bg-gradient-to-r from-green-500 to-emerald-500 text-white`}>
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Apply {writable.length} change{writable.length === 1 ? '' : 's'}
                                </button>
                                {dry.summary?.error > 0 && (
                                    <span className="text-xs text-amber-300 flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        {dry.summary.error} row(s) with errors will be left out
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                )}

                {confirmed && (
                    <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
                        <p className="flex items-center gap-1.5">
                            <FileSpreadsheet className="w-4 h-4" />
                            Applied {confirmed.applied} price(s) — {confirmed.shop_prices} shop-specific,
                            {' '}{confirmed.common_prices} common.
                        </p>
                        {confirmed.errors?.length > 0 && (
                            <p className="mt-1 text-amber-200">
                                {confirmed.errors.length} row(s) rejected on write: {confirmed.errors
                                    .slice(0, 3).map((e) => `row ${e.rowNumber} (${e.reason})`).join(', ')}
                                {confirmed.errors.length > 3 ? '…' : ''}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
