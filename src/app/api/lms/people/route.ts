/**
 * GET /api/lms/people
 *
 * Unified customer + lead list for the People page. Pulls from:
 *   • public.contacts          — name / phone / email / org_id
 *   • app_lms.lms_rfm_scores   — segment + score (best-effort)
 *   • app_lms.lms_health_scores — churn risk (best-effort)
 *
 * Filters: search (name/phone), segment, churn_risk. Sorted by recency
 * (RFM last-computed first, else contacts.created_at).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { lmsAdmin } from "@/lib/lms/supabase";
import type { ChurnRisk, RfmSegmentLabel } from "@/lib/lms/rfm/types";

export interface UnifiedPerson {
    contactId: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    createdAt: string;
    rfmSegment: RfmSegmentLabel | null;
    healthScore: number | null;
    churnRisk: ChurnRisk | null;
}

export async function GET(request: NextRequest) {
    const sp = new URL(request.url).searchParams;
    const search = sp.get("q")?.trim();
    const segment = sp.get("segment") as RfmSegmentLabel | "all" | null;
    const churnRisk = sp.get("churn") as ChurnRisk | "all" | null;
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "100", 10), 1), 500);

    try {
        // 1. All contacts.
        let q = supabaseAdmin
            .from("contacts")
            .select("id, name, phone, email, created_at", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(limit);
        if (search) {
            const like = `%${search}%`;
            q = q.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
        }
        const { data: contacts, error, count } = await q;
        if (error) throw new Error(`contacts: ${error.message}`);

        const ids = (contacts ?? []).map((c) => c.id as string);
        if (ids.length === 0) {
            return NextResponse.json({ count: 0, total: count ?? 0, people: [] });
        }

        // 2. RFM + Health rows in bulk.
        const [{ data: rfm }, { data: health }] = await Promise.all([
            lmsAdmin
                .from("lms_rfm_scores")
                .select("customer_id, segment")
                .in("customer_id", ids),
            lmsAdmin
                .from("lms_health_scores")
                .select("customer_id, score, churn_risk")
                .in("customer_id", ids),
        ]);

        const rfmMap = new Map<string, RfmSegmentLabel>();
        for (const r of rfm ?? []) {
            rfmMap.set(r.customer_id as string, r.segment as RfmSegmentLabel);
        }
        const healthMap = new Map<string, { score: number; risk: ChurnRisk }>();
        for (const h of health ?? []) {
            healthMap.set(h.customer_id as string, {
                score: (h.score as number) ?? 0,
                risk: h.churn_risk as ChurnRisk,
            });
        }

        let people: UnifiedPerson[] = (contacts ?? []).map((c) => {
            const cid = c.id as string;
            const hp = healthMap.get(cid);
            return {
                contactId: cid,
                name: (c.name as string | null) ?? null,
                phone: (c.phone as string | null) ?? null,
                email: (c.email as string | null) ?? null,
                createdAt: c.created_at as string,
                rfmSegment: rfmMap.get(cid) ?? null,
                healthScore: hp?.score ?? null,
                churnRisk: hp?.risk ?? null,
            };
        });

        // 3. Filter in-memory by segment + churn (works on the LMS-enriched rows).
        if (segment && segment !== "all") {
            people = people.filter((p) => p.rfmSegment === segment);
        }
        if (churnRisk && churnRisk !== "all") {
            people = people.filter((p) => p.churnRisk === churnRisk);
        }

        return NextResponse.json({
            count: people.length,
            total: count ?? people.length,
            people,
        });
    } catch (err) {
        console.error("[GET /api/lms/people]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
