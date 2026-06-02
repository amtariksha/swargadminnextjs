"use client";

/**
 * /lms/journeys/new — self-serve drip-sequence builder.
 *
 * Compose a custom journey without writing DSL: name + trigger + an ordered
 * list of steps (send_template / wait / tag / branch / enroll_in / exit). The
 * send_template step picks from APPROVED WhatsApp templates. A live preview
 * shows the English summary + the JSON that will be saved. On save it POSTs to
 * /api/lms/journeys; the journey ships PAUSED — activate it from the list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Loader2,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    Save,
    AlertTriangle,
} from "lucide-react";
import { wfetch } from "@/lib/whatsapp/wfetch";
import type { JourneyStep, JourneyTrigger } from "@/lib/lms/journeys/dsl";

// ─── Option catalogs ────────────────────────────────────────────────────────

const TRIGGERS: { value: JourneyTrigger; label: string }[] = [
    { value: "manual", label: "Manual / operator-enrolled" },
    { value: "first_delivery_completed", label: "First delivery completed (Welcome)" },
    { value: "sku_replenish_due", label: "SKU restock due (Replenishment)" },
    { value: "churn_risk_high", label: "Churn risk high" },
    { value: "referral_redeemed", label: "Referral redeemed" },
    { value: "inner_circle_quarterly_tick", label: "Inner Circle quarterly" },
];

const PURPOSES = [
    "txn_order_confirmation", "txn_delivery_update", "txn_delivery_done",
    "txn_payment_receipt", "txn_otp", "txn_feedback_request", "txn_support_reply",
    "txn_welcome_d0", "mkt_welcome_d2", "mkt_replenishment", "mkt_winback_d30",
    "mkt_winback_d60", "mkt_winback_d90", "mkt_festival_preorder",
    "mkt_crosssell_bridge", "mkt_broadcast", "mkt_back_in_stock",
    "mkt_inner_circle_touch", "mkt_referral_reminder", "mkt_review_request",
] as const;

const CONSENT_PURPOSES = [
    "transactional_orders", "marketing_in_app", "marketing_whatsapp",
    "marketing_email", "marketing_sms", "analytics_cookies", "personalisation",
] as const;

const NAMESPACES = ["channel", "product", "festival", "context", "behaviour", "custom"] as const;
const RFM_SEGMENTS = ["Champions", "Loyal", "Promising", "At-Risk", "Hibernating", "Lost"] as const;
const STEP_TYPES = ["send_template", "wait", "tag", "branch", "enroll_in", "exit"] as const;

interface ApiTemplate {
    name: string;
    language?: string;
    status?: string;
    category?: string;
}

// ─── Step factory + helpers ─────────────────────────────────────────────────

function newStep(type: (typeof STEP_TYPES)[number], id: string): JourneyStep {
    switch (type) {
        case "send_template":
            return { id, type, templateName: "", templateLanguage: "en", purpose: "mkt_broadcast", requiresConsent: "marketing_whatsapp" } as JourneyStep;
        case "wait":
            return { id, type, days: 1 } as JourneyStep;
        case "tag":
            return { id, type, action: "add", tagName: "", namespace: "context" } as JourneyStep;
        case "branch":
            return { id, type, condition: { kind: "rfm_segment_in", segments: ["Champions"] }, onTrueGoto: "", onFalseGoto: "" } as JourneyStep;
        case "enroll_in":
            return { id, type, journeyName: "" } as JourneyStep;
        case "exit":
            return { id, type, reason: "completed" } as JourneyStep;
    }
}

function summarise(s: JourneyStep): string {
    switch (s.type) {
        case "send_template":
            return `send "${s.templateName || "—"}" (${s.purpose}, needs ${s.requiresConsent})`;
        case "wait":
            return s.days ? `wait ${s.days} day(s)` : s.hours ? `wait ${s.hours} hour(s)` : "wait";
        case "tag":
            return `${s.action} tag ${s.namespace}:${s.tagName || "—"}`;
        case "branch":
            return `if ${s.condition.kind} → ${s.onTrueGoto || "?"} else ${s.onFalseGoto || "?"}`;
        case "enroll_in":
            return `enroll into "${s.journeyName || "—"}"`;
        case "exit":
            return `exit (${s.reason})`;
    }
}

export default function NewJourneyPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [trigger, setTrigger] = useState<JourneyTrigger>("manual");
    const [steps, setSteps] = useState<JourneyStep[]>([]);
    const [templates, setTemplates] = useState<ApiTemplate[]>([]);
    const [tplError, setTplError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const counter = useRef(0);

    useEffect(() => {
        (async () => {
            try {
                const res = await wfetch("/api/whatsapp/templates");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as { templates?: ApiTemplate[] } | ApiTemplate[];
                const list = Array.isArray(data) ? data : (data.templates ?? []);
                setTemplates(list.filter((t) => (t.status ?? "").toUpperCase() === "APPROVED" || !t.status));
            } catch (err) {
                setTplError(err instanceof Error ? err.message : "Failed to load templates");
            }
        })();
    }, []);

    const addStep = (type: (typeof STEP_TYPES)[number]) => {
        counter.current += 1;
        setSteps((cur) => [...cur, newStep(type, `${type}_${counter.current}`)]);
    };
    const removeStep = (i: number) => setSteps((cur) => cur.filter((_, idx) => idx !== i));
    const moveStep = (i: number, dir: -1 | 1) =>
        setSteps((cur) => {
            const j = i + dir;
            if (j < 0 || j >= cur.length) return cur;
            const next = [...cur];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    const patchStep = (i: number, patch: Partial<JourneyStep>) =>
        setSteps((cur) => cur.map((s, idx) => (idx === i ? ({ ...s, ...patch } as JourneyStep) : s)));

    const stepIds = useMemo(() => steps.map((s) => s.id), [steps]);
    const dsl = useMemo(() => ({ trigger, steps }), [trigger, steps]);

    const validationError = useMemo(() => {
        if (!name.trim()) return "Give the journey a name.";
        if (steps.length === 0) return "Add at least one step.";
        for (const s of steps) {
            if (s.type === "send_template" && !s.templateName) return `Step ${s.id}: pick a template.`;
            if (s.type === "tag" && !s.tagName) return `Step ${s.id}: tag name is required.`;
            if (s.type === "enroll_in" && !s.journeyName) return `Step ${s.id}: target journey name is required.`;
            if (s.type === "branch" && (!s.onTrueGoto || !s.onFalseGoto)) return `Step ${s.id}: branch needs both targets.`;
        }
        return null;
    }, [name, steps]);

    const save = useCallback(async () => {
        if (validationError) { setSaveError(validationError); return; }
        setSaving(true);
        setSaveError(null);
        try {
            const res = await wfetch("/api/lms/journeys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), dsl }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
            router.push("/lms/journeys");
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [validationError, name, dsl, router]);

    return (
        <div className="h-full overflow-auto p-6 lg:p-8">
            <button
                onClick={() => router.push("/lms/journeys")}
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                <ArrowLeft className="h-4 w-4" /> Back to journeys
            </button>

            <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-slate-50">
                New journey
            </h1>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                Compose a multi-step sequence. It ships paused — activate it from the list when ready.
                Every send is consent-gated, frequency-capped and routed to the right number automatically.
            </p>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                {/* ── Builder ── */}
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Name</span>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Ghee win-back"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Trigger</span>
                            <select
                                value={trigger}
                                onChange={(e) => setTrigger(e.target.value as JourneyTrigger)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                                {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </label>
                    </div>

                    {tplError && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Template list unavailable ({tplError}) — type the template name manually.
                        </p>
                    )}

                    {steps.map((s, i) => (
                        <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                            <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">{i + 1}</span>
                                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-slate-800">{s.type}</code>
                                    <span className="text-xs text-slate-400">{s.id}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => moveStep(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowUp className="h-4 w-4" /></button>
                                    <button onClick={() => moveStep(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowDown className="h-4 w-4" /></button>
                                    <button onClick={() => removeStep(i)} className="rounded p-1 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            </div>
                            {renderStepFields(s, i, { templates, stepIds, patchStep })}
                        </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                        {STEP_TYPES.map((t) => (
                            <button
                                key={t}
                                onClick={() => addStep(t)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                <Plus className="h-3.5 w-3.5" /> {t}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Preview + save ── */}
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                        {steps.length === 0 ? (
                            <p className="text-sm text-slate-400">No steps yet.</p>
                        ) : (
                            <ol className="space-y-1.5 text-sm">
                                {steps.map((s, i) => (
                                    <li key={s.id} className="text-slate-600 dark:text-slate-300">
                                        <span className="text-slate-400">{i + 1}.</span> {summarise(s)}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">JSON</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">{JSON.stringify(dsl, null, 2)}</pre>
                    </details>

                    {(saveError || validationError) && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                            <AlertTriangle className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                            {saveError ?? validationError}
                        </div>
                    )}

                    <button
                        onClick={save}
                        disabled={saving || !!validationError}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save journey (paused)
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Per-step field editors ─────────────────────────────────────────────────

function renderStepFields(
    s: JourneyStep,
    i: number,
    ctx: {
        templates: ApiTemplate[];
        stepIds: string[];
        patchStep: (i: number, patch: Partial<JourneyStep>) => void;
    },
): React.ReactNode {
    const { templates, stepIds, patchStep } = ctx;
    const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";
    const lbl = "mb-1 block text-[11px] font-semibold text-slate-500";

    if (s.type === "send_template") {
        return (
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                    <span className={lbl}>Template</span>
                    {templates.length > 0 ? (
                        <select
                            className={input}
                            value={s.templateName}
                            onChange={(e) => {
                                const tpl = templates.find((t) => t.name === e.target.value);
                                patchStep(i, { templateName: e.target.value, templateLanguage: tpl?.language ?? "en" } as Partial<JourneyStep>);
                            }}
                        >
                            <option value="">— pick a template —</option>
                            {templates.map((t) => (
                                <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language ?? "en"})</option>
                            ))}
                        </select>
                    ) : (
                        <input className={input} value={s.templateName} placeholder="template_name"
                            onChange={(e) => patchStep(i, { templateName: e.target.value } as Partial<JourneyStep>)} />
                    )}
                </label>
                <label className="block">
                    <span className={lbl}>Purpose (routes the number)</span>
                    <select className={input} value={s.purpose}
                        onChange={(e) => patchStep(i, { purpose: e.target.value } as Partial<JourneyStep>)}>
                        {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className={lbl}>Requires consent</span>
                    <select className={input} value={s.requiresConsent}
                        onChange={(e) => patchStep(i, { requiresConsent: e.target.value } as Partial<JourneyStep>)}>
                        {CONSENT_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>
            </div>
        );
    }
    if (s.type === "wait") {
        return (
            <label className="block w-32">
                <span className={lbl}>Wait days</span>
                <input type="number" min={0} className={input} value={s.days ?? 0}
                    onChange={(e) => patchStep(i, { days: Number(e.target.value), hours: undefined } as Partial<JourneyStep>)} />
            </label>
        );
    }
    if (s.type === "tag") {
        return (
            <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                    <span className={lbl}>Action</span>
                    <select className={input} value={s.action}
                        onChange={(e) => patchStep(i, { action: e.target.value as "add" | "remove" } as Partial<JourneyStep>)}>
                        <option value="add">add</option><option value="remove">remove</option>
                    </select>
                </label>
                <label className="block">
                    <span className={lbl}>Namespace</span>
                    <select className={input} value={s.namespace}
                        onChange={(e) => patchStep(i, { namespace: e.target.value } as Partial<JourneyStep>)}>
                        {NAMESPACES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className={lbl}>Tag name</span>
                    <input className={input} value={s.tagName}
                        onChange={(e) => patchStep(i, { tagName: e.target.value } as Partial<JourneyStep>)} />
                </label>
            </div>
        );
    }
    if (s.type === "enroll_in") {
        return (
            <label className="block">
                <span className={lbl}>Target journey name</span>
                <input className={input} value={s.journeyName}
                    onChange={(e) => patchStep(i, { journeyName: e.target.value } as Partial<JourneyStep>)} />
            </label>
        );
    }
    if (s.type === "exit") {
        return (
            <label className="block">
                <span className={lbl}>Exit reason</span>
                <input className={input} value={s.reason}
                    onChange={(e) => patchStep(i, { reason: e.target.value } as Partial<JourneyStep>)} />
            </label>
        );
    }
    // branch
    const cond = s.condition;
    const otherIds = stepIds.filter((id) => id !== s.id);
    return (
        <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
                <span className={lbl}>Condition</span>
                <select className={input} value={cond.kind}
                    onChange={(e) => {
                        const kind = e.target.value as "rfm_segment_in" | "has_tag" | "consent_granted";
                        const next = kind === "rfm_segment_in" ? { kind, segments: ["Champions"] as string[] }
                            : kind === "has_tag" ? { kind, tag: "" }
                            : { kind, purpose: "marketing_whatsapp" };
                        patchStep(i, { condition: next } as Partial<JourneyStep>);
                    }}>
                    <option value="rfm_segment_in">rfm_segment_in</option>
                    <option value="has_tag">has_tag</option>
                    <option value="consent_granted">consent_granted</option>
                </select>
            </label>
            <div>
                <span className={lbl}>Condition value</span>
                {cond.kind === "rfm_segment_in" && (
                    <select className={input} multiple value={cond.segments}
                        onChange={(e) => patchStep(i, { condition: { kind: "rfm_segment_in", segments: Array.from(e.target.selectedOptions).map((o) => o.value) } } as Partial<JourneyStep>)}>
                        {RFM_SEGMENTS.map((seg) => <option key={seg} value={seg}>{seg}</option>)}
                    </select>
                )}
                {cond.kind === "has_tag" && (
                    <input className={input} value={cond.tag} placeholder="tag name"
                        onChange={(e) => patchStep(i, { condition: { kind: "has_tag", tag: e.target.value } } as Partial<JourneyStep>)} />
                )}
                {cond.kind === "consent_granted" && (
                    <select className={input} value={cond.purpose}
                        onChange={(e) => patchStep(i, { condition: { kind: "consent_granted", purpose: e.target.value as (typeof CONSENT_PURPOSES)[number] } } as Partial<JourneyStep>)}>
                        {CONSENT_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                )}
            </div>
            <label className="block">
                <span className={lbl}>If TRUE go to</span>
                <select className={input} value={s.onTrueGoto}
                    onChange={(e) => patchStep(i, { onTrueGoto: e.target.value } as Partial<JourneyStep>)}>
                    <option value="">— step —</option>
                    {otherIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
            </label>
            <label className="block">
                <span className={lbl}>If FALSE go to</span>
                <select className={input} value={s.onFalseGoto}
                    onChange={(e) => patchStep(i, { onFalseGoto: e.target.value } as Partial<JourneyStep>)}>
                    <option value="">— step —</option>
                    {otherIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
            </label>
        </div>
    );
}
