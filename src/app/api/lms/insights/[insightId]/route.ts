/**
 * PATCH /api/lms/insights/[insightId]
 *
 * Approve / Snooze / Dismiss an AI-flagged action from the Today screen.
 *
 * Body: { action: "approve" | "snooze" | "dismiss", snoozeHours?: number }
 *
 * State transitions:
 *   pending → approved      (operator clicks "Approve" — actionable next step
 *                            shipped in C9 when each action type has a handler)
 *   pending → snoozed       (re-surfaces after snoozeHours)
 *   pending → dismissed     (gone for good — but logged so Insights agent
 *                            can learn to flag fewer of this kind)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestContext } from "@/lib/whatsapp/request";
import { lmsAdmin } from "@/lib/lms/supabase";

const schema = z.object({
    action: z.enum(["approve", "snooze", "dismiss"]),
    snoozeHours: z.number().int().min(1).max(168).optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ insightId: string }> },
) {
    const { insightId } = await params;
    const { userId } = getRequestContext(request.headers);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
        actioned_by_user_id: userId ?? null,
        actioned_at: now,
    };
    if (parsed.data.action === "approve") update.state = "approved";
    if (parsed.data.action === "dismiss") update.state = "dismissed";
    if (parsed.data.action === "snooze") {
        const hours = parsed.data.snoozeHours ?? 24;
        update.state = "snoozed";
        update.snooze_until = new Date(Date.now() + hours * 3_600_000).toISOString();
    }

    try {
        const { data, error } = await lmsAdmin
            .from("lms_insights_feed")
            .update(update)
            .eq("id", insightId)
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ insight: data });
    } catch (err) {
        console.error("[PATCH /api/lms/insights/:id]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
