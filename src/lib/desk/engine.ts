// Desk engine, per-ticket transitions: attach one stored customer message to a ticket (create /
// append / reopen / ack-attach), derive a ticket's clocks and system status from its stored
// messages, and resolve a ticket on behalf of the system. Every write is one conditional update
// whose affected-row count decides what happens next; there are no counters. This file never
// reads the clock (it receives `now` and `expired()`) and never touches Supabase directly.

import {
    HUMAN_RESOLVED_VIA, LEGACY_INBOX_ACTOR, RESOLUTION_CODES, SYSTEM_ACTOR, SYSTEM_RESOLUTIONS,
    type EventType, type ResolutionCode, type TicketStatus,
} from './constants';
import { ACK_MAX_LENGTH, isAckOnly } from './ack';
import { compareMessages, deriveTicketClock, isHumanReply, type DeskMessageFacts } from './clock';
import { decideInbound, isQuestionText, type InboundDecision, type InboundState } from './decide';
import { preClassify, type PreClassifyResult } from './rules';
import type { InternalMatcher } from './internal-contacts';
import {
    DESK_MESSAGE_PAGE, asTicketType, buildDerivedPatch, buildReopenPatch, buildTicketRow, isInsideWindow, isLater,
    reopenReason, syntheticInbound, wholeSeconds,
    type ConversationRow, type DeskDb, type DeskDbOutcome, type DeskRepo, type DerivedPatch, type EngineCategory,
    type InternalResolvePatch, type LatestResolvedRow, type MessageRow, type ResolveGuard,
    type SystemResolvePatch, type TicketClockRow, type UnresolvedTicketRow,
} from './repo';
import type { DeskSettings, EventDataMap } from './types';

/** A click-to-WhatsApp ad message is a sales lead even when its text is "ok". */
export const isAckMessage = (message: DeskMessageFacts): boolean =>
    message.source !== 'ctwa' && isAckOnly(message.body, message.content_type, Boolean(message.media_url));

export interface EngineContext {
    repo: DeskRepo;
    now: Date;
    settings: DeskSettings;
    /** Memoised by the runner: one read per tick. Rejects when the categories cannot be read. */
    categories: () => Promise<readonly EngineCategory[]>;
    /** The current step's time box has passed. */
    expired: () => boolean;
    /** Built once per run from the staff list and the contact flags (internal-contacts.ts). */
    internal: InternalMatcher;
}

export interface ConversationContext {
    conversation: ConversationRow;
    /** Memoised: one known-customer lookup per conversation group. */
    known: () => Promise<{ backend_user_id: number } | null>;
}

export type AttachOutcome =
    | 'created' | 'appended' | 'reopened' | 'ack_attached' | 'noop' | 'gave_up' | 'not_installed' | 'error'
    | 'internal_skipped';
export interface AttachResult {
    outcome: AttachOutcome;
    ticket_id: string | null;
    event_errors: number;
    /** The outcome is 'error' because a query hit its abort timeout. */
    timed_out?: boolean;
}

export type DeriveOutcome =
    | 'updated' | 'unchanged' | 'raced' | 'skipped' | 'too_large' | 'not_installed' | 'error';
export interface DeriveResult { outcome: DeriveOutcome; messages: readonly MessageRow[]; event_errors: number }

export type SystemResolutionKind = 'idle_close' | 'ack_autoclose' | 'legacy_inbox' | 'internal';
export interface SystemResolveTicket {
    id: string; status?: TicketStatus | null; category_slug?: string | null; awaiting_reply_since?: string | null;
    /** Needed for kind 'internal' only: the event source is ctx.internal.sourceOf(customer_phone). */
    customer_phone?: string | null;
}

/** Plan section 8: the internal close is a system resolution that also sets the category. */
const INTERNAL_RESOLUTION = { resolved_via: 'system', resolution_code: 'no_action' } as const;
export interface ResolveResult { outcome: 'resolved' | 'skipped' | 'not_installed' | 'error'; event_errors: number }

const MAX_PASSES = 3;
const MAX_DERIVE_PAGES = 3;
const ACK_STATE_MESSAGE_LIMIT = 500;

// ── Small helpers ──────────────────────────────────────────────────────────

export interface EventLog { errors: number }

