// Desk tick steps 4 (mirror), 5 (missing-message sweep) and 6 (lifecycle). Each step receives the
// counters object of the runner and mutates only that object, so a step that throws keeps the
// counts it had. Nothing here reads the clock: `ctx.now` and `ctx.expired()` come from the runner.

import { resolveQueueForNumber } from './rules';
import { istClockToUtc, istToday } from './business-hours';
import {
    deriveAndWrite, emitEvent, loadCategories, resolveBySystem,
    type EngineContext, type EventLog, type ResolveResult,
} from './engine';
import {
    buildReopenPatch, contactFields, markTimedOut, trackOutcome, wholeSeconds,
    type MessageRow, type NewTicketRow, type OpenConversationRow,
} from './repo';
import type { DeskTickResult, DeskTickStepBase } from './types';

export type MirrorCounters = NonNullable<DeskTickResult['steps']['mirror']>;
export type MissingCounters = NonNullable<DeskTickResult['steps']['missing']>;
export type LifecycleCounters = NonNullable<DeskTickResult['steps']['lifecycle']>;

const IN_LIST_CHUNK = 100;
const MIRROR_LIST_LIMIT = 1000;
const MIRROR_QUIET_MS = 120_000;
const TICKETED_INBOUND_LIMIT = 500;
const MISSING_PAGE = 200;
const MISSING_MAX_PAGES = 5;
const MISSING_GAP_MS = 120_000;
const MISSING_MADE_UP_MS = 5000;
const MISSING_INBOUND_LOOKBACK_MS = 600_000;
const LIFECYCLE_BATCH = 25;
const CUTOFF_WATCH_MS = 90 * 60_000;
const CUTOFF_WATCH_LIMIT = 200;
const MS_PER_HOUR = 3_600_000;

export function chunk<T>(items: readonly T[], size: number = IN_LIST_CHUNK): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}

/** Folds a resolve result into a step's counters; true when the ticket was resolved. */
function countResolve(counters: DeskTickStepBase, result: ResolveResult): boolean {
    counters.errors += result.event_errors;
    if (result.outcome === 'not_installed') trackOutcome(counters, 'not_installed');
    else if (result.outcome === 'error') counters.errors += 1;
    return result.outcome === 'resolved';
}

// ── Step 4 — mirror ────────────────────────────────────────────────────────

/** 4a: a conversation resolved in the old inbox resolves its ticket as legacy_inbox. */
async function mirrorLegacyResolved(ctx: EngineContext, counters: MirrorCounters): Promise<void> {
    const listed = await ctx.repo.listUnresolvedForMirror(MIRROR_LIST_LIMIT);
    if (listed.outcome !== 'ok') {
        trackOutcome(counters, listed.outcome);
        return;
    }
    // A manual ticket without a customer message is closed from the panel only (plan section 7, U1).
    const candidates = listed.data.filter((ticket) => (
        ticket.conversation_id !== null && !(ticket.origin === 'manual' && ticket.last_inbound_at === null)
    ));
    const resolvedConversations = new Set<string>();
    for (const ids of chunk(candidates.map((ticket) => ticket.conversation_id as string))) {
        const read = await ctx.repo.listResolvedConversationIds(ids);
        if (read.outcome !== 'ok') {
            if (!trackOutcome(counters, read.outcome)) return;
            continue;
        }
        read.data.forEach((id) => resolvedConversations.add(id));
    }
    for (const ticket of candidates) {
        if (!resolvedConversations.has(ticket.conversation_id as string)) continue;
        const quiet = ticket.last_inbound_at === null
            || ctx.now.getTime() - Date.parse(ticket.last_inbound_at) >= MIRROR_QUIET_MS;
        if (!quiet) continue;
        if (ctx.expired()) return markTimedOut(counters);
        const result = await resolveBySystem(ctx, ticket, 'legacy_inbox', {
            kind: 'mirror', readLastInboundAt: ticket.last_inbound_at,
        });
        if (countResolve(counters, result)) counters.legacy_resolved += 1;
        if (counters.not_installed) return;
    }
}

