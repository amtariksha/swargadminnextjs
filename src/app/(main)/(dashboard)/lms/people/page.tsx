"use client";

/**
 * /lms/people — Unified customer + lead viewer.
 *
 * Pulls public.contacts + RFM + Health into a single filterable list.
 * Filter chips: RFM segment + churn risk. Free-text on name/phone/email.
 *
 * Detail panel (right side on wide screens, modal on mobile) shows the
 * contact's consent state, RFM, recent activity. C9.x will add inline
 * tag-assign + journey-enroll actions.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Users,
    Loader2,
    Search,
    Phone,
    Mail,
    Sparkles,
    AlertTriangle,
    TrendingDown,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { RfmSegmentLabel, ChurnRisk } from "@/lib/lms/rfm/types";
import type { UnifiedPerson } from "@/app/api/lms/people/route";

const SEGMENTS: Array<RfmSegmentLabel | "all"> = [
    "all",
    "Champions",
    "Loyal",
    "Promising",
    "At-Risk",
    "Hibernating",
    "Lost",
];

const CHURN: Array<ChurnRisk | "all"> = ["all", "low", "medium", "high"];

const SEGMENT_CLS: Record<RfmSegmentLabel, string> = {
    Champions: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    Loyal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Promising: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    "At-Risk": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    Hibernating: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    Lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const CHURN_CLS: Record<ChurnRisk, string> = {
    low: "text-emerald-600 dark:text-emerald-300",
    medium: "text-amber-600 dark:text-amber-300",
    high: "text-red-600 dark:text-red-300",
};

export default function PeoplePage() {
    const [people, setPeople] = useState<UnifiedPerson[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [segment, setSegment] = useState<RfmSegmentLabel | "all">("all");
    const [churnRisk, setChurnRisk] = useState<ChurnRisk | "all">("all");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const sp = new URLSearchParams();
            if (search.trim()) sp.set("q", search.trim());
            if (segment !== "all") sp.set("segment", segment);
            if (churnRisk !== "all") sp.set("churn", churnRisk);
            sp.set("limit", "200");
            const res = await wfetch(`/api/lms/people?${sp}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as {
                people: UnifiedPerson[];
                total: number;
            };
            setPeople(data.people);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [search, segment, churnRisk]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                    <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        People
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        {total} contacts · enriched with RFM segment + health score
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name / phone / email"
                        className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                </div>
                <select
                    value={segment}
                    onChange={(e) => setSegment(e.target.value as RfmSegmentLabel | "all")}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                    {SEGMENTS.map((s) => (
                        <option key={s} value={s}>
                            {s === "all" ? "All segments" : s}
                        </option>
                    ))}
                </select>
                <select
                    value={churnRisk}
                    onChange={(e) => setChurnRisk(e.target.value as ChurnRisk | "all")}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                    {CHURN.map((c) => (
                        <option key={c} value={c}>
                            {c === "all" ? "All churn risk" : `Churn: ${c}`}
                        </option>
                    ))}
                </select>
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
            ) : people.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <Users className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No people match these filters.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Contact</th>
                                <th className="px-4 py-3">Segment</th>
                                <th className="px-4 py-3">Health</th>
                                <th className="px-4 py-3">Churn</th>
                                <th className="px-4 py-3">Since</th>
                            </tr>
                        </thead>
                        <tbody>
                            {people.map((p) => (
                                <tr
                                    key={p.contactId}
                                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40"
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800 dark:text-slate-100">
                                            {p.name ?? "—"}
                                        </div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500">
                                            {p.contactId.slice(0, 8)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                                        <div className="flex flex-col gap-0.5">
                                            {p.phone && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Phone className="h-3 w-3 text-slate-400" />
                                                    {p.phone}
                                                </span>
                                            )}
                                            {p.email && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Mail className="h-3 w-3 text-slate-400" />
                                                    {p.email}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {p.rfmSegment ? (
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${SEGMENT_CLS[p.rfmSegment]}`}
                                            >
                                                {p.rfmSegment}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {p.healthScore !== null ? (
                                            <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                                                <Sparkles className="h-3 w-3 text-purple-500" />
                                                {p.healthScore}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {p.churnRisk ? (
                                            <span
                                                className={`inline-flex items-center gap-1 font-medium capitalize ${CHURN_CLS[p.churnRisk]}`}
                                            >
                                                {p.churnRisk === "high" && (
                                                    <TrendingDown className="h-3 w-3" />
                                                )}
                                                {p.churnRisk}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                        {new Date(p.createdAt).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
