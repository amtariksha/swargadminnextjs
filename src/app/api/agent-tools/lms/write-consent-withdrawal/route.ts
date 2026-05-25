/**
 * POST /api/agent-tools/lms/write-consent-withdrawal
 *
 * Body: { customerId, purposes?: ConsentPurpose[], source?: ConsentSource }
 *
 * Used by: lms-lead-triage when an inbound contains an opt-out keyword
 * (STOP, UNSUBSCRIBE, Rukja, Band madi, ...). Default purposes = all
 * 4 marketing channels (in_app, whatsapp, email, sms). Source defaults
 * to 'whatsapp_keyword'.
 *
 * Writes one append-only row per (customer, purpose) into lms_consent_records
 * with granted=false. Idempotent at the ledger level — even a repeated STOP
 * will write a new row but downstream consent checks always read the latest.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import {
    recordConsent,
    withdrawAllMarketing,
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

const schema = z.object({
    customerId: z.string().uuid(),
    purposes: z
        .array(z.enum(PURPOSES as [ConsentPurpose, ...ConsentPurpose[]]))
        .optional(),
    source: z
        .enum(SOURCES as [ConsentSource, ...ConsentSource[]])
        .default("whatsapp_keyword"),
    language: z.string().max(8).optional(),
});

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail(`invalid body: ${JSON.stringify(parsed.error.flatten())}`, 400);
    }
    const body = parsed.data;
    const noticeVersion = getLatestNotice("en").version;

    try {
        if (!body.purposes || body.purposes.length === 0) {
            const records = await withdrawAllMarketing({
                orgId: ctx.orgId,
                customerId: body.customerId,
                source: body.source,
                noticeVersion,
                language: body.language ?? "en",
                evidenceBlob: {
                    written_by_agent: ctx.agentSlug,
                    agent_request_id: ctx.requestId,
                },
            });
            return ok(
                { recordIds: records.map((r) => r.id), withdrawnPurposes: records.map((r) => r.purpose) },
                { status: 201 },
            );
        }
        const records = [];
        for (const purpose of body.purposes) {
            const rec = await recordConsent({
                orgId: ctx.orgId,
                customerId: body.customerId,
                purpose,
                granted: false,
                source: body.source,
                noticeVersion,
                language: body.language ?? "en",
                evidenceBlob: {
                    written_by_agent: ctx.agentSlug,
                    agent_request_id: ctx.requestId,
                },
            });
            records.push(rec);
        }
        return ok(
            { recordIds: records.map((r) => r.id), withdrawnPurposes: records.map((r) => r.purpose) },
            { status: 201 },
        );
    } catch (err) {
        return fail(err);
    }
}
