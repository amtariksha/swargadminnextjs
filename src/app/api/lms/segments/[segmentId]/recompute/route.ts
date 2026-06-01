/**
 * POST /api/lms/segments/[segmentId]/recompute
 *
 * Force a fresh evaluation of the saved DSL and materialise the result into
 * lms_segment_memberships. Nightly cron will do this automatically (per
 * spec §0.2 — segments refreshed by 04:00 IST); this endpoint is for
 * on-demand recompute after editing tags/consent affecting many customers.
 */

import { NextRequest, NextResponse } from "next/server";
import { recomputeSegment } from "@/lib/lms/segments/service";

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ segmentId: string }> },
) {
    const { segmentId } = await params;
    try {
        const result = await recomputeSegment({ segmentId });
        return NextResponse.json({ ...result, segmentId });
    } catch (err) {
        console.error("[POST /api/lms/segments/:id/recompute]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
