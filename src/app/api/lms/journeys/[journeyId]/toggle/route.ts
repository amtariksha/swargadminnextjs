/**
 * POST /api/lms/journeys/[journeyId]/toggle
 * Body: { isActive: boolean }
 *
 * Activate or pause a journey. In-flight runs continue to be ticked when
 * the journey is paused — but the next time a step references it the
 * executor exits with reason "journey_paused".
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setJourneyActive } from "@/lib/lms/journeys/service";

const schema = z.object({ isActive: z.boolean() });

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
        const journey = await setJourneyActive({
            journeyId,
            isActive: parsed.data.isActive,
        });
        return NextResponse.json({ journey });
    } catch (err) {
        console.error("[POST /api/lms/journeys/:id/toggle]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
