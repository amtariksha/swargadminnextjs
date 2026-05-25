/**
 * POST /api/agent-tools/lms/write-lead
 *
 * Body: same shape as POST /api/lms/leads (source, name, phone, email, ...).
 * Returns: { leadId, deduped }.
 *
 * Used by: lms-lead-triage when an inbound message contains a "new_lead"
 * intent. Idempotency: createLead's built-in dedupe (open lead with same
 * phone → touch instead of insert) covers retries.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { createLead } from "@/lib/lms/leads/service";
import type { LeadSource } from "@/lib/lms/leads/types";

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

const schema = z.object({
    source: z.enum(SOURCES as [LeadSource, ...LeadSource[]]),
    sourceDetails: z.record(z.string(), z.unknown()).optional(),
    name: z.string().max(200).optional(),
    phone: z.string().min(6).max(20).optional(),
    email: z.string().email().optional(),
    pincode: z.string().max(12).optional(),
    language: z.string().max(8).optional(),
    tags: z.array(z.string().max(64)).max(20).optional(),
    notes: z.string().max(4000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail(`invalid body: ${JSON.stringify(parsed.error.flatten())}`, 400);
    }
    const body = parsed.data;
    try {
        const result = await createLead({
            orgId: ctx.orgId,
            source: body.source,
            sourceDetails: body.sourceDetails,
            name: body.name,
            phone: body.phone,
            email: body.email,
            pincode: body.pincode,
            language: body.language,
            tags: body.tags,
            notes: body.notes,
            metadata: {
                ...(body.metadata ?? {}),
                created_by_agent: ctx.agentSlug,
                agent_request_id: ctx.requestId,
            },
        });
        return ok(
            { leadId: result.lead.id, deduped: result.deduped, status: result.lead.status },
            { status: result.deduped ? 200 : 201 },
        );
    } catch (err) {
        return fail(err);
    }
}
