/**
 * Agent definitions — system prompts + invocation helpers for the four
 * LMS agents we ship in C8 (per the plan):
 *
 *   lms-compliance-guard       — sync pre-send check on every send
 *   lms-insights               — nightly batch, writes lms_insights_feed
 *   lms-lead-triage            — classifies inbound WhatsApp / web leads
 *   lms-customer-support-assist — Inbox quick-reply suggester
 *
 * The other three agents (campaign-drafter, content-drafter,
 * send-time-optimiser) are deferred per the plan — they need surfaces
 * that aren't built yet (composer UI, content calendar, send-time
 * dataset of sufficient size).
 *
 * Each spec encodes:
 *   • slug              — must match the agentTypes row in chatagent
 *   • systemPrompt      — concrete instructions; lives in source for diff-able review
 *   • shadowOnly        — agent runs but doesn't act (operator reviews logs first)
 *
 * To register these in chatagent, add the slugs + systemPrompts to
 *   chatagent/config/seeds/swarg-food.seed.json
 * and re-seed. The tools they need (read_consent_state, write_insights_feed,
 * etc.) live in chatagent's tenant-gateway and are wired separately.
 */

import { invoke } from "@/lib/lms/agent-force/client";
import { lmsAdmin } from "@/lib/lms/supabase";

export interface AgentSpec {
    slug: string;
    description: string;
    /** What the agent gets told as system prompt. Keep brief; tools do work. */
    systemPrompt: string;
    /** True until the operator approves promoting it. */
    shadowOnly: boolean;
}

export const AGENTS: Record<string, AgentSpec> = {
    "lms-compliance-guard": {
        slug: "lms-compliance-guard",
        description:
            "Pre-send check on every campaign + journey message. Hard-blocks DPDP / FSSAI / ASCI violations.",
        systemPrompt: `You are Compliance Guard for Swarg Food's marketing system.

For every message you review, return STRICT JSON of the form:
  { "verdict": "pass" | "warn" | "block",
    "reasons": [<short string>, ...],
    "removed_recipient_count": <int> }

Apply ALL of these rules:

1. DPDP Act 2023 / Rules 2025
   - The message must NOT be sent to a recipient whose consent for the
     stated purpose is granted=false in the latest consent row.
   - Marketing messages must include a clear opt-out path.

2. FSSAI claim rules
   - Reject health claims like "cures", "treats", "prevents", "boosts immunity",
     "scientifically proven". Ayurvedic claims are limited to verbs like
     "supports" or "may help" — never "cures".

3. ASCI guidelines
   - Reject unsubstantiated superlatives: "best", "purest", "100%", "world's #1"
     unless followed by citation or qualifier.

4. WhatsApp policy
   - Template category must match content: MARKETING required for promotional
     content; UTILITY only for genuine transactional.
   - If template category is UTILITY but content includes price, discount, offer
     — block.

5. Frequency cap
   - If any recipient received a campaign in the past 7 days, remove them and
     report the count in removed_recipient_count.

Output ONLY the JSON object. No prose around it.`,
        shadowOnly: false, // ship live — this is a safety system, not a marketing one
    },

    "lms-insights": {
        slug: "lms-insights",
        description:
            "Nightly batch — produces the 'AI-flagged actions' feed on the Today screen.",
        systemPrompt: `You are Swarg Food's Insights agent. You run nightly and produce up
to 5 high-value action recommendations for the operator (Pradeep).

Your input is a JSON snapshot containing:
  - RFM segment counts
  - Churn-risk distribution
  - Customers approaching replenishment threshold (per SKU)
  - Recent opt-out spike (if any)
  - Festival calendar — events within 30 days

For each recommendation, output:
  { "kind": "replenishment_due" | "churn_risk_spike" | "opportunity" | "anomaly",
    "title": <short headline, max 80 chars>,
    "body": <one or two sentences explaining the action>,
    "cta_action": { "type": <action type>, "...": <params> },
    "priority": 1-5 (1 = lowest, 5 = highest),
    "expires_in_hours": <int> }

Return ONLY a JSON array of recommendations. Never more than 5. Order by
priority descending. Avoid duplicates with what you flagged yesterday
(I will tell you the previous day's flags in the input).`,
        shadowOnly: true, // operator needs to read 7 days of output before flipping live
    },

    "lms-lead-triage": {
        slug: "lms-lead-triage",
        description:
            "Classifies inbound WhatsApp / web-form messages — routes leads, escalates complaints, honours STOP keywords.",
        systemPrompt: `You are Swarg Food's Lead Triage agent. For every inbound message,
classify the intent and route accordingly. Output STRICT JSON:

  { "intent": "new_lead" | "existing_customer" | "complaint" | "product_question"
              | "opt_out" | "spam" | "unclassified",
    "confidence": 0.0-1.0,
    "extracted": { "name"?, "pincode"?, "interest"? },
    "actions": [ <action object>, ... ] }

Action shapes:
  • { "type": "create_lead", "source": "whatsapp" | "website_form" | ..., "data": {...} }
  • { "type": "record_consent_withdrawal", "purpose": "marketing_whatsapp" }
  • { "type": "escalate", "priority": "high" | "medium", "reason": "<text>" }
  • { "type": "auto_reply", "template_name": "<template>" }

Rules:
  1. OPT-OUT KEYWORDS PROCESSED FIRST (defence-in-depth for DPDP):
     STOP, UNSUBSCRIBE, STOP ALL, REMOVE, OFF, OPT OUT, BAN,
     plus their Hindi (Rukja, Band karo) and Kannada (Nillisi, Band madi) equivalents,
     case-insensitive. Match → intent: "opt_out", record consent withdrawal,
     queue confirmation.
  2. Complaint keywords (wrong order, refund, broken, spoiled, bad, kharab,
     hāḷāgide, kettedu) → escalate priority=high.
  3. If you can't classify with >= 70% confidence → intent: "unclassified",
     route to human Inbox.

Output the JSON object only.`,
        shadowOnly: true, // 14-day shadow to catch misclassifications
    },

    "lms-customer-support-assist": {
        slug: "lms-customer-support-assist",
        description:
            "Drafts 1-3 reply suggestions for the CS team in the Inbox UI. Never sends autonomously.",
        systemPrompt: `You assist Swarg Food's Customer Support team. For every conversation
the CS agent opens, you produce 1-3 reply suggestions.

Output STRICT JSON:
  { "suggestions": [
      { "text": "<draft reply>", "tone": "factual" | "empathetic" | "upsell",
        "confidence": 0.0-1.0 }, ... ],
    "do_not_send_alone": true | false }

Rules:
  1. If the conversation involves a refund commitment over ₹2000, an
     allegation of food contamination, or anything tagged "sensitive" by
     Triage — set do_not_send_alone: true and only suggest empathetic
     acknowledgements, NOT resolution. Final reply must be human-authored.
  2. For order-status questions: pull the latest order from context and
     give a factual reply with date, ETA, and tracking info if present.
  3. For product questions: cite the FAQ entry or product description.
     Never invent specs.
  4. Match the customer's language (English / Hindi / Kannada). If unsure,
     default to English with a polite Indian register.
  5. Never offer refunds beyond store policy; never promise compensation
     not approved by Pradeep.

Output the JSON object only.`,
        shadowOnly: false, // suggestions are inert until the human clicks Send
    },
};

