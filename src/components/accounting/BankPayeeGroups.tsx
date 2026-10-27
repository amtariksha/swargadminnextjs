'use client';

import { ReactNode, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import LedgerPicker, { LedgerPickerValue } from '@/components/accounting/LedgerPicker';
import { StatementRow, BankRuleApplyBody, BankRuleApplyResult } from '@/hooks/useAccounting';
import { useVendors } from '@/hooks/useInventory';
import { DIRECTION, formatDate, formatINR } from '@/lib/accounting';
import { POST } from '@/lib/api';

/** Mirrors the backend's isUsableKey — shorter keys are too vague to group on. */
export const isUsablePayee = (key?: string | null) => String(key || '').trim().length >= 3;

/** POST /accounting/bank/rules/apply, toast its message, refresh rows + rules. Returns false on failure. */
export async function applyPayeeGroup(
    body: BankRuleApplyBody,
    queryClient: ReturnType<typeof useQueryClient>,
): Promise<boolean> {
    try {
        const res = await POST<BankRuleApplyResult>('/accounting/bank/rules/apply', { ...body });
        const failed = res.data?.failed ?? 0;
        const msg = res.message || `${res.data?.reconciled ?? 0} line(s) assigned`;
        if (failed > 0) toast.warning(`${msg} · ${failed} failed`); else toast.success(msg);
        queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-rows'] });
        queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-rules'] });
        queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-statements'] });
        return true;
    } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Assign failed');
        return false;
    }
}

interface PayeeGroup { key: string; payee: string; direction: number; rows: StatementRow[]; total: number }

interface BankPayeeGroupsProps {
    importId: number;
    /** The unmatched rows of the import. */
    rows: StatementRow[];
    onDone: () => void;
    /** Per-line actions (Match / Suspense / Ignore) for lines that can't be grouped. */
    renderRowActions?: (row: StatementRow) => ReactNode;
}

/** "Needs review" grouped by payee + direction: one target per group assigns every similar line. */
export default function BankPayeeGroups({ importId, rows, onDone, renderRowActions }: BankPayeeGroupsProps) {
    const groups = useMemo<PayeeGroup[]>(() => {
        const byKey = new Map<string, PayeeGroup>();
        for (const r of rows) {
            const payee = isUsablePayee(r.payee_key) ? String(r.payee_key).trim() : '—';
            const key = `${payee.toLowerCase()}|${r.direction}`;
            const g = byKey.get(key) ?? { key, payee, direction: r.direction, rows: [], total: 0 };
            byKey.set(key, { ...g, rows: [...g.rows, r], total: g.total + (Number(r.amount) || 0) });
        }
        return [...byKey.values()].sort((a, b) => b.rows.length - a.rows.length);
    }, [rows]);

    if (groups.length === 0) {
        return <div className="glass rounded-2xl p-8 text-center text-sm text-slate-500">Nothing here</div>;
    }
    return (
        <div className="space-y-3">
            {groups.map((g) => (
                <PayeeGroupCard key={g.key} group={g} importId={importId} onDone={onDone} renderRowActions={renderRowActions} />
            ))}
        </div>
    );
}

function PayeeGroupCard({ group, importId, onDone, renderRowActions }: {
    group: PayeeGroup; importId: number; onDone: () => void; renderRowActions?: (row: StatementRow) => ReactNode;
}) {
    const grouped = group.payee !== '—';
    const isCredit = group.direction === DIRECTION.CREDIT;
    const [open, setOpen] = useState(!grouped);
    const samples = group.rows.slice(0, 2).map((r) => r.narration).filter(Boolean);

    return (
        <div className="glass rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-white font-medium">
                        <Users className="w-4 h-4 text-slate-400" />
                        {grouped ? group.payee : <span className="text-slate-400">No payee — assign one by one</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                        <span className={isCredit ? 'text-green-400' : 'text-slate-300'}>{isCredit ? 'Money in' : 'Money out'}</span>
                        {' · '}{group.rows.length} line{group.rows.length === 1 ? '' : 's'}
                        {' · '}{isCredit ? '+' : '−'}{formatINR(group.total)}
                    </div>
                    {grouped && samples.map((s, i) => <div key={i} className="text-xs text-slate-500 truncate max-w-xl">{s}</div>)}
                </div>
                {grouped && <GroupAssign group={group} importId={importId} onDone={onDone} />}
            </div>
            <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {open ? 'Hide lines' : 'Show lines'}
            </button>
            {open && (
                <div className="space-y-1.5">
                    {group.rows.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-800/40 rounded-lg px-3 py-2 text-xs">
                            <span className="text-slate-400 w-24">{formatDate(r.txn_date)}</span>
                            <span className="text-slate-300 flex-1 min-w-0 truncate">{r.narration || '—'}</span>
                            <span className={isCredit ? 'text-green-400' : 'text-slate-400'}>{isCredit ? '+' : '−'}{formatINR(r.amount)}</span>
                            {!grouped && renderRowActions?.(r)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

type TargetMode = 'ledger' | 'vendor';

function GroupAssign({ group, importId, onDone }: { group: PayeeGroup; importId: number; onDone: () => void }) {
    const queryClient = useQueryClient();
    const { data: vendors = [] } = useVendors();
    const canPayVendor = group.direction === DIRECTION.DEBIT;
    const [mode, setMode] = useState<TargetMode>('ledger');
    const [ledger, setLedger] = useState<LedgerPickerValue | null>(null);
    const [vendorId, setVendorId] = useState('');
    const [remember, setRemember] = useState(true);
    const [busy, setBusy] = useState(false);

    const target = mode === 'ledger' ? (ledger ? { ledger_id: ledger.id } : null) : (vendorId ? { vendor_id: Number(vendorId) } : null);

    const assign = async () => {
        if (!target) return;
        setBusy(true);
        const ok = await applyPayeeGroup(
            { import_id: importId, payee_key: group.payee, direction: group.direction, remember, ...target },
            queryClient,
        );
        setBusy(false);
        if (ok) onDone();
    };

    const tabCls = (on: boolean) =>
        `px-3 py-1 text-xs rounded-lg ${on ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-400'}`;

    return (
        <div className="w-full sm:w-96 space-y-2">
            {canPayVendor && (
                <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50 w-fit">
                    <button onClick={() => setMode('ledger')} className={tabCls(mode === 'ledger')}>Ledger</button>
                    <button onClick={() => setMode('vendor')} className={tabCls(mode === 'vendor')}>Vendor</button>
                </div>
            )}
            {mode === 'ledger' ? (
                <LedgerPicker value={ledger?.id ?? null} onChange={setLedger} placeholder="Ledger (expense, staff, income…)" />
            ) : (
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} aria-label="Vendor paid"
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm">
                    <option value="">Select the vendor these pay…</option>
                    {vendors.filter((v) => v.is_active !== 0).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
            )}
            <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Remember for next time
                </label>
                <button onClick={assign} disabled={!target || busy}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Assign {group.rows.length} line{group.rows.length === 1 ? '' : 's'}
                </button>
            </div>
        </div>
    );
}
