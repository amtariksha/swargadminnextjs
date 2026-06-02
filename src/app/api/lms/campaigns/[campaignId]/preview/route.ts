/**
 * POST /api/lms/campaigns/[campaignId]/preview
 *
 * Resolve the campaign's segment to a live recipient count + 20-row sample so
 * the operator can sanity-check the audience before sending.
 */

import { NextRequest, NextResponse } from "next/server";
import { previewCampaign } from "@/lib/lms/campaigns/service";

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    const { campaignId } = await params;
    try {
        const preview = await previewCampaign(campaignId);
        return NextResponse.json(preview);
    } catch (err) {
        console.error("[POST /api/lms/campaigns/:id/preview]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
