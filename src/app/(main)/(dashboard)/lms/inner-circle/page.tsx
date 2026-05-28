"use client";

/**
 * /lms/inner-circle — manage the VIP customer flag.
 *
 * Phase 1: list current members + add by customer UUID + remove. The
 * "Quarterly Touch" journey enrols only flagged customers. Bulk-add from
 * top-RFM segment lands as a one-click action in C9.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Crown,
    Loader2,
    Plus,
    Trash2,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { InnerCircleMember } from "@/lib/lms/referrals/service";

interface EnrichedMember extends InnerCircleMember {
    contactName: string | null;
    contactPhone: string | null;
}

export default function InnerCirclePage() {
    const [members, setMembers] = useState<EnrichedMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAdd, setShowAdd] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/inner-circle");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as { members: EnrichedMember[] };
            setMembers(data.members);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onRemove = async (m: EnrichedMember) => {
        if (
            !confirm(
                `Remove ${m.contactName ?? m.customerId} from Inner Circle? They won't receive the Quarterly Touch journey anymore.`,
            )
        ) {
            return;
        }
        try {
            const res = await wfetch(`/api/lms/inner-circle/${m.customerId}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            await load();
        } catch (err) {
            alert(`Remove failed: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-amber-400 to-pink-500 p-2 shadow-md shadow-amber-500/30">
                        <Crown className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            Inner Circle
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Your top customers. They receive founder-voice touches once a
                            quarter and early access to new SKUs.
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700"
                >
                    <Plus className="h-4 w-4" />
                    Add member
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
            ) : members.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <Crown className="mx-auto mb-3 h-8 w-8 text-amber-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No Inner Circle members yet.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Bulk-add your top-80 by RFM is the typical first move. For now, add
                        one at a time by customer ID — find IDs in the People list.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Tier</th>
                                <th className="px-4 py-3">Since</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {members.map((m) => (
                                <tr
                                    key={m.customerId}
                                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800 dark:text-slate-100">
                                            {m.contactName ?? "—"}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">
                                            {m.contactPhone ?? m.customerId.slice(0, 8)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                                        {m.tier ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                        {m.innerCircleSince
                                            ? new Date(m.innerCircleSince).toLocaleDateString()
                                            : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => onRemove(m)}
                                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                                            title="Remove"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showAdd && (
                <AddDialog
                    onClose={() => setShowAdd(false)}
                    onAdded={() => {
                        setShowAdd(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}

function AddDialog({
    onClose,
    onAdded,
}: {
    onClose: () => void;
    onAdded: () => void;
}) {
    const [customerId, setCustomerId] = useState("");
    const [tier, setTier] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await wfetch(`/api/lms/inner-circle/${customerId.trim()}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tier: tier.trim() || undefined }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            onAdded();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-50">
                    Add Inner Circle member
                </h2>
                <form onSubmit={submit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Customer ID (UUID)
                        </label>
                        <input
                            autoFocus
                            type="text"
                            value={customerId}
                            onChange={(e) => setCustomerId(e.target.value)}
                            required
                            placeholder="e.g. 9a3b…"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            From the People page row → contact ID.
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Tier <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={tier}
                            onChange={(e) => setTier(e.target.value)}
                            placeholder="e.g. founder_circle, top_50"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !customerId.trim()}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {saving ? "Adding…" : (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Add
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
