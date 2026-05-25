/**
 * GET  /api/lms/referrals/codes/[customerId] — get or create the customer's code
 * POST /api/lms/referrals/codes/[customerId] — same, with optional reward override
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { getOrCreateCode } from "@/lib/lms/referrals/service";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

const bodySchema = z.object({
    rewardGiver: z.number().min(0).max(10000).optional(),
    rewardReceiver: z.number().min(0).max(10000).optional(),
    maxUses: z.number().int().positive().optional(),
});

const DEFAULT_REWARD = 150; // INR; Phase 1 default both sides

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    return ensureCode(request, params, {});
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    return ensureCode(request, params, parsed.data);
}

async function ensureCode(
    request: NextRequest,
    params: Promise<{ customerId: string }>,
    overrides: z.infer<typeof bodySchema>,
) {
    const { customerId } = await params;
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        // Look up the contact's name so the code prefix is mnemonic.
        const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("name")
            .eq("id", customerId)
            .maybeSingle();

        const code = await getOrCreateCode({
            orgId,
            ownerCustomerId: customerId,
            ownerName: contact?.name as string | undefined,
            rewardGiver: overrides.rewardGiver ?? DEFAULT_REWARD,
            rewardReceiver: overrides.rewardReceiver ?? DEFAULT_REWARD,
            maxUses: overrides.maxUses,
        });
        return NextResponse.json({ code });
    } catch (err) {
        console.error("[GET/POST /api/lms/referrals/codes/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
