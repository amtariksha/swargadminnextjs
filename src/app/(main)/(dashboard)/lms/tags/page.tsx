"use client";

/**
 * /lms/tags — Tag library.
 *
 * Operators create namespaced labels (channel/product/festival/context/
 * behaviour/custom) here and use them downstream in segment definitions.
 * Auto-tagging rules ship in C3+ — for now, all assignments are manual.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tags as TagsIcon, Plus, Trash2, Loader2, X } from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { Tag, TagNamespace } from "@/lib/lms/tags/service";

const NAMESPACES: { value: TagNamespace; label: string; hint: string }[] = [
    { value: "channel", label: "Channel", hint: "How we reached them (app, web, WhatsApp)" },
    { value: "product", label: "Product", hint: "What they buy (ghee, paneer, curd)" },
    { value: "festival", label: "Festival", hint: "Seasonal interest (diwali-26)" },
    { value: "context", label: "Context", hint: "Situational (inner_circle, vip)" },
    { value: "behaviour", label: "Behaviour", hint: "Engagement (high_engagement, churn_risk)" },
    { value: "custom", label: "Custom", hint: "One-offs not covered above" },
];

export default function TagsPage() {
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/tags");
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            const data = (await res.json()) as { tags: Tag[] };
            setTags(data.tags);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const grouped = useMemo(() => {
        const map = new Map<TagNamespace, Tag[]>();
        for (const t of tags) {
            const arr = map.get(t.namespace) ?? [];
            arr.push(t);
            map.set(t.namespace, arr);
        }
        return map;
    }, [tags]);

    const onDelete = async (tag: Tag) => {
        if (
            !confirm(
                `Delete tag "${tag.name}" (${tag.namespace})? All ${tag.usageCount ?? 0} active assignments will be removed.`,
            )
        ) {
            return;
        }
        try {
            const res = await wfetch(`/api/lms/tags/${tag.id}`, { method: "DELETE" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            load();
        } catch (err) {
            alert(`Failed to delete: ${err instanceof Error ? err.message : "error"}`);
        }
    };

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 p-2 shadow-md shadow-purple-500/30">
                        <TagsIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                            Tags
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Namespaced labels used to slice customers into segments.
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700"
                >
                    <Plus className="h-4 w-4" />
                    New tag
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <strong>Failed to load tags.</strong> {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : tags.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                    <TagsIcon className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        No tags yet.
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Create your first tag to start slicing customers into segments.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {NAMESPACES.map((ns) => {
                        const items = grouped.get(ns.value);
                        if (!items || items.length === 0) return null;
                        return (
                            <div key={ns.value}>
                                <div className="mb-2 flex items-baseline gap-2">
                                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                        {ns.label}
                                    </h2>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">
                                        {ns.hint} · {items.length} tag{items.length === 1 ? "" : "s"}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {items.map((t) => (
                                        <TagChip key={t.id} tag={t} onDelete={onDelete} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showCreate && (
                <CreateTagDialog
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

function TagChip({ tag, onDelete }: { tag: Tag; onDelete: (t: Tag) => void }) {
    return (
        <div className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm dark:border-slate-700 dark:bg-slate-900">
            <span className="font-medium text-slate-800 dark:text-slate-100">{tag.name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
                {tag.usageCount ?? 0}
            </span>
            <button
                onClick={() => onDelete(tag)}
                className="rounded-full p-1 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                title="Delete tag"
            >
                <Trash2 className="h-3 w-3" />
            </button>
        </div>
    );
}

function CreateTagDialog({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const [name, setName] = useState("");
    const [namespace, setNamespace] = useState<TagNamespace>("product");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await wfetch("/api/lms/tags", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), namespace }),
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
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                        New tag
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <form onSubmit={submit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
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
                            minLength={1}
                            maxLength={64}
                            placeholder="e.g. ghee, diwali-26, inner_circle"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Namespace
                        </label>
                        <select
                            value={namespace}
                            onChange={(e) => setNamespace(e.target.value as TagNamespace)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                            {NAMESPACES.map((ns) => (
                                <option key={ns.value} value={ns.value}>
                                    {ns.label} — {ns.hint}
                                </option>
                            ))}
                        </select>
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
                            disabled={saving || !name.trim()}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {saving ? "Creating…" : "Create tag"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
