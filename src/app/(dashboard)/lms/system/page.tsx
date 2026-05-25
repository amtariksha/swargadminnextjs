"use client";

/**
 * /lms/system — Operator control panel for batch jobs.
 *
 * Phase 1 surfaces:
 *   • RFM + Health snapshot (segment + churn-risk counts, last computed at).
 *   • "Recompute now" button (real, talks to backend `/get_order`).
 *   • "Seed demo data" button (random plausible values — test convenience).
 *
 * Future additions: automated tag rules executor, journey scheduler health,
 * Agent Force connectivity, webhook retry queue.
 */

import { useCallback, useEffect, useState } from "react";
import {
    BarChart3,
    Loader2,
    RefreshCw,
    Sparkles,
    AlertTriangle,
    CheckCircle2,
    FlaskConical,
    TrendingDown,
    Users,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { RfmSegmentLabel, ChurnRisk } from "@/lib/lms/rfm/types";

interface StatusResponse {
    rfm: {
        totalRows: number;
        lastComputedAt: string | null;
        segmentCounts: Record<RfmSegmentLabel, number>;
    };
    health: {
        totalRows: number;
        lastComputedAt: string | null;
        averageScore: number;
        churnCounts: Record<ChurnRisk, number>;
    };
}

interface RecomputeResult {
    contactCount: number;
    rowsWritten: number;
    backendOk: boolean;
    backendError?: string;
    computedAt: string;
    durationMs: number;
}

const SEGMENT_COLORS: Record<RfmSegmentLabel, string> = {
    Champions: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    Loyal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Promising: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    "At-Risk": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    Hibernating: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    Lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const CHURN_COLORS: Record<ChurnRisk, string> = {
    low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

export default function SystemPage() {
    const [status, setStatus] = useState<StatusResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [recomputing, setRecomputing] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [lastRunNote, setLastRunNote] = useState<{
        kind: "real" | "demo";
        result: RecomputeResult;
    } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/rfm/status");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setStatus((await res.json()) as StatusResponse);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onRecompute = async () => {
        setRecomputing(true);
        try {
            const res = await wfetch("/api/lms/rfm/recompute", { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setLastRunNote({ kind: "real", result: body as RecomputeResult });
            await load();
        } catch (err) {
            alert(`Recompute failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setRecomputing(false);
        }
    };

    const onSeedDemo = async () => {
        if (
            !confirm(
                "Seed demo RFM data? This OVERWRITES existing RFM + Health rows for every contact in this org with plausible random values. Use only on a test / staging org or before real order data is wired in.",
            )
        ) {
            return;
        }
        setSeeding(true);
        try {
            const res = await wfetch("/api/lms/rfm/seed-demo", { method: "POST" });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setLastRunNote({
                kind: "demo",
                result: {
                    ...body,
                    backendOk: true,
                    durationMs: 0,
                } as RecomputeResult,
            });
            await load();
        } catch (err) {
            alert(`Seed failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                    <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        System &amp; Jobs
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Manually trigger batch jobs and view their last-run state.
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <strong>Failed to load status.</strong> {error}
                </div>
            )}

            {/* RFM card */}
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
                            <Users className="h-5 w-5 text-purple-500" />
                            RFM &amp; Health Scores
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                            Recency / Frequency / Monetary per customer, plus a 0–100 health
                            score and next-best-action recommendation.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onSeedDemo}
                            disabled={seeding || recomputing}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            title="Generate random RFM rows for every contact (test convenience)"
                        >
                            {seeding ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <FlaskConical className="h-4 w-4" />
                            )}
                            Seed demo
                        </button>
                        <button
                            onClick={onRecompute}
                            disabled={recomputing || seeding}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                        >
                            {recomputing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                            Recompute now
                        </button>
                    </div>
                </div>

                {lastRunNote && (
                    <div
                        className={`mb-4 rounded-lg border p-3 text-sm ${
                            lastRunNote.kind === "demo"
                                ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
                                : lastRunNote.result.backendOk
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                        }`}
                    >
                        {lastRunNote.kind === "demo" ? (
                            <>
                                <FlaskConical className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                                <strong>Demo data seeded.</strong>{" "}
                                {lastRunNote.result.rowsWritten} of{" "}
                                {lastRunNote.result.contactCount} contacts populated with
                                random plausible RFM. Re-run "Recompute now" to overwrite with
                                real order data.
                            </>
                        ) : lastRunNote.result.backendOk ? (
                            <>
                                <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                                <strong>Real compute complete.</strong>{" "}
                                {lastRunNote.result.rowsWritten} rows written across{" "}
                                {lastRunNote.result.contactCount} contacts in{" "}
                                {lastRunNote.result.durationMs}ms.
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                                <strong>Backend fetch failed</strong> ({lastRunNote.result.backendError}).
                                Wrote zero-RFM rows for {lastRunNote.result.contactCount} contacts so
                                the segment evaluator still works. Fix backend access then re-run.
                            </>
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : status ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* RFM segments */}
                        <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    Segments
                                </h3>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {status.rfm.totalRows} rows
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {(Object.keys(status.rfm.segmentCounts) as RfmSegmentLabel[]).map(
                                    (label) => {
                                        const count = status.rfm.segmentCounts[label];
                                        const total = status.rfm.totalRows || 1;
                                        const pct = Math.round((count * 100) / total);
                                        return (
                                            <div key={label} className="flex items-center gap-2">
                                                <span
                                                    className={`inline-flex w-28 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEGMENT_COLORS[label]}`}
                                                >
                                                    {label}
                                                </span>
                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                                    <div
                                                        className="h-full rounded-full bg-purple-500"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <span className="w-12 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                    {count}
                                                </span>
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                Last computed:{" "}
                                {status.rfm.lastComputedAt
                                    ? new Date(status.rfm.lastComputedAt).toLocaleString()
                                    : "never"}
                            </p>
                        </div>

                        {/* Health + churn */}
                        <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                                    Health
                                </h3>
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {status.health.totalRows} rows
                                </span>
                            </div>
                            <div className="mb-3 rounded-lg bg-white p-3 dark:bg-slate-900">
                                <p className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                    Average score
                                </p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                                    {status.health.averageScore}
                                    <span className="text-sm font-normal text-slate-500">/100</span>
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                {(Object.keys(status.health.churnCounts) as ChurnRisk[]).map(
                                    (risk) => {
                                        const count = status.health.churnCounts[risk];
                                        const total = status.health.totalRows || 1;
                                        const pct = Math.round((count * 100) / total);
                                        return (
                                            <div key={risk} className="flex items-center gap-2">
                                                <span
                                                    className={`inline-flex w-24 justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${CHURN_COLORS[risk]}`}
                                                >
                                                    {risk === "high" && <TrendingDown className="h-3 w-3" />}
                                                    {risk}
                                                </span>
                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                                    <div
                                                        className={`h-full rounded-full ${
                                                            risk === "high"
                                                                ? "bg-red-500"
                                                                : risk === "medium"
                                                                  ? "bg-amber-500"
                                                                  : "bg-emerald-500"
                                                        }`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <span className="w-12 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
                                                    {count}
                                                </span>
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                Last computed:{" "}
                                {status.health.lastComputedAt
                                    ? new Date(status.health.lastComputedAt).toLocaleString()
                                    : "never"}
                            </p>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* What's next */}
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-5 dark:border-slate-700 dark:bg-slate-800/30">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Coming next
                </h3>
                <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                    <li>• Nightly Vercel Cron at 04:00 IST to recompute automatically.</li>
                    <li>• Auto-tag rules executor (assigns product / festival tags from orders + tags).</li>
                    <li>• Journey scheduler health (Welcome / Replenishment ticks).</li>
                    <li>• Agent Force connectivity check + per-agent cost trace.</li>
                </ul>
            </div>
        </div>
    );
}
