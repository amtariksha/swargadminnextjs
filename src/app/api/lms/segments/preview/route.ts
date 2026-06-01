/**
 * POST /api/lms/segments/preview
 *
 * Stateless preview — evaluate a DSL without saving. Used by the segment
 * builder UI to show "this filter would match N customers" live as the
 * operator edits the DSL.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewSegment } from "@/lib/lms/segments/service";
import { validateFilterDsl } from "@/lib/lms/segments/dsl";

const bodySchema = z.object({
    filterDsl: z.unknown(),
    sampleLimit: z.number().int().min(0).max(200).optional(),
});

export async function POST(request: NextRequest) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        validateFilterDsl(parsed.data.filterDsl);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Invalid DSL" },
            { status: 400 },
        );
    }
    try {
        const preview = await previewSegment({
            filter: parsed.data.filterDsl as Parameters<typeof previewSegment>[0]["filter"],
            sampleLimit: parsed.data.sampleLimit,
        });
        return NextResponse.json({ preview });
    } catch (err) {
        console.error("[POST /api/lms/segments/preview]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
