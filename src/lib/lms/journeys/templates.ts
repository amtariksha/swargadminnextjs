/**
 * Pre-built Journey templates. Operators don't author DSL by hand — they
 * pick a template, enable it, and tweak parameters (e.g. reminder day for
 * Replenishment, days-out for Festival). The templates here ship ready to
 * activate on day 1.
 *
 * Spec reference: requirements §4.4 — Pre-built journey templates list:
 *   • Welcome Journey
 *   • Replenishment Journey (per consumable SKU)
 *   • Win-back Ladder
 *   • Cross-sell Bridges
 *   • Festival Pre-order
 *   • Referral Reminder
 *   • Inner Circle Quarterly Touch
 *   • Birthday Surprise
 *
 * Phase 1 ships Welcome + Replenishment-ghee. The rest extend the same
 * pattern — add more entries to TEMPLATES and run /api/lms/journeys/install
 * to materialise into lms_journeys.
 */

import type { JourneyDsl } from "@/lib/lms/journeys/dsl";

export interface JourneyTemplate {
    name: string;
    description: string;
    dsl: JourneyDsl;
}

// ─── Welcome Journey ─────────────────────────────────────────────────────

const WELCOME_JOURNEY: JourneyTemplate = {
    name: "welcome",
    description:
        "7-step onboarding over 14 days. Triggered by first delivery completed. " +
        "Sends thank-you, brand story, replenishment-readiness ping, and a Day-14 review request.",
    dsl: {
        trigger: "first_delivery_completed",
        steps: [
            // Day 0: thank-you, attached to first order — UTILITY, Number 1.
            {
                id: "thanks_d0",
                type: "send_template",
                templateName: "welcome_thanks_d0",
                purpose: "txn_welcome_d0",
                requiresConsent: "transactional_orders",
            },
            { id: "wait_d2", type: "wait", days: 2 },

            // Day 2: brand story — first marketing touch, gated on WhatsApp consent.
            {
                id: "story_d2",
                type: "send_template",
                templateName: "welcome_brand_story_d2",
                purpose: "mkt_welcome_d2",
                requiresConsent: "marketing_whatsapp",
            },
            { id: "wait_d5", type: "wait", days: 3 },

            // Day 5: feedback request — UTILITY, transactional.
            {
                id: "review_d5",
                type: "send_template",
                templateName: "welcome_first_review_d5",
                purpose: "txn_feedback_request",
                requiresConsent: "transactional_orders",
            },
            { id: "wait_d10", type: "wait", days: 5 },

            // Day 10: cross-sell bridge — only if they've consented to marketing.
            {
                id: "crosssell_d10",
                type: "send_template",
                templateName: "welcome_crosssell_d10",
                purpose: "mkt_crosssell_bridge",
                requiresConsent: "marketing_whatsapp",
            },
            { id: "wait_d14", type: "wait", days: 4 },

            // Day 14: hand off to Replenishment journey.
            {
                id: "tag_welcomed",
                type: "tag",
                action: "add",
                tagName: "welcomed",
                namespace: "context",
            },
            {
                id: "enroll_replenishment",
                type: "enroll_in",
                journeyName: "replenishment_ghee",
            },
        ],
    },
};

// ─── Replenishment Journey (Ghee) ────────────────────────────────────────

const REPLENISHMENT_GHEE_JOURNEY: JourneyTemplate = {
    name: "replenishment_ghee",
    description:
        "Per-SKU restock nudge for Ghee 500ml. Triggered by RFM job when a " +
        "ghee buyer's expected re-order date is 3 days away. Three-touch ladder: " +
        "soft reminder, offer, last-call.",
    dsl: {
        trigger: "sku_replenish_due",
        steps: [
            // Day −3: soft reminder.
            {
                id: "remind_d-3",
                type: "send_template",
                templateName: "repl_reminder_d-3",
                purpose: "mkt_replenishment",
                requiresConsent: "marketing_whatsapp",
            },
            { id: "wait_3d", type: "wait", days: 3 },

            // Day 0: offer.
            {
                id: "offer_d0",
                type: "send_template",
                templateName: "repl_offer_d0",
                purpose: "mkt_replenishment",
                requiresConsent: "marketing_whatsapp",
            },
            { id: "wait_7d", type: "wait", days: 7 },

            // Day +7: last call.
            {
                id: "lastcall_d+7",
                type: "send_template",
                templateName: "repl_lastcall_d+7",
                purpose: "mkt_replenishment",
                requiresConsent: "marketing_whatsapp",
            },
            {
                id: "tag_repl_attempted",
                type: "tag",
                action: "add",
                tagName: "replenishment_attempted_ghee",
                namespace: "behaviour",
                expiresInDays: 60,
            },
            {
                id: "done",
                type: "exit",
                reason: "completed",
            },
        ],
    },
};

export const JOURNEY_TEMPLATES: JourneyTemplate[] = [
    WELCOME_JOURNEY,
    REPLENISHMENT_GHEE_JOURNEY,
];

export function findTemplate(name: string): JourneyTemplate | null {
    return JOURNEY_TEMPLATES.find((t) => t.name === name) ?? null;
}
