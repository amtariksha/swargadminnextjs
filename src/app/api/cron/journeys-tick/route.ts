/**
 * Vercel Cron — journey scheduler tick.
 *
 * Runs every minute (configure in vercel.json). Calls the executor for
 * every journey_run whose next_action_at <= now(). Bypasses admin-JWT
 * middleware via the public allowlist + a CRON_SECRET header check.
 *
 * Register the cron in vercel.json with schedule "every-minute" cron syntax
 * (asterisk-slash-1, space, four asterisks). See vercel.json in the repo root.
 *
 * Auth: Vercel's cron runner sends `Authorization: Bearer <CRON_SECRET>`
 * when the env var is set. We honour the same scheme for manual triggers
 * (curl + the same bearer). Without CRON_SECRET set, this endpoint refuses.
 */

import { NextRequest, NextResponse } from "next/server";
import { tickAllDue } from "@/lib/lms/journeys/executor";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
    // Auth — Vercel Cron sends Bearer CRON_SECRET when configured.
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
        const result = await tickAllDue();
        return NextResponse.json({ ok: true, ...result });
    } catch (err) {
        console.error("[cron/journeys-tick]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
