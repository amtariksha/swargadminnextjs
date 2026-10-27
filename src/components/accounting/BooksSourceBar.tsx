'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Database, Loader2, RefreshCw } from 'lucide-react';
import { refreshTallyChart, type BooksSource, type TallySnapshotMeta } from '@/hooks/useAccounting';
import { formatINR, formatDate, formatDateTime } from '@/lib/accounting';

const REFRESH_KEYS = [['accounting', 'tb'], ['accounting', 'bs'], ['accounting', 'pnl'], ['accounting', 'tally-chart'], ['accounting', 'reconcile']];

/** A +debit signed amount as "₹x Dr" / "₹x Cr" (never negative). */
export function formatDrCr(amount: number | string | null | undefined): string {
    const n = Number(amount) || 0;
    if (Math.abs(n) < 0.005) return formatINR(0);
    return `${formatINR(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`;
}

/** The 404 a Tally report returns before the first snapshot for that FY. */
export function isSnapshotMissing(err: unknown): err is Error {
    return err instanceof Error && /snapshot/i.test(err.message);
}

/** IST today, and the date to snapshot a financial year at: its last day, or today while it is running. */
const istToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const asOfForFy = (fy?: string) => {
    if (!fy) return undefined;
    const end = `${fy.slice(5, 9)}-03-31`;
    return /^\d{4}-03-31$/.test(end) && end < istToday() ? end : undefined;
};

/** Snapshot Tally now (read-only), then refetch every screen built on it. A past fy is read as of its year end. */
export function RefreshTallyButton({ compact = false, fy }: { compact?: boolean; fy?: string }) {
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);

    const refresh = async () => {
        setBusy(true);
        try {
            const asOn = asOfForFy(fy);
            const res = await refreshTallyChart(asOn ? { as_on: asOn } : {});
            toast.success(res.message || `Tally read — ${res.data.ledgers} ledgers as of ${formatDate(res.data.asOf)}`);
            await Promise.all(REFRESH_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not read Tally');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button onClick={refresh} disabled={busy}
            className={`inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl disabled:opacity-50 ${compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {busy ? 'Reading Tally…' : 'Refresh from Tally'}
        </button>
    );
}

/** Empty state for a Tally report with no snapshot yet (or an unreachable Tally). */
export function TallySnapshotEmpty({ message, fy }: { message: string; fy?: string }) {
    return (
        <div className="glass rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
            <Database className="w-8 h-8 text-slate-500" />
            <p className="text-slate-300">{message}</p>
            <RefreshTallyButton fy={fy} />
        </div>
    );
}

function SourceSwitch({ source, onChange }: { source: BooksSource; onChange: (s: BooksSource) => void }) {
    const options: { value: BooksSource; label: string }[] = [{ value: 'tally', label: 'Tally' }, { value: 'swarg', label: 'Swarg' }];
    return (
        <div className="inline-flex p-1 bg-slate-800/50 border border-slate-700/50 rounded-xl">
            {options.map((o) => (
                <button key={o.value} onClick={() => onChange(o.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${source === o.value ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function UnclassifiedNote({ names }: { names: string[] }) {
    return (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
                {names.length} ledger{names.length === 1 ? '' : 's'} {names.length === 1 ? "isn't" : "aren't"} under one of Tally&apos;s primary groups and {names.length === 1 ? 'is' : 'are'} left out: {names.join(', ')}
            </span>
        </div>
    );
}

interface BooksSourceBarProps {
    source: BooksSource;
    /** Omit for stamp-only mode (no Tally / Swarg switch). */
    onSourceChange?: (source: BooksSource) => void;
    snapshot?: TallySnapshotMeta | null;
    unclassified?: string[];
}

/** Tally | Swarg switch plus, for Tally, which snapshot is showing and a Refresh. */
export function BooksSourceBar({ source, onSourceChange, snapshot, unclassified }: BooksSourceBarProps) {
    const tally = source === 'tally';
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                {onSourceChange && <SourceSwitch source={source} onChange={onSourceChange} />}
                {tally && snapshot && (
                    <>
                        <span className="text-xs text-slate-400">
                            Tally{snapshot.company ? ` · ${snapshot.company}` : ''} · as of {formatDate(snapshot.as_of)} · taken {formatDateTime(snapshot.taken_at)}
                        </span>
                        <RefreshTallyButton compact />
                    </>
                )}
            </div>
            {tally && !!unclassified?.length && <UnclassifiedNote names={unclassified} />}
        </div>
    );
}
