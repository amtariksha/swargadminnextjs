/**
 * POST /api/lms/insights/run
 *
 * Manually trigger the Insights agent. Returns count of feed rows written.
 * A nightly Vercel Cron entry will call this automatically (see vercel.json
 * once the Today screen surface is finished).
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { runInsightsBatch } from "@/lib/lms/agent-force/agents";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        const result = await runInsightsBatch({ orgId });
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/lms/insights/run]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
