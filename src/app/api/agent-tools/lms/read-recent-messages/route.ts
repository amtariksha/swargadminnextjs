/**
 * GET /api/agent-tools/lms/read-recent-messages?customerId=<uuid>&limit=<int>
 *
 * Returns the most recent N messages (inbound + outbound) for one customer's
 * WhatsApp conversation. Used by: lms-customer-support-assist (full thread
 * context), lms-lead-triage (check if STOP was already processed in this
 * conversation to avoid duplicate confirmations).
 *
 * Reads from public.messages joined via conversations.contact_id.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

const schema = z.object({
    customerId: z.string().uuid(),
    limit: z.number().int().min(1).max(200).default(50),
});

export async function GET(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;
    const sp = new URL(request.url).searchParams;
    const parsed = schema.safeParse({
        customerId: sp.get("customerId"),
        limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    if (!parsed.success) return fail("customerId required; limit optional 1-200", 400);

    try {
        // Fetch the customer's conversation IDs first (a customer may have
        // multiple conversations across numbers / time).
        const { data: convs, error: cErr } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("contact_id", parsed.data.customerId);
        if (cErr) throw new Error(cErr.message);
        const convIds = (convs ?? []).map((c) => c.id as string);
        if (convIds.length === 0) {
            return ok({ customerId: parsed.data.customerId, messages: [] });
        }

        const { data, error } = await supabaseAdmin
            .from("messages")
            .select("id, conversation_id, direction, body, content_type, created_at, status")
            .in("conversation_id", convIds)
            .order("created_at", { ascending: false })
            .limit(parsed.data.limit);
        if (error) throw new Error(error.message);
        return ok({
            customerId: parsed.data.customerId,
            limit: parsed.data.limit,
            messages: data ?? [],
        });
    } catch (err) {
        return fail(err);
    }
}
