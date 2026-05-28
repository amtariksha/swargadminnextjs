"use client";

/**
 * /lms/journeys — pre-built journey templates with active/paused toggle.
 *
 * Operators don't author DSL in Phase 1. They install templates with one
 * click, then flip individual journeys on/off. The DSL is visible in
 * a JSON viewer for transparency.
 *
 * Step graph editor + per-template funnel stats land in C9 once we have
 * enough live journey runs to make the stats meaningful.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Workflow,
    Loader2,
    Play,
    Pause,
    Download,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { Journey } from "@/lib/lms/journeys/service";

export default function JourneysPage() {
    const [journeys, setJourneys] = useState<Journey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installing, setInstalling] = useState(false);
    const [installMsg, setInstallMsg] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/journeys");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as { journeys: Journey[] };
            setJourneys(data.journeys);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onInstallAll = async () => {
        setInstalling(true);
        setInstallMsg(null);
        try {
            const res = await wfetch("/api/lms/journeys/install", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setInstallMsg(
                `Installed ${body.installed.length} · Skipped ${body.skipped.length} · Errors ${body.errors.length}`,
            );
            await load();
        } catch (err) {
            setInstallMsg(
                `Install failed: ${err instanceof Error ? err.message : "error"}`,
            );
        } finally {
            setInstalling(false);
        }
    };

    const onToggle = async (j: Journey) => {
        try {
            const res = await wfetch(`/api/lms/journeys/${j.id}/toggle`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !j.isActive }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            await load();
        } catch (err) {
            alert(`Toggle failed: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                        <Workflow className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            Journeys
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Multi-step automations. Pre-built templates ship inactive — install,
                            review, then flip on.
                        </p>
                    </div>
                </div>
                <button
                    onClick={onInstallAll}
                    disabled={installing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                    {installing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    Install all templates
                </button>
            </div>

            {installMsg && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                    <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    {installMsg}
                </div>
            )}

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
            ) : journeys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <Workflow className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No journeys installed yet.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Click "Install all templates" to register the bundled Welcome and
                        Replenishment journeys.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {journeys.map((j) => (
                        <div
                            key={j.id}
                            className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        >
                            <div className="flex items-start justify-between gap-4 p-5">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                                            {j.name}
                                        </h3>
                                        {j.isActive ? (
                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                Paused
                                            </span>
                                        )}
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                                            v{j.version}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                        Trigger:{" "}
                                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                                            {j.triggerEvent}
                                        </code>
                                        {" · "}
                                        {j.dsl.steps.length} step
                                        {j.dsl.steps.length === 1 ? "" : "s"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => onToggle(j)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                                        j.isActive
                                            ? "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                                    }`}
                                >
                                    {j.isActive ? (
                                        <>
                                            <Pause className="h-3.5 w-3.5" />
                                            Pause
                                        </>
                                    ) : (
                                        <>
                                            <Play className="h-3.5 w-3.5" />
                                            Activate
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-800">
                                <button
                                    onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                                    className="w-full px-5 py-2 text-left text-xs font-medium text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                                >
                                    {expanded === j.id ? "Hide" : "Show"} step graph
                                </button>
                                {expanded === j.id && (
                                    <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                                        <ol className="space-y-2">
                                            {j.dsl.steps.map((s, i) => (
                                                <li
                                                    key={s.id}
                                                    className="flex items-start gap-3 text-sm"
                                                >
                                                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                                                        {i + 1}
                                                    </span>
                                                    <div>
                                                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-slate-800">
                                                            {s.type}
                                                        </code>{" "}
                                                        <span className="text-slate-600 dark:text-slate-300">
                                                            {summariseStep(s)}
                                                        </span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">
                <p className="mb-2 font-semibold text-slate-700 dark:text-slate-200">
                    How journey ticks happen
                </p>
                <p>
                    The scheduler runs every minute via Vercel Cron at{" "}
                    <code className="rounded bg-slate-200/50 px-1 py-0.5 text-xs dark:bg-slate-700">
                        /api/cron/journeys-tick
                    </code>
                    . It picks up runs whose{" "}
                    <code className="rounded bg-slate-200/50 px-1 py-0.5 text-xs dark:bg-slate-700">
                        next_action_at &lt;= now()
                    </code>
                    , walks the next step, then either schedules the following step or exits.
                    Set <code className="rounded bg-slate-200/50 px-1 py-0.5 text-xs dark:bg-slate-700">CRON_SECRET</code>{" "}
                    in Vercel env to enable.
                </p>
            </div>
        </div>
    );
}

function summariseStep(s: import("@/lib/lms/journeys/dsl").JourneyStep): string {
    switch (s.type) {
        case "send_template":
            return `${s.templateName} · purpose=${s.purpose} · needs ${s.requiresConsent}`;
        case "wait":
            return s.days
                ? `wait ${s.days}d`
                : s.hours
                  ? `wait ${s.hours}h`
                  : "wait";
        case "tag":
            return `${s.action} ${s.namespace}:${s.tagName}`;
        case "branch":
            return `branch on ${s.condition.kind} → ${s.onTrueGoto} / ${s.onFalseGoto}`;
        case "enroll_in":
            return `enroll in "${s.journeyName}"`;
        case "exit":
            return `exit (${s.reason})`;
    }
}
