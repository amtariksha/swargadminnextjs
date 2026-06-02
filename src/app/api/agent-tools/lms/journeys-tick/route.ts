/**
 * POST /api/agent-tools/lms/journeys-tick
 *
 * Advances every journey run whose next_action_at has passed (one step, with
 * the shared send pipeline). Triggered by the backend cron scheduler
 * (swargnodejsbackend src/cron/jobs/journeysTick.js) every minute — NOT a
 * Vercel cron, since the Hobby plan has no sub-daily crons. Gated by the
 * agent-tools service token (same surface + secret as the LMS nightly job).
 */

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import { tickAllDue } from "@/lib/lms/journeys/executor";

export const maxDuration = 60;

export async function POST(_request: NextRequest) {
    try {
        const result = await tickAllDue();
        return ok(result);
    } catch (err) {
        return fail(err, 500);
    }
}
