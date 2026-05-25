/**
 * RFM scoring — pure compute, no I/O.
 *
 * Spec reference: requirements §2.3.
 *
 * Method:
 *   • Recency (days since last order) — quintile-scored 1..5 (5=most recent).
 *   • Frequency (order count in last 90 days) — quintile-scored 1..5.
 *   • Monetary (total spend in last 90 days, INR) — tertile-scored 1..3.
 *
 * Quintile cutoffs are computed from the actual population each run, NOT
 * hard-coded — so the same R5 means "top 20% recency among customers this
 * month" even as the customer base evolves.
 *
 * Segment label is then derived from (R, F, M):
 *
 *   Champions     R5 F5     — most recent, most frequent
 *   Loyal         R4-5 F4-5
 *   Promising     R4-5 F1-3 — new but engaged
 *   At-Risk       R2-3 F4-5 — used to be loyal, slipping
 *   Hibernating   R1-2 F1-3
 *   Lost          R1
 *
 * The matrix is configurable per-tenant in a future iteration; for v1 we
 * ship the standard Wal-Mart Stores / Hughes-Wang labels.
 */

import type { RfmSegmentLabel } from "@/lib/lms/rfm/types";

export interface RfmInput {
    customerId: string;
    recencyDays: number;        // 9999 if never ordered
    frequencyCount: number;     // last-90-days order count
    monetaryValue: number;      // last-90-days spend in INR
}

export interface RfmOutput {
    customerId: string;
    recencyDays: number;
    recencyScore: 1 | 2 | 3 | 4 | 5;
    frequencyCount: number;
    frequencyScore: 1 | 2 | 3 | 4 | 5;
    monetaryValue: number;
    monetaryScore: 1 | 2 | 3;
    segment: RfmSegmentLabel;
}

/** Compute the full RFM table for a customer cohort in one pass. */
export function computeRfmBatch(inputs: RfmInput[]): RfmOutput[] {
    if (inputs.length === 0) return [];

    // Quintile-style cutoffs from the actual distribution.
    const recencyCutoffs = computeQuintileCutoffs(
        inputs.map((i) => i.recencyDays),
        { ascending: true }, // lower recency = better → flip below
    );
    const frequencyCutoffs = computeQuintileCutoffs(
        inputs.map((i) => i.frequencyCount),
        { ascending: false }, // higher = better
    );
    const monetaryCutoffs = computeTertileCutoffs(
        inputs.map((i) => i.monetaryValue),
    );

    return inputs.map((input) => {
        // Recency: invert so most-recent (smallest days) → score 5.
        const recencyScore = invertScore(
            scoreFromCutoffs(input.recencyDays, recencyCutoffs),
        );
        const frequencyScore = scoreFromCutoffs(input.frequencyCount, frequencyCutoffs);
        const monetaryScore = scoreFromTertiles(input.monetaryValue, monetaryCutoffs);
        return {
            customerId: input.customerId,
            recencyDays: input.recencyDays,
            recencyScore,
            frequencyCount: input.frequencyCount,
            frequencyScore,
            monetaryValue: input.monetaryValue,
            monetaryScore,
            segment: assignSegment(recencyScore, frequencyScore),
        };
    });
}

// ─── Segment assignment ──────────────────────────────────────────────────

export function assignSegment(
    r: 1 | 2 | 3 | 4 | 5,
    f: 1 | 2 | 3 | 4 | 5,
): RfmSegmentLabel {
    if (r === 1) return "Lost";
    if (r === 5 && f === 5) return "Champions";
    if (r >= 4 && f >= 4) return "Loyal";
    if (r >= 4 && f <= 3) return "Promising";
    if (r >= 2 && r <= 3 && f >= 4) return "At-Risk";
    return "Hibernating";
}

// ─── Quintile / tertile helpers ──────────────────────────────────────────

interface CutoffOptions {
    ascending: boolean;
}

/**
 * Returns 4 cutoff values [c1,c2,c3,c4] such that values fall into 5 buckets:
 *   bucket 1: v <= c1
 *   bucket 2: c1 < v <= c2
 *   bucket 3: c2 < v <= c3
 *   bucket 4: c3 < v <= c4
 *   bucket 5: v > c4
 *
 * `ascending=true` means lower input ↔ lower bucket number (recency is inverted
 * by the caller). `ascending=false` means higher input ↔ higher bucket number
 * (frequency, monetary).
 *
 * Ties handled by including them in the lower bucket.
 */
function computeQuintileCutoffs(values: number[], _opts: CutoffOptions): number[] {
    if (values.length === 0) return [0, 0, 0, 0];
    const sorted = [...values].sort((a, b) => a - b);
    return [0.2, 0.4, 0.6, 0.8].map((p) => percentile(sorted, p));
}

function computeTertileCutoffs(values: number[]): number[] {
    if (values.length === 0) return [0, 0];
    const sorted = [...values].sort((a, b) => a - b);
    return [0.33, 0.67].map((p) => percentile(sorted, p));
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(
        Math.floor(p * sorted.length),
        sorted.length - 1,
    );
    return sorted[idx];
}

function scoreFromCutoffs(value: number, cutoffs: number[]): 1 | 2 | 3 | 4 | 5 {
    if (value <= cutoffs[0]) return 1;
    if (value <= cutoffs[1]) return 2;
    if (value <= cutoffs[2]) return 3;
    if (value <= cutoffs[3]) return 4;
    return 5;
}

function scoreFromTertiles(value: number, cutoffs: number[]): 1 | 2 | 3 {
    if (value <= cutoffs[0]) return 1;
    if (value <= cutoffs[1]) return 2;
    return 3;
}

/** Recency input: lower = better, so invert the cutoff-derived score. */
function invertScore(s: 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
    return (6 - s) as 1 | 2 | 3 | 4 | 5;
}
