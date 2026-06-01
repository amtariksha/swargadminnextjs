/**
 * GET /api/lms/journeys — list all journeys for the org
 */

import { NextRequest, NextResponse } from "next/server";
import { listJourneys } from "@/lib/lms/journeys/service";

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
