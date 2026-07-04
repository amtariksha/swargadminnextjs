/**
 * POST /api/agent-tools/lms/rfm-recompute
 *
 * Body:
 *   { aggregates: [{ phone, lastOrderAt?, firstOrderAt?, count180d,
 *                    countWindow, sumWindow }] }
 *
 * Nightly RFM + health-score recompute, fed by the backend cron
 * (lms-nightly 'RFM Nightly Enabled' step) which aggregates its own orders
 * table in SQL — no admin JWT, no /get_order field-guessing. Scores every
 * contact against the pushed picture and upserts lms_rfm_scores +
 * lms_health_scores via the shared scorer.
 *
 * An empty/missing aggregates array is a 400, never a run: a non-empty
 * payload asserts "this is the complete 180-day order picture" (zero-scoring
 * unmatched contacts is then correct), while an empty one is almost always an
 * upstream bug and must not wipe real scores. When there genuinely are no
 * orders, the backend skips the POST entirely.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getAgentContext, ok, fail } from "@/lib/lms/agent-force/tool-helpers";
import {
    scoreAndWriteFromAggregates,
    type OrderAggregate,
} from "@/lib/lms/rfm/runner";

export const maxDuration = 60;

const schema = z.object({
    aggregates: z
        .array(
            z.object({
                phone: z.string().min(6),
                lastOrderAt: z.string().nullable().optional(),
                firstOrderAt: z.string().nullable().optional(),
                count180d: z.number().int().min(0),
                countWindow: z.number().int().min(0),
                sumWindow: z.number().min(0),
            }),
        )
        .min(1),
});

function toDate(iso: string | null | undefined): Date | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: NextRequest) {
    const ctx = getAgentContext(request);
    if ("status" in ctx) return ctx;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return fail(`invalid body: ${JSON.stringify(parsed.error.flatten())}`, 400);
    }

    const aggregates = new Map<string, OrderAggregate>();
    for (const a of parsed.data.aggregates) {
        aggregates.set(a.phone, {
            lastOrderAt: toDate(a.lastOrderAt),
            firstOrderAt: toDate(a.firstOrderAt),
            count180d: a.count180d,
            count90d: a.countWindow,
            sum90d: a.sumWindow,
        });
    }

    try {
        const result = await scoreAndWriteFromAggregates({ aggregates });
        return ok(result);
    } catch (err) {
        return fail(err);
    }
}
