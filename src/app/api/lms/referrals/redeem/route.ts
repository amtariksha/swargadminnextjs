/**
 * POST /api/lms/referrals/redeem
 * Body: { code, newCustomerId, firstOrderId, deviceId? }
 *
 * Validates and consumes a referral code at checkout time. Returns the
 * owner / reward details on success so the caller can update the order
 * total + show the redeemer a confirmation.
 *
 * Rejection reasons:
 *   code_not_found / code_inactive / self_referral / max_uses_reached
 *   / duplicate_redemption / missing_order_context
 *
 * The conversion row starts as 'pending'; flip to 'granted' when the
 * first order is actually delivered (call grantReferralReward()).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { redeemCode } from "@/lib/lms/referrals/service";

const schema = z.object({
    code: z.string().min(3).max(32),
    newCustomerId: z.string().uuid(),
    firstOrderId: z.string().min(1),
    deviceId: z.string().max(128).optional(),
});

export async function POST(request: NextRequest) {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    try {
        const result = await redeemCode({ ...parsed.data });
        if (!result.success) {
            return NextResponse.json(result, { status: 409 });
        }
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/lms/referrals/redeem]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
