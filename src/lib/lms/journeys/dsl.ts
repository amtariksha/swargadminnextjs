/**
 * Journey DSL — declarative state machine for multi-step customer flows.
 *
 * Spec reference: requirements §2.6.
 *
 * A Journey is { trigger, steps[] }. Each step has an id, a type, and
 * type-specific params. The executor walks steps in order, branching where
 * the step type says so. Operators pause / resume / version journeys via
 * the lms_journeys table; per-customer execution state lives in
 * lms_journey_runs.
 *
 * Step types:
 *
 *   send_template   — Send a templated WhatsApp message via the routing
 *                     layer. Compliance Guard runs first; consent missing →
 *                     skip & advance. Failures are logged but non-fatal to
 *                     the journey run.
 *
 *   wait            — Sleep N hours / days before the next step. The
 *                     scheduler picks up the run when next_action_at <= now().
 *
 *   tag             — Apply or remove a tag on the customer. Useful for
 *                     marking journey-stage progress (e.g. "welcomed").
 *
 *   branch          — Conditional fork. The condition is a tiny boolean
 *                     expression evaluated server-side against the
 *                     customer's state (RFM segment, tags, consent).
 *
 *   enroll_in       — Cross-enroll the customer into another journey.
 *                     Used for "after Welcome, start Replenishment".
 *
 *   exit            — Terminal state. Sets completed_at + exit_reason.
 *
 * Triggers (events that start a journey):
 *
 *   first_delivery_completed   — fired by backend delivery webhook
 *   sku_replenish_due          — fired by RFM job when a customer's
 *                                expected re-order date is within N days
 *   churn_risk_high            — fired by Insights agent
 *   manual                     — operator-initiated enrolment
 *   referral_redeemed          — fired by /api/lms/referrals/redeem
 */

import type { ConsentPurpose } from "@/lib/lms/types";
import type { Purpose } from "@/lib/whatsapp/router";
import type { RfmSegmentLabel } from "@/lib/lms/rfm/types";

// ─── Trigger types ────────────────────────────────────────────────────────

export type JourneyTrigger =
    | "first_delivery_completed"
    | "sku_replenish_due"
    | "churn_risk_high"
    | "manual"
    | "referral_redeemed"
    | "inner_circle_quarterly_tick";

// ─── Step types ───────────────────────────────────────────────────────────

export type JourneyStep =
    | SendTemplateStep
    | WaitStep
    | TagStep
    | BranchStep
    | EnrollInStep
    | ExitStep;

export interface BaseStep {
    id: string;
    description?: string;
}

export interface SendTemplateStep extends BaseStep {
    type: "send_template";
    templateName: string;
    templateLanguage?: string;
    purpose: Purpose;
    /** Params filled at send time. Use `{customer.name}` style placeholders. */
    params?: Record<string, string>;
    /** Hard-required consent purpose; skipped if customer hasn't granted. */
    requiresConsent: ConsentPurpose;
}

export interface WaitStep extends BaseStep {
    type: "wait";
    hours?: number;
    days?: number;
}

export interface TagStep extends BaseStep {
    type: "tag";
    action: "add" | "remove";
    tagName: string;
    namespace: "channel" | "product" | "festival" | "context" | "behaviour" | "custom";
    expiresInDays?: number;
}

export interface BranchStep extends BaseStep {
    type: "branch";
    condition: BranchCondition;
    /** Step ID to jump to if condition is TRUE. */
    onTrueGoto: string;
    /** Step ID to jump to if condition is FALSE. */
    onFalseGoto: string;
}

export type BranchCondition =
    | { kind: "rfm_segment_in"; segments: RfmSegmentLabel[] }
    | { kind: "has_tag"; tag: string }
    | { kind: "consent_granted"; purpose: ConsentPurpose };

export interface EnrollInStep extends BaseStep {
    type: "enroll_in";
    journeyName: string;
}

export interface ExitStep extends BaseStep {
    type: "exit";
    reason: string;
}

// ─── Whole-journey DSL ────────────────────────────────────────────────────

export interface JourneyDsl {
    trigger: JourneyTrigger;
    /** Steps are executed in order; branch jumps override. First step is entry point. */
    steps: JourneyStep[];
    /** Tags / segments that disqualify a customer from being enrolled. */
    exclude?: BranchCondition[];
}

// ─── Validation ───────────────────────────────────────────────────────────

export function validateJourneyDsl(d: unknown): asserts d is JourneyDsl {
    if (typeof d !== "object" || d === null) {
        throw new Error("Journey DSL must be an object");
    }
    const dsl = d as JourneyDsl;
    if (!dsl.trigger || typeof dsl.trigger !== "string") {
        throw new Error("Journey DSL needs a string `trigger`");
    }
    if (!Array.isArray(dsl.steps) || dsl.steps.length === 0) {
        throw new Error("Journey DSL needs at least one step");
    }
    const stepIds = new Set<string>();
    for (const step of dsl.steps) {
        if (!step.id || typeof step.id !== "string") {
            throw new Error(`Step missing string id: ${JSON.stringify(step)}`);
        }
        if (stepIds.has(step.id)) {
            throw new Error(`Duplicate step id: ${step.id}`);
        }
        stepIds.add(step.id);
    }
    // Resolve branch targets.
    for (const step of dsl.steps) {
        if (step.type === "branch") {
            if (!stepIds.has(step.onTrueGoto)) {
                throw new Error(`Branch ${step.id} → unknown onTrueGoto=${step.onTrueGoto}`);
            }
            if (!stepIds.has(step.onFalseGoto)) {
                throw new Error(`Branch ${step.id} → unknown onFalseGoto=${step.onFalseGoto}`);
            }
        }
    }
}
