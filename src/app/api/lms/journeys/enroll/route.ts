/**
 * POST /api/lms/journeys/enroll
 * Body: { customerId, trigger }
 *
 * Trigger-based enrolment so event sources never hardcode journey UUIDs.
 * Enrols the customer into every ACTIVE journey wired to `trigger`.
 *
 * Primary caller: the swargnodejsbackend delivery-completion webhook, which
 * fires `first_delivery_completed` on a customer's first completed delivery to
 * start the Welcome journey. The backend authenticates with an admin Bearer
 * JWT minted from the shared JWT_SECRET (same secret the middleware verifies).
 *
 * Idempotent — re-firing the same trigger for the same customer returns the
 * existing active run rather than duplicating it.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enrollByTrigger } from "@/lib/lms/journeys/service";
import type { JourneyTrigger } from "@/lib/lms/journeys/dsl";

const TRIGGERS: JourneyTrigger[] = [
    "first_delivery_completed",
    "sku_replenish_due",
    "churn_risk_high",
    "manual",
    "referral_redeemed",
    "inner_circle_quarterly_tick",
];

const schema = z.object({
    customerId: z.string().uuid(),
    trigger: z.enum(TRIGGERS as [JourneyTrigger, ...JourneyTrigger[]]),
});

export async function POST(request: NextRequest) {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        const runs = await enrollByTrigger(parsed.data);
        return NextResponse.json({ enrolled: runs.length, runs }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/journeys/enroll]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
