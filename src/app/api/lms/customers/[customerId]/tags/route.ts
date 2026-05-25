/**
 * GET  /api/lms/customers/[customerId]/tags — list tags on this customer
 * POST /api/lms/customers/[customerId]/tags — assign a tag (idempotent upsert)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { assignTag, getCustomerTags } from "@/lib/lms/tags/service";

const assignSchema = z.object({
    tagId: z.string().uuid(),
    source: z.enum(["auto", "manual", "imported"]).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        const tags = await getCustomerTags({ orgId, customerId });
        return NextResponse.json({ customerId, tags });
    } catch (err) {
        console.error("[GET /api/lms/customers/:id/tags]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;
    const parsed = assignSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        const assignment = await assignTag({
            customerId,
            tagId: parsed.data.tagId,
            source: parsed.data.source,
            expiresAt: parsed.data.expiresAt ?? null,
        });
        return NextResponse.json({ assignment }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/customers/:id/tags]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
