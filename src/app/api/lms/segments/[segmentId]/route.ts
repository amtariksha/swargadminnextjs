/**
 * GET    /api/lms/segments/[segmentId]  — fetch one segment
 * PATCH  /api/lms/segments/[segmentId]  — update name / desc / DSL / dynamic flag
 * DELETE /api/lms/segments/[segmentId]  — delete segment (memberships CASCADE)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    deleteSegment,
    getSegment,
    updateSegment,
} from "@/lib/lms/segments/service";
import { validateFilterDsl } from "@/lib/lms/segments/dsl";

const patchSchema = z.object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(500).nullable().optional(),
    filterDsl: z.unknown().optional(),
    isDynamic: z.boolean().optional(),
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ segmentId: string }> },
) {
    const { segmentId } = await params;
    try {
        const segment = await getSegment({ segmentId });
        if (!segment) {
            return NextResponse.json({ error: "Segment not found" }, { status: 404 });
        }
        return NextResponse.json({ segment });
    } catch (err) {
        console.error("[GET /api/lms/segments/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ segmentId: string }> },
) {
    const { segmentId } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    if (parsed.data.filterDsl !== undefined) {
        try {
            validateFilterDsl(parsed.data.filterDsl);
        } catch (err) {
            return NextResponse.json(
                { error: err instanceof Error ? err.message : "Invalid DSL" },
                { status: 400 },
            );
        }
    }
    try {
        const patchPayload: Parameters<typeof updateSegment>[0]["patch"] = {};
        if (parsed.data.name !== undefined) patchPayload.name = parsed.data.name;
        if (parsed.data.description !== undefined)
            patchPayload.description = parsed.data.description;
        if (parsed.data.filterDsl !== undefined)
            patchPayload.filterDsl = parsed.data.filterDsl as Parameters<
                typeof updateSegment
            >[0]["patch"]["filterDsl"];
        if (parsed.data.isDynamic !== undefined)
            patchPayload.isDynamic = parsed.data.isDynamic;

        const segment = await updateSegment({ segmentId, patch: patchPayload });
        return NextResponse.json({ segment });
    } catch (err) {
        console.error("[PATCH /api/lms/segments/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ segmentId: string }> },
) {
    const { segmentId } = await params;
    try {
        await deleteSegment({ segmentId });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/segments/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
