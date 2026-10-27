'use client';

/**
 * TallyChartTree — the "Tally" tab of the Chart of Accounts: Tally's List of
 * Accounts from the latest chart snapshot (primary groups → sub-groups →
 * ledgers) with opening / this-year / closing, plus which Swarg ledgers post to
 * each Tally ledger. Amounts are +debit signed; shown as Dr / Cr.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import {
    useTallyChart, useTallySettings, refreshTallyChart, isTallyLedgerNode,
    type TallyChartGroup, type TallyChartLedger, type TallyChartNode,
} from '@/hooks/useAccounting';
import { formatINR, formatDate, formatDateTime } from '@/lib/accounting';

const REFRESH_KEYS = ['tally-chart', 'tb', 'bs', 'pnl', 'reconcile'];
const COLS = 'grid grid-cols-[minmax(14rem,1fr)_8.5rem_8.5rem_8.5rem] gap-2 items-center';

const drCr = (n: number): string => {
    const v = Number(n) || 0;
    if (Math.abs(v) < 0.005) return '—';
    return `${formatINR(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`;
};

const visibleLedger = (l: TallyChartLedger, q: string, hideInactive: boolean): boolean =>
    !(hideInactive && l.inactive) && (!q || l.name.toLowerCase().includes(q));

// Prunes ledgers by search / inactive; while searching, drops groups with no match.
function pruneGroup(g: TallyChartGroup, q: string, hideInactive: boolean): TallyChartGroup | null {
    const ledgers = g.ledgers.filter((l) => visibleLedger(l, q, hideInactive));
    const groups = g.groups
        .map((c) => pruneGroup(c, q, hideInactive))
        .filter((c): c is TallyChartGroup => c !== null);
    if (q && ledgers.length === 0 && groups.length === 0) return null;
    return { ...g, ledgers, groups };
}

function LedgerRow({ ledger, depth }: { ledger: TallyChartLedger; depth: number }) {
    const names = ledger.mapped_to.map((m) => m.name);
    return (
        <div className={`${COLS} py-1.5 text-sm ${ledger.inactive ? 'opacity-50' : ''}`}>
            <div className="min-w-0 flex items-center gap-2 flex-wrap" style={{ paddingLeft: `${depth * 16 + 22}px` }}>
                <span className="text-slate-200">{ledger.name}</span>
                {names.length > 0 ? (
                    <span title={names.join('\n')} className="text-xs px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-300 truncate max-w-[16rem]">
                        Swarg: {names.join(', ')}
                    </span>
                ) : (
                    <span className="text-xs text-slate-600">not used by Swarg</span>
                )}
            </div>
            <span className="text-right text-slate-400 whitespace-nowrap">{drCr(ledger.opening)}</span>
            <span className="text-right text-slate-400 whitespace-nowrap">{drCr(ledger.movement)}</span>
            <span className="text-right text-slate-200 whitespace-nowrap">{drCr(ledger.closing)}</span>
        </div>
    );
}

interface GroupRowProps {
    group: TallyChartGroup;
    depth: number;
    isOpen: (g: TallyChartGroup, depth: number) => boolean;
    onToggle: (name: string) => void;
}

function GroupRow({ group, depth, isOpen, onToggle }: GroupRowProps) {
    const open = isOpen(group, depth);
    return (
        <div>
            <button onClick={() => onToggle(group.name)} className={`${COLS} w-full py-1.5 text-sm text-left hover:bg-slate-800/40 rounded-lg`}>
                <span className="min-w-0 flex items-center gap-1 font-semibold text-white" style={{ paddingLeft: `${depth * 16}px` }}>
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="truncate">{group.name}</span>
                    <span className="ml-1 text-xs font-normal text-slate-500">{group.ledgerCount}</span>
                </span>
                <span className="text-right font-semibold text-slate-300 whitespace-nowrap">{drCr(group.opening)}</span>
                <span className="text-right font-semibold text-slate-300 whitespace-nowrap">{drCr(group.movement)}</span>
                <span className="text-right font-semibold text-white whitespace-nowrap">{drCr(group.closing)}</span>
            </button>
            {open && (
                <>
                    {group.groups.map((c) => <GroupRow key={c.name} group={c} depth={depth + 1} isOpen={isOpen} onToggle={onToggle} />)}
                    {group.ledgers.map((l) => <LedgerRow key={l.name} ledger={l} depth={depth + 1} />)}
                </>
            )}
        </div>
    );
}

/** Refresh reads Tally now; a typed company (e.g. the CA's) is read AND then shown, blank goes back to Swarg's company. */
function RefreshBar({ onViewCompany }: { onViewCompany: (company: string) => void }) {
    const qc = useQueryClient();
    const { data: cfg } = useTallySettings();
    const [company, setCompany] = useState('');
    const [busy, setBusy] = useState(false);

    const refresh = async () => {
        setBusy(true);
        try {
            const res = await refreshTallyChart(company.trim() ? { company: company.trim() } : {});
            onViewCompany(company.trim());
            toast.success(res.message || `Tally snapshot taken — ${res.data.ledgers} ledgers`);
            await Promise.all(REFRESH_KEYS.map((k) => qc.invalidateQueries({ queryKey: ['accounting', k] })));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not read Tally');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <input value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Tally company"
                title="Read a different company, e.g. the CA's restored one"
                placeholder={cfg?.company_name || 'Company'}
                className="w-48 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
            <button onClick={refresh} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {busy ? 'Reading Tally…' : 'Refresh'}
            </button>
        </div>
    );
}

export default function TallyChartTree() {
    const [viewCompany, setViewCompany] = useState('');
    const { data, isLoading, error } = useTallyChart(undefined, viewCompany || undefined);
    const [hideInactive, setHideInactive] = useState(true);
    const [search, setSearch] = useState('');
    // Groups whose open state differs from the default (primary open, sub-groups closed).
    const [toggled, setToggled] = useState<Set<string>>(new Set());
    const q = search.trim().toLowerCase();

    const nodes = useMemo<TallyChartNode[]>(() => (data?.tree || [])
        .map((n) => (isTallyLedgerNode(n) ? (visibleLedger(n, q, hideInactive) ? n : null) : pruneGroup(n, q, hideInactive)))
        .filter((n): n is TallyChartNode => n !== null), [data, q, hideInactive]);

    const onToggle = (name: string) => setToggled((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
    });
    const isOpen = (g: TallyChartGroup, depth: number) => (q ? true : (depth === 0) !== toggled.has(g.name));

    const snap = data?.snapshot;
    const summary = data?.summary;
    const stale = data?.stale_mappings || [];

    return (
        <div className="space-y-4">
            <div className="glass rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-slate-300">
                    {snap ? (
                        <>Tally · <span className="text-white font-medium">{snap.company || '—'}</span> · as of {formatDate(snap.as_of)}
                            <span className="text-slate-500"> · taken {formatDateTime(snap.taken_at)}</span></>
                    ) : 'Tally'}
                </div>
                <RefreshBar onViewCompany={setViewCompany} />
            </div>

            {stale.length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200 flex gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        These Swarg ledgers post to names this Tally company doesn&rsquo;t have:{' '}
                        {stale.map((s) => `${s.name} → ${s.tally_ledger_name}`).join('; ')}.{' '}
                        Fix them in <Link href="/accounting/tally-settings" className="underline hover:text-white">Tally settings → Ledger mapping</Link>.
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="text-slate-400">Loading…</div>
            ) : error ? (
                <div className="glass rounded-2xl p-6 text-center text-rose-300">{error instanceof Error ? error.message : 'Failed to load'}</div>
            ) : !snap ? (
                <div className="glass rounded-2xl p-8 text-center text-slate-400">
                    No Tally snapshot yet — press Refresh (Tally must be running with the company open)
                </div>
            ) : (
                <div className="glass rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        {summary && (
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="px-2 py-1 rounded-lg bg-slate-800/60 text-slate-300">{summary.groups} groups</span>
                                <span className="px-2 py-1 rounded-lg bg-slate-800/60 text-slate-300">{summary.ledgers} ledgers</span>
                                <span className="px-2 py-1 rounded-lg bg-slate-800/60 text-slate-400">{summary.inactive} inactive{hideInactive ? ' (hidden)' : ''}</span>
                                <span className={`px-2 py-1 rounded-lg ${summary.unclassified ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800/60 text-slate-400'}`}>{summary.unclassified} unclassified</span>
                            </div>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-2 text-sm text-slate-300">
                                <input type="checkbox" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} className="accent-purple-500" />
                                Hide inactive ledgers
                            </label>
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ledgers…"
                                    className="w-52 pl-8 pr-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <div className="min-w-[44rem]">
                            <div className={`${COLS} pb-2 border-b border-slate-700/50 text-xs uppercase tracking-wide text-slate-500`}>
                                <span>Particulars</span>
                                <span className="text-right">Opening</span>
                                <span className="text-right">This year</span>
                                <span className="text-right">Closing</span>
                            </div>
                            {nodes.length === 0 ? (
                                <div className="py-4 text-sm text-slate-500">{q ? 'No ledger matches your search.' : 'No accounts in this snapshot.'}</div>
                            ) : nodes.map((n) => (isTallyLedgerNode(n)
                                ? <LedgerRow key={`l:${n.name}`} ledger={n} depth={0} />
                                : <GroupRow key={`g:${n.name}`} group={n} depth={0} isOpen={isOpen} onToggle={onToggle} />))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
