/**
 * POST /api/lms/rfm/seed-demo
 *
 * Test-mode RFM seeder. Generates plausible random RFM + health scores for
 * every contact in the org. Useful to populate segments / dashboards while
 * the real backend-orders integration is still being verified.
 *
 * Marks every health-score row with `reason_blob.demo_seed = true` so it's
 * easy to identify and overwrite later.
 *
 * Admin-gated by middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { seedDemoRfm } from "@/lib/lms/rfm/seed-demo";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        const result = await seedDemoRfm({ orgId });
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/lms/rfm/seed-demo]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
