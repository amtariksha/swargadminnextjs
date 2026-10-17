// The Desk tick: heartbeat and flags (1), message sweep (2), derive (3), then the steps in
// lifecycle.ts (4 mirror, 5 missing message, 6 lifecycle), then health numbers (7). Each step runs
// in its own try/catch and time box; a step that throws keeps the counts it had and the later steps
// still run. Counts only are returned: no message text, name or phone number leaves this module.

import {
    attachInbound, deriveAndWrite, loadCategories,
    type AttachResult, type ConversationContext, type EngineContext,
} from './engine';
import { chunk, runLifecycleStep, runMirrorStep, runMissingStep } from './lifecycle';
import { markTimedOut, newStepBase, trackOutcome, type DeskRepo, type EngineCategory, type MessageRow } from './repo';
import { phoneVariants } from './phone';
import { readDeskSettings } from './settings';
import type { DeskSettings, DeskTickResult, DeskTickSkip, DeskTickStats, DeskTickStepBase } from './types';

export const DESK_TICK_BOXES_MS = {
    heartbeat: 1500, sweep: 9000, derive: 5000, mirror: 3000, missing: 2000, lifecycle: 3000, health: 1500,
} as const;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const SWEEP_LIMIT = 100;
const SWEEP_MIN_AGE_MS = 90_000;
const ORPHAN_MIN_AGE_MS = 180_000;
const DERIVE_RECENT_LIMIT = 500;
const DERIVE_FAILED_LIMIT = 200;
const DERIVE_MAX_CONVERSATIONS = 200;
const HEALTH_CAP = 100;

type Steps = DeskTickResult['steps'];
type SweepCounters = NonNullable<Steps['sweep']>;
type DeriveCounters = NonNullable<Steps['derive']>;
type HealthCounters = NonNullable<Steps['health']>;

/** After an outage the window reaches back to the last tick (at most 24 h); otherwise the last 15 minutes. */
export function computeWindowStart(now: Date, previousTickAt: string | null): Date {
    const fifteenMinAgo = now.getTime() - 15 * MS_PER_MINUTE;
    const previousMs = previousTickAt === null ? Number.NaN : Date.parse(previousTickAt);
    if (!Number.isFinite(previousMs)) return new Date(fifteenMinAgo);
    const dayAgo = now.getTime() - 24 * MS_PER_HOUR;
    return new Date(Math.max(dayAgo, Math.min(fifteenMinAgo, previousMs - 5 * MS_PER_MINUTE)));
}

// ── Step 1 ─────────────────────────────────────────────────────────────────

interface StepOne { settings: DeskSettings; heartbeatWritten: boolean; skipped: DeskTickSkip | null }

/** Skip order: not_installed (a probe failed) -> settings_error -> engine_off -> no_go_live. */
async function heartbeatAndFlags(repo: DeskRepo, now: Date): Promise<StepOne> {
    const { settings } = await readDeskSettings(repo);
    const [heartbeat, ticketsProbe, columnProbe] = await Promise.all([
        repo.writeTickSetting('desk_last_tick_at', now.toISOString()),
        repo.probe('desk_tickets'),
        repo.probe('messages.ticket_id'),
    ]);
    const heartbeatWritten = heartbeat.outcome === 'ok' && heartbeat.data === 1;
    let skipped: DeskTickSkip | null = null;
    if (ticketsProbe.outcome !== 'ok' || columnProbe.outcome !== 'ok') skipped = 'not_installed';
    else if (!settings.readable) skipped = 'settings_error';
    else if (!settings.engine_enabled) skipped = 'engine_off';
    else if (settings.go_live_at === null) skipped = 'no_go_live';
    return { settings, heartbeatWritten, skipped };
}

function statsOf(tickAt: string, durationMs: number, steps: Steps, health?: HealthCounters): DeskTickStats {
    return {
        at: tickAt,
        duration_ms: durationMs,
        orphans: health?.orphans ?? 0,
        orphans_capped: health?.orphans_capped ?? false,
        oldest_orphan_age_s: health?.oldest_orphan_age_s ?? null,
        failed_replies_24h: health?.failed_replies_24h ?? 0,
        steps,
    };
}

// ── Step 2 — message sweep ─────────────────────────────────────────────────

function groupByConversation(rows: readonly MessageRow[]): Array<{ id: string; messages: MessageRow[] }> {
    const groups = new Map<string, MessageRow[]>();
    for (const row of rows) {
        if (row.conversation_id) groups.set(row.conversation_id, [...(groups.get(row.conversation_id) ?? []), row]);
    }
    return [...groups].map(([id, messages]) => ({ id, messages }));
}

/** The known-customer lookup, once per conversation group. A failed lookup means "not known". */
function memoisedKnownCustomer(ctx: EngineContext, phone: string | null | undefined): ConversationContext['known'] {
    let lookup: Promise<{ backend_user_id: number } | null> | null = null;
    return () => {
        lookup ??= (async () => {
            const variants = phoneVariants(phone);
            if (variants.length === 0) return null;
            const found = await ctx.repo.findKnownCustomer(variants);
            return found.outcome === 'ok' ? found.data : null;
        })();
        return lookup;
    };
}

