/**
 * GET  /api/lms/segments — list segments for the org
 * POST /api/lms/segments — create new segment from DSL
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { createSegment, listSegments } from "@/lib/lms/segments/service";
import { validateFilterDsl } from "@/lib/lms/segments/dsl";

const createSchema = z.object({
    name: z.string().min(1).max(128),
    description: z.string().max(500).optional(),
    filterDsl: z.unknown(),
    isDynamic: z.boolean().optional(),
});

export async function GET(_request: NextRequest) {
    try {
        const segments = await listSegments();
        return NextResponse.json({ count: segments.length, segments });
    } catch (err) {
        console.error("[GET /api/lms/segments]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const { userId } = getRequestContext(request.headers);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
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
            { error: err instanceof Error ? err.message : "Invalid filter DSL" },
            { status: 400 },
        );
    }
    try {
        const segment = await createSegment({
            name: parsed.data.name,
            description: parsed.data.description,
            filterDsl: parsed.data.filterDsl,
            isDynamic: parsed.data.isDynamic,
            createdByUserId: userId || undefined,
        });
        return NextResponse.json({ segment }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/segments]", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("duplicate") || msg.includes("unique")) {
            return NextResponse.json(
                { error: "A segment with this name already exists" },
                { status: 409 },
            );
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
