/**
 * POST /api/lms/campaigns/[campaignId]/send
 *
 * Immediate send. Runs the campaign-level Compliance Guard review, then fans
 * the segment through the shared dispatch pipeline (consent + ≤2/week cap +
 * quiet hours + 2-number routing). Can be long-running on a big segment.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendCampaign } from "@/lib/lms/campaigns/service";

export const maxDuration = 60;

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    const { campaignId } = await params;
    try {
        const summary = await sendCampaign(campaignId);
        const httpStatus = summary.status === "blocked" ? 409 : 200;
        return NextResponse.json(summary, { status: httpStatus });
    } catch (err) {
        console.error("[POST /api/lms/campaigns/:id/send]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
