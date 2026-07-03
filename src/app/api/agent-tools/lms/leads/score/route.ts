/**
 * POST /api/agent-tools/lms/leads/score
 *
 * Nightly rule-based lead scoring. Recomputes score (0–100) for every open
 * lead (new/contacted/qualified) from the cheap signals on the row — see
 * computeLeadScore. Token-gated by middleware. Pinged by the backend
 * lms-nightly cron alongside reconcile + expire-stale.
 *
 * Body (optional): { limit?: number }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { scoreOpenLeads } from "@/lib/lms/leads/service";

const schema = z.object({
    limit: z.number().int().min(1).max(5000).optional(),
});

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) return fail("invalid body", 400);

    try {
        const result = await scoreOpenLeads({ limit: parsed.data.limit });
        return ok(result);
    } catch (err) {
        return fail(err);
    }
}
