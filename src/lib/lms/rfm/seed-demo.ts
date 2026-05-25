/**
 * Demo seeder — populates lms_rfm_scores + lms_health_scores with
 * plausible random values so segments / journeys / dashboards can be
 * tested end-to-end without depending on the backend orders endpoint.
 *
 * NOT for production. Pradeep / engineering can invoke this from
 * /lms/system during initial setup to see "what would Champions look
 * like" before the real backend job is wired up.
 *
 * Strategy: bias the distribution so we get a realistic mix —
 *   ~15% Champions, ~25% Loyal, ~20% Promising,
 *   ~15% At-Risk, ~15% Hibernating, ~10% Lost.
 *
 * Uses the same compute pipeline as the real runner so the resulting
 * health scores + next-best-actions are consistent with how a real
 * customer with those numbers would score.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import { computeRfmBatch, type RfmInput } from "@/lib/lms/rfm/score";
import { computeHealth } from "@/lib/lms/rfm/health";

interface SeedDemoResult {
    contactCount: number;
    rowsWritten: number;
    computedAt: string;
}

export async function seedDemoRfm(args: { orgId: string }): Promise<SeedDemoResult> {
    const computedAt = new Date().toISOString();

    // 1. Pull contacts.
    const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("org_id", args.orgId);
    if (error) throw new Error(`[rfm-seed] fetch contacts failed: ${error.message}`);

    const contacts = (data ?? []).map((c) => c.id as string);
    if (contacts.length === 0) {
        return { contactCount: 0, rowsWritten: 0, computedAt };
    }

    // 2. Synthesise plausible inputs.
    const inputs: RfmInput[] = contacts.map((customerId) => {
        const bucket = pickBucket();
        return {
            customerId,
            ...synthForBucket(bucket),
        };
    });

    // 3. Run the real compute pipeline so the segments map cleanly.
    const rfmRows = computeRfmBatch(inputs);
    const healthRows = rfmRows.map((r) => ({
        customerId: r.customerId,
        ...computeHealth(r, {}),
    }));

    // 4. Upsert.
    const BATCH = 200;
    let written = 0;
    for (let i = 0; i < rfmRows.length; i += BATCH) {
        const slice = rfmRows.slice(i, i + BATCH).map((r) => ({
            customer_id: r.customerId,
            org_id: args.orgId,
            recency_days: r.recencyDays,
            recency_score: r.recencyScore,
            frequency_count: r.frequencyCount,
            frequency_score: r.frequencyScore,
            monetary_value: r.monetaryValue,
            monetary_score: r.monetaryScore,
            segment: r.segment,
            computed_at: computedAt,
        }));
        const { error: e } = await lmsAdmin
            .from("lms_rfm_scores")
            .upsert(slice, { onConflict: "customer_id" });
        if (e) throw new Error(`[rfm-seed] rfm upsert failed: ${e.message}`);
        written += slice.length;
    }
    for (let i = 0; i < healthRows.length; i += BATCH) {
        const slice = healthRows.slice(i, i + BATCH).map((h) => ({
            customer_id: h.customerId,
            org_id: args.orgId,
            score: h.score,
            churn_risk: h.churnRisk,
            next_best_action: h.nextBestAction,
            reason_blob: { ...h.reasonBlob, demo_seed: true },
            computed_at: computedAt,
        }));
        const { error: e } = await lmsAdmin
            .from("lms_health_scores")
            .upsert(slice, { onConflict: "customer_id" });
        if (e) throw new Error(`[rfm-seed] health upsert failed: ${e.message}`);
    }

    return {
        contactCount: contacts.length,
        rowsWritten: written,
        computedAt,
    };
}

// ─── Distribution helpers ────────────────────────────────────────────────

type Bucket = "champion" | "loyal" | "promising" | "atrisk" | "hibernating" | "lost";

function pickBucket(): Bucket {
    const r = Math.random();
    if (r < 0.15) return "champion";
    if (r < 0.40) return "loyal";
    if (r < 0.60) return "promising";
    if (r < 0.75) return "atrisk";
    if (r < 0.90) return "hibernating";
    return "lost";
}

function synthForBucket(b: Bucket): Omit<RfmInput, "customerId"> {
    // Ranges chosen so the quintile cutoffs in computeRfmBatch will tend to
    // place these customers in the intended segment most of the time.
    switch (b) {
        case "champion":
            return {
                recencyDays: randInt(0, 14),
                frequencyCount: randInt(20, 60),
                monetaryValue: randMoney(8000, 30000),
            };
        case "loyal":
            return {
                recencyDays: randInt(0, 30),
                frequencyCount: randInt(10, 25),
                monetaryValue: randMoney(4000, 12000),
            };
        case "promising":
            return {
                recencyDays: randInt(0, 21),
                frequencyCount: randInt(1, 5),
                monetaryValue: randMoney(500, 3000),
            };
        case "atrisk":
            return {
                recencyDays: randInt(30, 60),
                frequencyCount: randInt(10, 30),
                monetaryValue: randMoney(3000, 9000),
            };
        case "hibernating":
            return {
                recencyDays: randInt(60, 120),
                frequencyCount: randInt(1, 5),
                monetaryValue: randMoney(200, 2000),
            };
        case "lost":
            return {
                recencyDays: randInt(150, 365),
                frequencyCount: randInt(0, 2),
                monetaryValue: randMoney(0, 1000),
            };
    }
}

function randInt(lo: number, hi: number): number {
    return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function randMoney(lo: number, hi: number): number {
    // Round to nearest 50 rupees for a more realistic feel.
    const raw = lo + Math.random() * (hi - lo);
    return Math.round(raw / 50) * 50;
}
