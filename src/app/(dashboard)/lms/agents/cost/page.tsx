"use client";

/**
 * /lms/agents/cost — Agent spend dashboard.
 *
 * Owner ask: "I would not cap this with money. But I need clear report of
 * how much is being spent conversation wise so I can optimise the
 * workflow. And I need evals."
 *
 * Phase 1 surface:
 *   • Totals card — runs / cost / tokens / failure rate for the window.
 *   • Group-by selector: agent / conversation / customer / day.
 *   • Per-group table sorted by cost descending.
 *   • CSV export (same /api endpoint with ?format=csv).
 *
 * Eval dashboard is a sister surface — will land at /lms/agents/evals
 * once chatagent exposes the eval-run endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    BarChart3,
    Loader2,
    Download,
    AlertTriangle,
    DollarSign,
    Activity,
    Cpu,
    AlertCircle,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";

type GroupBy = "agent" | "conversation" | "customer" | "day";

interface RollupRow {
    groupKey: string;
    runs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    avgLatencyMs: number;
    failureRate: number;
}

interface Totals {
    runs: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    failureRate: number;
}

interface CostResponse {
    groupBy: GroupBy;
    from: string | null;
    to: string | null;
    totals: Totals;
    rows: RollupRow[];
}

const GROUP_LABELS: Record<GroupBy, string> = {
    agent: "Agent",
    conversation: "Conversation / Session",
    customer: "Customer",
    day: "Day",
};

// Default window: last 7 days, anchored to today.
function defaultRange(): { from: string; to: string } {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
    };
}

export default function AgentCostPage() {
    const [range, setRange] = useState(defaultRange());
    const [groupBy, setGroupBy] = useState<GroupBy>("agent");
    const [data, setData] = useState<CostResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const sp = new URLSearchParams({
                from: range.from,
                to: range.to,
                groupBy,
                limit: "200",
            });
            const res = await wfetch(`/api/lms/agents/cost?${sp}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setData((await res.json()) as CostResponse);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [range, groupBy]);

    useEffect(() => {
        load();
    }, [load]);

    const onDownloadCsv = () => {
        const sp = new URLSearchParams({
            from: range.from,
            to: range.to,
            groupBy,
            limit: "1000",
            format: "csv",
        });
        // Direct nav so the browser saves the file. We're an authenticated
        // admin so the wfetch wrapper's bearer header is on us — easier to
        // open a fetch + blob path here for the same reason.
        downloadCsv(sp.toString(), `agent-cost-${groupBy}-${range.from}_${range.to}.csv`);
    };

    const totals = data?.totals;

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                        <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            Agent cost
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Per-conversation cost reporting for every Agent Force
                            invocation. Data flows in via the webhook on{" "}
                            <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">
                                agent_run.completed
                            </code>
                            .
                        </p>
                    </div>
                </div>
                <button
                    onClick={onDownloadCsv}
                    disabled={loading || !data || data.rows.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <Download className="h-4 w-4" />
                    CSV
                </button>
            </div>

            {/* Controls */}
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    From
                    <input
                        type="date"
                        value={range.from}
                        onChange={(e) => setRange({ ...range, from: e.target.value })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    To
                    <input
                        type="date"
                        value={range.to}
                        onChange={(e) => setRange({ ...range, to: e.target.value })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    Group by
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                        {(["agent", "conversation", "customer", "day"] as const).map((g) => (
                            <option key={g} value={g}>
                                {GROUP_LABELS[g]}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    {error}
                </div>
            )}

            {/* Totals */}
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiCard
                    label="Total spend"
                    value={totals ? `$${totals.costUsd.toFixed(4)}` : "—"}
                    sub={
                        totals
                            ? `${totals.runs} run${totals.runs === 1 ? "" : "s"}`
                            : ""
                    }
                    icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
                />
                <KpiCard
                    label="Avg / run"
                    value={
                        totals && totals.runs > 0
                            ? `$${(totals.costUsd / totals.runs).toFixed(6)}`
                            : "—"
                    }
                    sub=""
                    icon={<Activity className="h-4 w-4 text-blue-500" />}
                />
                <KpiCard
                    label="Tokens (in + out)"
                    value={
                        totals
                            ? `${(totals.inputTokens + totals.outputTokens).toLocaleString()}`
                            : "—"
                    }
                    sub={
                        totals
                            ? `${totals.inputTokens.toLocaleString()} in · ${totals.outputTokens.toLocaleString()} out`
                            : ""
                    }
                    icon={<Cpu className="h-4 w-4 text-purple-500" />}
                />
                <KpiCard
                    label="Failure rate"
                    value={totals ? `${(totals.failureRate * 100).toFixed(1)}%` : "—"}
                    sub=""
                    icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
                    valueCls={
                        totals && totals.failureRate > 0.05
                            ? "text-red-600 dark:text-red-300"
                            : ""
                    }
                />
            </div>

            {/* Rows */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : !data || data.rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <BarChart3 className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No runs in this window.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Rows appear here when chatagent posts{" "}
                        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                            agent_run.completed
                        </code>{" "}
                        events. Trigger Compliance Guard or Insights to populate.
                    </p>
                </div>
            ) : (
                <CostTable rows={data.rows} groupBy={groupBy} totalCost={totals?.costUsd ?? 0} />
            )}
        </div>
    );
}

