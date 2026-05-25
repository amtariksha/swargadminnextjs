/**
 * Tiny helpers shared by every /api/agent-tools/lms/* route.
 *
 * The routes follow a uniform pattern:
 *   1. Middleware has verified AGENT_FORCE_SERVICE_TOKEN + set synthetic
 *      super-admin x-user-* headers.
 *   2. Route handler reads org context from headers, plus the agent's
 *      X-Agent-Force-Request-Id (for idempotency / dedupe) and
 *      X-Agent-Force-Agent (for audit).
 *   3. Handler validates input, calls the relevant service, returns JSON
 *      in a consistent envelope.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";

export interface AgentRequestContext {
    orgId: string;
    requestId: string;
    agentSlug: string;
}

/** Pulls the standard agent context bits or returns a 400 NextResponse. */
export function getAgentContext(
    request: NextRequest,
): AgentRequestContext | NextResponse {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json(
            { success: false, error: "Missing org context (WACRM_ORG_ID unset?)" },
            { status: 400 },
        );
    }
    const requestId = request.headers.get("x-agent-force-request-id") ?? "";
    const agentSlug = request.headers.get("x-agent-force-agent") ?? "unknown";
    return { orgId, requestId, agentSlug };
}

/** Standard success envelope. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
    return NextResponse.json({ success: true, data }, init);
}

/** Standard error envelope — string or Error. */
export function fail(error: unknown, status = 500): NextResponse {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status });
}
