/**
 * Rule-based lead scoring (0–100) — deterministic, no LLM.
 *
 * For a one-salesperson office, "who do I call first" needs a stable ranking,
 * not a probability model. This weights the cheap signals already on the lead
 * row: source quality, recency, and engagement. Computed nightly by
 * scoreOpenLeads (service.ts) and shown/sorted in the leads list.
 *
 * Kept pure (no DB) so the curve is obvious and unit-testable.
 */

import type { LeadSource, LeadStatus } from "./types";

/** Source quality weight — warmer intent = higher base. */
const SOURCE_WEIGHT: Record<string, number> = {
    referral: 35,
    stall: 30,
    website_form: 25,
    app_install: 25,
    whatsapp: 25,
    phone: 20,
    manual: 20,
    social: 15,
    organic_search: 15,
    geo_ai: 15,
    csv_import: 10,
    other: 10,
};

export interface ScoreInput {
    source?: LeadSource | string | null;
    first_touch_at?: string | null;
    last_activity_at?: string | null;
    contact_id?: string | null;   // has a WhatsApp conversation
    email?: string | null;
    name?: string | null;
    tags?: string[] | null;
    status?: LeadStatus | string | null;
}

/**
 * @param lead cheap signal fields from the lms_leads row
 * @param now  epoch ms (injectable for tests)
 * @returns integer 0–100
 */
export function computeLeadScore(lead: ScoreInput, now: number = Date.now()): number {
    let score = SOURCE_WEIGHT[lead.source ?? ""] ?? 10;

    // Recency of the last touch — a fresh lead is hotter.
    const anchor = lead.last_activity_at ?? lead.first_touch_at;
    if (anchor) {
        const ts = new Date(anchor).getTime();
        if (!Number.isNaN(ts)) {
            const days = (now - ts) / 86_400_000;
            if (days <= 2) score += 30;
            else if (days <= 7) score += 20;
            else if (days <= 14) score += 10;
            else if (days <= 30) score += 5;
        }
    }

    // Engagement / completeness signals.
    if (lead.contact_id) score += 15; // reachable on WhatsApp already
    if (lead.email) score += 5;
    if (lead.tags && lead.tags.length > 0) score += 5;
    if (lead.name) score += 5;

    // Progress through the funnel.
    if (lead.status === "qualified") score += 10;
    else if (lead.status === "contacted") score += 5;

    return Math.max(0, Math.min(100, Math.round(score)));
}
