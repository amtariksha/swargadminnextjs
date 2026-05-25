/**
 * GET /api/agent-tools/lms/read-campaign-history?customerId=<uuid>&days=<int>
 *
 * Returns campaign messages sent to one customer within the trailing N days
 * (default 7). Used by: lms-compliance-guard for frequency-cap checks
 * (spec §6.3 rule 5 — "no recipient receives >1 promotional message in the
 * trailing 7 days") and lms-insights for engagement signal.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { lmsAdmin } from "@/lib/lms/supabase";

const schema = z.object({
    customerId: z.string().uuid(),
    days: z.number().int().min(1).max(365).default(7),
});

export async function GET(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;
    const sp = new URL(request.url).searchParams;
    const parsed = schema.safeParse({
        customerId: sp.get("customerId"),
        days: sp.get("days") ? Number(sp.get("days")) : undefined,
    });
    if (!parsed.success) return fail("customerId required; days optional 1-365", 400);

    try {
        const since = new Date(
            Date.now() - parsed.data.days * 86_400_000,
        ).toISOString();
        const { data, error } = await lmsAdmin
            .from("lms_campaign_messages")
            .select(
                "id, campaign_id, channel, purpose, status, queued_at, sent_at, delivered_at, read_at, clicked_at, converted_at",
            )
            .eq("customer_id", parsed.data.customerId)
            .gte("queued_at", since)
            .order("queued_at", { ascending: false });
        if (error) throw new Error(error.message);
        return ok({
            customerId: parsed.data.customerId,
            windowDays: parsed.data.days,
            messages: data ?? [],
        });
    } catch (err) {
        return fail(err);
    }
}
