/**
 * POST /api/agent-force/webhook
 *
 * Inbound webhook from chatagent. Public path (allowlisted in middleware)
 * because the signature is the auth. Every payload MUST carry an
 *   X-Agent-Force-Signature: <hex(hmac_sha256(secret, rawBody))>
 * header, verified against AGENT_FORCE_WEBHOOK_SECRET.
 *
 * Event types (Phase 1 — extend as more land):
 *   agent_run.completed   — async agent finished, includes result + usage
 *   tool_call.required    — agent paused waiting for a long-running tool
 *                           (NOT used Phase 1; reserved)
 *
 * agent_run.completed persistence (migration 005):
 *   Each event writes one row to app_lms.lms_agent_runs, which feeds the
 *   /lms/agents/cost dashboard. The unique index on request_id makes
 *   re-posts idempotent — chatagent retries don't double-count.
 */

import { NextRequest, NextResponse } from "next/server";
import { lmsAdmin } from "@/lib/lms/supabase";

interface WebhookPayload {
    event: "agent_run.completed" | "tool_call.required" | string;
    agentSlug: string;
    sessionId: string;
    /** Echoes the X-Agent-Force-Request-Id from the originating invoke; used
     *  for idempotency on the persistence side. */
    requestId?: string;
    /** Optional context — agent's view of who they were helping. */
    customerId?: string;
    conversationId?: string;
    /** Agent output (string or structured). Truncated into result_summary for
     *  at-a-glance scans; full payload in raw_result. */
    result?: unknown;
    /** True/false based on whether the agent reported a clean exit. Defaults
     *  TRUE if omitted so existing chatagent versions keep working. */
    succeeded?: boolean;
    errorMessage?: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cost_usd?: number;
        latency_ms?: number;
    };
}

export async function POST(request: NextRequest) {
    const secret = process.env.AGENT_FORCE_WEBHOOK_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: "AGENT_FORCE_WEBHOOK_SECRET not configured" },
            { status: 503 },
        );
    }

    const sig = request.headers.get("x-agent-force-signature");
    if (!sig) {
        return NextResponse.json(
            { error: "Missing x-agent-force-signature header" },
            { status: 401 },
        );
    }

    const rawBody = await request.text();
    const sigOk = await hmacVerify(secret, rawBody, sig);
    if (!sigOk) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: WebhookPayload;
    try {
        payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // ── Event dispatch ───────────────────────────────────────────────────
    switch (payload.event) {
        case "agent_run.completed":
            await handleAgentRunCompleted(payload);
            break;
        case "tool_call.required":
            // Reserved for Phase 2 — async tool resolution dance.
            console.log(
                `[agent-force.webhook] tool_call.required (Phase 1 no-op):`,
                payload.sessionId,
            );
            break;
        default:
            console.warn(
                `[agent-force.webhook] unknown event "${payload.event}" — ignoring`,
            );
    }

    return NextResponse.json({ ok: true });
}

async function handleAgentRunCompleted(payload: WebhookPayload): Promise<void> {
    const cost = payload.usage?.cost_usd;
    console.log(
        `[agent-force.webhook] run.completed agent=${payload.agentSlug} session=${payload.sessionId}` +
            (typeof cost === "number" ? ` cost=$${cost.toFixed(4)}` : ""),
    );

    const orgId = process.env.WACRM_ORG_ID;
    if (!orgId) {
        console.warn(
            "[agent-force.webhook] WACRM_ORG_ID unset — cannot persist run",
        );
        return;
    }

    const resultText = stringifyResult(payload.result);

    try {
        const { error } = await lmsAdmin.from("lms_agent_runs").insert({
            org_id: orgId,
            agent_slug: payload.agentSlug,
            session_id: payload.sessionId,
            customer_id: payload.customerId ?? null,
            conversation_id: payload.conversationId ?? null,
            input_tokens: payload.usage?.input_tokens ?? null,
            output_tokens: payload.usage?.output_tokens ?? null,
            cost_usd: typeof cost === "number" ? cost : null,
            latency_ms: payload.usage?.latency_ms ?? null,
            result_summary: resultText.slice(0, 200),
            raw_result:
                payload.result && typeof payload.result === "object"
                    ? (payload.result as Record<string, unknown>)
                    : resultText
                      ? { text: resultText }
                      : null,
            succeeded: payload.succeeded ?? true,
            error_message: payload.errorMessage ?? null,
            request_id: payload.requestId ?? null,
        });
        if (error) {
            // Unique-constraint violation on request_id is the dedupe path —
            // log and move on rather than failing the webhook.
            if (error.message.includes("duplicate") || error.code === "23505") {
                console.log(
                    `[agent-force.webhook] duplicate request_id=${payload.requestId} — skipped`,
                );
            } else {
                console.error(
                    `[agent-force.webhook] persist failed: ${error.message}`,
                );
            }
        }
    } catch (err) {
        console.error("[agent-force.webhook] persist threw:", err);
    }
}

/** Best-effort string extraction from any result payload shape. */
function stringifyResult(result: unknown): string {
    if (result === null || result === undefined) return "";
    if (typeof result === "string") return result;
    if (typeof result === "object") {
        try {
            return JSON.stringify(result);
        } catch {
            return String(result);
        }
    }
    return String(result);
}

// ─── HMAC verification (Edge-runtime safe, Web Crypto only) ──────────────

async function hmacVerify(
    secret: string,
    body: string,
    sigHex: string,
): Promise<boolean> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const buf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const computed = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    // Equal-length constant-time compare.
    if (computed.length !== sigHex.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
        diff |= computed.charCodeAt(i) ^ sigHex.charCodeAt(i);
    }
    return diff === 0;
}
