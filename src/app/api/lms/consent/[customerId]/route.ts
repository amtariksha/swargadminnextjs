/**
 * GET  /api/lms/consent/[customerId] — effective consent state per purpose
 * POST /api/lms/consent/[customerId] — record a grant or withdrawal
 *
 * Auth: requires admin Bearer JWT (verified by middleware). orgId is taken
 * from the x-user-org-id header injected by middleware.
 *
 * Service module: src/lib/lms/consent/service.ts owns all DB writes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import {
    getEffectiveConsents,
    hashIp,
    recordConsent,
} from "@/lib/lms/consent/service";
import { getLatestNotice } from "@/lib/lms/consent/notice";
import type { ConsentPurpose, ConsentSource } from "@/lib/lms/types";

const PURPOSES: ConsentPurpose[] = [
    "transactional_orders",
    "marketing_in_app",
    "marketing_whatsapp",
    "marketing_email",
    "marketing_sms",
    "analytics_cookies",
    "personalisation",
];

const SOURCES: ConsentSource[] = [
    "signup",
    "preference_center",
    "whatsapp_keyword",
    "in_app_toggle",
    "checkout",
    "phone_call",
    "stall",
    "import",
    "legitimate_interest_backfill",
];

const recordSchema = z.object({
    purpose: z.enum(PURPOSES as [ConsentPurpose, ...ConsentPurpose[]]),
    granted: z.boolean(),
    source: z.enum(SOURCES as [ConsentSource, ...ConsentSource[]]),
    language: z.string().min(2).max(8).optional(),
    /** Operator can override the notice version (e.g. capturing a verbal consent
     *  against a specific older notice). Defaults to current latest. */
    noticeVersion: z.string().optional(),
    evidenceBlob: z.record(z.string(), z.unknown()).optional(),
});

// ─── GET ─────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;
    const { orgId } = getRequestContext(request.headers);

    if (!orgId) {
        return NextResponse.json(
            { error: "Missing org context" },
            { status: 400 },
        );
    }

    try {
        const consents = await getEffectiveConsents({ orgId, customerId });
        return NextResponse.json({ customerId, consents });
    } catch (err) {
        console.error("[GET /api/lms/consent/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

// ─── POST ────────────────────────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ customerId: string }> },
) {
    const { customerId } = await params;
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json(
            { error: "Missing org context" },
            { status: 400 },
        );
    }

    const json = await request.json().catch(() => null);
    const parsed = recordSchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const body = parsed.data;
    const noticeVersion = body.noticeVersion ?? getLatestNotice("en").version;

    // Best-effort capture of IP + UA for the evidence record. We hash the IP
    // before storing so we don't keep raw IPs around (DPDP minimisation).
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip")
        ?? null;
    const ipHash = ip ? await hashIp(ip) : undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    try {
        const record = await recordConsent({
            orgId,
            customerId,
            purpose: body.purpose,
            granted: body.granted,
            source: body.source,
            noticeVersion,
            language: body.language ?? "en",
            ipHash,
            userAgent,
            evidenceBlob: body.evidenceBlob,
        });
        return NextResponse.json({ record }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/lms/consent/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
