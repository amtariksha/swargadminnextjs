/**
 * POST /api/agent-tools/lms/leads/convert
 *
 * Real-time lead conversion signal from the backend. Fired (fire-and-forget)
 * by swargnodejsbackend when a phone places its FIRST order via any path
 * (app order, day-time order, bot quick-order). Token-gated by middleware
 * (AGENT_FORCE_INBOUND_TOKEN / AGENT_FORCE_SERVICE_TOKEN).
 *
 * Body: { phone: string, backendUserId: number, name?, email? }
 *
 * Effect: upserts the phone ↔ backend_user_id link in lms_unified_customers
 * and flips the open WhatsApp lead (if any) to 'converted'. Idempotent and
 * safe when no lead exists (customer ordered without ever messaging).
 *
 * The nightly reconcile (POST /api/agent-tools/lms/reconcile) is the batch
 * backstop for any signal that gets dropped.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { convertLeadByPhone } from "@/lib/lms/leads/service";

const schema = z.object({
    phone: z.string().min(6).max(20),
    backendUserId: z.number().int().positive(),
    name: z.string().max(200).optional(),
    email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail("phone + backendUserId required", 400);
    }

    try {
        const result = await convertLeadByPhone({
            phone: parsed.data.phone,
            backendUserId: parsed.data.backendUserId,
            name: parsed.data.name ?? null,
            email: parsed.data.email ?? null,
        });
        return ok(result);
    } catch (err) {
        return fail(err);
    }
}
