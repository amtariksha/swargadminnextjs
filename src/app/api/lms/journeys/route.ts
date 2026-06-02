/**
 * GET  /api/lms/journeys — list all journeys
 * POST /api/lms/journeys — create a custom journey from a DSL (operator builder)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listJourneys, upsertJourney } from "@/lib/lms/journeys/service";
import { validateJourneyDsl, type JourneyDsl } from "@/lib/lms/journeys/dsl";

export async function GET(_request: NextRequest) {
    try {
        const journeys = await listJourneys();
        return NextResponse.json({ count: journeys.length, journeys });
    } catch (err) {
        console.error("[GET /api/lms/journeys]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

const createSchema = z.object({
    name: z.string().min(1).max(120),
    // dsl is validated structurally by validateJourneyDsl below.
    dsl: z.object({
        trigger: z.string().min(1),
        steps: z.array(z.unknown()).min(1),
    }).passthrough(),
});

export async function POST(request: NextRequest) {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    const dsl = parsed.data.dsl as unknown as JourneyDsl;
    try {
        validateJourneyDsl(dsl);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Invalid journey DSL" },
            { status: 400 },
        );
    }
    try {
        const journey = await upsertJourney({
            name: parsed.data.name,
            triggerEvent: dsl.trigger,
            dsl,
        });
        return NextResponse.json({ journey }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/journeys]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
