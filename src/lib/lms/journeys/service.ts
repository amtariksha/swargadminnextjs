/**
 * Journey service — CRUD + enrolment + listing runs.
 *
 * Journeys are stored in lms_journeys (template definitions, immutable per
 * version) and lms_journey_runs (per-customer state). Operators don't
 * usually author DSL by hand; they enable pre-built templates (see
 * ./templates.ts) and tweak parameters via the admin UI.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { type JourneyDsl, type JourneyTrigger, validateJourneyDsl } from "@/lib/lms/journeys/dsl";

export interface Journey {
    id: string;
    orgId: string;
    name: string;
    triggerEvent: JourneyTrigger;
    dsl: JourneyDsl;
    isActive: boolean;
    version: number;
    createdAt: string;
}

export interface JourneyRun {
    id: string;
    journeyId: string;
    customerId: string;
    currentState: string;
    nextActionAt: string | null;
    startedAt: string;
    completedAt: string | null;
    exitReason: string | null;
}

// ─── Journeys ─────────────────────────────────────────────────────────────

export async function listJourneys(): Promise<Journey[]> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("*")
        .order("name");
    if (error) throw new Error(`[journeys] list: ${error.message}`);
    return (data ?? []).map(mapJourneyRow);
}

export async function getJourneyByName(args: {
    name: string;
}): Promise<Journey | null> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("*")
        .eq("name", args.name)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`[journeys] getByName: ${error.message}`);
    return data ? mapJourneyRow(data) : null;
}

export async function upsertJourney(args: {
    name: string;
    triggerEvent: JourneyTrigger;
    dsl: JourneyDsl;
    /** When true, replaces the latest active row with the new DSL at the same version. */
    overwriteLatest?: boolean;
}): Promise<Journey> {
    validateJourneyDsl(args.dsl);
    const existing = await getJourneyByName({ name: args.name });

    if (existing && args.overwriteLatest) {
        const { data, error } = await lmsAdmin
            .from("lms_journeys")
            .update({ dsl: args.dsl, trigger_event: args.triggerEvent })
            .eq("id", existing.id)
            .select("*")
            .single();
        if (error) throw new Error(`[journeys] update: ${error.message}`);
        return mapJourneyRow(data);
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .insert({
            name: args.name,
            trigger_event: args.triggerEvent,
            dsl: args.dsl,
            is_active: false, // operators must explicitly enable
            version: nextVersion,
        })
        .select("*")
        .single();
    if (error) throw new Error(`[journeys] insert: ${error.message}`);
    return mapJourneyRow(data);
}

export async function setJourneyActive(args: {
    journeyId: string;
    isActive: boolean;
}): Promise<Journey> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .update({ is_active: args.isActive })
        .eq("id", args.journeyId)
        .select("*")
        .single();
    if (error) throw new Error(`[journeys] setActive: ${error.message}`);
    return mapJourneyRow(data);
}

// ─── Enrolment ────────────────────────────────────────────────────────────

export async function enrollCustomer(args: {
    journeyId: string;
    customerId: string;
}): Promise<JourneyRun> {
    // 1. Load journey to confirm active + grab first step.
    const { data: j, error: jErr } = await lmsAdmin
        .from("lms_journeys")
        .select("id, dsl, is_active")
        .eq("id", args.journeyId)
        .maybeSingle();
    if (jErr) throw new Error(`[journeys] enrol fetch: ${jErr.message}`);
    if (!j) throw new Error("Journey not found");
    if (!j.is_active) throw new Error("Journey is paused");

    const dsl = j.dsl as JourneyDsl;
    validateJourneyDsl(dsl);
    const firstStepId = dsl.steps[0].id;

    // 2. Avoid duplicate active runs for the same (journey, customer).
    const { data: existing } = await lmsAdmin
        .from("lms_journey_runs")
        .select("id")
        .eq("journey_id", args.journeyId)
        .eq("customer_id", args.customerId)
        .is("completed_at", null)
        .limit(1);
    if (existing && existing.length > 0) {
        const found = await getRun(existing[0].id as string);
        if (found) return found;
    }

    // 3. Insert new run, scheduled immediately.
    const { data, error } = await lmsAdmin
        .from("lms_journey_runs")
        .insert({
            journey_id: args.journeyId,
            customer_id: args.customerId,
            current_state: firstStepId,
            next_action_at: new Date().toISOString(),
        })
        .select("*")
        .single();
    if (error) throw new Error(`[journeys] enrol insert: ${error.message}`);
    return mapRunRow(data);
}