export async function emitEvent<K extends EventType>(
    ctx: EngineContext, log: EventLog,
    event: { ticketId: string; type: K; from: TicketStatus | null; to: TicketStatus | null; data: EventDataMap[K]; actor?: { id: string; name: string } },
): Promise<void> {
    const actor = event.actor ?? SYSTEM_ACTOR;
    const result = await ctx.repo.insertEvent({
        ticket_id: event.ticketId, type: event.type, from_status: event.from, to_status: event.to,
        actor_id: actor.id, actor_name: actor.name, data: event.data,
    });
    if (result.outcome === 'ok') return;
    log.errors += 1;
    console.error('[desk] event insert failed', event.type, result.outcome);
}

/** Counts a failed non-essential write (suggestion, priority, first resolution) like a failed event. */
function noteFailure(log: EventLog, result: DeskDb<unknown>): void {
    if (result.outcome !== 'ok') log.errors += 1;
}

/** Categories, or null when they cannot be read (the caller then leaves the work for the next tick). */
export async function loadCategories(ctx: EngineContext): Promise<readonly EngineCategory[] | null> {
    try {
        return await ctx.categories();
    } catch {
        // The runner's memo rejects when desk_categories cannot be read; callers count it as an error.
        return null;
    }
}

function ackText(message: DeskMessageFacts): string {
    return (message.body ?? '').trim().slice(0, ACK_MAX_LENGTH);
}

// ── attachInbound ──────────────────────────────────────────────────────────

type Step = { kind: 'retry' } | { kind: 'done'; result: AttachResult };

const RETRY: Step = { kind: 'retry' };

function finish(log: EventLog, outcome: AttachOutcome, ticketId: string | null): Step {
    return { kind: 'done', result: { outcome, ticket_id: ticketId, event_errors: log.errors } };
}

function failStep(log: EventLog, outcome: DeskDbOutcome, ticketId: string | null): Step {
    const mapped: AttachOutcome = outcome === 'not_installed' ? 'not_installed' : 'error';
    const result: AttachResult = { outcome: mapped, ticket_id: ticketId, event_errors: log.errors };
    return { kind: 'done', result: outcome === 'timeout' ? { ...result, timed_out: true } : result };
}

/** The two booleans of InboundState.latest_resolved; read only when a rule can use them. */
async function readAckFacts(
    ctx: EngineContext, conversationId: string, resolved: LatestResolvedRow,
): Promise<DeskDb<{ after: boolean; question: boolean }>> {
    const read = await ctx.repo.listConversationMessages(conversationId, resolved.opened_at, ACK_STATE_MESSAGE_LIMIT, 0);
    if (read.outcome !== 'ok') return { outcome: read.outcome, data: null };
    const resolvedMs = Date.parse(resolved.resolved_at);
    const humans = read.data.filter(isHumanReply);
    const lastBefore = humans.filter((m) => Date.parse(m.created_at) <= resolvedMs).sort(compareMessages).pop();
    return {
        outcome: 'ok',
        data: {
            after: humans.some((m) => Date.parse(m.created_at) > resolvedMs),
            question: lastBefore ? isQuestionText(lastBefore.body) : false,
        },
    };
}

interface PassState { unresolved: UnresolvedTicketRow | null; latest: LatestResolvedRow | null; inbound: InboundState }

async function readPassState(
    ctx: EngineContext, conversationId: string, message: MessageRow, isAck: boolean,
): Promise<{ state: PassState } | { failed: DeskDbOutcome }> {
    const unresolved = await ctx.repo.getUnresolvedTicket(conversationId);
    if (unresolved.outcome !== 'ok') return { failed: unresolved.outcome };
    const latest = await ctx.repo.getLatestResolvedTicket(conversationId);
    if (latest.outcome !== 'ok') return { failed: latest.outcome };
    const resolved = latest.data;
    const readFacts = unresolved.data === null && resolved !== null && isAck
        && ctx.settings.ack_suppress !== 'off'
        && (HUMAN_RESOLVED_VIA as readonly string[]).includes(resolved.resolved_via ?? '')
        && isInsideWindow(message.created_at, resolved.resolved_at, ctx.settings.reopen_window_hours);
    let facts = { after: false, question: false };
    if (readFacts && resolved !== null) {
        const read = await readAckFacts(ctx, conversationId, resolved);
        if (read.outcome !== 'ok') return { failed: read.outcome };
        facts = read.data;
    }
    const inbound: InboundState = {
        unresolved: unresolved.data
            ? { id: unresolved.data.id, status: unresolved.data.status, last_inbound_at: unresolved.data.last_inbound_at }
            : null,
        latest_resolved: resolved === null ? null : {
            id: resolved.id,
            resolved_at: resolved.resolved_at,
            resolved_via: resolved.resolved_via,
            human_message_after_resolution: facts.after,
            last_human_message_before_resolution_is_question: facts.question,
        },
    };
    return { state: { unresolved: unresolved.data, latest: resolved, inbound } };
}

