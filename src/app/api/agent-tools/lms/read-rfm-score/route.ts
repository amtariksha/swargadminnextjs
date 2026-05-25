/**
 * GET /api/agent-tools/lms/read-rfm-score?customerId=<uuid>
 *
 * Returns the latest RFM row for one customer, or null if never computed.
 * Used by: lms-insights, lms-customer-support-assist.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { lmsAdmin } from "@/lib/lms/supabase";

const schema = z.object({ customerId: z.string().uuid() });

export async function GET(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;
    const parsed = schema.safeParse({
        customerId: new URL(request.url).searchParams.get("customerId"),
    });
    if (!parsed.success) return fail("customerId is required", 400);

    try {
        const { data, error } = await lmsAdmin
            .from("lms_rfm_scores")
            .select("*")
            .eq("org_id", ctx.orgId)
            .eq("customer_id", parsed.data.customerId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        return ok({ customerId: parsed.data.customerId, rfm: data ?? null });
    } catch (err) {
        return fail(err);
    }
}
