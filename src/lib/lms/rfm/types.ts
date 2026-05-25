/**
 * RFM + Health score shared types.
 * Schema mirror: app_lms.lms_rfm_scores + lms_health_scores.
 */

export type RfmSegmentLabel =
    | "Champions"
    | "Loyal"
    | "Promising"
    | "At-Risk"
    | "Hibernating"
    | "Lost";

export type ChurnRisk = "low" | "medium" | "high";

/** Suggested next action — surfaced in the Today screen's flagged-actions feed. */
export type NextBestAction =
    | "replenishment_ghee"
    | "replenishment_paneer"
    | "replenishment_curd"
    | "replenishment_milk"
    | "winback_d30"
    | "winback_d60"
    | "winback_d90"
    | "inner_circle_invite"
    | "cross_sell_dairy"
    | "festival_preorder"
    | "first_order_followup"
    | "none";

export interface RfmScore {
    customerId: string;
    orgId: string;
    recencyDays: number;
    recencyScore: 1 | 2 | 3 | 4 | 5;
    frequencyCount: number;
    frequencyScore: 1 | 2 | 3 | 4 | 5;
    monetaryValue: number;
    monetaryScore: 1 | 2 | 3;
    segment: RfmSegmentLabel;
    computedAt: string;
}

export interface HealthScore {
    customerId: string;
    orgId: string;
    score: number;          // 0-100
    churnRisk: ChurnRisk;
    nextBestAction: NextBestAction;
    reasonBlob: Record<string, unknown>;
    computedAt: string;
}