async function classifyMessage(
    ctx: EngineContext, conv: ConversationContext, message: MessageRow,
): Promise<PreClassifyResult | null> {
    const categories = await loadCategories(ctx);
    if (categories === null) return null;
    const known = await conv.known();
    return preClassify({
        text: message.body,
        content_type: message.content_type,
        has_media: Boolean(message.media_url),
        integrated_number: conv.conversation.integrated_number,
        number_queues: ctx.settings.number_queues,
        customer: { known: known !== null, active_subscriber: null },
        is_ctwa: message.source === 'ctwa',
        categories,
    });
}

async function emitSuggested(ctx: EngineContext, log: EventLog, ticketId: string, result: PreClassifyResult): Promise<void> {
    const orderId = result.order_id_hint === null ? null : Number(result.order_id_hint);
    await emitEvent(ctx, log, {
        ticketId, type: 'suggested', from: null, to: null,
        data: {
            source: 'rules', suggested_type: asTicketType(result.suggested_type), suggested_category: result.suggested_category,
            order_id: orderId !== null && Number.isFinite(orderId) ? orderId : null, matched_keyword: result.matched_keyword,
        },
    });
}

const hasSuggestion = (result: PreClassifyResult): boolean =>
    result.suggested_type !== null || result.suggested_category !== null || result.order_id_hint !== null;

/** Links the message and runs the derive. A failed claim leaves the message for the next tick. */
async function claimAndDerive(
    ctx: EngineContext, log: EventLog, message: MessageRow, ticketId: string, outcome: AttachOutcome, writeEvents: () => Promise<void>,
): Promise<Step> {
    const claim = await ctx.repo.claimMessage(message.id, ticketId);
    await writeEvents();
    if (claim.outcome !== 'ok') return failStep(log, claim.outcome, ticketId);
    const derived = await deriveAndWrite(ctx, ticketId);
    log.errors += derived.event_errors;
    return finish(log, outcome, ticketId);
}

async function doAppend(
    ctx: EngineContext, conv: ConversationContext, message: MessageRow, isAck: boolean,
    ticket: UnresolvedTicketRow, log: EventLog,
): Promise<Step> {
    const next = ticket.last_inbound_at === null || isLater(message.created_at, ticket.last_inbound_at) ? message.created_at : ticket.last_inbound_at;
    const touched = await ctx.repo.touchInbound(ticket.id, ticket.last_inbound_at, next);
    if (touched.outcome !== 'ok') return failStep(log, touched.outcome, null);
    if (touched.data === 0) return RETRY;
    return claimAndDerive(ctx, log, message, ticket.id, 'appended', async () => {
        if (isAck || ticket.category_slug !== null) return;
        const result = await classifyMessage(ctx, conv, message);
        if (result === null) {
            log.errors += 1;
            return;
        }
        if ((result.suggested_type !== null || result.suggested_category !== null) && ticket.suggested_type === null) {
            const written = await ctx.repo.writeSuggestion(ticket.id, { suggested_type: result.suggested_type, suggested_category: result.suggested_category });
            noteFailure(log, written);
            if (written.outcome === 'ok' && written.data === 1) await emitSuggested(ctx, log, ticket.id, result);
        }
        if (result.priority < ticket.priority) noteFailure(log, await ctx.repo.raisePriority(ticket.id, result.priority));
    });
}

