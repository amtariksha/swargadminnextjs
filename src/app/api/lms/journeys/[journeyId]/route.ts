/**
 * GET    /api/lms/journeys/[journeyId] — fetch one journey (for the editor)
 * PATCH  /api/lms/journeys/[journeyId] — edit name / trigger / DSL in place
 * DELETE /api/lms/journeys/[journeyId] — remove a journey
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    deleteJourney,
    getJourneyById,
    updateJourney,
} from "@/lib/lms/journeys/service";
import { validateJourneyDsl, type JourneyDsl } from "@/lib/lms/journeys/dsl";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ journeyId: string }> },
) {
    const { journeyId } = await params;
    try {
        const journey = await getJourneyById(journeyId);
        if (!journey) {
            return NextResponse.json({ error: "Journey not found" }, { status: 404 });
        }
        return NextResponse.json({ journey });
    } catch (err) {
        console.error("[GET /api/lms/journeys/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

const patchSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    dsl: z
        .object({
            trigger: z.string().min(1),
            steps: z.array(z.unknown()).min(1),
        })
        .passthrough()
        .optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ journeyId: string }> },
) {
    const { journeyId } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    let dsl: JourneyDsl | undefined;
    if (parsed.data.dsl) {
        dsl = parsed.data.dsl as unknown as JourneyDsl;
        try {
            validateJourneyDsl(dsl);
        } catch (err) {
            return NextResponse.json(
                { error: err instanceof Error ? err.message : "Invalid journey DSL" },
                { status: 400 },
            );
        }
    }
    try {
        const journey = await updateJourney({
            journeyId,
            name: parsed.data.name,
            triggerEvent: dsl?.trigger,
            dsl,
        });
        return NextResponse.json({ journey });
    } catch (err) {
        console.error("[PATCH /api/lms/journeys/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ journeyId: string }> },
) {
    const { journeyId } = await params;
    try {
        await deleteJourney(journeyId);
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/journeys/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
