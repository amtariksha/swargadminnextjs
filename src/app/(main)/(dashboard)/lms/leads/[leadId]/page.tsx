"use client";

/**
 * /lms/leads/[leadId] — single-lead detail page.
 *
 * Phase-1: status transitions + notes + delete. Activity timeline (calls,
 * messages, stage changes) materialises in C8 when Agent Force activity
 * feed lands. For now we show the lead row data + a couple of inline
 * actions.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
    ArrowLeft,
    Loader2,
    User,
    Phone,
    Mail,
    MapPin,
    Tag as TagIcon,
    Save,
    Trash2,
    AlertTriangle,
    Check,
    Link2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { Lead, LeadStatus } from "@/lib/lms/leads/types";

const STATUS_LABELS: Record<LeadStatus, { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
    contacted: { label: "Contacted", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
    qualified: { label: "Qualified", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    converted: { label: "Converted", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
    lost: { label: "Lost", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
    duplicate: { label: "Duplicate", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
};

export default function LeadDetailPage() {
    const params = useParams<{ leadId: string }>();
    const router = useRouter();
    const leadId = params.leadId;
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedNote, setSavedNote] = useState(false);
    const [notesDraft, setNotesDraft] = useState("");
    const [linkUserId, setLinkUserId] = useState("");
    const [linking, setLinking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch(`/api/lms/leads/${leadId}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as { lead: Lead };
            setLead(data.lead);
            setNotesDraft(data.lead.notes ?? "");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [leadId]);

    useEffect(() => {
        load();
    }, [load]);

    const patch = async (body: Record<string, unknown>) => {
        setSaving(true);
        try {
            const res = await wfetch(`/api/lms/leads/${leadId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setLead(data.lead);
        } catch (err) {
            alert(`Save failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setSaving(false);
        }
    };

    const onStatusChange = async (newStatus: LeadStatus) => {
        await patch({ status: newStatus });
    };

    const onSaveNote = async () => {
        await patch({ notes: notesDraft });
        setSavedNote(true);
        setTimeout(() => setSavedNote(false), 2000);
    };

    const onLinkExisting = async () => {
        const existingUserId = Number(linkUserId.trim());
        if (!existingUserId || existingUserId <= 0) {
            alert("Enter the existing customer's backend user ID.");
            return;
        }
        if (
            !confirm(
                `Link ${lead?.phone ?? "this number"} as an alternate phone on customer #${existingUserId} and mark this lead a duplicate?`,
            )
        ) {
            return;
        }
        setLinking(true);
        try {
            const res = await wfetch(`/api/lms/leads/${leadId}/link-existing`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ existingUserId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setLead(data.lead);
            setLinkUserId("");
        } catch (err) {
            alert(`Link failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setLinking(false);
        }
    };

    const onDelete = async () => {
        if (!confirm("Delete this lead? This cannot be undone.")) return;
        try {
            const res = await wfetch(`/api/lms/leads/${leadId}`, { method: "DELETE" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            router.push("/lms/leads");
        } catch (err) {
            alert(`Delete failed: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }
    if (error || !lead) {
        return (
            <div className="p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                    Failed to load lead. {error}
                </div>
            </div>
        );
    }

    const statusStyle = STATUS_LABELS[lead.status];

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <Link
                href="/lms/leads"
                className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to leads
            </Link>

            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                        {lead.name ?? "Unnamed lead"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        First touch:{" "}
                        {new Date(lead.firstTouchAt).toLocaleString()}
                        {lead.lastActivityAt && (
                            <>
                                {" · Last activity: "}
                                {new Date(lead.lastActivityAt).toLocaleString()}
                            </>
                        )}
                    </p>
                </div>
                <button
                    onClick={onDelete}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Profile card */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <User className="h-4 w-4 text-purple-500" />
                        Profile
                    </h2>
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Row label="Phone" icon={<Phone className="h-3.5 w-3.5 text-slate-400" />}>
                            {lead.phone ?? <em className="text-slate-400">none</em>}
                        </Row>
                        <Row label="Email" icon={<Mail className="h-3.5 w-3.5 text-slate-400" />}>
                            {lead.email ?? <em className="text-slate-400">none</em>}
                        </Row>
                        <Row label="Pincode" icon={<MapPin className="h-3.5 w-3.5 text-slate-400" />}>
                            {lead.pincode ?? <em className="text-slate-400">none</em>}
                        </Row>
                        <Row label="Language">{lead.language}</Row>
                        <Row label="Source">{lead.source}</Row>
                        <Row label="Score">
                            {lead.score !== null && lead.score !== undefined
                                ? `${lead.score}/100`
                                : <em className="text-slate-400">unscored</em>}
                        </Row>
                    </dl>

                    {/* Notes */}
                    <div className="mt-6">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Notes
                            </h3>
                            <button
                                onClick={onSaveNote}
                                disabled={saving || notesDraft === (lead.notes ?? "")}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50 dark:text-purple-300 dark:hover:bg-purple-500/10"
                            >
                                {saving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : savedNote ? (
                                    <Check className="h-3 w-3" />
                                ) : (
                                    <Save className="h-3 w-3" />
                                )}
                                {savedNote ? "Saved" : "Save"}
                            </button>
                        </div>
                        <textarea
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={4}
                            placeholder="Any context worth remembering — quoted price, follow-up date, preferences."
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>

                    {/* Tags */}
                    {lead.tags && lead.tags.length > 0 && (
                        <div className="mt-6">
                            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                <TagIcon className="h-3.5 w-3.5" />
                                Tags
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {lead.tags.map((t) => (
                                    <span
                                        key={t}
                                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Status sidebar */}
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Status
                        </h3>
                        <div className="mb-4 flex justify-center">
                            <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusStyle.cls}`}
                            >
                                {statusStyle.label}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {(Object.keys(STATUS_LABELS) as LeadStatus[])
                                .filter((s) => s !== lead.status)
                                .map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => onStatusChange(s)}
                                        disabled={saving}
                                        className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                        → {STATUS_LABELS[s].label}
                                    </button>
                                ))}
                        </div>
                    </div>

                    {/* Link to existing customer — alternate-number merge. */}
                    {lead.status !== "duplicate" && lead.status !== "converted" && (
                        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                <Link2 className="h-3.5 w-3.5 text-amber-500" />
                                Link to existing customer
                            </h3>
                            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                                If {lead.phone ?? "this number"} is an existing customer&apos;s alternate
                                number, link it so future messages &amp; orders resolve to that
                                customer. Marks this lead a duplicate.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={linkUserId}
                                    onChange={(e) => setLinkUserId(e.target.value)}
                                    placeholder="Customer ID"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                                <button
                                    onClick={onLinkExisting}
                                    disabled={linking || !linkUserId.trim()}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                                >
                                    {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Link"}
                                </button>
                            </div>
                        </div>
                    )}

                    {lead.sourceDetails && Object.keys(lead.sourceDetails).length > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Source details
                            </h3>
                            <pre className="overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                {JSON.stringify(lead.sourceDetails, null, 2)}
                            </pre>
                        </div>
                    )}

                    {lead.metadata && Object.keys(lead.metadata).length > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Metadata
                            </h3>
                            <pre className="overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                {JSON.stringify(lead.metadata, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Row({
    label,
    children,
    icon,
}: {
    label: string;
    children: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (
        <div>
            <dt className="mb-0.5 flex items-center gap-1 text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {icon}
                {label}
            </dt>
            <dd className="text-sm text-slate-800 dark:text-slate-100">{children}</dd>
        </div>
    );
}
