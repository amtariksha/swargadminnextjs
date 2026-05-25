/**
 * GET /api/lms/journeys — list all journeys for the org
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { listJourneys } from "@/lib/lms/journeys/service";

export async function GET(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        const journeys = await listJourneys({ orgId });
        return NextResponse.json({ count: journeys.length, journeys });
    } catch (err) {
        console.error("[GET /api/lms/journeys]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