type Next = 'next' | 'stop_group' | 'stop_step';

function tally(counters: SweepCounters, result: AttachResult): Next {
    counters.errors += result.event_errors;
    switch (result.outcome) {
        case 'created': counters.created += 1; return 'next';
        case 'appended': counters.appended += 1; return 'next';
        case 'reopened': counters.reopened += 1; return 'next';
        case 'ack_attached': counters.ack_attached += 1; return 'next';
        case 'noop': counters.noop += 1; return 'next';
        case 'gave_up': counters.gave_up += 1; return 'stop_group';
        case 'not_installed': trackOutcome(counters, 'not_installed'); return 'stop_step';
        case 'error': trackOutcome(counters, result.timed_out ? 'timeout' : 'error'); return 'stop_group';
    }
}

async function sweepGroup(
    ctx: EngineContext, counters: SweepCounters, group: { id: string; messages: MessageRow[] }, derived: Set<string>,
): Promise<boolean> {
    const found = await ctx.repo.getConversation(group.id);
    if (found.outcome !== 'ok') return trackOutcome(counters, found.outcome);
    if (found.data === null) {
        counters.skipped_no_conversation += group.messages.length;
        return true;
    }
    const conv: ConversationContext = {
        conversation: found.data,
        known: memoisedKnownCustomer(ctx, found.data.contacts?.phone),
    };
    for (const message of group.messages) {
        const result = await attachInbound(ctx, conv, message);
        const next = tally(counters, result);
        if (result.ticket_id !== null && ['created', 'appended', 'reopened'].includes(result.outcome)) {
            derived.add(result.ticket_id);
        }
        if (next === 'stop_step') return false;
        if (next === 'stop_group') break;
    }
    return true;
}

async function runSweepStep(ctx: EngineContext, counters: SweepCounters, derived: Set<string>): Promise<void> {
    if (ctx.settings.go_live_at === null) return;
    if ((await loadCategories(ctx)) === null) {
        counters.errors += 1;
        return;
    }
    const listed = await ctx.repo.listUnticketedInbound(
        ctx.settings.go_live_at, new Date(ctx.now.getTime() - SWEEP_MIN_AGE_MS).toISOString(), SWEEP_LIMIT,
    );
    if (listed.outcome !== 'ok') {
        trackOutcome(counters, listed.outcome);
        return;
    }
    counters.scanned = listed.data.length;
    for (const group of groupByConversation(listed.data)) {
        if (ctx.expired()) return markTimedOut(counters);
        if (!(await sweepGroup(ctx, counters, group, derived))) return;
    }
}

// ── Step 3 — derive ────────────────────────────────────────────────────────

async function runDeriveStep(
    ctx: EngineContext, counters: DeriveCounters, windowStart: Date, alreadyDerived: ReadonlySet<string>,
): Promise<void> {
    const recent = await ctx.repo.listActiveConversationIds(windowStart.toISOString(), DERIVE_RECENT_LIMIT);
    if (recent.outcome !== 'ok') return void trackOutcome(counters, recent.outcome);
    const failed = await ctx.repo.listFailedOutboundConversationIds(
        new Date(ctx.now.getTime() - 48 * MS_PER_HOUR).toISOString(), DERIVE_FAILED_LIMIT,
    );
    if (failed.outcome !== 'ok') return void trackOutcome(counters, failed.outcome);
    const conversationIds = [...new Set([...recent.data, ...failed.data])].slice(0, DERIVE_MAX_CONVERSATIONS);
    const ticketIds: string[] = [];
    for (const ids of chunk(conversationIds)) {
        const read = await ctx.repo.listUnresolvedTicketIds(ids);
        if (read.outcome !== 'ok') {
            if (!trackOutcome(counters, read.outcome)) return;
            continue;
        }
        ticketIds.push(...read.data);
    }
    const todo = ticketIds.filter((id) => !alreadyDerived.has(id));
    counters.candidates = todo.length;
    for (const id of todo) {
        if (ctx.expired()) return markTimedOut(counters);
        const result = await deriveAndWrite(ctx, id);
        counters.errors += result.event_errors;
        if (result.outcome === 'updated') counters.updated += 1;
        else if (result.outcome === 'raced') counters.raced += 1;
        else if (result.outcome === 'too_large') counters.too_large += 1;
        else if (result.outcome === 'error') counters.errors += 1;
        else if (result.outcome === 'not_installed') return void trackOutcome(counters, 'not_installed');
    }
}

// ── Step 7 — health numbers ────────────────────────────────────────────────

