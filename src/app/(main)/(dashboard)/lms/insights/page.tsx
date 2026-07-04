"use client";

/**
 * /lms/insights — the full insights feed (the Today screen shows only
 * pending; this page adds state tabs so approved/snoozed/dismissed rows —
 * including the archived weekly CEO digests — stay readable).
 *
 * Actions reuse PATCH /api/lms/insights/[id]; "Run insights now" reuses the
 * Today screen's POST /api/lms/insights/run.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Zap,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    XCircle,
    BellOff,
    PlayCircle,
    Inbox,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";

interface Insight {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    priority: number;
    state: string;
    snooze_until: string | null;
    expires_at: string;
    created_at: string;
}

const TABS = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "snoozed", label: "Snoozed" },
    { key: "dismissed", label: "Dismissed" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function InsightsPage() {
    const [tab, setTab] = useState<TabKey>("pending");
    const [insights, setInsights] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    const load = useCallback(async (state: TabKey) => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch(`/api/lms/insights?state=${state}&limit=50`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setInsights(body.insights ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load(tab);
    }, [tab, load]);

    const onRunNow = async () => {
        if (
            !confirm(
                "Run the Insights agent now? It scans your RFM + churn + replenishment state and writes up to 5 flagged actions to the feed.",
            )
        ) {
            return;
        }
        setRunning(true);
        try {
            const res = await wfetch("/api/lms/insights/run", { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setTab("pending");
            await load("pending");
        } catch (err) {
            alert(`Insights run failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setRunning(false);
        }
    };

    const onAction = async (
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
            await load(tab);
        } catch (err) {
            alert(`Action failed: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 p-3 shadow-lg shadow-purple-500/30">
                        <Zap className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                            Insights
                        </h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            Everything the Insights agent has flagged — including the weekly
                            CEO digests. The nightly run lands here each morning.
                        </p>
                    </div>
                </div>
                <button
                    onClick={onRunNow}
                    disabled={running}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                    {running ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Zap className="h-4 w-4" />
                    )}
                    Run insights now
                </button>
            </div>

            <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 w-fit">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            tab === t.key
                                ? "bg-purple-600 text-white"
                                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
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
            ) : insights.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                    {tab === "pending" ? (
                        <>
                            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                All clear — nothing pending.
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                The Insights agent runs nightly (once enabled) and flags up to 5
                                high-impact actions. Click "Run insights now" to trigger one
                                immediately.
                            </p>
                        </>
                    ) : (
                        <>
                            <Inbox className="mx-auto mb-2 h-7 w-7 text-slate-400" />
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                No {tab} insights yet.
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {insights.map((i) => (
                        <InsightCard
                            key={i.id}
                            insight={i}
                            showActions={tab === "pending"}
                            onAction={(a) => onAction(i, a)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function InsightCard({
    insight,
    showActions,
    onAction,
}: {
    insight: Insight;
    showActions: boolean;
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
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">
                        {insight.body}
                    </p>
                )}
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    <Clock className="mr-1 inline h-3 w-3 align-text-bottom" />
                    Created {new Date(insight.created_at).toLocaleString()}
                    {insight.state === "snoozed" && insight.snooze_until
                        ? ` · snoozed until ${new Date(insight.snooze_until).toLocaleString()}`
                        : ` · expires ${new Date(insight.expires_at).toLocaleString()}`}
                </p>
            </div>
            {showActions && (
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
            )}
        </div>
    );
}
