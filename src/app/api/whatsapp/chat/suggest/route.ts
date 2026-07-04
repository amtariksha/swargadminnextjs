/**
 * POST /api/whatsapp/chat/suggest
 *
 * Body: { conversationId, contactId }
 *
 * "Suggest reply" for the inbox composer — invokes the
 * lms-customer-support-assist Agent Force agent, which reads the
 * conversation/order/health context via its own tools. Returns 1–3 drafts;
 * they are inert until a human puts one in the composer and hits Send.
 *
 * Graceful when Agent Force is unconfigured/unreachable: 200 with
 * configured:false so the UI shows a quiet notice instead of an error state.
 * Admin-JWT gated by middleware like the rest of /api/whatsapp/**.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { suggestReply } from "@/lib/lms/agent-force/agents";

export const maxDuration = 30;

const schema = z.object({
    conversationId: z.string().min(1),
    contactId: z.string().min(1),
});

export async function POST(request: NextRequest) {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json(
            { error: `invalid body: ${JSON.stringify(parsed.error.flatten())}` },
            { status: 400 },
        );
    }
    const { conversationId, contactId } = parsed.data;

    try {
        const result = await suggestReply({
            sessionId: `cs-assist-${conversationId}`,
            conversationId,
            customerId: contactId,
        });
        if (!result) {
            return NextResponse.json({
                configured: false,
                suggestions: [],
                doNotSendAlone: false,
            });
        }
        return NextResponse.json({ configured: true, ...result });
    } catch (err) {
        console.error("[POST /api/whatsapp/chat/suggest]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
