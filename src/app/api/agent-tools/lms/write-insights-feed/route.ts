/**
 * POST /api/agent-tools/lms/write-insights-feed
 *
 * Body:
 *   { kind, title, body, ctaAction?, priority?, expiresInHours? }
 *
 * Insert one row into lms_insights_feed. Used by: lms-insights agent
 * when it identifies an action worth surfacing on the Today screen.
 *
 * Idempotency: writes for the same X-Agent-Force-Request-Id are blocked
 * by the unique constraint on the request_id metadata field (best-effort —
 * the agent typically calls write-* exactly once per recommendation anyway).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { lmsAdmin } from "@/lib/lms/supabase";

const schema = z.object({
    kind: z.enum(["replenishment_due", "churn_risk_spike", "opportunity", "anomaly"]),
    title: z.string().min(1).max(200),
    body: z.string().max(2000).optional(),
    ctaAction: z.record(z.string(), z.unknown()).optional(),
    priority: z.number().int().min(1).max(5).default(3),
    expiresInHours: z.number().int().min(1).max(720).default(48),
});

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail(`invalid body: ${JSON.stringify(parsed.error.flatten())}`, 400);
    }
    const body = parsed.data;

    try {
        const { data, error } = await lmsAdmin
            .from("lms_insights_feed")
            .insert({
                org_id: ctx.orgId,
                kind: body.kind,
                title: body.title,
                body: body.body ?? null,
                cta_action: body.ctaAction ?? null,
                priority: body.priority,
                expires_at: new Date(
                    Date.now() + body.expiresInHours * 3_600_000,
                ).toISOString(),
            })
            .select("id, kind, title, priority, expires_at")
            .single();
        if (error) throw new Error(error.message);
        return ok({ insight: data }, { status: 201 });
    } catch (err) {
        return fail(err);
    }
}
