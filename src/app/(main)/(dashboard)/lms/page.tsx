"use client";

/**
 * /lms — Today screen
 *
 * Real landing page. Surfaces:
 *   1. Five headline numbers (computed from real RFM + leads + journey state).
 *   2. AI-flagged actions feed from lms_insights_feed — Approve/Snooze/Dismiss.
 *   3. Agent Force health badge.
 *   4. Quick-action tiles for power users.
 *
 * The "live campaigns" + "calendar strip" sections from the spec arrive
 * when C9.x (Campaigns UI) lands.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Sparkles,
    Loader2,
    Users,
    UserPlus,
    AlertTriangle,
    CheckCircle2,
    TrendingDown,
    Megaphone,
    Workflow,
    Inbox,
    Zap,
    Clock,
    XCircle,
    BellOff,
    PlayCircle,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { RfmSegmentLabel, ChurnRisk } from "@/lib/lms/rfm/types";

interface Insight {
    id: string;
    org_id: string;
    kind: string;
    title: string;
    body: string | null;
    priority: number;
    state: string;
    cta_action: Record<string, unknown> | null;
    expires_at: string;
    created_at: string;
}

interface DashboardData {
    rfm: {
        totalRows: number;
        segmentCounts: Record<RfmSegmentLabel, number>;
    };
    health: {
        averageScore: number;
        churnCounts: Record<ChurnRisk, number>;
    };
    leads: { total: number };
    insights: Insight[];
    agentForce: {
        configured: boolean;
        reachable: boolean;
        latencyMs?: number;
        error?: string;
    };
}

export default function TodayPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [runningInsights, setRunningInsights] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rfm, leads, insights, agent] = await Promise.all([
                wfetch("/api/lms/rfm/status").then((r) => r.json()),
                wfetch("/api/lms/leads?limit=1").then((r) => r.json()),
                wfetch("/api/lms/insights").then((r) => r.json()),
                wfetch("/api/lms/agent-force/ping").then((r) => r.json()),
            ]);
            setData({
                rfm: rfm.rfm ?? {
                    totalRows: 0,
                    segmentCounts: {
                        Champions: 0,
                        Loyal: 0,
                        Promising: 0,
                        "At-Risk": 0,
                        Hibernating: 0,
                        Lost: 0,
                    },
                },
                health: rfm.health ?? {
                    averageScore: 0,
                    churnCounts: { low: 0, medium: 0, high: 0 },
                },
                leads: { total: leads.total ?? 0 },
                insights: insights.insights ?? [],
                agentForce: agent,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onRunInsights = async () => {
        if (
            !confirm(
                "Run the Insights agent now? It scans your RFM + churn + replenishment state and writes up to 5 flagged actions to the feed below.",
            )
        ) {
            return;
        }
        setRunningInsights(true);
        try {
            const res = await wfetch("/api/lms/insights/run", { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            await load();
        } catch (err) {
            alert(`Insights run failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setRunningInsights(false);
        }
    };

    const onInsightAction = async (
        insight: Insight,
        action: "approve" | "snooze" | "dismiss",
    ) => {
        try {
            const res = await wfetch(`/api/lms/insights/${insight.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    snoozeHours: action === "snooze" ? 24 : undefined,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            await load();
        } catch (err) {
            alert(`Action failed: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    const segmentTotal = useMemo(
        () => (data ? data.rfm.totalRows : 0),
        [data],
    );

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-3 shadow-lg shadow-purple-500/30">
                        <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                            Today
                        </h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            Your LMS at a glance — what's happening, what needs attention, what to ship next.
                        </p>
                    </div>
                </div>
                <button
                    onClick={onRunInsights}
                    disabled={runningInsights}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                    {runningInsights ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Zap className="h-4 w-4" />
                    )}
                    Run insights
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : !data ? null : (
                <>
                    {/* Headline metrics */}
                    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
                        <MetricCard
                            label="Total customers"
                            value={segmentTotal}
                            icon={<Users className="h-4 w-4" />}
                            href="/lms/people"
                        />
                        <MetricCard
                            label="Champions"
                            value={data.rfm.segmentCounts.Champions ?? 0}
                            icon={<Sparkles className="h-4 w-4 text-purple-500" />}
                            href="/lms/segments"
                            cls="text-purple-700 dark:text-purple-300"
                        />
                        <MetricCard
                            label="At-risk + High churn"
                            value={
                                (data.rfm.segmentCounts["At-Risk"] ?? 0) +
                                data.health.churnCounts.high
                            }
                            icon={<TrendingDown className="h-4 w-4 text-amber-500" />}
                            href="/lms/system"
                            cls="text-amber-700 dark:text-amber-300"
                        />
                        <MetricCard
                            label="Active leads"
                            value={data.leads.total}
                            icon={<UserPlus className="h-4 w-4" />}
                            href="/lms/leads"
                        />
                        <MetricCard
                            label="Health avg"
                            value={`${data.health.averageScore}/100`}
                            icon={<Sparkles className="h-4 w-4 text-emerald-500" />}
                            href="/lms/system"
                            cls="text-emerald-700 dark:text-emerald-300"
                        />
                    </div>

                    {/* Agent Force status */}
                    <AgentForceBadge status={data.agentForce} />

                    {/* AI-flagged actions */}
                    <div className="mb-6 mt-6">
                        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
                            <Zap className="h-5 w-5 text-purple-500" />
                            AI-flagged actions
                            {data.insights.length > 0 && (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                                    {data.insights.length}
                                </span>
                            )}
                        </h2>
                        {data.insights.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                                <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                    All clear — no flagged actions.
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Insights agent flags up to 5 high-impact opportunities per day. Click
                                    "Run insights" above to trigger now.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {data.insights.map((i) => (
                                    <InsightRow
                                        key={i.id}
                                        insight={i}
                                        onAction={(a) => onInsightAction(i, a)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quick-action tiles */}
                    <div>
                        <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-50">
                            Jump to
                        </h2>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <QuickTile
                                icon={<UserPlus className="h-5 w-5" />}
                                label="Leads"
                                href="/lms/leads"
                            />
                            <QuickTile
                                icon={<Megaphone className="h-5 w-5" />}
                                label="Campaigns"
                                href="/lms/campaigns"
                            />
                            <QuickTile
                                icon={<Workflow className="h-5 w-5" />}
                                label="Journeys"
                                href="/lms/journeys"
                            />
                            <QuickTile
                                icon={<Inbox className="h-5 w-5" />}
                                label="Inbox"
                                href="/whatsapp"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Components ───────────────────────────────────────────────────────────

function MetricCard({
    label,
    value,
    icon,
    href,
    cls,
}: {
    label: string;
    value: number | string;
    icon: React.ReactNode;
    href: string;
    cls?: string;
}) {
    return (
        <Link
            href={href}
            className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-purple-300 hover:shadow-md hover:shadow-purple-500/10 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-purple-500/50"
        >
            <div className="mb-2 flex items-center justify-between text-slate-400">
                {icon}
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {label}
            </p>
            <p className={`mt-0.5 text-xl font-bold text-slate-900 dark:text-slate-50 ${cls ?? ""}`}>
                {value}
            </p>
        </Link>
    );
}

function AgentForceBadge({
    status,
}: {
    status: DashboardData["agentForce"];
}) {
    if (!status.configured) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                <strong>Agent Force not configured.</strong> Set{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-500/20">
                    AGENT_FORCE_URL
                </code>
                ,{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-500/20">
                    AGENT_FORCE_EMAIL
                </code>
                ,{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-500/20">
                    AGENT_FORCE_PASSWORD
                </code>{" "}
                in Vercel env. Agent-powered features (insights, lead triage, reply
                suggestions, compliance guard) will be inert until then.
            </div>
        );
    }
    if (!status.reachable) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                <strong>Agent Force unreachable.</strong> {status.error ?? "unknown error"}
            </div>
        );
    }
    return (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-text-bottom" />
            <strong>Agent Force online.</strong> Latency {status.latencyMs}ms.
        </div>
    );
}

function InsightRow({
    insight,
    onAction,
}: {
    insight: Insight;
    onAction: (a: "approve" | "snooze" | "dismiss") => void;
}) {
    const priorityCls =
        insight.priority >= 4
            ? "border-l-red-500"
            : insight.priority >= 3
              ? "border-l-amber-500"
              : "border-l-blue-500";

    return (
        <div
            className={`flex items-start gap-3 rounded-lg border border-slate-200 border-l-4 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 ${priorityCls}`}
        >
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {insight.title}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {insight.kind}
                    </span>
                </div>
                {insight.body && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {insight.body}
                    </p>
                )}
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    <Clock className="mr-1 inline h-3 w-3 align-text-bottom" />
                    Expires {new Date(insight.expires_at).toLocaleString()}
                </p>
            </div>
            <div className="flex shrink-0 gap-1">
                <button
                    onClick={() => onAction("approve")}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    title="Approve"
                >
                    <PlayCircle className="h-3.5 w-3.5" />
                    Approve
                </button>
                <button
                    onClick={() => onAction("snooze")}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    title="Snooze 24h"
                >
                    <BellOff className="h-3.5 w-3.5" />
                </button>
                <button
                    onClick={() => onAction("dismiss")}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                    title="Dismiss"
                >
                    <XCircle className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}

function QuickTile({
    icon,
    label,
    href,
}: {
    icon: React.ReactNode;
    label: string;
    href: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-purple-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-purple-500/50"
        >
            <div className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {icon}
            </div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {label}
            </span>
        </Link>
    );
}
