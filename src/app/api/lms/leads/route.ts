/**
 * GET  /api/lms/leads   — paginated, filtered list
 * POST /api/lms/leads   — create lead (admin / operator-initiated)
 *
 * Source-keyed public intake is at /api/lms/leads/intake/[source] (no auth).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { createLead, listLeads } from "@/lib/lms/leads/service";
import type { LeadSource, LeadStatus } from "@/lib/lms/leads/types";

const SOURCES: LeadSource[] = [
    "whatsapp",
    "phone",
    "website_form",
    "app_install",
    "stall",
    "referral",
    "social",
    "geo_ai",
    "organic_search",
    "csv_import",
    "manual",
    "other",
];

const STATUSES: (LeadStatus | "all")[] = [
    "all",
    "new",
    "contacted",
    "qualified",
    "converted",
    "lost",
    "duplicate",
];

const createSchema = z.object({
    source: z.enum(SOURCES as [LeadSource, ...LeadSource[]]).default("manual"),
    sourceDetails: z.record(z.string(), z.unknown()).optional(),
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(6).max(20).optional(),
    email: z.string().email().optional().or(z.literal("")),
    pincode: z.string().max(12).optional(),
    language: z.string().max(8).optional(),
    ownerUserId: z.string().uuid().optional(),
    tags: z.array(z.string().max(64)).max(20).optional(),
    notes: z.string().max(4000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status") as (LeadStatus | "all") | null;
    const source = sp.get("source") as (LeadSource | "all") | null;
    const owner = sp.get("owner");
    const search = sp.get("q") ?? undefined;
    const fromDate = sp.get("from") ?? undefined;
    const toDate = sp.get("to") ?? undefined;
    const limit = sp.get("limit") ? parseInt(sp.get("limit") ?? "50", 10) : undefined;
    const offset = sp.get("offset") ? parseInt(sp.get("offset") ?? "0", 10) : undefined;

    try {
        const result = await listLeads({
            status: status && STATUSES.includes(status) ? status : "all",
            source: source && (SOURCES.includes(source as LeadSource) || source === "all")
                ? source
                : "all",
            ownerUserId: owner ?? "any",
            search,
            fromDate,
            toDate,
            limit,
            offset,
        });
        return NextResponse.json(result);
    } catch (err) {
        console.error("[GET /api/lms/leads]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const { userId } = getRequestContext(request.headers);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid body", details: parsed.error.flatten() },
            { status: 400 },
        );
    }
    try {
        const result = await createLead({
            source: parsed.data.source,
            sourceDetails: parsed.data.sourceDetails,
            name: parsed.data.name,
            phone: parsed.data.phone,
            email: parsed.data.email || undefined,
            pincode: parsed.data.pincode,
            language: parsed.data.language,
            ownerUserId: parsed.data.ownerUserId,
            tags: parsed.data.tags,
            notes: parsed.data.notes,
            metadata: {
                ...(parsed.data.metadata ?? {}),
                created_by_admin: userId || "unknown",
            },
        });
        return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
    } catch (err) {
        console.error("[POST /api/lms/leads]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