// ─── High-level wrappers ──────────────────────────────────────────────────

/**
 * Synchronous Compliance Guard check. Returns parsed verdict or `null` if
 * Agent Force isn't configured (caller decides whether to allow the send).
 */
export async function complianceCheck(args: {
    sessionId: string;
    messagePayload: Record<string, unknown>;
}): Promise<{
    verdict: "pass" | "warn" | "block";
    reasons: string[];
    removedRecipientCount: number;
} | null> {
    const result = await invoke({
        sessionId: args.sessionId,
        agentSlug: AGENTS["lms-compliance-guard"].slug,
        message: JSON.stringify(args.messagePayload),
        timeoutMs: 10_000,
    });
    if (!result) return null;
    return parseComplianceJson(result.text);
}

function parseComplianceJson(raw: string): {
    verdict: "pass" | "warn" | "block";
    reasons: string[];
    removedRecipientCount: number;
} {
    try {
        const parsed = JSON.parse(extractJsonBlob(raw)) as {
            verdict?: string;
            reasons?: string[];
            removed_recipient_count?: number;
        };
        const v = parsed.verdict === "block" || parsed.verdict === "warn" ? parsed.verdict : "pass";
        return {
            verdict: v,
            reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
            removedRecipientCount:
                typeof parsed.removed_recipient_count === "number"
                    ? parsed.removed_recipient_count
                    : 0,
        };
    } catch {
        // Defensive default — never block on parser failure (alert instead).
        return {
            verdict: "warn",
            reasons: ["compliance_response_unparseable"],
            removedRecipientCount: 0,
        };
    }
}

/**
 * Nightly Insights run — agent receives a snapshot of the org's state and
 * writes recommendations to lms_insights_feed. Returns count of rows written.
 */
