/**
 * POST /api/lms/leads/[leadId]/convert
 *
 * Mark a lead as converted by binding it to an existing customer record.
 * The customer ID is the WACRM contacts.id (UUID) — same canonical
 * customer identifier we use across the LMS.
 *
 * Body: { customerId: string }
 *
 * Future: if `customerId` not provided, auto-create the contact from the
 * lead's name/phone/email — wired up in C4 follow-up once Contacts CRUD
 * has a service module of its own.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { convertLead } from "@/lib/lms/leads/service";

const bodySchema = z.object({
    customerId: z.string().uuid(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leadId: string }> },
) {
    const { leadId } = await params;
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        const lead = await convertLead({
            orgId,
            leadId,
            convertedCustomerId: parsed.data.customerId,
        });
        return NextResponse.json({ lead });
    } catch (err) {
        console.error("[POST /api/lms/leads/:id/convert]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