async function doReopen(
    ctx: EngineContext, message: MessageRow, isAck: boolean, decision: InboundDecision,
    resolved: LatestResolvedRow, log: EventLog,
): Promise<Step> {
    const patch = buildReopenPatch(resolved, message.created_at);
    const written = await ctx.repo.reopenTicket(resolved.id, resolved.resolved_at, patch);
    if (written.outcome === 'conflict') return RETRY;
    if (written.outcome !== 'ok') return failStep(log, written.outcome, null);
    if (written.data === 0) return RETRY;
    return claimAndDerive(ctx, log, message, resolved.id, 'reopened', async () => {
        await emitEvent(ctx, log, {
            ticketId: resolved.id, type: 'reopened', from: 'resolved', to: patch.status,
            data: { reason: reopenReason(message, resolved.resolved_at, isAck), message_id: message.id, prior_resolution: patch.prior_resolution },
        });
        if (decision.reason === 'ack_shadow') {
            await emitEvent(ctx, log, { ticketId: resolved.id, type: 'ack_would_suppress', from: null, to: null, data: { message_id: message.id, text: ackText(message) } });
        }
    });
}

async function doCreate(
    ctx: EngineContext, conv: ConversationContext, message: MessageRow, isAck: boolean,
    decision: InboundDecision, log: EventLog, via: 'tick' | 'inline',
): Promise<Step> {
    const result = await classifyMessage(ctx, conv, message);
    if (result === null) return failStep(log, 'error', null);
    const known = await conv.known();
    const row = buildTicketRow(conv.conversation, message, isAck, result, decision.previous_ticket_id, known);
    const inserted = await ctx.repo.insertTicket(row);
    if (inserted.outcome === 'conflict') return RETRY;
    if (inserted.outcome !== 'ok') return failStep(log, inserted.outcome, null);
    const ticketId = inserted.data.id;
    return claimAndDerive(ctx, log, message, ticketId, 'created', async () => {
        await emitEvent(ctx, log, {
            ticketId, type: 'created', from: null, to: 'new',
            data: {
                origin: 'inbound', via, message_id: message.id, queue: result.queue,
                lag_secs: wholeSeconds(message.created_at, ctx.now.getTime()), previous_ticket_id: decision.previous_ticket_id,
            },
        });
        if (hasSuggestion(result)) await emitSuggested(ctx, log, ticketId, result);
    });
}

async function doAckAttach(ctx: EngineContext, message: MessageRow, resolved: LatestResolvedRow, log: EventLog): Promise<Step> {
    const claim = await ctx.repo.claimMessage(message.id, resolved.id);
    if (claim.outcome !== 'ok') return failStep(log, claim.outcome, null);
    if (claim.data === 0) return finish(log, 'noop', null);
    await emitEvent(ctx, log, { ticketId: resolved.id, type: 'ack_suppressed', from: null, to: null, data: { message_id: message.id, text: ackText(message) } });
    return finish(log, 'ack_attached', resolved.id);
}

/** On an internal contact only a manual ticket may take the message (plan section 8, risk R-E2). */
function allowedForInternal(decision: InboundDecision, state: PassState): boolean {
    if (decision.action === 'append') return state.unresolved?.origin === 'manual';
    if (decision.action === 'reopen' || decision.action === 'ack_attach') return state.latest?.origin === 'manual';
    return false;
}

async function runPass(
    ctx: EngineContext, conv: ConversationContext, message: MessageRow, isAck: boolean, log: EventLog, via: 'tick' | 'inline',
): Promise<Step> {
    const read = await readPassState(ctx, conv.conversation.id, message, isAck);
    if ('failed' in read) return failStep(log, read.failed, null);
    const { state } = read;
    const decision = decideInbound(state.inbound, { id: message.id, created_at: message.created_at, is_ack: isAck }, ctx.settings);
    if (ctx.internal.isInternal(conv.conversation.contacts?.phone) && !allowedForInternal(decision, state)) {
        return finish(log, 'internal_skipped', null);
    }
    switch (decision.action) {
        case 'append':
            return state.unresolved ? doAppend(ctx, conv, message, isAck, state.unresolved, log) : RETRY;
        case 'reopen':
            return state.latest ? doReopen(ctx, message, isAck, decision, state.latest, log) : RETRY;
        case 'ack_attach':
            return state.latest ? doAckAttach(ctx, message, state.latest, log) : RETRY;
        case 'create':
            return doCreate(ctx, conv, message, isAck, decision, log, via);
    }
}

