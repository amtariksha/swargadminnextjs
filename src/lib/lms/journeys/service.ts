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

export async function listJourneys(args: { orgId: string }): Promise<Journey[]> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("*")
        .eq("org_id", args.orgId)
        .order("name");
    if (error) throw new Error(`[journeys] list: ${error.message}`);
    return (data ?? []).map(mapJourneyRow);
}

export async function getJourneyByName(args: {
    orgId: string;
    name: string;
}): Promise<Journey | null> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .select("*")
        .eq("org_id", args.orgId)
        .eq("name", args.name)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`[journeys] getByName: ${error.message}`);
    return data ? mapJourneyRow(data) : null;
}

export async function upsertJourney(args: {
    orgId: string;
    name: string;
    triggerEvent: JourneyTrigger;
    dsl: JourneyDsl;
    /** When true, replaces the latest active row with the new DSL at the same version. */
    overwriteLatest?: boolean;
}): Promise<Journey> {
    validateJourneyDsl(args.dsl);
    const existing = await getJourneyByName({ orgId: args.orgId, name: args.name });

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
            org_id: args.orgId,
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
    orgId: string;
    journeyId: string;
    isActive: boolean;
}): Promise<Journey> {
    const { data, error } = await lmsAdmin
        .from("lms_journeys")
        .update({ is_active: args.isActive })
        .eq("org_id", args.orgId)
        .eq("id", args.journeyId)
        .select("*")
        .single();
    if (error) throw new Error(`[journeys] setActive: ${error.message}`);
    return mapJourneyRow(data);
}

// ─── Enrolment ────────────────────────────────────────────────────────────

export async function enrollCustomer(args: {
    orgId: string;
    journeyId: string;
    customerId: string;
}): Promise<JourneyRun> {
    // 1. Load journey to confirm active + grab first step.
    const { data: j, error: jErr } = await lmsAdmin
        .from("lms_journeys")
        .select("id, org_id, dsl, is_active")
        .eq("id", args.journeyId)
        .maybeSingle();
    if (jErr) throw new Error(`[journeys] enrol fetch: ${jErr.message}`);
    if (!j) throw new Error("Journey not found");
    if (j.org_id !== args.orgId) throw new Error("Journey/org mismatch");
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
