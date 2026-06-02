/**
 * POST /api/agent-tools/lms/campaigns-tick
 *
 * Sends any scheduled campaign whose time has arrived (campaign-level
 * Compliance Guard, then the shared send pipeline per recipient). Triggered by
 * the backend cron scheduler (swargnodejsbackend src/cron/jobs/campaignsTick.js)
 * every few minutes. Gated by the agent-tools service token.
 */

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { listDueCampaigns, sendCampaign } from "@/lib/lms/campaigns/service";

export const maxDuration = 60;

export async function POST(_request: NextRequest) {
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
        return ok({ processed: due.length, results });
    } catch (err) {
        return fail(err, 500);
    }
}
