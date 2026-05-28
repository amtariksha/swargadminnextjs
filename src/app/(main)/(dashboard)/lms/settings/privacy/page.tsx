"use client";

/**
 * /lms/settings/privacy — Consent & Privacy
 *
 * Phase 1 scope:
 *   • DSAR Queue tab — Data Subject Access Requests with a 7-day SLA
 *     countdown per row. Operators triage manually until automation lands.
 *   • Privacy Notice tab — read the current published notice text.
 *
 * Coming later in the LMS build:
 *   • Consent ledger viewer (per-customer drill-down lives on the People page).
 *   • Notice editor (publishes a new version → triggers consent renewal banner).
 *   • Vendor DPA list (spec §10.1 control #9).
 */

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, FileText, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { DsarRequest, DsarStatus, PrivacyNotice } from "@/lib/lms/types";

type Tab = "queue" | "notice";

// Same status palette used on the DSAR row badges + filter chips.
const STATUS_STYLES: Record<DsarStatus, { label: string; cls: string }> = {
    submitted: { label: "Submitted", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
    verifying_identity: { label: "Verifying", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
    in_progress: { label: "In progress", cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
    fulfilled: { label: "Fulfilled", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    rejected: { label: "Rejected", cls: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
    expired: { label: "Expired", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

export default function PrivacyPage() {
    const [tab, setTab] = useState<Tab>("queue");

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                    <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        Privacy &amp; Consent
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        DPDP-compliant consent ledger, data subject requests, and the published privacy notice.
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit dark:bg-slate-800/60">
                <TabButton active={tab === "queue"} onClick={() => setTab("queue")} icon={<Clock className="h-4 w-4" />}>
                    DSAR Queue
                </TabButton>
                <TabButton active={tab === "notice"} onClick={() => setTab("notice")} icon={<FileText className="h-4 w-4" />}>
                    Privacy Notice
                </TabButton>
            </div>

            {tab === "queue" ? <DsarQueue /> : <PrivacyNoticeViewer />}
        </div>
    );
}

function TabButton({
    active,
    onClick,
    icon,
    children,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                active
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
        >
            {icon}
            {children}
        </button>
    );
}

// ─── DSAR Queue ──────────────────────────────────────────────────────────

function DsarQueue() {
    const [requests, setRequests] = useState<DsarRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<DsarStatus | "all">("all");

    useEffect(() => {
        const ctrl = new AbortController();
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await wfetch(`/api/lms/dsar?status=${statusFilter}`, {
                    signal: ctrl.signal,
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error ?? `HTTP ${res.status}`);
                }
                const data = (await res.json()) as { requests: DsarRequest[] };
                setRequests(data.requests);
            } catch (err) {
                if (ctrl.signal.aborted) return;
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        })();
        return () => ctrl.abort();
    }, [statusFilter]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: requests.length };
        for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
        return c;
    }, [requests]);

    if (error) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <strong>Failed to load DSAR queue.</strong> {error}
            </div>
        );
    }

    return (
        <div>
            {/* Filter chips */}
            <div className="mb-4 flex flex-wrap gap-2">
                {(["all", "submitted", "verifying_identity", "in_progress", "fulfilled", "expired", "rejected"] as const).map(
                    (s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                statusFilter === s
                                    ? "bg-purple-600 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            }`}
                        >
                            {s === "all" ? "All" : STATUS_STYLES[s as DsarStatus]?.label ?? s}
                            <span className="ml-1.5 opacity-70">{counts[s] ?? 0}</span>
                        </button>
                    ),
                )}
            </div>

            {loading ? (
                <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                    Loading requests…
                </div>
            ) : requests.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No requests {statusFilter !== "all" ? `in "${STATUS_STYLES[statusFilter as DsarStatus]?.label}"` : ""}.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Data principals can submit requests at <code>/api/lms/dsar/submit</code> or via{" "}
                        <a href="mailto:privacy@swargfood.com" className="text-purple-600 hover:underline dark:text-purple-400">
                            privacy@swargfood.com
                        </a>
                        .
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                                <th className="px-4 py-3">Contact</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">SLA</th>
                                <th className="px-4 py-3">Submitted</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((r) => (
                                <DsarRow key={r.id} req={r} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function DsarRow({ req }: { req: DsarRequest }) {
    const remaining = useSlaCountdown(req.slaDeadline, req.status);
    const style = STATUS_STYLES[req.status];

    return (
        <tr className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
            <td className="px-4 py-3 text-sm">
                <div className="font-medium text-slate-800 dark:text-slate-100">
                    {req.contactPhone ?? req.contactEmail ?? "—"}
                </div>
                {req.details && (
                    <div className="mt-0.5 line-clamp-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                        {req.details}
                    </div>
                )}
            </td>
            <td className="px-4 py-3 text-sm capitalize text-slate-700 dark:text-slate-200">{req.requestType}</td>
            <td className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${style.cls}`}>
                    {style.label}
                </span>
            </td>
            <td className="px-4 py-3 text-sm">
                <div className="flex items-center gap-1.5">
                    {remaining.overdue ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span
                        className={
                            remaining.overdue
                                ? "font-medium text-red-600 dark:text-red-300"
                                : remaining.urgent
                                  ? "font-medium text-amber-600 dark:text-amber-300"
                                  : "text-slate-600 dark:text-slate-300"
                        }
                    >
                        {remaining.label}
                    </span>
                </div>
            </td>
            <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                {new Date(req.createdAt).toLocaleString()}
            </td>
        </tr>
    );
}

function useSlaCountdown(deadline: string, status: DsarStatus) {
    return useMemo(() => {
        if (status === "fulfilled" || status === "rejected") {
            return { label: "—", overdue: false, urgent: false };
        }
        const ms = new Date(deadline).getTime() - Date.now();
        if (ms < 0) return { label: "Overdue", overdue: true, urgent: false };
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        const label =
            days > 0
                ? `${days}d ${hours % 24}h`
                : hours > 0
                  ? `${hours}h`
                  : "<1h";
        return { label, overdue: false, urgent: hours < 24 };
    }, [deadline, status]);
}

// ─── Privacy Notice viewer ───────────────────────────────────────────────

function PrivacyNoticeViewer() {
    const [notice, setNotice] = useState<PrivacyNotice | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await wfetch("/api/lms/consent/notice/latest?lang=en");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as { notice: PrivacyNotice };
                setNotice(data.notice);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                Loading notice…
            </div>
        );
    }
    if (error || !notice) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <strong>Failed to load privacy notice.</strong> {error ?? "Unknown error."}
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Currently published
                    </p>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-50">
                        Version {notice.version}{" "}
                        <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                            {notice.language.toUpperCase()}
                        </span>
                    </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    Live
                </span>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                {notice.bodyMarkdown}
            </pre>
            <p className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                Publish a new version by adding a file under{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
                    src/content/privacy-notices/v&lt;X.Y&gt;.&lt;lang&gt;.md
                </code>{" "}
                and deploying. Customers on the old version see a consent-renewal banner on next interaction.
            </p>
        </div>
    );
}
