/**
 * GET /api/agent-tools/lms/read-consent-state?customerId=<uuid>
 *
 * Returns the effective consent map for one customer (newest row per purpose).
 * Used by: lms-compliance-guard (per-recipient consent check), lms-lead-triage
 * (verify STOP keyword should not double-withdraw already-withdrawn purposes).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { getEffectiveConsents } from "@/lib/lms/consent/service";

const schema = z.object({ customerId: z.string().uuid() });

export async function GET(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;
    const parsed = schema.safeParse({
        customerId: new URL(request.url).searchParams.get("customerId"),
    });
    if (!parsed.success) {
        return fail("customerId is required and must be a UUID", 400);
    }
    try {
        const consents = await getEffectiveConsents({
            orgId: ctx.orgId,
            customerId: parsed.data.customerId,
        });
        return ok({ customerId: parsed.data.customerId, consents });
    } catch (err) {
        return fail(err);
    }
}
