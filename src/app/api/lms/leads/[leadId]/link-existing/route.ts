/**
 * POST /api/lms/leads/[leadId]/link-existing
 *
 * "Link to existing customer" merge for a WhatsApp lead that turns out to be an
 * existing customer's alternate number. Records the lead's phone as an
 * alternate on the chosen backend user (so future logins / orders / inbound
 * messages resolve to that customer via resolveUserByPhone), then marks the
 * lead 'duplicate'.
 *
 * Admin-gated by middleware. The admin's Bearer JWT is forwarded to the backend
 * (rfm-runner pattern) so its authenticateToken middleware accepts the call.
 *
 * Body: { existingUserId: number, label?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getLead, updateLead } from "@/lib/lms/leads/service";

const bodySchema = z.object({
    existingUserId: z.number().int().positive(),
    label: z.string().max(100).optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ leadId: string }> },
) {
    const { leadId } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "existingUserId required", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const lead = await getLead({ leadId });
    if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (!lead.phone) {
        return NextResponse.json(
            { error: "Lead has no phone to link" },
            { status: 400 },
        );
    }

    const backendUrl =
        process.env.SWARG_BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!backendUrl) {
        return NextResponse.json(
            { error: "Backend URL not configured (SWARG_BACKEND_URL)" },
            { status: 503 },
        );
    }
    const auth = request.headers.get("authorization") ?? "";

    try {
        // 1. Record the alternate number on the existing backend user.
        const res = await fetch(
            `${backendUrl.replace(/\/$/, "")}/api/users/${parsed.data.existingUserId}/alternate-phones`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: auth },
                body: JSON.stringify({ phone: lead.phone, label: parsed.data.label ?? "alternate" }),
                signal: AbortSignal.timeout(10000),
            },
        );
        const backendJson = (await res.json().catch(() => ({}))) as {
            status?: boolean;
            message?: string;
        };
        if (!res.ok || backendJson.status === false) {
            return NextResponse.json(
                { error: backendJson.message ?? `backend ${res.status}` },
                { status: 502 },
            );
        }

        // 2. Mark the lead a duplicate of that customer.
        const updated = await updateLead({
            leadId,
            patch: {
                status: "duplicate",
                metadata: {
                    ...(lead.metadata ?? {}),
                    linked_backend_user_id: parsed.data.existingUserId,
                    linked_as: "alternate_phone",
                },
            },
        });
        return NextResponse.json({ lead: updated });
    } catch (err) {
        console.error("[POST /api/lms/leads/:id/link-existing]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