async function runHealthStep(
    ctx: EngineContext, counters: HealthCounters,
    snapshot: (health: HealthCounters) => string,
): Promise<void> {
    if (ctx.settings.go_live_at === null) return;
    const orphans = await ctx.repo.listOrphans(
        ctx.settings.go_live_at, new Date(ctx.now.getTime() - ORPHAN_MIN_AGE_MS).toISOString(), HEALTH_CAP + 1,
    );
    if (orphans.outcome === 'ok') {
        counters.orphans = Math.min(orphans.data.length, HEALTH_CAP);
        counters.orphans_capped = orphans.data.length > HEALTH_CAP;
        counters.oldest_orphan_age_s = orphans.data.length === 0 ? null
            : Math.max(0, Math.round((ctx.now.getTime() - Date.parse(orphans.data[0].created_at)) / 1000));
    } else if (!trackOutcome(counters, orphans.outcome)) return;
    const failed = await ctx.repo.listFailedPanelReplyIds(new Date(ctx.now.getTime() - 24 * MS_PER_HOUR).toISOString(), HEALTH_CAP + 1);
    if (failed.outcome === 'ok') counters.failed_replies_24h = Math.min(failed.data.length, HEALTH_CAP);
    else if (!trackOutcome(counters, failed.outcome)) return;
    const written = await ctx.repo.writeTickSetting('desk_last_tick_stats', snapshot(counters));
    if (written.outcome === 'ok') counters.stats_written = written.data === 1;
    else trackOutcome(counters, written.outcome);
}

// ── The runner ─────────────────────────────────────────────────────────────

export interface DeskTickDeps { repo: DeskRepo; now?: Date; clock?: () => number }

class CategoriesUnavailable extends Error {}

/** All six step objects exist from the start, so a step that throws still reports the counts it had. */
function newSteps(): Required<Steps> {
    return {
        sweep: { ...newStepBase(), scanned: 0, created: 0, reopened: 0, appended: 0, ack_attached: 0, noop: 0, gave_up: 0, skipped_no_conversation: 0 },
        derive: { ...newStepBase(), candidates: 0, updated: 0, raced: 0, too_large: 0 },
        mirror: { ...newStepBase(), legacy_resolved: 0, invariant_reopened: 0, reopen_conflicts: 0 },
        missing: { ...newStepBase(), scanned: 0, flagged: 0 },
        lifecycle: { ...newStepBase(), followups_due: 0, idle_closed: 0, ack_closed: 0, cutoff_watch: 0 },
        health: { ...newStepBase(), orphans: 0, orphans_capped: false, oldest_orphan_age_s: null, failed_replies_24h: 0, stats_written: false },
    };
}

export async function runDeskTick(deps: DeskTickDeps): Promise<DeskTickResult> {
    const { repo } = deps;
    const now = deps.now ?? new Date();
    const clock = deps.clock ?? Date.now;
    const startedMs = clock();
    const tickAt = now.toISOString();
    const first = await heartbeatAndFlags(repo, now);
    const { settings } = first;
    const base = { tick_at: tickAt, heartbeat_written: first.heartbeatWritten };
    if (first.skipped !== null) {
        const durationMs = clock() - startedMs;
        if (first.skipped !== 'settings_error') {
            await repo.writeTickSetting('desk_last_tick_stats', JSON.stringify(statsOf(tickAt, durationMs, {})));
        }
        return { ran: false, skipped: first.skipped, duration_ms: durationMs, steps: {}, ...base };
    }

    let memo: Promise<readonly EngineCategory[]> | null = null;
    const categories = (): Promise<readonly EngineCategory[]> => {
        memo ??= repo.listActiveCategories().then((read) => {
            if (read.outcome !== 'ok') throw new CategoriesUnavailable(read.outcome);
            return read.data;
        });
        return memo;
    };
    const run = async (
        name: string, boxMs: number, counters: DeskTickStepBase, work: (ctx: EngineContext) => Promise<void>,
    ): Promise<void> => {
        const deadline = clock() + boxMs;
        try {
            await work({ repo, now, settings, categories, expired: () => clock() >= deadline });
        } catch (error) {
            counters.ok = false;
            console.error('[desk-tick] step failed', name, error instanceof Error ? error.name : 'Error');
        }
    };

    const windowStart = computeWindowStart(now, settings.last_tick_at);
    const derived = new Set<string>();
    const steps = newSteps();
    const { sweep, derive, mirror, missing, lifecycle, health } = steps;
    await run('sweep', DESK_TICK_BOXES_MS.sweep, sweep, (ctx) => runSweepStep(ctx, sweep, derived));
    await run('derive', DESK_TICK_BOXES_MS.derive, derive, (ctx) => runDeriveStep(ctx, derive, windowStart, derived));
    await run('mirror', DESK_TICK_BOXES_MS.mirror, mirror, (ctx) => runMirrorStep(ctx, mirror, windowStart));
    await run('missing', DESK_TICK_BOXES_MS.missing, missing, (ctx) => runMissingStep(ctx, missing, windowStart));
    await run('lifecycle', DESK_TICK_BOXES_MS.lifecycle, lifecycle, (ctx) => runLifecycleStep(ctx, lifecycle));
    await run('health', DESK_TICK_BOXES_MS.health, health, (ctx) => runHealthStep(ctx, health, (current) => (
        JSON.stringify(statsOf(tickAt, clock() - startedMs, { ...steps, health: { ...current, stats_written: true } }, current))
    )));
    return { ran: true, skipped: null, duration_ms: clock() - startedMs, steps, ...base };
}