/** 4b: a resolved ticket with a customer message newer than its resolution (and not a recorded suppressed ack) reopens. */
async function mirrorUnseenInbound(
    ctx: EngineContext, counters: MirrorCounters, windowStart: Date,
): Promise<void> {
    const listed = await ctx.repo.listTicketedInboundSince(windowStart.toISOString(), TICKETED_INBOUND_LIMIT);
    if (listed.outcome !== 'ok') {
        trackOutcome(counters, listed.outcome);
        return;
    }
    const byTicket = new Map<string, Array<{ id: string; created_at: string }>>();
    for (const message of listed.data) {
        byTicket.set(message.ticket_id, [...(byTicket.get(message.ticket_id) ?? []), message]);
    }
    for (const ids of chunk([...byTicket.keys()])) {
        const tickets = await ctx.repo.listResolvedTicketsByIds(ids);
        if (tickets.outcome !== 'ok') {
            if (!trackOutcome(counters, tickets.outcome)) return;
            continue;
        }
        for (const ticket of tickets.data) {
            if (ctx.expired()) return markTimedOut(counters);
            const newer = (byTicket.get(ticket.id) ?? [])
                .filter((message) => Date.parse(message.created_at) > Date.parse(ticket.resolved_at));
            if (newer.length === 0) continue;
            const acks = await ctx.repo.listSuppressedAckMessageIds(ticket.id);
            if (acks.outcome !== 'ok') {
                if (!trackOutcome(counters, acks.outcome)) return;
                continue;
            }
            const unseen = newer
                .filter((message) => !acks.data.includes(message.id))
                .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
            if (unseen.length === 0) continue;
            await reopenUnseen(ctx, counters, ticket, unseen[0]);
            if (counters.not_installed) return;
        }
    }
}

async function reopenUnseen(
    ctx: EngineContext, counters: MirrorCounters,
    ticket: Parameters<typeof buildReopenPatch>[0] & { id: string }, earliest: { id: string; created_at: string },
): Promise<void> {
    const patch = buildReopenPatch(ticket, earliest.created_at);
    const written = await ctx.repo.reopenTicket(ticket.id, ticket.resolved_at, patch);
    if (written.outcome === 'conflict') {
        counters.reopen_conflicts += 1;
        return;
    }
    if (written.outcome !== 'ok') {
        trackOutcome(counters, written.outcome);
        return;
    }
    if (written.data === 0) return;
    counters.invariant_reopened += 1;
    const log: EventLog = { errors: 0 };
    await emitEvent(ctx, log, {
        ticketId: ticket.id, type: 'reopened', from: 'resolved', to: patch.status,
        data: { reason: 'unseen_message', message_id: earliest.id, prior_resolution: patch.prior_resolution },
    });
    const derived = await deriveAndWrite(ctx, ticket.id);
    counters.errors += log.errors + derived.event_errors;
    if (derived.outcome === 'not_installed') trackOutcome(counters, 'not_installed');
    else if (derived.outcome === 'error') counters.errors += 1;
}

export async function runMirrorStep(
    ctx: EngineContext, counters: MirrorCounters, windowStart: Date,
): Promise<void> {
    await mirrorLegacyResolved(ctx, counters);
    if (counters.not_installed || counters.timed_out) return;
    await mirrorUnseenInbound(ctx, counters, windowStart);
}

// ── Step 5 — missing-message sweep ─────────────────────────────────────────

async function readOpenConversations(
    ctx: EngineContext, counters: MissingCounters, lowerIso: string, upperIso: string,
): Promise<OpenConversationRow[]> {
    const rows: OpenConversationRow[] = [];
    for (let page = 0; page < MISSING_MAX_PAGES; page += 1) {
        if (page > 0 && ctx.expired()) {
            markTimedOut(counters);
            break;
        }
        const read = await ctx.repo.listOpenConversationsWithIncoming(lowerIso, upperIso, MISSING_PAGE, page * MISSING_PAGE);
        if (read.outcome !== 'ok') {
            trackOutcome(counters, read.outcome);
            break;
        }
        rows.push(...read.data);
        if (read.data.length < MISSING_PAGE) break;
    }
    return rows;
}

/** The conversation POST /api/whatsapp/conversations creates carries a made-up incoming timestamp and no message. */
const isMadeUp = (row: OpenConversationRow): boolean => (
    (row.last_message ?? '').trim() === ''
    && Math.abs(Date.parse(row.last_incoming_timestamp) - Date.parse(row.created_at)) <= MISSING_MADE_UP_MS
);

