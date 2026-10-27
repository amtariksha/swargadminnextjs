'use client';

/**
 * RebuildBooksModal — POST /accounting/gl/backfill for a date range. Idempotent
 * on the server: it only fills in Swarg vouchers that are missing.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { POST } from '@/lib/api';
import Modal from '@/components/Modal';
import { inputClassName } from '@/components/FormField';
import { useTallySettings, type BackfillResult } from '@/hooks/useAccounting';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const todayIst = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const fyStartOf = (isoDate: string): string => {
    const [y, m] = isoDate.split('-').map(Number);
    return `${m >= 4 ? y : y - 1}-04-01`;
};

const RESULT_ROWS: { key: keyof BackfillResult; label: string }[] = [
    { key: 'invoices', label: 'Invoices' },
    { key: 'receipts', label: 'Receipts' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'vendorPayments', label: 'Vendor payments' },
    { key: 'errors', label: 'Errors' },
];

export default function RebuildBooksModal({ isOpen, onClose }: Props) {
    const qc = useQueryClient();
    const { data: tally } = useTallySettings();
    // null = untouched → follow the default (settings may load after the modal opens).
    const [from, setFrom] = useState<string | null>(null);
    const [to, setTo] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<BackfillResult | null>(null);

    const today = todayIst();
    const fromValue = from ?? (tally?.posting_from_date ? tally.posting_from_date.slice(0, 10) : fyStartOf(today));
    const toValue = to ?? today;

    const close = () => {
        setFrom(null); setTo(null); setResult(null);
        onClose();
    };

    const run = async () => {
        if (fromValue && toValue && fromValue > toValue) { toast.error('From must be on or before To'); return; }
        setBusy(true);
        try {
            const res = await POST<BackfillResult>('/accounting/gl/backfill', {
                from: fromValue || undefined, to: toValue || undefined,
            });
            setResult(res.data);
            toast.success(res.message || 'Books rebuilt');
            await Promise.all((['chart', 'tb', 'bs', 'pnl', 'reconcile'] as const)
                .map((k) => qc.invalidateQueries({ queryKey: ['accounting', k] })));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Rebuild failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title="Rebuild books" size="md">
            <div className="space-y-3">
                <p className="text-sm text-slate-400">
                    Fills in any missing Swarg voucher for invoices, receipts, purchases and vendor payments in this range.
                    Never changes or duplicates an existing one.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">From</label>
                        <input type="date" value={fromValue} onChange={(e) => setFrom(e.target.value)} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">To</label>
                        <input type="date" value={toValue} onChange={(e) => setTo(e.target.value)} className={inputClassName} />
                    </div>
                </div>

                {result && (
                    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {RESULT_ROWS.map(({ key, label }) => {
                            const n = Number(result[key]) || 0;
                            const isError = key === 'errors' && n > 0;
                            return (
                                <div key={key} className="text-center">
                                    <div className={`text-lg font-semibold ${isError ? 'text-rose-300' : 'text-white'}`}>{n}</div>
                                    <div className="text-xs text-slate-500">{label}</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={close} className="px-4 py-2 rounded-xl text-sm bg-slate-800 text-slate-300">
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    <button onClick={run} disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50">
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                        {busy ? 'Rebuilding…' : result ? 'Run again' : 'Rebuild'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
