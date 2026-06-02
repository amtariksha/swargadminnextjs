/**
 * GET  /api/lms/campaigns — list campaigns (newest first)
 * POST /api/lms/campaigns — create a campaign (draft, or scheduled if scheduledAt set)
 *
 * Campaigns are marketing-only: the purpose must be `mkt_*` so the 2-number
 * router sends from Number 2. Recipients come from a saved LMS segment.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { createCampaign, listCampaigns } from "@/lib/lms/campaigns/service";
import type { Purpose } from "@/lib/whatsapp/router";
import type { ConsentPurpose } from "@/lib/lms/types";

const MKT_PURPOSES = [
    "mkt_welcome_d2", "mkt_replenishment", "mkt_winback_d30", "mkt_winback_d60",
    "mkt_winback_d90", "mkt_festival_preorder", "mkt_crosssell_bridge",
    "mkt_broadcast", "mkt_back_in_stock", "mkt_inner_circle_touch",
    "mkt_referral_reminder", "mkt_review_request",
] as const;

const CONSENT_PURPOSES = [
    "marketing_whatsapp", "marketing_in_app", "marketing_email", "marketing_sms",
] as const;

const createSchema = z.object({
    name: z.string().min(1).max(120),
    segmentId: z.string().uuid(),
    templateName: z.string().min(1).max(200),
    templateLanguage: z.string().max(8).optional(),
    purpose: z.enum(MKT_PURPOSES as unknown as [string, ...string[]]).default("mkt_broadcast"),
    requiresConsent: z.enum(CONSENT_PURPOSES as unknown as [string, ...string[]]).optional(),
    params: z.record(z.string(), z.string()).optional(),
    scheduledAt: z.string().datetime().optional(),
});

export async function GET(_request: NextRequest) {
    try {
        const campaigns = await listCampaigns();
        return NextResponse.json({ count: campaigns.length, campaigns });
    } catch (err) {
        console.error("[GET /api/lms/campaigns]", err);
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
        const campaign = await createCampaign({
            name: parsed.data.name,
            segmentId: parsed.data.segmentId,
            templateName: parsed.data.templateName,
            templateLanguage: parsed.data.templateLanguage,
            purpose: parsed.data.purpose as Purpose,
            requiresConsent: parsed.data.requiresConsent as ConsentPurpose | undefined,
            params: parsed.data.params,
            scheduledAt: parsed.data.scheduledAt,
            createdByUserId: userId || undefined,
        });
        return NextResponse.json({ campaign }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/campaigns]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
