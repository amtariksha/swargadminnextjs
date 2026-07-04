"use client";

/**
 * /lms/at-risk — "At-risk today": the care person's morning call list.
 *
 * Top 10 worst health scores among high-churn-risk customers (nightly RFM
 * job), each with the suggested next-best-action as the call script line and
 * one-tap call / WhatsApp links. Worked top to bottom, to zero.
 */

import { useCallback, useEffect, useState } from "react";
import {
    TrendingDown,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Phone,
    MessageCircle,
    RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { wfetch } from "@/lib/whatsapp/wfetch";

interface AtRiskPerson {
    contactId: string;
    name: string | null;
    phone: string | null;
    riskLevel: string;
    healthScore: number;
    nextBestAction: string | null;
    segment: string | null;
    recencyDays: number | null;
}

interface AtRiskData {
    count: number;
    computedAt: string | null;
    stale: boolean;
    people: AtRiskPerson[];
}

export default function AtRiskPage() {
    const [data, setData] = useState<AtRiskData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/at-risk?limit=10");
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setData(body);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-amber-500 to-red-500 p-3 shadow-lg shadow-amber-500/30">
                        <TrendingDown className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                            At-risk today
                        </h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            The 10 customers most likely to lapse — call top to bottom, use
                            the suggested action as your opener.
                        </p>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    {error}
                </div>
            )}

            {data?.stale && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    Scores were computed{" "}
                    {data.computedAt ? new Date(data.computedAt).toLocaleString() : "a while ago"}{" "}
                    — over 48h old. Enable the nightly RFM job or run a recompute from{" "}
                    <Link href="/lms/system" className="underline">
                        System &amp; Jobs
                    </Link>
                    .
                </div>
            )}

            {loading && !data ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : !data || data.people.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                    <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No at-risk customers right now.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Scores recompute nightly once the RFM job is enabled. If this list
                        looks wrong, run a recompute from{" "}
                        <Link href="/lms/system" className="underline">
                            System &amp; Jobs
                        </Link>
                        .
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {data.people.map((p, idx) => (
                        <PersonRow key={p.contactId} person={p} rank={idx + 1} />
                    ))}
                </div>
            )}

            {data?.computedAt && !data.stale && (
                <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                    Scores computed {new Date(data.computedAt).toLocaleString()}.
                </p>
            )}
        </div>
    );
}

function PersonRow({ person, rank }: { person: AtRiskPerson; rank: number }) {
    const digits = (person.phone ?? "").replace(/\D/g, "");
    const riskCls =
        person.riskLevel === "high"
            ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";

    return (
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {rank}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {person.name || person.phone || "Unknown"}
                    </h3>
                    <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${riskCls}`}
                    >
                        {person.riskLevel} risk
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        health {person.healthScore}/100
                    </span>
                    {person.segment && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {person.segment}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {person.nextBestAction
                        ? `Suggested: ${person.nextBestAction.replace(/_/g, " ")}`
                        : "Check in and ask how their deliveries are going."}
                    {person.recencyDays != null && person.recencyDays < 9999 && (
                        <span className="text-slate-400 dark:text-slate-500">
                            {" "}
                            · last order {person.recencyDays}d ago
                        </span>
                    )}
                </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
                {digits && (
                    <>
                        <a
                            href={`tel:+${digits.length === 10 ? `91${digits}` : digits}`}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                            <Phone className="h-3.5 w-3.5" />
                            Call
                        </a>
                        <a
                            href={`https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <MessageCircle className="h-3.5 w-3.5" />
                            WhatsApp
                        </a>
                    </>
                )}
            </div>
        </div>
    );
}
