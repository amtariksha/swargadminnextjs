/**
 * Agent invocation helpers.
 *
 * Post-tool-bridge rewrite (integration plan §4-§8):
 * Each agent now has the full LMS data surface available as tools, so the
 * helpers here are thin invocation wrappers. The agent fetches what it
 * needs (consent state, RFM, recent messages, etc.) via /api/agent-tools/*
 * and writes results directly via the same surface. The admin-panel-side
 * "stuff the prompt full of data + parse the response + write to DB"
 * code from the prior implementation has been removed.
 *
 * What's left here:
 *   • invokeAgent()           — generic single-call helper.
 *   • complianceCheck()       — sync verdict (pass / warn / block).
 *   • runInsightsBatch()      — kicks off the nightly Insights run.
 *   • triageInbound()         — classifies an inbound message.
 *   • suggestReply()          — drafts CS reply suggestions.
 *
 * AGENT system prompts moved to the chatagent repo's seed config — this
 * file no longer carries them. Source-of-truth for the prompt strings is
 * chatagent/config/seeds/swarg-food.seed.json.
 */

import { invoke } from "@/lib/lms/agent-force/client";

// ─── Agent slugs (must match chatagent agentTypes table) ─────────────────

export const AGENT_SLUGS = {
    complianceGuard: "lms-compliance-guard",
    insights: "lms-insights",
    leadTriage: "lms-lead-triage",
    customerSupportAssist: "lms-customer-support-assist",
} as const;

// ─── Compliance Guard ────────────────────────────────────────────────────

/**
 * Pre-send compliance check on a campaign or journey send.
 *
 * The campaignId / journeyRunId is passed to the agent — it then uses
 * `lms.read_template_registry`, `lms.read_consent_state` (per recipient),
 * `lms.read_campaign_history` (frequency cap) on its own, and writes the
 * final decision via `lms.write_compliance_decision`.
 *
 * Returns the parsed verdict. Defensive defaults if Agent Force is
 * unconfigured (`null`) or the response is malformed (`warn` verdict).
 */
export async function complianceCheck(args: {
    sessionId: string;
    campaignId?: string;
    journeyRunId?: string;
    notes?: string;
}): Promise<{
    verdict: "pass" | "warn" | "block";
    reasons: string[];
    removedRecipientCount: number;
} | null> {
    if (!args.campaignId && !args.journeyRunId) {
        throw new Error("complianceCheck requires campaignId or journeyRunId");
    }
    const result = await invoke({
        sessionId: args.sessionId,
        agentSlug: AGENT_SLUGS.complianceGuard,
        message: JSON.stringify({
            kind: "review_pending_send",
            campaign_id: args.campaignId,
            journey_run_id: args.journeyRunId,
            notes: args.notes,
        }),
        timeoutMs: 15_000,
    });
    if (!result) return null;
    return parseVerdict(result.text);
}

function parseVerdict(raw: string): {
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
        const v =
            parsed.verdict === "block" || parsed.verdict === "warn"
                ? parsed.verdict
                : "pass";
        return {
            verdict: v,
            reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
            removedRecipientCount:
                typeof parsed.removed_recipient_count === "number"
                    ? parsed.removed_recipient_count
                    : 0,
        };
    } catch {
        return {
            verdict: "warn",
            reasons: ["compliance_response_unparseable"],
            removedRecipientCount: 0,
        };
    }
}

// ─── Insights batch ──────────────────────────────────────────────────────

/**
 * Kick off the Insights agent run. The agent calls
 * `lms.read_rfm_score`, `lms.read_health_score`, `lms.read_campaign_history`
 * for the org's customers, then writes up to 5 rows via
 * `lms.write_insights_feed` directly. We don't pre-fetch the snapshot
 * anymore.
 *
 * Returns the agent's text response for debugging — the actual rows
 * land in lms_insights_feed asynchronously (the agent writes them
 * before stream completion).
 */
export async function runInsightsBatch(args: {
    orgId: string;
}): Promise<{ agentReachable: boolean; rawResponse?: string }> {
    const result = await invoke({
        sessionId: `insights-${args.orgId}-${new Date().toISOString().slice(0, 10)}`,
        agentSlug: AGENT_SLUGS.insights,
        message: JSON.stringify({
            kind: "run_daily_insights",
            org_id: args.orgId,
            as_of: new Date().toISOString(),
        }),
        timeoutMs: 60_000,
    });
    if (!result) return { agentReachable: false };
    return { agentReachable: true, rawResponse: result.text };
}

// ─── Lead Triage ─────────────────────────────────────────────────────────

/**
 * Classify an inbound message + take any structured actions.
 *
 * The agent uses `lms.read_recent_messages` (to avoid duplicate STOP
 * confirmations), then calls `lms.write_lead` / `lms.write_consent_withdrawal`
 * / `lms.write_inbox_message` directly. We just hand it the message body
 * and sender context.
 */
export async function triageInbound(args: {
    sessionId: string;
    conversationId: string;
    messageBody: string;
    senderPhone?: string;
    senderName?: string;
}): Promise<{
    intent: string;
    confidence: number;
    actionsTaken: number;
} | null> {
    const result = await invoke({
        sessionId: args.sessionId,
        agentSlug: AGENT_SLUGS.leadTriage,
        message: JSON.stringify({
            kind: "triage_inbound",
            conversation_id: args.conversationId,
            body: args.messageBody,
            from: { phone: args.senderPhone, name: args.senderName },
        }),
        timeoutMs: 15_000,
    });
    if (!result) return null;
    try {
        const parsed = JSON.parse(extractJsonBlob(result.text)) as {
            intent?: string;
            confidence?: number;
            actions?: unknown[];
        };
        return {
            intent: parsed.intent ?? "unclassified",
            confidence:
                typeof parsed.confidence === "number" ? parsed.confidence : 0,
            actionsTaken: Array.isArray(parsed.actions) ? parsed.actions.length : 0,
        };
    } catch {
        return { intent: "unclassified", confidence: 0, actionsTaken: 0 };
    }
}

// ─── Customer Support Assist ─────────────────────────────────────────────

/**
 * Draft 1–3 reply suggestions for the Inbox UI.
 *
 * The agent uses `lms.read_recent_messages` + `lms.read_order_history` +
 * `lms.read_health_score` on its own to build context. We pass just the
 * conversationId.
 */
export async function suggestReply(args: {
    sessionId: string;
    conversationId: string;
    customerId: string;
}): Promise<{
    suggestions: Array<{ text: string; tone: string; confidence: number }>;
    doNotSendAlone: boolean;
} | null> {
    const result = await invoke({
        sessionId: args.sessionId,
        agentSlug: AGENT_SLUGS.customerSupportAssist,
        message: JSON.stringify({
            kind: "suggest_reply",
            conversation_id: args.conversationId,
            customer_id: args.customerId,
        }),
        timeoutMs: 15_000,
    });
    if (!result) return null;
    try {
        const parsed = JSON.parse(extractJsonBlob(result.text)) as {
            suggestions?: Array<{ text: string; tone: string; confidence: number }>;
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

// ─── JSON-from-noisy-text helper ─────────────────────────────────────────

function extractJsonBlob(raw: string): string {
    const startObj = raw.indexOf("{");
    const startArr = raw.indexOf("[");
    if (startObj === -1 && startArr === -1) return raw;
    if (startArr !== -1 && (startObj === -1 || startArr < startObj)) {
        const end = raw.lastIndexOf("]");
        return end > startArr ? raw.slice(startArr, end + 1) : raw;
    }
    const end = raw.lastIndexOf("}");
    return end > startObj ? raw.slice(startObj, end + 1) : raw;
}
