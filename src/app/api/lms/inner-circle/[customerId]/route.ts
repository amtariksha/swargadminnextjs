/**
 * POST   /api/lms/inner-circle/[customerId] — add member
 * DELETE /api/lms/inner-circle/[customerId] — remove member
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    addToInnerCircle,
    removeFromInnerCircle,
} from "@/lib/lms/referrals/service";

const addSchema = z.object({ tier: z.string().max(64).optional() });

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;
    const parsed = addSchema.safeParse(await request.json().catch(() => ({})));
    try {
        const member = await addToInnerCircle({
            customerId,
            tier: parsed.success ? parsed.data.tier : undefined,
        });
        return NextResponse.json({ member }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/inner-circle/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;
    try {
        await removeFromInnerCircle({ customerId });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/inner-circle/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
