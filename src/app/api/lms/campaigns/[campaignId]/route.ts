/**
 * GET    /api/lms/campaigns/[campaignId] — fetch one campaign
 * DELETE /api/lms/campaigns/[campaignId] — cancel (only draft/scheduled)
 */

import { NextRequest, NextResponse } from "next/server";
import { cancelCampaign, getCampaign } from "@/lib/lms/campaigns/service";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    const { campaignId } = await params;
    try {
        const campaign = await getCampaign(campaignId);
        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }
        return NextResponse.json({ campaign });
    } catch (err) {
        console.error("[GET /api/lms/campaigns/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ campaignId: string }> },
) {
    const { campaignId } = await params;
    try {
        await cancelCampaign(campaignId);
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/campaigns/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