/** Turns one stored inbound message into exactly one ticket link, in at most three passes. */
export async function attachInbound(ctx: EngineContext, conv: ConversationContext, message: MessageRow, via: 'tick' | 'inline' = 'tick'): Promise<AttachResult> {
    const log: EventLog = { errors: 0 };
    const isAck = isAckMessage(message);
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        // The caller checked the time box before starting this message; only a retry pass is gated.
        if (pass > 0 && ctx.expired()) break;
        const step = await runPass(ctx, conv, message, isAck, log, via);
        if (step.kind === 'done') return step.result;
    }
    return { outcome: 'gave_up', ticket_id: null, event_errors: log.errors };
}

// ── deriveAndWrite ─────────────────────────────────────────────────────────

type ReadMessages =
    | { kind: 'ok'; messages: MessageRow[] }
    | { kind: 'fail'; outcome: 'not_installed' | 'error' | 'too_large' };

/** Pages of DESK_MESSAGE_PAGE, at most three; a fourth page with rows means the ticket is too large to derive. */
async function readTicketMessages(ctx: EngineContext, conversationId: string, openedAt: string): Promise<ReadMessages> {
    const messages: MessageRow[] = [];
    for (let page = 0; page <= MAX_DERIVE_PAGES; page += 1) {
        const read = await ctx.repo.listConversationMessages(conversationId, openedAt, DESK_MESSAGE_PAGE, page * DESK_MESSAGE_PAGE);
        if (read.outcome !== 'ok') return { kind: 'fail', outcome: read.outcome === 'not_installed' ? 'not_installed' : 'error' };
        if (page === MAX_DERIVE_PAGES) {
            return read.data.length > 0 ? { kind: 'fail', outcome: 'too_large' } : { kind: 'ok', messages };
        }
        messages.push(...read.data);
        if (read.data.length < DESK_MESSAGE_PAGE) break;
    }
    return { kind: 'ok', messages };
}

async function emitDerivedEvents(
    ctx: EngineContext, log: EventLog, ticket: TicketClockRow, patch: DerivedPatch,
    clock: ReturnType<typeof deriveTicketClock>,
): Promise<void> {
    if (patch.status !== undefined) {
        const inboundAdvanced = clock.last_inbound_at !== null && isLater(clock.last_inbound_at, ticket.last_inbound_at);
        const cause = patch.status === 'waiting_customer' ? 'human_reply' : inboundAdvanced ? 'inbound' : 'reply_failed';
        await emitEvent(ctx, log, {
            ticketId: ticket.id, type: 'status_changed', from: ticket.status, to: patch.status, data: { cause },
        });
    }
    if (patch.first_response_message_id && clock.first_response_at && clock.first_response_source) {
        await emitEvent(ctx, log, {
            ticketId: ticket.id, type: 'first_response', from: null, to: null,
            data: {
                message_id: patch.first_response_message_id, source: clock.first_response_source, by: patch.first_response_by ?? null,
                secs_since_open: Math.round((Date.parse(clock.first_response_at) - Date.parse(ticket.opened_at)) / 1000),
            },
        });
    }
}

/** The only writer of derived ticket state in the tick. */
export async function deriveAndWrite(ctx: EngineContext, ticketId: string): Promise<DeriveResult> {
    const log: EventLog = { errors: 0 };
    const done = (outcome: DeriveOutcome, messages: readonly MessageRow[] = []): DeriveResult =>
        ({ outcome, messages, event_errors: log.errors });
    const found = await ctx.repo.getTicketClock(ticketId);
    if (found.outcome !== 'ok') return done(found.outcome === 'not_installed' ? 'not_installed' : 'error');
    const ticket = found.data;
    if (ticket === null || ticket.status === 'resolved' || ticket.conversation_id === null) return done('skipped');
    const read = await readTicketMessages(ctx, ticket.conversation_id, ticket.opened_at);
    if (read.kind === 'fail') return done(read.outcome);
    const messages = ticket.origin === 'missing_message' ? [...read.messages, syntheticInbound(ticket.opened_at)] : read.messages;
    const openedMs = Date.parse(ticket.opened_at);
    const inbound = messages.filter((m) => m.direction === 'inbound' && Date.parse(m.created_at) >= openedMs);
    const clock = deriveTicketClock(messages, ticket);
    const built = buildDerivedPatch(ticket, clock, inbound.length > 0 && inbound.every(isAckMessage));
    // A new first response carries its panel sender (messages.sent_by_user_id); a phone-app reply has none.
    const patch: DerivedPatch = built.first_response_message_id
        ? { ...built, first_response_by: messages.find((m) => m.id === built.first_response_message_id)?.sent_by_user_id ?? null }
        : built;
    if (Object.keys(patch).length === 0) return done('unchanged', read.messages);
    const written = await ctx.repo.writeDerived({ id: ticket.id, status: ticket.status, last_inbound_at: ticket.last_inbound_at }, patch);
    if (written.outcome !== 'ok') return done(written.outcome === 'not_installed' ? 'not_installed' : 'error', read.messages);
    if (written.data === 0) return done('raced', read.messages);
    await emitDerivedEvents(ctx, log, ticket, patch, clock);
    return done('updated', read.messages);
}