async function findGapCandidates(
    ctx: EngineContext, counters: MissingCounters, rows: readonly OpenConversationRow[], lowerMs: number,
): Promise<Array<{ row: OpenConversationRow; newest: string | null }> | null> {
    const newestByConversation = new Map<string, string>();
    const sinceIso = new Date(lowerMs - MISSING_INBOUND_LOOKBACK_MS).toISOString();
    for (const ids of chunk(rows.map((row) => row.id))) {
        const read = await ctx.repo.listNewestInbound(ids, sinceIso, 1000);
        if (read.outcome !== 'ok') {
            if (!trackOutcome(counters, read.outcome)) return null;
            return [];
        }
        for (const message of read.data) {
            const known = newestByConversation.get(message.conversation_id);
            if (known === undefined || Date.parse(message.created_at) > Date.parse(known)) {
                newestByConversation.set(message.conversation_id, message.created_at);
            }
        }
    }
    return rows
        .filter((row) => !isMadeUp(row))
        .map((row) => ({ row, newest: newestByConversation.get(row.id) ?? null }))
        .filter(({ row, newest }) => (
            newest === null || Date.parse(row.last_incoming_timestamp) - Date.parse(newest) > MISSING_GAP_MS
        ));
}

async function dropTicketedConversations(
    ctx: EngineContext, counters: MissingCounters, candidates: ReadonlyArray<{ row: OpenConversationRow; newest: string | null }>,
): Promise<Array<{ row: OpenConversationRow; newest: string | null }>> {
    const covered = new Set<string>();
    const incoming = new Map(candidates.map(({ row }) => [row.id, Date.parse(row.last_incoming_timestamp)]));
    for (const ids of chunk(candidates.map(({ row }) => row.id))) {
        const read = await ctx.repo.listTicketsForConversations(ids, 500);
        if (read.outcome !== 'ok') {
            trackOutcome(counters, read.outcome);
            return [];
        }
        for (const ticket of read.data) {
            const lastIncoming = incoming.get(ticket.conversation_id ?? '');
            const recent = lastIncoming !== undefined
                && Date.parse(ticket.opened_at) >= lastIncoming - MISSING_GAP_MS;
            if (ticket.conversation_id !== null && (ticket.status !== 'resolved' || recent)) {
                covered.add(ticket.conversation_id);
            }
        }
    }
    return candidates.filter(({ row }) => !covered.has(row.id));
}

async function flagMissingMessage(
    ctx: EngineContext, counters: MissingCounters, row: OpenConversationRow, newest: string | null,
): Promise<void> {
    const queue = resolveQueueForNumber(row.integrated_number, ctx.settings.number_queues);
    const incomingAt = row.last_incoming_timestamp;
    const ticket: NewTicketRow = {
        channel: 'whatsapp',
        conversation_id: row.id,
        contact_id: row.contact_id,
        integrated_number: row.integrated_number,
        origin: 'missing_message',
        previous_ticket_id: null,
        ...contactFields(row.contacts),
        queue,
        priority: 3,
        is_ack_only: false,
        status: 'new',
        opened_at: incomingAt,
        last_inbound_at: incomingAt,
        awaiting_reply_since: incomingAt,
    };
    const inserted = await ctx.repo.insertTicket(ticket);
    if (inserted.outcome === 'conflict') return;
    if (inserted.outcome !== 'ok') {
        trackOutcome(counters, inserted.outcome);
        return;
    }
    counters.flagged += 1;
    const log: EventLog = { errors: 0 };
    await emitEvent(ctx, log, {
        ticketId: inserted.data.id, type: 'created', from: null, to: 'new',
        data: {
            origin: 'missing_message', via: 'tick', message_id: null, queue,
            lag_secs: wholeSeconds(incomingAt, ctx.now.getTime()), previous_ticket_id: null,
        },
    });
    await emitEvent(ctx, log, {
        ticketId: inserted.data.id, type: 'missing_message_flagged', from: null, to: null,
        data: { last_incoming_timestamp: incomingAt, newest_stored_inbound_at: newest },
    });
    counters.errors += log.errors;
}

export async function runMissingStep(
    ctx: EngineContext, counters: MissingCounters, windowStart: Date,
): Promise<void> {
    if (ctx.settings.go_live_at === null) return;
    const lowerMs = Math.max(Date.parse(ctx.settings.go_live_at), windowStart.getTime());
    const rows = await readOpenConversations(
        ctx, counters, new Date(lowerMs).toISOString(), new Date(ctx.now.getTime() - MISSING_GAP_MS).toISOString(),
    );
    counters.scanned = rows.length;
    if (rows.length === 0 || counters.not_installed) return;
    const gaps = await findGapCandidates(ctx, counters, rows, lowerMs);
    if (gaps === null || gaps.length === 0) return;
    for (const { row, newest } of await dropTicketedConversations(ctx, counters, gaps)) {
        if (ctx.expired()) return markTimedOut(counters);
        await flagMissingMessage(ctx, counters, row, newest);
        if (counters.not_installed) return;
    }
}

