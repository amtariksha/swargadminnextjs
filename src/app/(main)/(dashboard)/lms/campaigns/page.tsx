"use client";

/**
 * /lms/campaigns — segment-targeted WhatsApp campaign composer + status list.
 *
 * Compose: name → segment → approved template → marketing purpose → send now
 * or schedule. Preview resolves the segment to a live recipient count before
 * you commit. Every send runs the campaign-level Compliance Guard then fans
 * through the shared pipeline (consent + ≤2/week cap + quiet hours + Number 2),
 * so the status counts reflect real consented, uncapped deliveries.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Megaphone,
    Loader2,
    Send,
    CalendarClock,
    Eye,
    Trash2,
    AlertTriangle,
    CheckCircle2,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { Campaign } from "@/lib/lms/campaigns/service";

const MKT_PURPOSES = [
    "mkt_broadcast", "mkt_festival_preorder", "mkt_winback_d30", "mkt_winback_d60",
    "mkt_winback_d90", "mkt_replenishment", "mkt_crosssell_bridge", "mkt_back_in_stock",
    "mkt_inner_circle_touch", "mkt_referral_reminder", "mkt_review_request", "mkt_welcome_d2",
] as const;

interface SegmentLite { id: string; name: string; estimatedSize?: number | null; englishDescription?: string }
interface TemplateLite { name: string; language?: string; status?: string }
interface PreviewResult { count: number; samples: { name: string | null; phone: string | null }[]; englishDescription: string }

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [segments, setSegments] = useState<SegmentLite[]>([]);
    const [templates, setTemplates] = useState<TemplateLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // composer
    const [name, setName] = useState("");
    const [segmentId, setSegmentId] = useState("");
    const [templateName, setTemplateName] = useState("");
    const [templateLanguage, setTemplateLanguage] = useState("en");
    const [purpose, setPurpose] = useState<string>("mkt_broadcast");
    const [scheduledAt, setScheduledAt] = useState("");
    const [creating, setCreating] = useState(false);
    const [composerMsg, setComposerMsg] = useState<string | null>(null);

    // per-campaign action state
    const [previews, setPreviews] = useState<Record<string, PreviewResult>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionMsg, setActionMsg] = useState<string | null>(null);

    const loadCampaigns = useCallback(async () => {
        const res = await wfetch("/api/lms/campaigns");
        if (res.ok) setCampaigns(((await res.json()) as { campaigns: Campaign[] }).campaigns);
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [cRes, sRes, tRes] = await Promise.all([
                    wfetch("/api/lms/campaigns"),
                    wfetch("/api/lms/segments"),
                    wfetch("/api/whatsapp/templates"),
                ]);
                if (cRes.ok) setCampaigns(((await cRes.json()) as { campaigns: Campaign[] }).campaigns);
                if (sRes.ok) setSegments(((await sRes.json()) as { segments: SegmentLite[] }).segments);
                if (tRes.ok) {
                    const data = (await tRes.json()) as { templates?: TemplateLite[] } | TemplateLite[];
                    const list = Array.isArray(data) ? data : (data.templates ?? []);
                    setTemplates(list.filter((t) => (t.status ?? "").toUpperCase() === "APPROVED" || !t.status));
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Load failed");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const create = async () => {
        setComposerMsg(null);
        if (!name.trim() || !segmentId || !templateName) {
            setComposerMsg("Name, segment and template are required.");
            return;
        }
        setCreating(true);
        try {
            const body: Record<string, unknown> = {
                name: name.trim(), segmentId, templateName, templateLanguage, purpose,
            };
            if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();
            const res = await wfetch("/api/lms/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setName(""); setSegmentId(""); setTemplateName(""); setScheduledAt("");
            setComposerMsg(scheduledAt ? "Scheduled." : "Draft created — preview, then send.");
            await loadCampaigns();
        } catch (err) {
            setComposerMsg(err instanceof Error ? err.message : "Create failed");
        } finally {
            setCreating(false);
        }
    };

    const preview = async (id: string) => {
        setBusyId(id); setActionMsg(null);
        try {
            const res = await wfetch(`/api/lms/campaigns/${id}/preview`, { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setPreviews((p) => ({ ...p, [id]: data as PreviewResult }));
        } catch (err) {
            setActionMsg(err instanceof Error ? err.message : "Preview failed");
        } finally {
            setBusyId(null);
        }
    };

    const send = async (id: string) => {
        const p = previews[id];
        if (!confirm(`Send this campaign${p ? ` to ~${p.count} recipients` : ""}? It respects consent + the ≤2/week cap.`)) return;
        setBusyId(id); setActionMsg(null);
        try {
            const res = await wfetch(`/api/lms/campaigns/${id}/send`, { method: "POST" });
            const data = await res.json();
            if (res.status === 409) { setActionMsg(`Blocked by Compliance Guard: ${data.blockedReason ?? "see logs"}`); }
            else if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            else {
                const c = data.counts ?? {};
                setActionMsg(`Sent ${c.sent ?? 0} · skipped ${c.skipped ?? 0} · failed ${c.failed ?? 0}${data.deferred ? ` · deferred ${data.deferred} (quiet hours)` : ""}`);
            }
            await loadCampaigns();
        } catch (err) {
            setActionMsg(err instanceof Error ? err.message : "Send failed");
        } finally {
            setBusyId(null);
        }
    };

    const cancel = async (id: string) => {
        if (!confirm("Cancel this campaign?")) return;
        setBusyId(id);
        try {
            await wfetch(`/api/lms/campaigns/${id}`, { method: "DELETE" });
            await loadCampaigns();
        } finally {
            setBusyId(null);
        }
    };

    const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <div className="mb-6 flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 p-2 shadow-md shadow-orange-500/30">
                    <Megaphone className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Campaigns</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Marketing blasts to a segment — consent-checked, frequency-capped, sent from Number 2.
                    </p>
                </div>
            </div>

            {/* ── Composer ── */}
            <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">New campaign</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">Name</span>
                        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali ghee offer" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">Segment (audience)</span>
                        <select className={inputCls} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                            <option value="">— pick a segment —</option>
                            {segments.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}{s.estimatedSize != null ? ` (~${s.estimatedSize})` : ""}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">Template</span>
                        <select className={inputCls} value={templateName}
                            onChange={(e) => {
                                setTemplateName(e.target.value);
                                const t = templates.find((x) => x.name === e.target.value);
                                if (t?.language) setTemplateLanguage(t.language);
                            }}>
                            <option value="">— pick a template —</option>
                            {templates.map((t) => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language ?? "en"})</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">Purpose (routes Number 2)</span>
                        <select className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                            {MKT_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-500">Schedule (optional, IST — leave empty to send manually)</span>
                        <input type="datetime-local" className={inputCls} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                    </label>
                    <div className="flex items-end">
                        <button onClick={create} disabled={creating}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50">
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                            {scheduledAt ? "Schedule" : "Create draft"}
                        </button>
                    </div>
                </div>
                {composerMsg && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />{composerMsg}</p>}
            </div>

            {actionMsg && (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                    {actionMsg}
                </div>
            )}
            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                    <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />{error}
                </div>
            )}

            {/* ── List ── */}
            {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : campaigns.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No campaigns yet.</p>
            ) : (
                <div className="space-y-3">
                    {campaigns.map((c) => (
                        <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-slate-900 dark:text-slate-50">{c.name}</h3>
                                        <StatusBadge status={c.status} />
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{c.templateName || "—"}</code>
                                        {" · "}{c.purpose}
                                        {c.scheduledAt ? ` · scheduled ${new Date(c.scheduledAt).toLocaleString("en-IN")}` : ""}
                                    </p>
                                    {c.counts && (
                                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                            {c.counts.recipients} recipients · {c.counts.sent} sent · {c.counts.skipped} skipped · {c.counts.failed} failed
                                        </p>
                                    )}
                                    {previews[c.id] && (
                                        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                                            Preview: ~{previews[c.id].count} recipients — {previews[c.id].englishDescription}
                                        </p>
                                    )}
                                </div>
                                {(c.status === "draft" || c.status === "scheduled") && (
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => preview(c.id)} disabled={busyId === c.id}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                                            <Eye className="h-3.5 w-3.5" /> Preview
                                        </button>
                                        <button onClick={() => send(c.id)} disabled={busyId === c.id}
                                            className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
                                            {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send now
                                        </button>
                                        <button onClick={() => cancel(c.id)} disabled={busyId === c.id}
                                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: Campaign["status"] }) {
    const map: Record<Campaign["status"], string> = {
        draft: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
        pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
        sending: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
        sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        cancelled: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
        failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>{status}</span>;
}