// ── resolveBySystem ────────────────────────────────────────────────────────

async function resolutionCodeFor(
    ctx: EngineContext, kind: SystemResolutionKind, categorySlug: string | null | undefined,
): Promise<ResolutionCode | null> {
    if (kind === 'internal') return INTERNAL_RESOLUTION.resolution_code;
    const fallback: ResolutionCode = SYSTEM_RESOLUTIONS[kind].resolution_code;
    if (kind !== 'legacy_inbox' || !categorySlug) return fallback;
    const categories = await loadCategories(ctx);
    if (categories === null) return null;
    const declared = categories.find((category) => category.slug === categorySlug)?.default_resolution_code;
    return declared && (RESOLUTION_CODES as readonly string[]).includes(declared) ? (declared as ResolutionCode) : fallback;
}

/** The patch of a system resolution; the internal close also sets the category (plan section 8). */
function systemPatch(kind: SystemResolutionKind, code: ResolutionCode, nowIso: string): SystemResolvePatch | InternalResolvePatch {
    const base: SystemResolvePatch = {
        status: 'resolved', resolved_at: nowIso, resolved_by: null, resolved_by_name: null,
        resolution_code: code, resolution_note: null,
        resolved_via: kind === 'internal' ? INTERNAL_RESOLUTION.resolved_via : SYSTEM_RESOLUTIONS[kind].resolved_via,
        lost_reason: null, follow_up_at: null, hold_reason: null, awaiting_reply_since: null,
    };
    if (kind !== 'internal') return base;
    return { ...base, category_slug: 'internal', type: 'other', classified_at: nowIso, classified_by: null, classification_source: null };
}

/** One conditional update (the guard re-checks every condition in SQL), then first_resolved_* and the event. */
export async function resolveBySystem(
    ctx: EngineContext, ticket: SystemResolveTicket, kind: SystemResolutionKind, guard: ResolveGuard,
): Promise<ResolveResult> {
    const log: EventLog = { errors: 0 };
    const source = kind === 'internal' ? ctx.internal.sourceOf(ticket.customer_phone) : null;
    if (kind === 'internal' && source === null) return { outcome: 'skipped', event_errors: 0 };
    const code = await resolutionCodeFor(ctx, kind, ticket.category_slug);
    if (code === null) return { outcome: 'error', event_errors: 0 };
    const nowIso = ctx.now.toISOString();
    const patch = systemPatch(kind, code, nowIso);
    const resolvedVia = patch.resolved_via;
    const written = await ctx.repo.resolveSystem(ticket.id, patch, guard);
    if (written.outcome !== 'ok') {
        return { outcome: written.outcome === 'not_installed' ? 'not_installed' : 'error', event_errors: 0 };
    }
    if (written.data === 0) return { outcome: 'skipped', event_errors: 0 };
    noteFailure(log, await ctx.repo.writeFirstResolution(ticket.id, { first_resolved_at: nowIso, first_resolved_by: null, first_resolved_code: code }));
    if (source !== null) {
        await emitEvent(ctx, log, { ticketId: ticket.id, type: 'auto_internal', from: null, to: null, data: { source } });
    }
    await emitEvent(ctx, log, {
        ticketId: ticket.id, type: 'resolved', from: ticket.status ?? null, to: 'resolved',
        actor: kind === 'legacy_inbox' ? LEGACY_INBOX_ACTOR : SYSTEM_ACTOR,
        data: {
            resolution_code: code, resolved_via: resolvedVia, note: null, lost_reason: null,
            action_id: null, duplicate_of_ticket_no: null,
            ...(kind === 'legacy_inbox' && (ticket.awaiting_reply_since ?? null) !== null ? { over_unanswered: true } : {}),
        },
    });
    return { outcome: 'resolved', event_errors: log.errors };
}
