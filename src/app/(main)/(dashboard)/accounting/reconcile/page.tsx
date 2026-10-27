'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { POST } from '@/lib/api';
import { useTallyReconcile, useTallyImportRuns, type ReconRow, type ReconTreeNode } from '@/hooks/useAccounting';
import { formatDateTime } from '@/lib/accounting';
import { BooksSourceBar, RefreshTallyButton, formatDrCr } from '@/components/accounting/BooksSourceBar';

const RUN_TYPE: Record<number, string> = { 1: 'Day Book', 2: 'Trial Balance' };
const RUN_BADGE: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-300',
    running: 'bg-sky-500/15 text-sky-300',
    failed: 'bg-rose-500/15 text-rose-300',
};
const differs = (diff: number) => Math.abs(Number(diff) || 0) > 0.01;
const isGroup = (n: ReconTreeNode) => !n.isLedger && Array.isArray(n.groups);

/** Drop matching ledgers, then groups with nothing left. Group figures stay rolled up from the server. */
function onlyDifferences(nodes: ReconTreeNode[]): ReconTreeNode[] {
    return nodes.flatMap((n) => {
        if (!isGroup(n)) return differs(n.diff) ? [n] : [];
        const groups = onlyDifferences(n.groups || []);
        const ledgers = (n.ledgers || []).filter((l) => differs(l.diff));
        return groups.length || ledgers.length ? [{ ...n, groups, ledgers }] : [];
    });
}

function Amounts({ n, bold }: { n: ReconTreeNode | ReconRow; bold?: boolean }) {
    const weight = bold ? 'font-semibold' : '';
    return (
        <>
            <td className={`p-3 text-right text-slate-300 whitespace-nowrap ${weight}`}>{formatDrCr(n.tally)}</td>
            <td className={`p-3 text-right text-slate-300 whitespace-nowrap ${weight}`}>{formatDrCr(n.swarg)}</td>
            <td className={`p-3 text-right whitespace-nowrap ${differs(n.diff) ? 'text-rose-300 font-medium' : 'text-slate-500'} ${weight}`}>{formatDrCr(n.diff)}</td>
        </>
    );
}

function TreeRows({ nodes, depth, path, collapsed, toggle }: {
    nodes: ReconTreeNode[]; depth: number; path: string; collapsed: Set<string>; toggle: (key: string) => void;
}) {
    return (
        <>
            {nodes.map((n) => {
                const key = `${path}/${n.name}`;
                const pad = { paddingLeft: `${12 + depth * 20}px` };
                if (!isGroup(n)) {
                    return (
                        <tr key={key} className={differs(n.diff) ? 'bg-rose-500/5' : ''}>
                            <td className="p-3 text-slate-200" style={pad}>
                                {n.name}{n.inactive && <span className="ml-2 text-xs text-slate-500">inactive</span>}
                            </td>
                            <Amounts n={n} />
                        </tr>
                    );
                }
                const open = !collapsed.has(key);
                return (
                    <Fragment key={key}>
                        <tr className="bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer" onClick={() => toggle(key)}>
                            <td className="p-3 text-white font-semibold" style={pad}>
                                <span className="inline-flex items-center gap-1">
                                    {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                    {n.name}
                                    {n.ledgerCount != null && <span className="ml-1 text-xs font-normal text-slate-500">{n.ledgerCount}</span>}
                                </span>
                            </td>
                            <Amounts n={n} bold />
                        </tr>
                        {open && <TreeRows nodes={[...(n.groups || []), ...(n.ledgers || [])]} depth={depth + 1} path={key} collapsed={collapsed} toggle={toggle} />}
                    </Fragment>
                );
            })}
        </>
    );
}

function ReconTree({ tree, diffsOnly }: { tree: ReconTreeNode[]; diffsOnly: boolean }) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const nodes = useMemo(() => (diffsOnly ? onlyDifferences(tree) : tree), [tree, diffsOnly]);
    const toggle = (key: string) => setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    if (!nodes.length) {
        return <div className="p-6 text-center text-slate-500 text-sm">{diffsOnly ? 'No differences — every Tally ledger matches Swarg.' : 'Nothing to reconcile yet.'}</div>;
    }
    return (
        <table className="w-full text-sm">
            <thead className="text-slate-400"><tr>
                <th className="text-left p-3">Group / Ledger</th><th className="text-right p-3">Tally</th>
                <th className="text-right p-3">Swarg</th><th className="text-right p-3">Difference</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/40">
                <TreeRows nodes={nodes} depth={0} path="" collapsed={collapsed} toggle={toggle} />
            </tbody>
        </table>
    );
}

function FlatTable({ rows }: { rows: ReconRow[] }) {
    return (
        <table className="w-full text-sm">
            <thead className="text-slate-400"><tr>
                <th className="text-left p-3">Ledger</th><th className="text-right p-3">Tally</th>
                <th className="text-right p-3">Swarg</th><th className="text-right p-3">Difference</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-700/40">
                {rows.map((r, i) => (
                    <tr key={i} className={differs(r.diff) ? 'bg-rose-500/5' : ''}>
                        <td className="p-3 text-slate-200">{r.ledgerName}</td>
                        <Amounts n={r} />
                    </tr>
                ))}
                {!rows.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nothing to reconcile yet.</td></tr>}
            </tbody>
        </table>
    );
}

