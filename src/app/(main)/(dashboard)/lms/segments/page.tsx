"use client";

/**
 * /lms/segments — segment library + builder.
 *
 * Phase 1: JSON-DSL editor (textarea) with live preview that shows
 * matching count + sample contacts + English description. The full
 * visual rule builder lands in a follow-up; the JSON-DSL surface is
 * sufficient for Pradeep / Engineering to author segments today.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Tags as TagsIcon,
    Plus,
    Trash2,
    Loader2,
    X,
    Eye,
    RefreshCw,
    Users,
    AlertTriangle,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { Segment, SegmentPreview } from "@/lib/lms/segments/service";

const EXAMPLE_DSL = JSON.stringify(
    {
        op: "AND",
        children: [
            { type: "has_tag", tag: "ghee" },
            {
                type: "consent",
                purpose: "marketing_whatsapp",
                granted: true,
            },
            {
                op: "NOT",
                children: [
                    { type: "received_campaign_within_days", days: 7 },
                ],
            },
        ],
    },
    null,
    2,
);

export default function SegmentsPage() {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [recomputing, setRecomputing] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/segments");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as { segments: Segment[] };
            setSegments(data.segments);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onDelete = async (s: Segment) => {
        if (!confirm(`Delete segment "${s.name}"? Memberships will be cleared.`)) return;
        try {
            const res = await wfetch(`/api/lms/segments/${s.id}`, { method: "DELETE" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            load();
        } catch (err) {
            alert(`Delete failed: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    const onRecompute = async (s: Segment) => {
        setRecomputing(s.id);
        try {
            const res = await wfetch(`/api/lms/segments/${s.id}/recompute`, {
                method: "POST",
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            load();
        } catch (err) {
            alert(`Recompute failed: ${err instanceof Error ? err.message : "error"}`);
        } finally {
            setRecomputing(null);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                        <TagsIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            Segments
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Saved filter definitions. Campaigns and journeys target a segment.
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700"
                >
                    <Plus className="h-4 w-4" />
                    New segment
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <strong>Failed to load.</strong> {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : segments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <Users className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No segments yet.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Create a segment by composing tag / consent / RFM filters.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {segments.map((s) => (
                        <div
                            key={s.id}
                            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                                        {s.name}
                                    </h3>
                                    {s.description && (
                                        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                                            {s.description}
                                        </p>
                                    )}
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        <span className="font-medium">English:</span>{" "}
                                        {s.englishDescription ?? "—"}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                                        <span>
                                            <strong>
                                                {s.estimatedSize ?? "?"}
                                            </strong>{" "}
                                            customers
                                        </span>
                                        <span>
                                            Last computed:{" "}
                                            {s.lastComputedAt
                                                ? new Date(s.lastComputedAt).toLocaleString()
                                                : "never"}
                                        </span>
                                        {s.isDynamic && (
                                            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                                                Dynamic
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <button
                                        onClick={() => onRecompute(s)}
                                        disabled={recomputing === s.id}
                                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                                        title="Recompute memberships"
                                    >
                                        {recomputing === s.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5" />
                                        )}
                                        Recompute
                                    </button>
                                    <button
                                        onClick={() => onDelete(s)}
                                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                                        title="Delete segment"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showCreate && (
                <CreateSegmentDialog
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}

// ─── Create dialog ─────────────────────────────────────────────────────────

function CreateSegmentDialog({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [dslText, setDslText] = useState(EXAMPLE_DSL);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<SegmentPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);

    const parsedDsl = useMemo(() => {
        try {
            return { ok: true as const, value: JSON.parse(dslText) };
        } catch (err) {
            return {
                ok: false as const,
                error: err instanceof Error ? err.message : "Invalid JSON",
            };
        }
    }, [dslText]);

    const onPreview = async () => {
        if (!parsedDsl.ok) {
            setError(parsedDsl.error);
            return;
        }
        setPreviewing(true);
        setError(null);
        setPreview(null);
        try {
            const res = await wfetch("/api/lms/segments/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filterDsl: parsedDsl.value, sampleLimit: 20 }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as { preview: SegmentPreview };
            setPreview(data.preview);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setPreviewing(false);
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!parsedDsl.ok) {
            setError(parsedDsl.error);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/segments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    filterDsl: parsedDsl.value,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                        New segment
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={submit} className="flex-1 overflow-auto p-5 space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                            <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Name
                        </label>
                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            maxLength={128}
                            placeholder="e.g. Ghee customers, marketing-eligible"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Description <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={500}
                            placeholder="What this segment is for"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>

                    <div>
                        <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
                            <span>
                                Filter DSL <span className="font-normal text-slate-400">(JSON)</span>
                            </span>
                            <button
                                type="button"
                                onClick={onPreview}
                                disabled={!parsedDsl.ok || previewing}
                                className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                {previewing ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Eye className="h-3 w-3" />
                                )}
                                Preview
                            </button>
                        </label>
                        <textarea
                            value={dslText}
                            onChange={(e) => setDslText(e.target.value)}
                            rows={10}
                            spellCheck={false}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100"
                        />
                        {!parsedDsl.ok && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                                Invalid JSON: {parsedDsl.error}
                            </p>
                        )}
                    </div>

                    {preview && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-500/30 dark:bg-purple-500/10">
                            <div className="flex items-baseline gap-3">
                                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                                    {preview.count}
                                </div>
                                <div className="text-sm text-slate-700 dark:text-slate-200">
                                    customer{preview.count === 1 ? "" : "s"} match
                                </div>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                <strong>English:</strong> {preview.englishDescription}
                            </p>
                            {preview.samples.length > 0 && (
                                <div className="mt-2 space-y-0.5">
                                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                        Sample ({preview.samples.length}):
                                    </p>
                                    <ul className="space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {preview.samples.slice(0, 8).map((s) => (
                                            <li key={s.contactId}>
                                                {s.name ?? "—"}{" "}
                                                <span className="text-slate-400">
                                                    {s.phone ?? ""}
                                                </span>
                                            </li>
                                        ))}
                                        {preview.samples.length > 8 && (
                                            <li className="text-slate-400">
                                                …and {preview.samples.length - 8} more
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </form>

                <div className="flex gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        onClick={submit}
                        disabled={saving || !name.trim() || !parsedDsl.ok}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saving ? "Creating…" : "Create segment"}
                    </button>
                </div>
            </div>
        </div>
    );
}
