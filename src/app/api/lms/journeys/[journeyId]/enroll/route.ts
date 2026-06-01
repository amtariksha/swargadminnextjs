/**
 * POST /api/lms/journeys/[journeyId]/enroll
 * Body: { customerId: string }
 *
 * Manually enrol a customer into a journey. Used by:
 *   • Operators kicking off Welcome for a backfilled customer.
 *   • Agent Force when an event triggers a journey.
 *   • The RFM job (sku_replenish_due → enrol in replenishment).
 *
 * Idempotent: if there's an active run for (journey, customer) already,
 * returns that run instead of inserting a duplicate.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enrollCustomer } from "@/lib/lms/journeys/service";

const schema = z.object({ customerId: z.string().uuid() });

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ journeyId: string }> },
) {
    const { journeyId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    try {
        const run = await enrollCustomer({
            journeyId,
            customerId: parsed.data.customerId,
        });
        return NextResponse.json({ run }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/journeys/:id/enroll]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
