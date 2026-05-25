/**
 * POST /api/agent-tools/lms/write-inbox-message
 *
 * Body: { conversationId, body, kind: "auto_reply" | "internal_note" }
 *
 * Used by:
 *   • lms-lead-triage  — to send opt-out confirmation ("You've been
 *     unsubscribed. Reply START to re-subscribe.") with kind="auto_reply".
 *   • lms-customer-support-assist  — to drop an internal-only note on a
 *     conversation summarising the agent's reasoning, kind="internal_note".
 *
 * For "auto_reply" we dispatch through the existing WhatsApp send path so
 * 2-number routing is honoured. For "internal_note" we just insert a
 * messages row with direction='internal'.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { routeSend } from "@/lib/whatsapp/router";

const schema = z.object({
    conversationId: z.string().uuid(),
    body: z.string().min(1).max(4096),
    kind: z.enum(["auto_reply", "internal_note"]),
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
        // Pull the conversation to confirm it's in this org and to get the
        // contact_id for outbound sends.
        const { data: conv, error: cErr } = await supabaseAdmin
            .from("conversations")
            .select("id, contact_id, integrated_number, org_id")
            .eq("id", body.conversationId)
            .maybeSingle();
        if (cErr) throw new Error(`conversation lookup: ${cErr.message}`);
        if (!conv) return fail("conversation not found", 404);
        if (conv.org_id !== ctx.orgId) return fail("conversation/org mismatch", 403);

        if (body.kind === "internal_note") {
            // Internal-only — never leaves the system.
            const { data, error } = await supabaseAdmin
                .from("messages")
                .insert({
                    conversation_id: body.conversationId,
                    direction: "internal",
                    content_type: "text",
                    body: body.body,
                    status: "internal",
                    metadata: {
                        written_by_agent: ctx.agentSlug,
                        agent_request_id: ctx.requestId,
                    },
                })
                .select("id")
                .single();
            if (error) throw new Error(error.message);
            return ok({ messageId: data.id, kind: "internal_note" }, { status: 201 });
        }

        // auto_reply — honour 2-number routing. Opt-out confirmations are
        // transactional in spirit (responding to a user-initiated request)
        // so we use a txn_support_reply purpose → Number 1.
        const routed = await routeSend({
            orgId: ctx.orgId,
            purpose: "txn_support_reply",
        });
        // We don't actually dispatch to Meta here — that happens via the
        // existing /api/whatsapp/chat/send pipeline. For agent-originated
        // sends we log the intent and let an operator or the send worker
        // pick it up. Full agent-driven outbound lands in C8 follow-up.
        const { data, error } = await supabaseAdmin
            .from("messages")
            .insert({
                conversation_id: body.conversationId,
                direction: "out",
                content_type: "text",
                body: body.body,
                status: "queued",
                metadata: {
                    written_by_agent: ctx.agentSlug,
                    agent_request_id: ctx.requestId,
                    routed_number: routed.number,
                    purpose: "txn_support_reply",
                },
            })
            .select("id")
            .single();
        if (error) throw new Error(error.message);
        return ok(
            { messageId: data.id, kind: "auto_reply", routedNumber: routed.number },
            { status: 201 },
        );
    } catch (err) {
        return fail(err);
    }
}