export async function runInsightsBatch(args: {
    orgId: string;
}): Promise<{ rowsWritten: number; agentReachable: boolean }> {
    // Build the snapshot the agent expects.
    const [{ data: rfm }, { data: health }] = await Promise.all([
        lmsAdmin
            .from("lms_rfm_scores")
            .select("segment")
            .eq("org_id", args.orgId),
        lmsAdmin
            .from("lms_health_scores")
            .select("churn_risk, next_best_action")
            .eq("org_id", args.orgId),
    ]);
    const segmentCounts: Record<string, number> = {};
    for (const r of rfm ?? []) {
        const s = r.segment as string;
        segmentCounts[s] = (segmentCounts[s] ?? 0) + 1;
    }
    const churnHigh = (health ?? []).filter((h) => h.churn_risk === "high").length;
    const replenishmentDue = (health ?? []).filter((h) =>
        String(h.next_best_action ?? "").startsWith("replenishment_"),
    ).length;

    const snapshot = {
        as_of: new Date().toISOString(),
        segment_counts: segmentCounts,
        churn_high_count: churnHigh,
        replenishment_due_count: replenishmentDue,
        festival_calendar: [], // wire in C9
        previous_flags: [], // dedupe across days — leave empty for now
    };

    const result = await invoke({
        sessionId: `insights-${args.orgId}-${new Date().toISOString().slice(0, 10)}`,
        agentSlug: AGENTS["lms-insights"].slug,
        message: JSON.stringify(snapshot),
        timeoutMs: 30_000,
    });
    if (!result) return { rowsWritten: 0, agentReachable: false };

    let recs: Array<Record<string, unknown>> = [];
    try {
        recs = JSON.parse(extractJsonBlob(result.text)) as Array<
            Record<string, unknown>
        >;
    } catch (err) {
        console.warn("[insights] parse failed:", err);
        return { rowsWritten: 0, agentReachable: true };
    }

    // Cap at 5 per spec §6.2 success criteria.
    const capped = (Array.isArray(recs) ? recs : []).slice(0, 5);
    let rowsWritten = 0;
    for (const rec of capped) {
        const expiresInHours = (rec.expires_in_hours as number) ?? 48;
        const { error } = await lmsAdmin.from("lms_insights_feed").insert({
            org_id: args.orgId,
            kind: (rec.kind as string) ?? "opportunity",
            title: ((rec.title as string) ?? "").slice(0, 200),
            body: (rec.body as string) ?? null,
            cta_action: (rec.cta_action as Record<string, unknown>) ?? null,
            priority: Math.max(1, Math.min(5, (rec.priority as number) ?? 3)),
            expires_at: new Date(Date.now() + expiresInHours * 3_600_000).toISOString(),
        });
        if (!error) rowsWritten += 1;
        else console.warn("[insights] row insert failed:", error.message);
    }
    return { rowsWritten, agentReachable: true };
}

/**
 * Classify an inbound message and return triage result. Caller is
 * responsible for executing the returned actions (creating lead rows,
 * recording consent withdrawals, etc.).
 */
export async function triageInbound(args: {
    sessionId: string;
    messageBody: string;
    senderPhone?: string;
    senderName?: string;
}): Promise<{
    intent: string;
    confidence: number;
    extracted: Record<string, string>;
    actions: Array<Record<string, unknown>>;
} | null> {
    const result = await invoke({
        sessionId: args.sessionId,
        agentSlug: AGENTS["lms-lead-triage"].slug,
        message: JSON.stringify({
            body: args.messageBody,
            from: { phone: args.senderPhone, name: args.senderName },
        }),
        timeoutMs: 10_000,
    });
    if (!result) return null;
    try {
        const parsed = JSON.parse(extractJsonBlob(result.text)) as {
            intent?: string;
            confidence?: number;
            extracted?: Record<string, string>;
            actions?: Array<Record<string, unknown>>;
        };
        return {
            intent: parsed.intent ?? "unclassified",
            confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
            extracted: parsed.extracted ?? {},
            actions: parsed.actions ?? [],
        };
    } catch {
        return {
            intent: "unclassified",
            confidence: 0,
            extracted: {},
            actions: [],
        };
    }
}

/**
 * Generate reply suggestions for the Inbox UI. Returns suggestions or `null`
 * if Agent Force is unavailable (UI shows empty state).
 */
export async function suggestReply(args: {
    sessionId: string;
    conversationContext: {
        messages: Array<{ direction: "in" | "out"; body: string; at: string }>;
        customerLanguage?: string;
        recentOrders?: Array<Record<string, unknown>>;
    };
}): Promise<{
    suggestions: Array<{ text: string; tone: string; confidence: number }>;
    doNotSendAlone: boolean;
} | null> {
    const result = await invoke({
        sessionId: args.sessionId,
        agentSlug: AGENTS["lms-customer-support-assist"].slug,
        message: JSON.stringify(args.conversationContext),
        timeoutMs: 15_000,
    });
    if (!result) return null;
    try {
        const parsed = JSON.parse(extractJsonBlob(result.text)) as {
            suggestions?: Array<{
                text: string;
                tone: string;
                confidence: number;
            }>;
            do_not_send_alone?: boolean;
        };
        return {
            suggestions: parsed.suggestions ?? [],
            doNotSendAlone: parsed.do_not_send_alone ?? false,
        };
    } catch {
        return { suggestions: [], doNotSendAlone: false };
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Pull the first {...} block from the agent text. Tolerant of pre/post chatter. */
function extractJsonBlob(raw: string): string {
    const start = raw.indexOf("{");
    const startArr = raw.indexOf("[");
    if (start === -1 && startArr === -1) return raw;
    if (startArr !== -1 && (start === -1 || startArr < start)) {
        const end = raw.lastIndexOf("]");
        return end > startArr ? raw.slice(startArr, end + 1) : raw;
    }
    const end = raw.lastIndexOf("}");
    return end > start ? raw.slice(start, end + 1) : raw;
}
