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
 * Phase 1 behaviour for agent_run.completed:
 *   • Log the run in console (full observability dashboard ships C9 follow-up)
 *   • Capture cost into a future per-agent rollup table (deferred)
 *   • Ack 200 so chatagent doesn't retry
 *
 * Idempotency: chatagent may retry on network errors. The route is a no-op
 * past the log line so duplicate deliveries are safe.
 */

import { NextRequest, NextResponse } from "next/server";

interface WebhookPayload {
    event: "agent_run.completed" | "tool_call.required" | string;
    agentSlug: string;
    sessionId: string;
    result?: unknown;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cost_usd?: number;
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
    // Future hooks (deferred):
    //   • Insert into lms_agent_runs (per-run cost + latency rollup)
    //   • Trigger downstream follow-up based on agent + result shape
    //     (e.g. insights run → refresh /lms Today screen client-side via WS)
    //   • Daily cost cap enforcement (disable agent when daily total exceeds
    //     AGENT_FORCE_DAILY_COST_USD env)
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
