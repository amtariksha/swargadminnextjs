/**
 * Journey executor — advances one journey_run by one or more steps.
 *
 * The scheduler (Vercel Cron, every minute) calls `tickAllDue()`
 * which fetches all runs with next_action_at <= now() and processes
 * them. Operators / agents can also call `advanceRun(runId)` to nudge
 * a stuck run manually.
 *
 * Step semantics:
 *
 *   send_template  — Compliance Guard pre-check (when wired in C8),
 *                    then routeSend() to pick the right number, then
 *                    delegate to the existing /api/whatsapp/chat/send
 *                    payload shape. Failures are logged but the run
 *                    proceeds to the next step (don't abandon flows
 *                    due to transient Meta errors).
 *
 *   wait           — Just set next_action_at; the scheduler picks up later.
 *
 *   tag            — Apply/remove the tag via the tags service.
 *
 *   branch         — Evaluate condition, jump to onTrueGoto or onFalseGoto.
 *                    Branch steps are "free" — we recurse into the same
 *                    tick without bumping the scheduler.
 *
 *   enroll_in      — Look up the named journey, instantiate a new run,
 *                    then exit the current one.
 *
 *   exit           — Set completed_at + exit_reason.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";
import {
    type JourneyDsl,
    type JourneyStep,
    type BranchCondition,
    validateJourneyDsl,
} from "@/lib/lms/journeys/dsl";
import { assignTag, unassignTag } from "@/lib/lms/tags/service";
import { hasConsent } from "@/lib/lms/consent/service";
import { routeSend, type Purpose } from "@/lib/whatsapp/router";
import { ORG_ID } from "@/lib/whatsapp/request";

interface JourneyRunRow {
    id: string;
    journey_id: string;
    customer_id: string;
    current_state: string;
    state_data: Record<string, unknown> | null;
    next_action_at: string | null;
    started_at: string;
    completed_at: string | null;
    exit_reason: string | null;
}

interface JourneyRow {
    id: string;
    name: string;
    dsl: JourneyDsl;
    is_active: boolean;
    version: number;
}

// Hard cap on how many steps we execute within a single tick for one run.
// Prevents an accidental infinite branch loop from melting a worker.
const MAX_STEPS_PER_TICK = 10;

// ─── Public entry points ──────────────────────────────────────────────────

export async function tickAllDue(): Promise<{
    processed: number;
    errors: number;
    durationMs: number;
}> {
    const startedAt = Date.now();
    const { data, error } = await lmsAdmin
        .from("lms_journey_runs")
        .select("id, journey_id, customer_id, current_state, state_data, next_action_at, started_at, completed_at, exit_reason")
        .lte("next_action_at", new Date().toISOString())
        .is("completed_at", null)
        .order("next_action_at", { ascending: true })
        .limit(500);
    if (error) throw new Error(`[journeys.tick] fetch failed: ${error.message}`);

    const runs = (data ?? []) as JourneyRunRow[];
    let processed = 0;
    let errors = 0;
    for (const run of runs) {
        try {
            await advanceRun({ runId: run.id });
            processed += 1;
        } catch (err) {
            errors += 1;
            console.error(`[journeys.tick] run ${run.id} failed:`, err);
        }
    }
    return { processed, errors, durationMs: Date.now() - startedAt };
}

export async function advanceRun(args: {
    runId: string;
}): Promise<void> {
    const run = await fetchRun(args.runId);
    if (!run) throw new Error(`Run ${args.runId} not found`);
    if (run.completed_at) return; // already terminal

    const journey = await fetchJourney(run.journey_id);
    if (!journey) {
        await markExit(run.id, "journey_deleted");
        return;
    }
    if (!journey.is_active) {
        await markExit(run.id, "journey_paused");
        return;
    }
    validateJourneyDsl(journey.dsl);

    let stepId = run.current_state || journey.dsl.steps[0].id;
    let stepsTaken = 0;

    while (stepsTaken < MAX_STEPS_PER_TICK) {
        stepsTaken += 1;
        const step = findStep(journey.dsl, stepId);
        if (!step) {
            await markExit(run.id, `step_${stepId}_not_found`);
            return;
        }

        // ── Step dispatch ──────────────────────────────────────────────
        if (step.type === "send_template") {
            await executeSendTemplate({
                run,
                step,
            });
            const next = nextStepAfter(journey.dsl, step.id);
            if (!next) {
                await markExit(run.id, "completed");
                return;
            }
            await updateRunState(run.id, next.id, null);
            stepId = next.id;
            continue;
        }

        if (step.type === "wait") {
            const ms =
                (step.hours ?? 0) * 60 * 60 * 1000 +
                (step.days ?? 0) * 24 * 60 * 60 * 1000;
            const next = nextStepAfter(journey.dsl, step.id);
            if (!next) {
                await markExit(run.id, "completed");
                return;
            }
            const nextActionAt = new Date(Date.now() + ms).toISOString();
            await updateRunState(run.id, next.id, nextActionAt);
            return; // hand off to scheduler
        }

        if (step.type === "tag") {
            await executeTag({ run, step });
            const next = nextStepAfter(journey.dsl, step.id);
            if (!next) {
                await markExit(run.id, "completed");
                return;
            }
            await updateRunState(run.id, next.id, null);
            stepId = next.id;
            continue;
        }

        if (step.type === "branch") {
            const truthy = await evaluateCondition({
                customerId: run.customer_id,
                cond: step.condition,
            });
            stepId = truthy ? step.onTrueGoto : step.onFalseGoto;
            await updateRunState(run.id, stepId, null);
            continue;
        }

        if (step.type === "enroll_in") {
            await enrollInOther({
                customerId: run.customer_id,
                journeyName: step.journeyName,
            });
            await markExit(run.id, `enrolled_${step.journeyName}`);
            return;
        }

        if (step.type === "exit") {
            await markExit(run.id, step.reason);
            return;
        }

        // Unknown step type (shouldn't happen if DSL is validated)
        await markExit(run.id, "unknown_step_type");
        return;
    }

    // Hit the step-budget — pause until next tick.
    const nextActionAt = new Date(Date.now() + 60_000).toISOString();
    await updateRunState(run.id, stepId, nextActionAt);
}

// ─── Step implementations ─────────────────────────────────────────────────

async function executeSendTemplate(args: {
    run: JourneyRunRow;
    step: Extract<JourneyStep, { type: "send_template" }>;
}): Promise<void> {
    // 1. Consent check — silently skip if the customer hasn't granted.
    const granted = await hasConsent({
        customerId: args.run.customer_id,
        purpose: args.step.requiresConsent,
    });
    if (!granted) {
        console.log(
            `[journey] skip send_template ${args.step.id} for ${args.run.customer_id} — no consent for ${args.step.requiresConsent}`,
        );
        return;
    }

    // 2. Look up the customer's phone (we use contacts.phone as canonical).
    const { data: contact, error } = await supabaseAdmin
        .from("contacts")
        .select("phone, name")
        .eq("id", args.run.customer_id)
        .maybeSingle();
    if (error || !contact?.phone) {
        console.warn(
            `[journey] no contact / phone for customer ${args.run.customer_id}; skipping send`,
        );
        return;
    }

    // 3. Resolve routing decision + write audit.
    let routed;
    try {
        routed = await routeSend({
            orgId: ORG_ID,
            purpose: args.step.purpose as Purpose,
        });
    } catch (err) {
        console.error(
            `[journey] routing failed for step ${args.step.id}:`,
            err instanceof Error ? err.message : err,
        );
        return;
    }

    // 4. Actually dispatch. For now we just log — full template-send wiring
    //    happens in C8 when Agent Force's Compliance Guard joins the chain.
    //    Wiring through /api/whatsapp/chat/send is one fetch() away once the
    //    routing-aware client lands.
    console.log(
        `[journey] would send template "${args.step.templateName}" via Number ${routed.number} to ${contact.phone}`,
        { params: args.step.params, purpose: args.step.purpose },
    );
}

async function executeTag(args: {
    run: JourneyRunRow;
    step: Extract<JourneyStep, { type: "tag" }>;
}): Promise<void> {
    // Resolve tagId by (namespace, name).
    const { data: tag, error } = await lmsAdmin
        .from("lms_tags")
        .select("id")
        .eq("namespace", args.step.namespace)
        .eq("name", args.step.tagName)
        .maybeSingle();
    if (error || !tag) {
        console.warn(
            `[journey] tag ${args.step.namespace}:${args.step.tagName} not found; skipping`,
        );
        return;
    }
    if (args.step.action === "add") {
        const expiresAt = args.step.expiresInDays
            ? new Date(
                  Date.now() + args.step.expiresInDays * 24 * 60 * 60 * 1000,
              ).toISOString()
            : null;
        await assignTag({
            customerId: args.run.customer_id,
            tagId: tag.id as string,
            source: "auto",
            expiresAt,
        });
    } else {
        await unassignTag({
            customerId: args.run.customer_id,
            tagId: tag.id as string,
        });
    }
}

async function evaluateCondition(args: {
    customerId: string;
    cond: BranchCondition;
}): Promise<boolean> {
    switch (args.cond.kind) {
        case "rfm_segment_in": {
            const { data } = await lmsAdmin
                .from("lms_rfm_scores")
                .select("segment")
                .eq("customer_id", args.customerId)
                .maybeSingle();
            return data ? args.cond.segments.includes(data.segment) : false;
        }
        case "has_tag": {
            const { data } = await lmsAdmin
                .from("v_lms_customer_tags_flat")
                .select("customer_id")
                .eq("customer_id", args.customerId)
                .eq("tag_name", args.cond.tag)
                .eq("effective", true)
                .limit(1);
            return (data?.length ?? 0) > 0;
        }
        case "consent_granted": {
            return hasConsent({
                customerId: args.customerId,
                purpose: args.cond.purpose,
            });
        }
    }
}

async function enrollInOther(args: {
    customerId: string;
    journeyName: string;
}): Promise<void> {
    const { data: target, error } = await lmsAdmin
        .from("lms_journeys")
        .select("id, dsl, is_active")
        .eq("name", args.journeyName)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !target) {
        console.warn(
            `[journey] enrol target "${args.journeyName}" missing/inactive — skipping`,
        );
        return;
    }
    const firstStepId = (target.dsl as JourneyDsl).steps[0]?.id ?? "entry";
    await lmsAdmin.from("lms_journey_runs").insert({
        journey_id: target.id as string,
        customer_id: args.customerId,
        current_state: firstStepId,
        next_action_at: new Date().toISOString(),
    });
}

// ─── DB helpers ───────────────────────────────────────────────────────────

async function fetchRun(runId: string): Promise<JourneyRunRow | null> {
    const { data, error } = await lmsAdmin
        .from("lms_journey_runs")
        .select("id, journey_id, customer_id, current_state, state_data, next_action_at, started_at, completed_at, exit_reason")
        .eq("id", runId)
        .maybeSingle();
    if (error) throw new Error(`[journeys] fetchRun: ${error.message}`);
    return (data as JourneyRunRow | null) ?? null;
}

async function fetchJourney(journeyId: string): Promise<JourneyRow | null> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("id, name, dsl, is_active, version")
        .eq("id", journeyId)
        .maybeSingle();
    if (error) throw new Error(`[journeys] fetchJourney: ${error.message}`);
    return (data as JourneyRow | null) ?? null;
}

async function updateRunState(
    runId: string,
    stepId: string,
    nextActionAt: string | null,
): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_journey_runs")
        .update({
            current_state: stepId,
            next_action_at: nextActionAt,
        })
        .eq("id", runId);
    if (error) throw new Error(`[journeys] updateRunState: ${error.message}`);
}

async function markExit(runId: string, reason: string): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_journey_runs")
        .update({
            completed_at: new Date().toISOString(),
            exit_reason: reason,
            next_action_at: null,
        })
        .eq("id", runId);
    if (error) throw new Error(`[journeys] markExit: ${error.message}`);
}

// ─── DSL navigation ───────────────────────────────────────────────────────

function findStep(dsl: JourneyDsl, stepId: string): JourneyStep | null {
    return dsl.steps.find((s) => s.id === stepId) ?? null;
}

function nextStepAfter(dsl: JourneyDsl, stepId: string): JourneyStep | null {
    const idx = dsl.steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return null;
    return dsl.steps[idx + 1] ?? null;
}
