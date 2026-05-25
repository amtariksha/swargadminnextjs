"use client";

/**
 * /lms/leads — filterable lead list.
 *
 * Phase-1 surface. Filters: status, source, free-text search. Click row →
 * detail page at /lms/leads/[leadId]. "New lead" → /lms/leads/new.
 *
 * Adds two operator buttons:
 *   • "Sync from contacts" — POSTs /api/lms/leads/sync-from-contacts to
 *     backfill leads from the WACRM contacts table (one-click catch-up).
 *   • "New lead" — manual entry form.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
    UserPlus,
    Plus,
    Loader2,
    Search,
    RefreshCw,
    Phone,
    Mail,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type {
    Lead,
    LeadListResponse,
    LeadSource,
    LeadStatus,
} from "@/lib/lms/leads/types";

const STATUS_OPTIONS: Array<{ value: LeadStatus | "all"; label: string; cls: string }> = [
    { value: "all", label: "All", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
    { value: "new", label: "New", cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
    { value: "contacted", label: "Contacted", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
    { value: "qualified", label: "Qualified", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    { value: "converted", label: "Converted", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
    { value: "lost", label: "Lost", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
    { value: "duplicate", label: "Duplicate", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
];

const SOURCE_LABELS: Record<LeadSource | "all", string> = {
    all: "All sources",
    whatsapp: "WhatsApp",
    phone: "Phone",
    website_form: "Website form",
    app_install: "App install",
    stall: "Stall / event",
    referral: "Referral",
    social: "Social",
    geo_ai: "Geo / AI",
    organic_search: "Organic search",
    csv_import: "CSV import",
    manual: "Manual entry",
    other: "Other",
};

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
    const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
    const [search, setSearch] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== "all") params.set("status", statusFilter);
            if (sourceFilter !== "all") params.set("source", sourceFilter);
            if (search.trim()) params.set("q", search.trim());
            params.set("limit", "100");
            const res = await wfetch(`/api/lms/leads?${params}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as LeadListResponse;
            setLeads(data.leads);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [statusFilter, sourceFilter, search]);

    useEffect(() => {
        load();
    }, [load]);

    const onSync = async () => {
        if (
            !confirm(
                "Sync leads from existing WhatsApp contacts? Creates a lead row for every contact not yet represented in the leads table. Safe to re-run.",
            )
        ) {
            return;
        }
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await wfetch("/api/lms/leads/sync-from-contacts", {
                method: "POST",
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            setSyncResult(
                `Synced ${body.contactsScanned} contacts · ${body.leadsCreated} new leads, ${body.leadsDeduped} already existed, ${body.errors} errors.`,
            );
            await load();
        } catch (err) {
            setSyncResult(`Sync failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                        <UserPlus className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            Leads
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            {total} total · capture from WhatsApp, website, stall, manual entry
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onSync}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        {syncing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                        Sync from contacts
                    </button>
                    <Link
                        href="/lms/leads/new"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700"
                    >
                        <Plus className="h-4 w-4" />
                        New lead
                    </Link>
                </div>
            </div>

            {syncResult && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    {syncResult}
                </div>
            )}

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
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as LeadSource | "all")}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                    {(Object.entries(SOURCE_LABELS) as [LeadSource | "all", string][]).map(
                        ([v, l]) => (
                            <option key={v} value={v}>
                                {l}
                            </option>
                        ),
                    )}
                </select>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                    <button
                        key={s.value}
                        onClick={() => setStatusFilter(s.value)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            statusFilter === s.value
                                ? "bg-purple-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        }`}
                    >
                        {s.label}
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
            ) : leads.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <UserPlus className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No leads {statusFilter !== "all" || sourceFilter !== "all" || search ? "match these filters" : "yet"}.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Click "Sync from contacts" to backfill from your WhatsApp contact list,
                        or "New lead" to add one manually.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Contact</th>
                                <th className="px-4 py-3">Source</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">First touch</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map((l) => {
                                const status = STATUS_OPTIONS.find((s) => s.value === l.status);
                                return (
                                    <tr
                                        key={l.id}
                                        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-800/50"
                                        onClick={() => {
                                            window.location.href = `/lms/leads/${l.id}`;
                                        }}
                                    >
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/lms/leads/${l.id}`}
                                                className="font-medium text-slate-800 hover:text-purple-600 dark:text-slate-100 dark:hover:text-purple-300"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {l.name ?? "—"}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                                            <div className="flex flex-col gap-0.5">
                                                {l.phone && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Phone className="h-3 w-3 text-slate-400" />
                                                        {l.phone}
                                                    </span>
                                                )}
                                                {l.email && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Mail className="h-3 w-3 text-slate-400" />
                                                        {l.email}
                                                    </span>
                                                )}
                                                {!l.phone && !l.email && <span className="text-slate-400">—</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                                            {SOURCE_LABELS[l.source]}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${status?.cls ?? ""}`}
                                            >
                                                {status?.label ?? l.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                            {new Date(l.firstTouchAt).toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
