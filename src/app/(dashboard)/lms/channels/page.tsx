"use client";

/**
 * /lms/channels — WhatsApp Channels & Routing.
 *
 * Phase 1 surfaces:
 *   • The two-number doctrine (header card).
 *   • Recent routing audit entries with per-number tally.
 *   • Helpful copy for operators on what gets routed where.
 *
 * Quality-rating monitoring + template approval queue land later in C6/C8.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Smartphone,
    Megaphone,
    ShieldCheck,
    Loader2,
    AlertTriangle,
    RefreshCw,
    CheckCircle2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";

interface AuditEntry {
    id: string;
    org_id: string;
    purpose: string;
    picked_number: "1" | "2";
    integrated_number_id: string | null;
    campaign_message_id: string | null;
    rejected: boolean;
    rejection_reason: string | null;
    created_at: string;
}

interface AuditResponse {
    count: number;
    total: number;
    summary: {
        number1Count: number;
        number2Count: number;
        rejectedCount: number;
    };
    entries: AuditEntry[];
}

export default function ChannelsPage() {
    const [data, setData] = useState<AuditResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [purposeFilter, setPurposeFilter] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = purposeFilter ? `?purpose=${encodeURIComponent(purposeFilter)}` : "";
            const res = await wfetch(`/api/lms/routing/audit${qs}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setData((await res.json()) as AuditResponse);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [purposeFilter]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                    <Smartphone className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        WhatsApp Channels &amp; Routing
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        The two-number doctrine in action. Every outbound send is logged here
                        so you can verify the routing rule is enforced end-to-end.
                    </p>
                </div>
            </div>

            {/* Two-number doctrine cards */}
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumberCard
                    label="Number 1"
                    purpose="Transactional"
                    description="Order confirmations · OTPs · Delivery updates · Support replies"
                    color="emerald"
                    tally={data?.summary.number1Count ?? 0}
                    icon={<ShieldCheck className="h-5 w-5" />}
                />
                <NumberCard
                    label="Number 2"
                    purpose="Marketing"
                    description="Broadcasts · Win-backs · Festival pre-orders · Cross-sell"
                    color="purple"
                    tally={data?.summary.number2Count ?? 0}
                    icon={<Megaphone className="h-5 w-5" />}
                />
            </div>

            {/* The rule */}
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                <strong className="font-semibold">The rule that must never be broken:</strong>{" "}
                A transactional message <em>never</em> goes via Number 2. A marketing
                message <em>never</em> goes via Number 1. Routing is enforced at the
                send-helper layer (<code>src/lib/whatsapp/router.ts</code>), so mismatched
                purpose/number combos throw before they reach Meta.
            </div>

            {/* Audit log */}
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                    Recent routing decisions
                </h2>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={purposeFilter}
                        onChange={(e) => setPurposeFilter(e.target.value)}
                        placeholder="Filter by purpose (e.g. mkt_broadcast)"
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                        onClick={() => load()}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    {error}
                </div>
            )}

            {data && data.summary.rejectedCount > 0 && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <strong>{data.summary.rejectedCount} rejected sends</strong> in this view —
                    inspect rows below for the reason.
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : !data || data.entries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No routing decisions logged yet.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Audit rows will appear as soon as the LMS or WhatsApp surface starts
                        sending messages through the router.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                                <th className="px-4 py-3">When</th>
                                <th className="px-4 py-3">Purpose</th>
                                <th className="px-4 py-3">Number</th>
                                <th className="px-4 py-3">Outcome</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.entries.map((e) => (
                                <tr
                                    key={e.id}
                                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                                >
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                        {new Date(e.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-100">
                                        {e.purpose}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                                e.picked_number === "1"
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                                    : "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
                                            }`}
                                        >
                                            #{e.picked_number}{" "}
                                            {e.picked_number === "1" ? "(txn)" : "(mkt)"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {e.rejected ? (
                                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-300">
                                                <AlertTriangle className="h-3 w-3" />
                                                Rejected: {e.rejection_reason ?? "no reason"}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Sent
                                            </span>
                                        )}
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

function NumberCard({
    label,
    purpose,
    description,
    color,
    tally,
    icon,
}: {
    label: string;
    purpose: string;
    description: string;
    color: "emerald" | "purple";
    tally: number;
    icon: React.ReactNode;
}) {
    const cls =
        color === "emerald"
            ? "from-emerald-500/10 border-emerald-200 text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300"
            : "from-purple-500/10 border-purple-200 text-purple-700 dark:border-purple-500/30 dark:text-purple-300";
    return (
        <div
            className={`rounded-xl border bg-gradient-to-br to-transparent p-5 dark:bg-slate-900 ${cls}`}
        >
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {label}
                    </span>
                </div>
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {tally}
                </span>
            </div>
            <p className="text-sm font-semibold uppercase tracking-wider opacity-80">
                {purpose} only
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</p>
        </div>
    );
}
