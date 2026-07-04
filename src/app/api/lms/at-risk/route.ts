/**
 * GET /api/lms/at-risk — today's call list for the care person.
 *
 * Worst health scores first among churn_risk='high' customers (nightly RFM
 * job writes the scores); backfills with 'medium' rows when there are fewer
 * high-risk customers than the limit. Joined in-memory to contacts (name,
 * phone) + lms_rfm_scores (segment, recency) — the people-route pattern.
 *
 *   ?limit=1..50 (default 10)
 *
 * Response: { count, computedAt, stale, people: [{ contactId, name, phone,
 *   riskLevel, healthScore, nextBestAction, segment, recencyDays }] }
 * `stale` flags scores older than 48h so the page can point at the recompute.
 */

import { NextRequest, NextResponse } from "next/server";
import { lmsAdmin } from "@/lib/lms/supabase";

const STALE_AFTER_HOURS = 48;

interface HealthRow {
    customer_id: string;
    score: number;
    churn_risk: string;
    next_best_action: string | null;
    computed_at: string;
}

async function fetchByRisk(risk: string, limit: number): Promise<HealthRow[]> {
    const { data, error } = await lmsAdmin
        .from("lms_health_scores")
        .select("customer_id, score, churn_risk, next_best_action, computed_at")
        .eq("churn_risk", risk)
        .order("score", { ascending: true })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as HealthRow[];
}

export async function GET(request: NextRequest) {
    const rawLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);
    const limit = Math.min(Math.max(Number.isNaN(rawLimit) ? 10 : rawLimit, 1), 50);

    try {
        const high = await fetchByRisk("high", limit);
        const medium =
            high.length < limit ? await fetchByRisk("medium", limit - high.length) : [];
        const rows = [...high, ...medium];
        if (rows.length === 0) {
            return NextResponse.json({ count: 0, computedAt: null, stale: false, people: [] });
        }

        const ids = rows.map((r) => r.customer_id);
        const [{ data: contacts }, { data: rfm }] = await Promise.all([
            lmsAdmin.from("contacts").select("id, name, phone").in("id", ids),
            lmsAdmin
                .from("lms_rfm_scores")
                .select("customer_id, segment, recency_days")
                .in("customer_id", ids),
        ]);

        const contactMap = new Map(
            (contacts ?? []).map((c) => [c.id as string, c as { name: string | null; phone: string | null }]),
        );
        const rfmMap = new Map(
            (rfm ?? []).map((r) => [
                r.customer_id as string,
                { segment: r.segment as string, recencyDays: r.recency_days as number },
            ]),
        );

        const people = rows
            .map((r) => {
                const contact = contactMap.get(r.customer_id);
                if (!contact) return null; // health PK is contacts.id — defensive
                const rf = rfmMap.get(r.customer_id);
                return {
                    contactId: r.customer_id,
                    name: contact.name ?? null,
                    phone: contact.phone ?? null,
                    riskLevel: r.churn_risk,
                    healthScore: r.score,
                    nextBestAction: r.next_best_action,
                    segment: rf?.segment ?? null,
                    recencyDays: rf?.recencyDays ?? null,
                };
            })
            .filter((p): p is NonNullable<typeof p> => p !== null);

        const computedAt = rows.reduce(
            (max, r) => (r.computed_at > max ? r.computed_at : max),
            rows[0].computed_at,
        );
        const ageHours = (Date.now() - new Date(computedAt).getTime()) / 3_600_000;

        return NextResponse.json({
            count: people.length,
            computedAt,
            stale: ageHours > STALE_AFTER_HOURS,
            people,
        });
    } catch (err) {
        console.error("[GET /api/lms/at-risk]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
