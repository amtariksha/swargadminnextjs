/**
 * POST /api/agent-tools/lms/insights/run
 *
 * Service-token wrapper around the lms-insights Agent Force run, so the
 * backend's nightly cron (lms-nightly 'Insights Agent Nightly Enabled' step)
 * can trigger it — the admin-JWT twin at /api/lms/insights/run stays for the
 * UI's "Run insights" button. The agent writes its own lms_insights_feed rows
 * via write-insights-feed during the run.
 */

import { NextRequest } from "next/server";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { runInsightsBatch } from "@/lib/lms/agent-force/agents";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    try {
        const result = await runInsightsBatch({ orgId: ctx.orgId });
        return ok(result);
    } catch (err) {
        return fail(err);
    }
}
