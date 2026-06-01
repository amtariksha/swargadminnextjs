/**
 * GET    /api/lms/leads/[leadId]   — fetch one
 * PATCH  /api/lms/leads/[leadId]   — update status/owner/notes/tags
 * DELETE /api/lms/leads/[leadId]   — hard delete
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteLead, getLead, updateLead } from "@/lib/lms/leads/service";
import type { LeadStatus } from "@/lib/lms/leads/types";

const STATUSES: LeadStatus[] = [
    "new",
    "contacted",
    "qualified",
    "converted",
    "lost",
    "duplicate",
];

const patchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(6).max(20).nullable().optional(),
    email: z.string().email().nullable().optional().or(z.literal("")),
    pincode: z.string().max(12).nullable().optional(),
    language: z.string().max(8).optional(),
    status: z.enum(STATUSES as [LeadStatus, ...LeadStatus[]]).optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    score: z.number().int().min(0).max(100).nullable().optional(),
    tags: z.array(z.string().max(64)).max(20).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
});

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ leadId: string }> },
) {
    const { leadId } = await params;
    try {
        const lead = await getLead({ leadId });
        if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        return NextResponse.json({ lead });
    } catch (err) {
        console.error("[GET /api/lms/leads/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ leadId: string }> },
) {
    const { leadId } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        const patch: Parameters<typeof updateLead>[0]["patch"] = {};
        if (parsed.data.name !== undefined) patch.name = parsed.data.name;
        if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone ?? undefined;
        if (parsed.data.email !== undefined) {
            patch.email = parsed.data.email || undefined;
        }
        if (parsed.data.pincode !== undefined) patch.pincode = parsed.data.pincode ?? undefined;
        if (parsed.data.language !== undefined) patch.language = parsed.data.language;
        if (parsed.data.status !== undefined) patch.status = parsed.data.status;
        if (parsed.data.ownerUserId !== undefined)
            patch.ownerUserId = parsed.data.ownerUserId ?? undefined;
        if (parsed.data.score !== undefined) patch.score = parsed.data.score ?? undefined;
        if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags ?? undefined;
        if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes ?? undefined;

        const lead = await updateLead({ leadId, patch });
        return NextResponse.json({ lead });
    } catch (err) {
        console.error("[PATCH /api/lms/leads/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ leadId: string }> },
) {
    const { leadId } = await params;
    try {
        await deleteLead({ leadId });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[DELETE /api/lms/leads/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
