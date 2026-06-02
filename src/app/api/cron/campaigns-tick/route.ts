/**
 * Vercel Cron — scheduled-campaign dispatcher.
 *
 * Fires every few minutes. Sends any campaign whose status is `scheduled` and
 * whose scheduled_at has passed. Same CRON_SECRET scheme as journeys-tick;
 * bypasses admin-JWT middleware (not in the matcher).
 *
 * Recommended schedule: every 5 minutes. Schedule campaigns OUTSIDE quiet
 * hours (21:00–08:00 IST) — the dispatch pipeline defers marketing sends in
 * that window, so a campaign fired then would have its recipients skipped.
 */

import { NextRequest, NextResponse } from "next/server";
import { listDueCampaigns, sendCampaign } from "@/lib/lms/campaigns/service";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: "CRON_SECRET not configured — cron disabled" },
            { status: 503 },
        );
    }
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const due = await listDueCampaigns();
        const results: Array<{ id: string; status: string; sent?: number; error?: string }> = [];
        for (const id of due) {
            try {
                const summary = await sendCampaign(id);
                results.push({ id, status: summary.status, sent: summary.counts.sent });
            } catch (err) {
                results.push({
                    id,
                    status: "error",
                    error: err instanceof Error ? err.message : "Unknown error",
                });
            }
        }
        return NextResponse.json({ ok: true, processed: due.length, results });
    } catch (err) {
        console.error("[cron/campaigns-tick]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
