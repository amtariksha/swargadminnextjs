/**
 * POST /api/lms/consent/[customerId]/withdraw
 *
 * Convenience: withdraw consent for ALL marketing purposes in one call.
 * Writes 4 new rows (in_app, whatsapp, email, sms — each granted=false).
 *
 * Used by:
 *   - The "Withdraw all marketing consent" button in the Preference Center.
 *   - The WhatsApp STOP keyword handler (Lead Triage agent).
 *   - The email 1-click unsubscribe handler.
 *
 * Per DPDP Act §6(4), withdrawal must be as easy as giving consent — this
 * one-call helper makes that mechanically true.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashIp, withdrawAllMarketing } from "@/lib/lms/consent/service";
import { getLatestNotice } from "@/lib/lms/consent/notice";
import type { ConsentSource } from "@/lib/lms/types";

const ALLOWED_SOURCES: ConsentSource[] = [
    "preference_center",
    "whatsapp_keyword",
    "in_app_toggle",
    "phone_call",
];

const bodySchema = z.object({
    source: z.enum(ALLOWED_SOURCES as [ConsentSource, ...ConsentSource[]]),
    language: z.string().min(2).max(8).optional(),
    noticeVersion: z.string().optional(),
    evidenceBlob: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const body = parsed.data;
    const noticeVersion = body.noticeVersion ?? getLatestNotice("en").version;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip")
        ?? null;
    const ipHash = ip ? await hashIp(ip) : undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    try {
        const records = await withdrawAllMarketing({
            customerId,
            source: body.source,
            noticeVersion,
            language: body.language ?? "en",
            ipHash,
            userAgent,
            evidenceBlob: body.evidenceBlob,
        });
        return NextResponse.json(
            { withdrawnCount: records.length, records },
            { status: 201 },
        );
    } catch (err) {
        console.error("[POST /api/lms/consent/:id/withdraw]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
