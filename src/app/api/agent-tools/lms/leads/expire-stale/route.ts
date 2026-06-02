/**
 * POST /api/agent-tools/lms/leads/expire-stale
 *
 * 30-day lead retention sweep. Open leads (new/contacted/qualified) with no
 * activity for >`days` become 'lost' (source_details.lost_reason='expired_30d').
 * Token-gated by middleware. Pinged nightly by the backend cron
 * (scripts/cron/lms-nightly.js); bounded per call so a backlog drains across
 * runs rather than blowing the request budget.
 *
 * Body (optional): { days?: number, limit?: number }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { expireStaleLeads } from "@/lib/lms/leads/service";

const schema = z.object({
    days: z.number().int().min(1).max(3650).optional(),
    limit: z.number().int().min(1).max(2000).optional(),
});

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse((await request.json().catch(() => null)) ?? {});
    if (!parsed.success) return fail("invalid body", 400);

    try {
        const result = await expireStaleLeads({
            days: parsed.data.days,
            limit: parsed.data.limit,
        });
        return ok(result);
    } catch (err) {
        return fail(err);
    }
}
