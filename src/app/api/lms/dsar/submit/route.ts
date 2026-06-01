/**
 * POST /api/lms/dsar/submit
 *
 * Public endpoint — data principals (customers) submit a DSAR without
 * needing an admin account. Middleware allowlists this path.
 *
 * v1 skeleton: accepts the request, persists it with status=submitted,
 * returns a tracking id. Identity verification (OTP to phone/email) and
 * fulfilment automation (export ZIP for access requests, scrub for
 * erasure, etc.) ship in a follow-up patch — flagging here so future-me
 * doesn't ship this as "done".
 *
 * Until that lands, an operator handles each request manually from the
 * /lms/settings/privacy queue page.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitDsar } from "@/lib/lms/dsar/service";
import type { DsarRequestType } from "@/lib/lms/types";

const REQUEST_TYPES: DsarRequestType[] = [
    "access",
    "correction",
    "erasure",
    "portability",
];

const bodySchema = z
    .object({
        requestType: z.enum(REQUEST_TYPES as [DsarRequestType, ...DsarRequestType[]]),
        contactPhone: z.string().min(10).max(20).optional(),
        contactEmail: z.string().email().optional(),
        details: z.string().max(2000).optional(),
        /**
         * Accepted for forward-compat but currently ignored — LMS runs as a
         * single internal org (see ORG_ID in src/lib/whatsapp/request.ts).
         */
        orgCode: z.string().optional(),
    })
    .refine(
        (data) => data.contactPhone || data.contactEmail,
        { message: "Either contactPhone or contactEmail is required" },
    );

export async function POST(request: NextRequest) {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }

    try {
        const dsar = await submitDsar({
            contactPhone: parsed.data.contactPhone,
            contactEmail: parsed.data.contactEmail,
            requestType: parsed.data.requestType,
            details: parsed.data.details,
        });
        return NextResponse.json(
            {
                requestId: dsar.id,
                status: dsar.status,
                slaDeadline: dsar.slaDeadline,
                message:
                    "Request received. We will verify your identity and respond within 7 days as required by the DPDP Act.",
            },
            { status: 201 },
        );
    } catch (err) {
        console.error("[POST /api/lms/dsar/submit]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
