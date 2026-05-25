/**
 * POST /api/agent-tools/lms/write-compliance-decision
 *
 * Body: { campaignId?, journeyRunId?, verdict, reasons[], removedRecipientIds[] }
 *
 * Used by: lms-compliance-guard after evaluating a pending send. Writes
 * one row to lms_compliance_decisions for the audit ledger.
 *
 * Idempotent on X-Agent-Force-Request-Id (UNIQUE INDEX in migration 004).
 * Re-sending the same decision returns the existing row with status 200.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { lmsAdmin } from "@/lib/lms/supabase";

const schema = z
    .object({
        campaignId: z.string().uuid().optional(),
        journeyRunId: z.string().uuid().optional(),
        verdict: z.enum(["pass", "warn", "block"]),
        reasons: z.array(z.string().max(500)).max(50).default([]),
        removedRecipientIds: z.array(z.string().uuid()).max(10_000).default([]),
        sessionId: z.string().max(256).optional(),
    })
    .refine((d) => d.campaignId || d.journeyRunId, {
        message: "Either campaignId or journeyRunId must be provided",
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
        // Idempotency check via request_id BEFORE attempting the insert.
        if (ctx.requestId) {
            const { data: existing } = await lmsAdmin
                .from("lms_compliance_decisions")
                .select("*")
                .eq("request_id", ctx.requestId)
                .maybeSingle();
            if (existing) {
                return ok({ decision: existing, deduped: true });
            }
        }

        const { data, error } = await lmsAdmin
            .from("lms_compliance_decisions")
            .insert({
                org_id: ctx.orgId,
                campaign_id: body.campaignId ?? null,
                journey_run_id: body.journeyRunId ?? null,
                verdict: body.verdict,
                reasons: body.reasons,
                removed_recipient_ids: body.removedRecipientIds,
                removed_recipient_count: body.removedRecipientIds.length,
                agent_session_id: body.sessionId ?? null,
                request_id: ctx.requestId || null,
            })
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        return ok({ decision: data, deduped: false }, { status: 201 });
    } catch (err) {
        return fail(err);
    }
}