/**
 * Enrol a customer into every ACTIVE journey wired to a given trigger.
 * Event sources (e.g. the backend delivery-completion webhook firing
 * `first_delivery_completed`) call this so they never hardcode journey UUIDs.
 * Idempotent via enrollCustomer's per-(journey, customer) dedupe.
 */
export async function enrollByTrigger(args: {
    customerId: string;
    trigger: JourneyTrigger;
}): Promise<JourneyRun[]> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("id")
        .eq("trigger_event", args.trigger)
        .eq("is_active", true);
    if (error) throw new Error(`[journeys] enrollByTrigger fetch: ${error.message}`);

    const runs: JourneyRun[] = [];
    for (const row of data ?? []) {
        try {
            runs.push(
                await enrollCustomer({
                    journeyId: row.id as string,
                    customerId: args.customerId,
                }),
            );
        } catch (err) {
            console.warn(
                `[journeys] enrollByTrigger: journey ${row.id as string} skipped:`,
                err instanceof Error ? err.message : err,
            );
        }
    }
    return runs;
}

export async function getJourneyById(journeyId: string): Promise<Journey | null> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("*")
        .eq("id", journeyId)
        .maybeSingle();
    if (error) throw new Error(`[journeys] getById: ${error.message}`);
    return data ? mapJourneyRow(data) : null;
}

/**
 * Edit an existing journey in place (operator-authored journeys). DSL is
 * re-validated. This overwrites the current row rather than versioning —
 * simplest semantics for the builder; the executor re-reads the DSL each tick.
 */
export async function updateJourney(args: {
    journeyId: string;
    name?: string;
    triggerEvent?: JourneyTrigger;
    dsl?: JourneyDsl;
}): Promise<Journey> {
    const update: Record<string, unknown> = {};
    if (args.name !== undefined) update.name = args.name;
    if (args.triggerEvent !== undefined) update.trigger_event = args.triggerEvent;
    if (args.dsl !== undefined) {
        validateJourneyDsl(args.dsl);
        update.dsl = args.dsl;
    }
    if (Object.keys(update).length === 0) {
        const cur = await getJourneyById(args.journeyId);
        if (!cur) throw new Error("Journey not found");
        return cur;
    }
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .update(update)
        .eq("id", args.journeyId)
        .select("*")
        .single();
    if (error) throw new Error(`[journeys] update: ${error.message}`);
    return mapJourneyRow(data);
}

export async function deleteJourney(journeyId: string): Promise<void> {
    // lms_journey_runs reference the journey; the executor exits cleanly on a
    // missing journey, so deleting strands any in-flight runs harmlessly.
    const { error } = await lmsAdmin
        .from("lms_journeys")
        .delete()
        .eq("id", journeyId);
    if (error) throw new Error(`[journeys] delete: ${error.message}`);
}

export async function getRun(runId: string): Promise<JourneyRun | null> {
    const { data, error } = await lmsAdmin
        .from("lms_journey_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();
    if (error) throw new Error(`[journeys] getRun: ${error.message}`);
    return data ? mapRunRow(data) : null;
}

export async function listRuns(args: {
    journeyId: string;
    completed?: boolean;
    limit?: number;
}): Promise<JourneyRun[]> {
    let q = lmsAdmin
        .from("lms_journey_runs")
        .select("*")
        .eq("journey_id", args.journeyId)
        .order("started_at", { ascending: false })
        .limit(args.limit ?? 50);
    if (args.completed === false) q = q.is("completed_at", null);
    if (args.completed === true) q = q.not("completed_at", "is", null);
    const { data, error } = await q;
    if (error) throw new Error(`[journeys] listRuns: ${error.message}`);
    return (data ?? []).map(mapRunRow);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mapJourneyRow(row: Record<string, unknown>): Journey {
    return {
        id: row.id as string,
        orgId: row.org_id as string,
        name: row.name as string,
        triggerEvent: row.trigger_event as JourneyTrigger,
        dsl: row.dsl as JourneyDsl,
        isActive: row.is_active as boolean,
        version: row.version as number,
        createdAt: row.created_at as string,
    };
}

function mapRunRow(row: Record<string, unknown>): JourneyRun {
    return {
        id: row.id as string,
        journeyId: row.journey_id as string,
        customerId: row.customer_id as string,
        currentState: row.current_state as string,
        nextActionAt: (row.next_action_at as string | null) ?? null,
        startedAt: row.started_at as string,
        completedAt: (row.completed_at as string | null) ?? null,
        exitReason: (row.exit_reason as string | null) ?? null,
    };
}
