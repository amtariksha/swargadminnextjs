/**
 * GET /api/lms/rfm/status
 *
 * Snapshot for the System page: row counts, per-segment breakdown, last
 * compute time. Read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRequestContext } from "@/lib/whatsapp/request";
import { lmsAdmin } from "@/lib/lms/supabase";
import type { RfmSegmentLabel, ChurnRisk } from "@/lib/lms/rfm/types";

export async function GET(request: NextRequest) {
    const { orgId } = getRequestContext(request.headers);
    if (!orgId) {
        return NextResponse.json({ error: "Missing org context" }, { status: 400 });
    }
    try {
        const [{ data: rfm, error: rfmErr }, { data: health, error: healthErr }] =
            await Promise.all([
                lmsAdmin
                    .from("lms_rfm_scores")
                    .select("segment, computed_at")
                    .eq("org_id", orgId),
                lmsAdmin
                    .from("lms_health_scores")
                    .select("churn_risk, score, computed_at")
                    .eq("org_id", orgId),
            ]);
        if (rfmErr) throw new Error(rfmErr.message);
        if (healthErr) throw new Error(healthErr.message);

        const segmentCounts: Record<RfmSegmentLabel, number> = {
            Champions: 0,
            Loyal: 0,
            Promising: 0,
            "At-Risk": 0,
            Hibernating: 0,
            Lost: 0,
        };
        let rfmLastComputed: string | null = null;
        for (const row of rfm ?? []) {
            const s = row.segment as RfmSegmentLabel;
            if (s in segmentCounts) segmentCounts[s] += 1;
            const ts = row.computed_at as string;
            if (!rfmLastComputed || ts > rfmLastComputed) rfmLastComputed = ts;
        }

        const churnCounts: Record<ChurnRisk, number> = { low: 0, medium: 0, high: 0 };
        let healthLastComputed: string | null = null;
        let healthScoreSum = 0;
        for (const row of health ?? []) {
            const c = row.churn_risk as ChurnRisk;
            if (c in churnCounts) churnCounts[c] += 1;
            healthScoreSum += (row.score as number) ?? 0;
            const ts = row.computed_at as string;
            if (!healthLastComputed || ts > healthLastComputed) healthLastComputed = ts;
        }

        return NextResponse.json({
            rfm: {
                totalRows: rfm?.length ?? 0,
                lastComputedAt: rfmLastComputed,
                segmentCounts,
            },
            health: {
                totalRows: health?.length ?? 0,
                lastComputedAt: healthLastComputed,
                averageScore:
                    health && health.length > 0
                        ? Math.round((healthScoreSum / health.length) * 10) / 10
                        : 0,
                churnCounts,
            },
        });
    } catch (err) {
        console.error("[GET /api/lms/rfm/status]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