// ── Step 6 — lifecycle ─────────────────────────────────────────────────────

/** Derive first (fresh clocks); true only when the derive left the ticket in a state that may be resolved. */
async function deriveFresh(
    ctx: EngineContext, counters: LifecycleCounters, id: string,
): Promise<{ usable: boolean; messages: readonly MessageRow[] }> {
    const derived = await deriveAndWrite(ctx, id);
    counters.errors += derived.event_errors;
    if (derived.outcome === 'not_installed') trackOutcome(counters, 'not_installed');
    if (derived.outcome === 'error') counters.errors += 1;
    const usable = derived.outcome === 'updated' || derived.outcome === 'unchanged';
    return { usable, messages: derived.messages };
}

async function closeIdle(ctx: EngineContext, counters: LifecycleCounters): Promise<void> {
    const idleCutoffIso = new Date(ctx.now.getTime() - ctx.settings.idle_close_hours * MS_PER_HOUR).toISOString();
    const listed = await ctx.repo.listIdleCandidateIds(idleCutoffIso, LIFECYCLE_BATCH);
    if (listed.outcome !== 'ok') {
        trackOutcome(counters, listed.outcome);
        return;
    }
    for (const id of listed.data) {
        if (ctx.expired()) return markTimedOut(counters);
        const fresh = await deriveFresh(ctx, counters, id);
        if (counters.not_installed) return;
        if (!fresh.usable) continue;
        const result = await resolveBySystem(ctx, { id, status: 'waiting_customer' }, 'idle_close', {
            kind: 'idle', idleCutoffIso,
        });
        if (countResolve(counters, result)) counters.idle_closed += 1;
        if (counters.not_installed) return;
    }
}

async function closeAckLane(ctx: EngineContext, counters: LifecycleCounters): Promise<void> {
    const ackCutoffIso = new Date(ctx.now.getTime() - ctx.settings.ack_autoclose_hours * MS_PER_HOUR).toISOString();
    const listed = await ctx.repo.listAckLaneCandidateIds(ackCutoffIso, LIFECYCLE_BATCH);
    if (listed.outcome !== 'ok') {
        trackOutcome(counters, listed.outcome);
        return;
    }
    for (const id of listed.data) {
        if (ctx.expired()) return markTimedOut(counters);
        const fresh = await deriveFresh(ctx, counters, id);
        if (counters.not_installed) return;
        const unlinked = fresh.messages.some((message) => message.direction === 'inbound' && message.ticket_id === null);
        if (!fresh.usable || unlinked) continue;
        const result = await resolveBySystem(ctx, { id }, 'ack_autoclose', { kind: 'ack', ackCutoffIso });
        if (countResolve(counters, result)) counters.ack_closed += 1;
        if (counters.not_installed) return;
    }
}

/** 6d: counts only. The alert and the cutoff_alerted event belong to a later unit. */
async function watchCutoff(ctx: EngineContext, counters: LifecycleCounters): Promise<void> {
    const cutoff = istClockToUtc(istToday(ctx.now), ctx.settings.business_hours.end);
    if (cutoff === null) return;
    const untilCutoff = cutoff.getTime() - ctx.now.getTime();
    if (untilCutoff < 0 || untilCutoff > CUTOFF_WATCH_MS) return;
    const categories = await loadCategories(ctx);
    if (categories === null) {
        counters.errors += 1;
        return;
    }
    const slugs = categories.filter((category) => category.deadline_rule === 'before_cutoff').map((category) => category.slug);
    const listed = await ctx.repo.listCutoffWatchIds(slugs, CUTOFF_WATCH_LIMIT);
    if (listed.outcome !== 'ok') {
        trackOutcome(counters, listed.outcome);
        return;
    }
    counters.cutoff_watch = new Set(listed.data).size;
}

export async function runLifecycleStep(ctx: EngineContext, counters: LifecycleCounters): Promise<void> {
    const due = await ctx.repo.listDueFollowUpIds(ctx.now.toISOString(), 101);
    if (due.outcome === 'ok') counters.followups_due = Math.min(due.data.length, 100);
    else if (!trackOutcome(counters, due.outcome)) return;
    await closeIdle(ctx, counters);
    if (counters.not_installed) return;
    await closeAckLane(ctx, counters);
    if (counters.not_installed) return;
    await watchCutoff(ctx, counters);
}
