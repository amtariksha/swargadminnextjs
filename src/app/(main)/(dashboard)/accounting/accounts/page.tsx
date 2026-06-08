'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useChartOfAccounts, useAccountGroups, type AccountGroup } from '@/hooks/useAccounting';
import { formatINR, NATURE_LABELS } from '@/lib/accounting';
import CoaActionBar from '@/components/accounting/CoaActionBar';

const NATURE_BADGE: Record<number, string> = {
    1: 'bg-emerald-500/15 text-emerald-300',
    2: 'bg-amber-500/15 text-amber-300',
    3: 'bg-sky-500/15 text-sky-300',
    4: 'bg-rose-500/15 text-rose-300',
    5: 'bg-violet-500/15 text-violet-300',
};

interface GroupNode extends AccountGroup {
    children: GroupNode[];
}

export default function ChartOfAccountsPage() {
    const { data, isLoading } = useChartOfAccounts();
    const { data: groups = [] } = useAccountGroups();
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

    // Build the group tree (primary → sub-groups) for the side-rail.
    const tree = useMemo(() => {
        const nodes = new Map<number, GroupNode>(groups.map((g) => [g.id, { ...g, children: [] }]));
        const roots: GroupNode[] = [];
        for (const node of nodes.values()) {
            if (node.parent_group_id && nodes.has(node.parent_group_id)) {
                nodes.get(node.parent_group_id)!.children.push(node);
            } else {
                roots.push(node);
            }
        }
        const sortRec = (arr: GroupNode[]) => {
            arr.sort((a, b) => a.name.localeCompare(b.name));
            arr.forEach((n) => sortRec(n.children));
        };
        sortRec(roots);
        return roots;
    }, [groups]);

    // Ledgers of the selected group (from the chart, which carries balances).
    const chartByGroupId = useMemo(
        () => new Map((data?.groups || []).map((g) => [g.group_id, g])),
        [data],
    );
    const selectedChart = selectedGroupId != null ? chartByGroupId.get(selectedGroupId) : null;
    const selectedGroup = selectedGroupId != null ? groups.find((g) => g.id === selectedGroupId) : null;

    const toggleCollapse = (id: number) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });

    const renderGroupNode = (node: GroupNode, depth: number) => (
        <div key={node.id}>
            <div
                className={`flex items-center gap-1 rounded-lg pr-2 ${selectedGroupId === node.id ? 'bg-purple-500/15' : 'hover:bg-slate-800/50'}`}
                style={{ paddingLeft: `${depth * 12}px` }}
            >
                {node.children.length > 0 ? (
                    <button onClick={() => toggleCollapse(node.id)} className="p-1 text-slate-400 hover:text-white">
                        {collapsed.has(node.id) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                ) : <span className="w-[22px]" />}
                <button
                    onClick={() => setSelectedGroupId(node.id)}
                    className={`flex-1 text-left py-1.5 text-sm ${selectedGroupId === node.id ? 'text-purple-300 font-medium' : 'text-slate-300'}`}
                >
                    {node.name}
                </button>
            </div>
            {!collapsed.has(node.id) && node.children.map((c) => renderGroupNode(c, depth + 1))}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-white">Chart of Accounts</h1>
                    <p className="text-slate-400">Account groups &amp; ledgers with live balances</p>
                </div>
                <CoaActionBar groups={groups} selectedGroupId={selectedGroupId} />
            </div>

            {data && (
                <div className="glass rounded-2xl px-4 py-2.5 text-sm text-slate-300 flex items-center justify-between">
                    <span>Total Debit / Credit</span>
                    <span className="font-semibold text-white">
                        {formatINR(data.total_debit)} <span className="text-slate-500">/</span> {formatINR(data.total_credit)}
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4">
                {/* Side-rail: group tree */}
                <div className="glass rounded-2xl p-3 h-fit">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Groups</span>
                        {selectedGroupId != null && (
                            <button onClick={() => setSelectedGroupId(null)} className="text-xs text-slate-400 hover:text-white">Show all</button>
                        )}
                    </div>
                    {groups.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-slate-500">No groups</p>
                    ) : tree.map((n) => renderGroupNode(n, 0))}
                </div>

                {/* Right pane: ledgers */}
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="text-slate-400">Loading…</div>
                    ) : selectedGroup ? (
                        <div className="glass rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-white font-semibold">{selectedGroup.name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-lg ${NATURE_BADGE[selectedGroup.nature] || 'bg-slate-700/50 text-slate-300'}`}>
                                        {NATURE_LABELS[selectedGroup.nature] || '—'}
                                    </span>
                                </div>
                                {selectedChart && (
                                    <span className="text-sm font-semibold text-white">
                                        {formatINR(selectedChart.subtotal)} <span className="text-slate-500">{selectedChart.subtotal_type}</span>
                                    </span>
                                )}
                            </div>
                            <div className="divide-y divide-slate-700/40">
                                {(selectedChart?.ledgers || []).map((l) => (
                                    <div key={l.id} className="flex items-center justify-between py-1.5 text-sm">
                                        <span className="text-slate-200">
                                            {l.name}
                                            {l.code && <span className="ml-2 text-xs text-slate-500">{l.code}</span>}
                                        </span>
                                        <span className="text-slate-300">
                                            {formatINR(l.balance)} <span className="text-slate-500">{l.balance_type}</span>
                                        </span>
                                    </div>
                                ))}
                                {(!selectedChart || selectedChart.ledgers.length === 0) && (
                                    <div className="py-3 text-xs text-slate-500">No ledgers in this group yet. Use “New Ledger”.</div>
                                )}
                            </div>
                        </div>
                    ) : data?.groups?.length ? (
                        // No group selected → full chart (every group with activity).
                        data.groups.map((g) => (
                            <div key={g.group_id} className="glass rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <button onClick={() => setSelectedGroupId(g.group_id)} className="flex items-center gap-2 text-left">
                                        <span className="text-white font-semibold hover:text-purple-300">{g.group_name}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded-lg ${NATURE_BADGE[g.nature] || 'bg-slate-700/50 text-slate-300'}`}>
                                            {NATURE_LABELS[g.nature] || '—'}
                                        </span>
                                    </button>
                                    <span className="text-sm font-semibold text-white">
                                        {formatINR(g.subtotal)} <span className="text-slate-500">{g.subtotal_type}</span>
                                    </span>
                                </div>
                                <div className="divide-y divide-slate-700/40">
                                    {g.ledgers.map((l) => (
                                        <div key={l.id} className="flex items-center justify-between py-1.5 text-sm">
                                            <span className="text-slate-200">
                                                {l.name}
                                                {l.code && <span className="ml-2 text-xs text-slate-500">{l.code}</span>}
                                            </span>
                                            <span className="text-slate-300">
                                                {formatINR(l.balance)} <span className="text-slate-500">{l.balance_type}</span>
                                            </span>
                                        </div>
                                    ))}
                                    {g.ledgers.length === 0 && <div className="py-1.5 text-xs text-slate-500">No ledgers</div>}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="glass rounded-2xl p-8 text-center text-slate-400">
                            No accounts yet. Issue an invoice or post a voucher to populate the ledger.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
