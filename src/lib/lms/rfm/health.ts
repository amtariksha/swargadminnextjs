/**
 * Health score — pure compute.
 *
 * Combines RFM (the loaded signal we have today) with optional engagement
 * + opt-out hints into a 0-100 score. Heuristic; tunable later.
 *
 * Formula (v1):
 *   base = R*15 + F*10 + M*5            // max 5*15 + 5*10 + 3*5 = 140
 *   normalised = clamp(round(base * 100 / 140), 0..100)
 *   penalty_optout      = -20 if any marketing consent withdrawn
 *   bonus_recent_engage = +5 if read a message in last 7 days
 *   score = clamp(normalised + bonus_recent_engage + penalty_optout, 0..100)
 *
 * Churn risk thresholds:
 *   >= 70  → low
 *   40-69  → medium
 *   < 40   → high
 *
 * Next-best-action priority (first match wins):
 *   1. First-order followup     — only 1 order, less than 14 days ago
 *   2. Replenishment-<sku>      — based on dominant product tag + recency
 *   3. Winback-d30/d60/d90      — based on recency, only if used to be active
 *   4. Inner-circle invite      — Champions, not already invited
 *   5. Cross-sell-dairy         — Loyal but only one product
 *   6. Festival-preorder        — within 14 days of a festival_T-14 trigger
 *   7. None
 */

import { type RfmOutput } from "@/lib/lms/rfm/score";
import {
    type ChurnRisk,
    type NextBestAction,
    type RfmSegmentLabel,
} from "@/lib/lms/rfm/types";

export interface HealthSignals {
    optedOutOfMarketing?: boolean;
    readMessageWithinDays?: number | null;   // null = no recent read
    firstOrderAgeDays?: number | null;
    primaryProductTag?: string | null;       // 'ghee' | 'paneer' | 'curd' | 'milk' | ...
    productTagCount?: number;                // how many product tags they carry
    daysToNextFestival?: number | null;      // null = no festival within window
    alreadyInInnerCircle?: boolean;
}

export interface HealthOutput {
    score: number;
    churnRisk: ChurnRisk;
    nextBestAction: NextBestAction;
    reasonBlob: Record<string, unknown>;
}

export function computeHealth(rfm: RfmOutput, signals: HealthSignals = {}): HealthOutput {
    const base =
        rfm.recencyScore * 15 +
        rfm.frequencyScore * 10 +
        rfm.monetaryScore * 5;
    const normalised = clamp(Math.round((base * 100) / 140), 0, 100);

    const engagementBonus =
        signals.readMessageWithinDays !== null &&
        signals.readMessageWithinDays !== undefined &&
        signals.readMessageWithinDays <= 7
            ? 5
            : 0;
    const optoutPenalty = signals.optedOutOfMarketing ? -20 : 0;

    const score = clamp(normalised + engagementBonus + optoutPenalty, 0, 100);

    return {
        score,
        churnRisk: scoreToChurnRisk(score),
        nextBestAction: pickNextBestAction(rfm, signals),
        reasonBlob: {
            rfm: {
                segment: rfm.segment,
                R: rfm.recencyScore,
                F: rfm.frequencyScore,
                M: rfm.monetaryScore,
            },
            base,
            normalised,
            engagementBonus,
            optoutPenalty,
            signals,
        },
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function scoreToChurnRisk(score: number): ChurnRisk {
    if (score >= 70) return "low";
    if (score >= 40) return "medium";
    return "high";
}

function pickNextBestAction(
    rfm: RfmOutput,
    signals: HealthSignals,
): NextBestAction {
    // 1. First-order followup — single order, very recent
    if (
        signals.firstOrderAgeDays !== null &&
        signals.firstOrderAgeDays !== undefined &&
        signals.firstOrderAgeDays <= 14 &&
        rfm.frequencyCount === 1
    ) {
        return "first_order_followup";
    }

    // 2. Replenishment — primary SKU customer, recency 21-60 days
    if (
        rfm.recencyDays >= 21 &&
        rfm.recencyDays <= 60 &&
        signals.primaryProductTag
    ) {
        const action = replenishmentAction(signals.primaryProductTag);
        if (action) return action;
    }

    // 3. Winback — based on recency buckets
    if (rfm.recencyDays >= 30 && rfm.recencyDays < 60) return "winback_d30";
    if (rfm.recencyDays >= 60 && rfm.recencyDays < 90) return "winback_d60";
    if (rfm.recencyDays >= 90) return "winback_d90";

    // 4. Inner-circle invite — Champions not yet inside
    if (rfm.segment === "Champions" && !signals.alreadyInInnerCircle) {
        return "inner_circle_invite";
    }

    // 5. Cross-sell — Loyal with only one product tag
    if (rfm.segment === "Loyal" && (signals.productTagCount ?? 0) <= 1) {
        return "cross_sell_dairy";
    }

    // 6. Festival pre-order — within 14 days of a known festival
    if (
        signals.daysToNextFestival !== null &&
        signals.daysToNextFestival !== undefined &&
        signals.daysToNextFestival <= 14
    ) {
        return "festival_preorder";
    }

    return "none";
}

function replenishmentAction(productTag: string): NextBestAction | null {
    const t = productTag.toLowerCase();
    if (t.includes("ghee")) return "replenishment_ghee";
    if (t.includes("paneer")) return "replenishment_paneer";
    if (t.includes("curd")) return "replenishment_curd";
    if (t.includes("milk")) return "replenishment_milk";
    return null;
}

// Re-export so callers don't need to import RfmSegmentLabel separately.
export type { RfmSegmentLabel };
