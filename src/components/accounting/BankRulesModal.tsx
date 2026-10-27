'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/Modal';
import { useBankRules, BankRule, BankRuleLearn, BankRuleProposal } from '@/hooks/useAccounting';
import { formatDateTime } from '@/lib/accounting';
import { DELETE, POST, PUT } from '@/lib/api';

const DIRECTION_LABEL: Record<number, string> = { 1: 'in', 2: 'out' };
const dirLabel = (d: number | null) => (d == null ? 'either' : DIRECTION_LABEL[d] || 'either');
const proposalKey = (p: BankRuleProposal) => `${p.payee_key.toLowerCase()}|${p.direction}`;

/** The learned/saved bank-statement rules: payee → ledger or vendor. */
export default function BankRulesModal({ onClose }: { onClose: () => void }) {
    const queryClient = useQueryClient();
    const { data: rules = [], isLoading } = useBankRules();
    const [busyId, setBusyId] = useState<number | null>(null);

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-rules'] });
        queryClient.invalidateQueries({ queryKey: ['accounting', 'bank-rows'] });
    };

    const run = async (id: number, action: () => Promise<{ message?: string }>) => {
        setBusyId(id);
        try {
            const res = await action();
            toast.success(res.message || 'Done');
            refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed');
        } finally {
            setBusyId(null);
        }
    };

    const toggle = (r: BankRule) => run(r.id, () => PUT(`/accounting/bank/rules/${r.id}`, { is_active: !r.is_active }));
    const remove = (r: BankRule) => {
        if (!window.confirm(`Delete the rule for “${r.pattern}”? Lines it suggested but nobody confirmed go back to Needs review.`)) return;
        run(r.id, () => DELETE(`/accounting/bank/rules/${r.id}`));
    };

    return (
        <Modal isOpen onClose={onClose} title="Bank statement rules" size="xl">
            <div className="space-y-4">
                <p className="text-xs text-slate-400">
                    Lines from the same payee go to the same place. A rule only suggests — each line still needs a Confirm.
                </p>
                <LearnPanel onSaved={refresh} />
                <div className="max-h-96 overflow-y-auto space-y-1.5">
                    {isLoading ? (
                        <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
                    ) : rules.length === 0 ? (
                        <div className="text-slate-500 text-sm py-6 text-center">No rules yet — assign a payee group or learn from history.</div>
                    ) : rules.map((r) => (
                        <RuleRow key={r.id} rule={r} busy={busyId === r.id} onToggle={() => toggle(r)} onDelete={() => remove(r)} />
                    ))}
                </div>
            </div>
        </Modal>
    );
}

function RuleRow({ rule, busy, onToggle, onDelete }: { rule: BankRule; busy: boolean; onToggle: () => void; onDelete: () => void }) {
    const target = rule.target_type === 'vendor' ? rule.vendor_name : rule.ledger_name;
    return (
        <div className={`flex flex-wrap items-center gap-3 bg-slate-800/40 rounded-lg px-3 py-2 text-sm ${rule.is_active ? '' : 'opacity-60'}`}>
            <div className="flex-1 min-w-0">
                <div className="text-white truncate">
                    {rule.pattern}
                    <span className="text-slate-500 text-xs"> · {dirLabel(rule.direction)}</span>
                    {rule.source === 'learned' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">learned</span>
                    )}
                </div>
                <div className={`text-xs ${rule.target_type === 'vendor' ? 'text-fuchsia-300' : 'text-amber-300'}`}>
                    → {target || `${rule.target_type} #${rule.ledger_id ?? rule.vendor_id}`}
                </div>
            </div>
            <div className="text-xs text-slate-500 text-right">
                <div>{rule.hits} hit{rule.hits === 1 ? '' : 's'}</div>
                <div>{rule.last_used_at ? formatDateTime(rule.last_used_at) : 'never used'}</div>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={!!rule.is_active} disabled={busy} onChange={onToggle} /> Active
            </label>
            <button onClick={onDelete} disabled={busy} aria-label="Delete rule"
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-700/50 disabled:opacity-50">
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}

function LearnPanel({ onSaved }: { onSaved: () => void }) {
    const [learn, setLearn] = useState<BankRuleLearn | null>(null);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);

    const fetchProposals = async () => {
        setBusy(true);
        try {
            const res = await POST<BankRuleLearn>('/accounting/bank/rules/learn', {});
            setLearn(res.data);
            setPicked(new Set((res.data?.proposals || []).map(proposalKey)));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Learning failed');
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        const accept = (learn?.proposals || []).filter((p) => picked.has(proposalKey(p))).map((p) => ({
            payee_key: p.payee_key, direction: p.direction,
            ...(p.target_type === 'vendor' ? { vendor_id: p.target_id } : { ledger_id: p.target_id }),
        }));
        if (accept.length === 0) return;
        setBusy(true);
        try {
            const res = await POST<{ saved: number; suggested: number }>('/accounting/bank/rules/learn', { accept });
            toast.success(res.message || `${res.data?.saved ?? accept.length} rule(s) saved`);
            setLearn(null);
            onSaved();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    const flip = (k: string) => setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k); else next.add(k);
        return next;
    });

    if (!learn) {
        return (
            <button onClick={fetchProposals} disabled={busy}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-700/50 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Learn from history
            </button>
        );
    }
    return (
        <div className="border border-slate-700/50 rounded-xl p-3 space-y-2">
            <div className="text-sm text-slate-300">
                {learn.proposals.length === 0 ? 'No new rules to learn — every consistent payee already has one.' : 'Proposed rules from reconciled lines'}
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
                {learn.proposals.map((p) => (
                    <label key={proposalKey(p)} className="flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={picked.has(proposalKey(p))} onChange={() => flip(proposalKey(p))} />
                        <span className="text-white">{p.payee_key}</span>
                        <span className="text-slate-500">({dirLabel(p.direction)})</span>
                        → <span className={p.target_type === 'vendor' ? 'text-fuchsia-300' : 'text-amber-300'}>{p.target_name || `${p.target_type} #${p.target_id}`}</span>
                        <span className="text-slate-500">({p.lines} line{p.lines === 1 ? '' : 's'})</span>
                    </label>
                ))}
                {learn.conflicts.map((c) => (
                    <div key={`${c.payee_key}|${c.direction}`} className="text-xs text-slate-500">
                        {c.payee_key} ({dirLabel(c.direction)}) — not sure — different places: {c.targets.map((t) => t.replace(':', ' #')).join(', ')}
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={() => setLearn(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                <button onClick={save} disabled={busy || picked.size === 0}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save {picked.size} rule{picked.size === 1 ? '' : 's'}
                </button>
            </div>
        </div>
    );
}