function SwargOnlyNote({ rows }: { rows: { ledgerName: string; closing: number }[] }) {
    return (
        <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-500/20 text-sm text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4" />
                {rows.length} Swarg ledger{rows.length === 1 ? '' : 's'} post{rows.length === 1 ? 's' : ''} to a name Tally doesn&apos;t have
            </div>
            <ul className="text-xs space-y-0.5">
                {rows.map((r) => <li key={r.ledgerName}>{r.ledgerName} — {formatDrCr(r.closing)}</li>)}
            </ul>
            <Link href="/accounting/tally-settings" className="inline-block text-xs underline text-amber-100 hover:text-white">
                Fix the mapping in Tally settings →
            </Link>
        </div>
    );
}

const VIEW_BTN = (on: boolean) => `px-3 py-1 rounded-lg text-xs ${on ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`;

export default function ReconcilePage() {
    const { data: recon, isLoading, refetch } = useTallyReconcile();
    const { data: runs, refetch: refetchRuns } = useTallyImportRuns();
    const [busy, setBusy] = useState('');
    const [view, setView] = useState<'tree' | 'flat'>('tree');
    const [diffsOnly, setDiffsOnly] = useState(true);

    const run = async (label: string, path: string, body: Record<string, unknown>) => {
        setBusy(label);
        try {
            const r = await POST<{ skipped?: boolean }>(path, body);
            if ((r.data as { skipped?: boolean })?.skipped) toast('Tally import is disabled — flip tally_import_enabled once the bridge is verified');
            else toast.success(`${label} complete`);
            refetch(); refetchRuns();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Request failed');
        } finally { setBusy(''); }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Tally Reconciliation</h1>
                <p className="text-slate-400">Swarg&apos;s books against Tally&apos;s, ledger by ledger in Tally&apos;s groups</p>
            </div>

            <div className="glass rounded-2xl p-4 flex flex-wrap gap-3">
                <button disabled={!!busy} onClick={() => run('Seed import', '/accounting/tally/import', { mode: 'seed' })}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm disabled:opacity-50">
                    Pull Day Book (seed)
                </button>
                <button disabled={!!busy} onClick={() => run('Sync import', '/accounting/tally/import', { mode: 'sync' })}
                    className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm disabled:opacity-50">
                    Pull CA edits (sync)
                </button>
                <button disabled={!!busy} onClick={() => run('Trial balance snapshot', '/accounting/tally/trial-balance-snapshot', {})}
                    className="px-4 py-2 bg-slate-700 text-white rounded-xl text-sm disabled:opacity-50">
                    Snapshot Trial Balance
                </button>
                {busy && <span className="text-sm text-slate-400 self-center">{busy}…</span>}
            </div>

            {recon?.has_tally_snapshot
                ? <BooksSourceBar source="tally" snapshot={recon.snapshot} />
                : recon && <div className="flex items-center gap-3 text-sm text-slate-400">No Tally snapshot yet. <RefreshTallyButton compact /></div>}

            {!!recon?.swarg_only?.length && <SwargOnlyNote rows={recon.swarg_only} />}

            <div className="glass rounded-2xl overflow-hidden">
                <div className="bg-slate-800/50 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">Tally vs Swarg (as on {recon?.as_on || 'today'})</span>
                    <div className="flex flex-wrap items-center gap-3">
                        {view === 'tree' && (
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={diffsOnly} onChange={(e) => setDiffsOnly(e.target.checked)} className="accent-purple-500" />
                                Only differences
                            </label>
                        )}
                        <div className="inline-flex p-0.5 bg-slate-900/40 rounded-lg">
                            <button onClick={() => setView('tree')} className={VIEW_BTN(view === 'tree')}>Tree</button>
                            <button onClick={() => setView('flat')} className={VIEW_BTN(view === 'flat')}>Flat list</button>
                        </div>
                        {recon && (
                            <span className={`text-xs px-2 py-1 rounded-lg ${recon.matched ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                                {!recon.has_tally_snapshot ? 'No Tally snapshot yet' : recon.matched ? 'Reconciled' : `${recon.mismatches.length} mismatch(es)`}
                            </span>
                        )}
                    </div>
                </div>
                {isLoading ? <div className="p-4 text-slate-400">Loading…</div>
                    : view === 'tree' ? <ReconTree tree={recon?.tree || []} diffsOnly={diffsOnly} />
                    : <FlatTable rows={recon?.rows || []} />}
            </div>

            <div className="glass rounded-2xl overflow-hidden">
                <div className="bg-slate-800/50 px-4 py-2 text-sm font-semibold text-white">Import runs</div>
                <table className="w-full text-sm">
                    <thead className="text-slate-400"><tr>
                        <th className="text-left p-3">Type</th><th className="text-left p-3">Range</th>
                        <th className="text-left p-3">Status</th><th className="text-right p-3">Seen</th>
                        <th className="text-right p-3">Imported</th><th className="text-left p-3">When</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-700/40">
                        {(runs || []).map((r, i) => (
                            <tr key={i}>
                                <td className="p-3 text-slate-200">{RUN_TYPE[Number(r.run_type)] || r.run_type}</td>
                                <td className="p-3 text-slate-400 text-xs">{r.from_date || r.as_of_date || '—'}{r.to_date ? ` → ${r.to_date}` : ''}</td>
                                <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-lg ${RUN_BADGE[String(r.status)] || 'bg-slate-700/50 text-slate-300'}`}>{r.status}</span></td>
                                <td className="p-3 text-right text-slate-400">{r.vouchers_seen ?? 0}</td>
                                <td className="p-3 text-right text-slate-400">{r.vouchers_imported ?? 0}</td>
                                <td className="p-3 text-xs text-slate-500">{formatDateTime(String(r.created_at))}</td>
                            </tr>
                        ))}
                        {!runs?.length && <tr><td colSpan={6} className="p-6 text-center text-slate-500">No import runs yet.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