function CostTable({
    rows,
    groupBy,
    totalCost,
}: {
    rows: RollupRow[];
    groupBy: GroupBy;
    totalCost: number;
}) {
    const maxCost = useMemo(
        () => rows.reduce((m, r) => Math.max(m, r.costUsd), 0),
        [rows],
    );
    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                        <th className="px-4 py-3">{GROUP_LABELS[groupBy]}</th>
                        <th className="px-4 py-3 text-right">Runs</th>
                        <th className="px-4 py-3 text-right">In + Out tokens</th>
                        <th className="px-4 py-3 text-right">Cost (USD)</th>
                        <th className="px-4 py-3 text-right">Avg latency</th>
                        <th className="px-4 py-3 text-right">Fail %</th>
                        <th className="px-4 py-3">Share</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const sharePct =
                            totalCost > 0
                                ? Math.round((r.costUsd / totalCost) * 100)
                                : 0;
                        const barPct =
                            maxCost > 0
                                ? Math.max(2, Math.round((r.costUsd / maxCost) * 100))
                                : 0;
                        return (
                            <tr
                                key={r.groupKey}
                                className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                            >
                                <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-100">
                                    {truncateMiddle(r.groupKey, 40)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                                    {r.runs}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                                    {(r.inputTokens + r.outputTokens).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                    ${r.costUsd.toFixed(6)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                                    {r.avgLatencyMs}ms
                                </td>
                                <td
                                    className={`px-4 py-3 text-right text-sm tabular-nums ${
                                        r.failureRate > 0.05
                                            ? "text-red-600 dark:text-red-300"
                                            : "text-slate-600 dark:text-slate-300"
                                    }`}
                                >
                                    {(r.failureRate * 100).toFixed(1)}%
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                            <div
                                                className="h-full rounded-full bg-purple-500"
                                                style={{ width: `${barPct}%` }}
                                            />
                                        </div>
                                        <span className="w-8 text-right text-xs text-slate-500 dark:text-slate-400">
                                            {sharePct}%
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function KpiCard({
    label,
    value,
    sub,
    icon,
    valueCls,
}: {
    label: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
    valueCls?: string;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {label}
                </p>
                {icon}
            </div>
            <p className={`text-xl font-bold text-slate-900 dark:text-slate-50 ${valueCls ?? ""}`}>
                {value}
            </p>
            {sub && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>
            )}
        </div>
    );
}

function truncateMiddle(s: string, max: number): string {
    if (s.length <= max) return s;
    const half = Math.floor((max - 3) / 2);
    return `${s.slice(0, half)}...${s.slice(s.length - half)}`;
}

async function downloadCsv(qs: string, filename: string): Promise<void> {
    try {
        const res = await wfetch(`/api/lms/agents/cost?${qs}`);
        if (!res.ok) {
            alert(`Download failed: HTTP ${res.status}`);
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert(`Download failed: ${err instanceof Error ? err.message : "error"}`);
    }
}
