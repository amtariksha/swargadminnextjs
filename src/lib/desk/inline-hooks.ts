// Desk inline accelerators (unit P1c). The two webhooks, chat/send and the old-inbox conversation
// PATCH call these right after their own write, so a ticket opens, links, records its first reply
// or closes in the same request instead of one tick later. Every exported function never throws,
// resolves within DESK_INLINE_BUDGET_MS, does nothing unless desk_engine_enabled and
// desk_inline_hooks are both '1', and skips internal contacts. The tick stays the source of truth:
// the hooks reuse the engine's conditional writes (plus I4 / I13 of the engine contract), so a hook
// that is cut short, races the tick or runs twice leaves nothing to undo.

import { LEGACY_INBOX_ACTOR } from './constants';
import { DESK_MESSAGE_COLUMNS, isHumanReply } from './clock';
import {
    attachInbound, deriveAndWrite, emitEvent, resolveBySystem,
    type AttachOutcome, type ConversationContext, type EngineContext, type EventLog,
} from './engine';
import { buildInternalMatcher, type InternalMatcher } from './internal-contacts';
import { phoneVariants } from './phone';
import {
    DESK_QUERY_TIMEOUT_MS, classifyDeskDbError, reportNotInstalled, wholeSeconds,
    type DeskDb, type DeskRepo, type EngineCategory, type MessageRow,
} from './repo';
import { getDeskSettings } from './settings';
import { resolveWhoami } from './whoami';
import type { DeskActor, DeskSettings, IsoDateTime, StaffId } from './types';

export const DESK_INLINE_BUDGET_MS = 1500;

/** Tick step 4a mirrors an old-inbox resolve only this long after the last customer message (lifecycle.ts). */
const MIRROR_QUIET_MS = 120_000;
const INBOUND_LOOKBACK_MS = 10 * 60_000;
const INBOUND_SCAN_LIMIT = 50;
const INBOUND_ATTACH_MAX = 5;
const LOG_WINDOW_MS = 60_000;
const LOG_KEY_LIMIT = 100;
const BEARER_PREFIX = 'Bearer ';
const KEEP_GOING: ReadonlySet<AttachOutcome> = new Set<AttachOutcome>(['created', 'appended', 'reopened', 'ack_attached', 'noop']);

// ── The few statements the engine repository does not have ─────────────────

export interface InlineStore {
    readMessage(messageId: string): Promise<DeskDb<MessageRow | null>>;
    /** I4: write once, filter first_response_at IS NULL. */
    writeFirstResponse(ticketId: string, values: {
        first_response_at: IsoDateTime; first_response_message_id: string; first_response_source: 'panel'; first_response_by: StaffId;
    }): Promise<DeskDb<number>>;
    /** I13: unresolved and unassigned only. */
    autoAssign(ticketId: string, values: { assigned_to: StaffId; assigned_name: string | null; assigned_at: IsoDateTime }): Promise<DeskDb<number>>;
    readAssignment(conversationId: string): Promise<DeskDb<{ id: string; assigned_to: StaffId | null } | null>>;
    /** Old-inbox assign copied to the ticket, pinned to the assignee read just before. */
    mirrorAssignment(ticketId: string, readAssignedTo: StaffId | null, values: {
        assigned_to: StaffId | null; assigned_name: string | null; assigned_at: IsoDateTime | null;
    }): Promise<DeskDb<number>>;
}

type PgResult = { data: unknown; error: { code?: string | null; message?: string | null } | null };

async function runQuery<T>(
    table: string, runSignal: AbortSignal, query: (signal: AbortSignal) => PromiseLike<PgResult>, pick: (data: unknown) => T,
): Promise<DeskDb<T>> {
    try {
        const { data, error } = await query(AbortSignal.any([AbortSignal.timeout(DESK_QUERY_TIMEOUT_MS), runSignal]));
        const outcome = classifyDeskDbError(error);
        if (outcome === 'ok') return { outcome: 'ok', data: pick(data) };
        if (outcome === 'not_installed') reportNotInstalled(table, error?.code ?? '');
        return { outcome, data: null };
    } catch (thrown) {
        const outcome = classifyDeskDbError(thrown instanceof Error ? thrown : { message: String(thrown) });
        return { outcome: outcome === 'ok' ? 'error' : outcome, data: null };
    }
}

const countOf = (data: unknown): number => (Array.isArray(data) ? data.length : 0);
const oneOf = <T>(data: unknown): T | null => (data === null || data === undefined ? null : (data as T));

export async function createSupabaseInlineStore(runSignal: AbortSignal): Promise<InlineStore> {
    // Imported on demand so that the tests of this module never load the Supabase client.
    const { supabaseAdmin } = await import('@/lib/whatsapp/supabase');
    const tickets = () => supabaseAdmin.from('desk_tickets');
    return {
        readMessage: (messageId) => runQuery('messages', runSignal, (signal) => supabaseAdmin
            .from('messages').select(DESK_MESSAGE_COLUMNS).eq('id', messageId)
            .limit(1).abortSignal(signal).maybeSingle(), (data) => oneOf<MessageRow>(data)),
        writeFirstResponse: (ticketId, values) => runQuery('desk_tickets', runSignal, (signal) => tickets()
            .update(values).eq('id', ticketId).is('first_response_at', null)
            .select('id').abortSignal(signal), countOf),
        autoAssign: (ticketId, values) => runQuery('desk_tickets', runSignal, (signal) => tickets()
            .update(values).eq('id', ticketId).neq('status', 'resolved').is('assigned_to', null)
            .select('id').abortSignal(signal), countOf),
        readAssignment: (conversationId) => runQuery('desk_tickets', runSignal, (signal) => tickets()
            .select('id, assigned_to').eq('conversation_id', conversationId).neq('status', 'resolved')
            .limit(1).abortSignal(signal).maybeSingle(), (data) => oneOf<{ id: string; assigned_to: StaffId | null }>(data)),
        mirrorAssignment: (ticketId, readAssignedTo, values) => runQuery('desk_tickets', runSignal, (signal) => {
            const base = tickets().update(values).eq('id', ticketId).neq('status', 'resolved');
            const pinned = readAssignedTo === null ? base.is('assigned_to', null) : base.eq('assigned_to', readAssignedTo);
            return pinned.select('id').abortSignal(signal);
        }, countOf),
    };
}

// ── Budget, gate and shared context ────────────────────────────────────────

export interface InlineHookDeps {
    repoFor?: (signal: AbortSignal) => DeskRepo | Promise<DeskRepo>;
    storeFor?: (signal: AbortSignal) => InlineStore | Promise<InlineStore>;
    settings?: () => Promise<DeskSettings>;
    now?: () => Date;
    budgetMs?: number;
}

type HookName = 'inbound' | 'outbound' | 'conversation_patch' | 'actor';

const loggedAt = new Map<string, number>();

/** One line per key per minute per server instance. Never logs a phone number, a body or a token. */
function logOnce(key: string, line: string): void {
    const nowMs = Date.now();
    const last = loggedAt.get(key);
    if (last !== undefined && nowMs - last < LOG_WINDOW_MS) return;
    if (loggedAt.size >= LOG_KEY_LIMIT) loggedAt.clear();
    loggedAt.set(key, nowMs);
    console.warn(line);
}

/** Runs `work` with a signal that aborts at the budget, and resolves by then with `fallback` at the latest. */
async function withinBudget<T>(name: HookName, budgetMs: number, fallback: T, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = new Promise<T>((resolve) => {
        timer = setTimeout(() => {
            controller.abort();
            logOnce(`${name}|budget`, `[desk-inline] ${name} stopped at the ${budgetMs} ms budget`);
            resolve(fallback);
        }, budgetMs);
    });
    const guarded = Promise.resolve()
        .then(() => work(controller.signal))
        .catch((error: unknown) => {
            logOnce(`${name}|error`, `[desk-inline] ${name} failed ${error instanceof Error ? error.name : 'Error'}`);
            return fallback;
        });
    try {
        return await Promise.race([guarded, stop]);
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
}

const hooksOn = (settings: DeskSettings): boolean => settings.readable && settings.engine_enabled && settings.inline_hooks;

async function defaultRepo(signal: AbortSignal): Promise<DeskRepo> {
    const { createSupabaseDeskRepo } = await import('./repo-supabase');
    return createSupabaseDeskRepo({ runSignal: signal });
}

/** null = the flags could not be read: the caller leaves the conversation to the tick. */
async function matcherFor(repo: DeskRepo, settings: DeskSettings): Promise<InternalMatcher | null> {
    const flags = await repo.readContactFlags();
    if (flags.outcome === 'not_installed') return buildInternalMatcher({ staffPhones: settings.staff_phones, flags: [] });
    if (flags.outcome !== 'ok') return null;
    return buildInternalMatcher({ staffPhones: settings.staff_phones, flags: flags.data });
}

function engineContext(repo: DeskRepo, settings: DeskSettings, now: Date, internal: InternalMatcher, signal: AbortSignal): EngineContext {
    let memo: Promise<readonly EngineCategory[]> | null = null;
    const categories = (): Promise<readonly EngineCategory[]> => {
        memo ??= repo.listActiveCategories().then((read) => {
            if (read.outcome !== 'ok') throw new Error(`categories ${read.outcome}`);
            return read.data;
        });
        return memo;
    };
    return { repo, now, settings, categories, expired: () => signal.aborted, internal };
}

/** Same as tick.ts memoisedKnownCustomer (not exported there): one lookup, a failure means "not known". */
function knownCustomer(repo: DeskRepo, phone: string | null | undefined): ConversationContext['known'] {
    let lookup: Promise<{ backend_user_id: number } | null> | null = null;
    return () => {
        lookup ??= (async () => {
            const variants = phoneVariants(phone);
            if (variants.length === 0) return null;
            const found = await repo.findKnownCustomer(variants);
            return found.outcome === 'ok' ? found.data : null;
        })();
        return lookup;
    };
}

interface Opened { settings: DeskSettings; repo: DeskRepo; now: Date }

/** Settings first (cached 30 s), so a switched-off Desk costs no query at all. */
async function openHook(deps: InlineHookDeps, signal: AbortSignal): Promise<Opened | null> {
    const settings = await (deps.settings ?? getDeskSettings)();
    if (!hooksOn(settings)) return null;
    const repo = await (deps.repoFor ?? defaultRepo)(signal);
    return { settings, repo, now: (deps.now ?? (() => new Date()))() };
}

const eventActor = (actor: DeskActor): { id: string; name: string } => ({ id: actor.id, name: actor.name ?? actor.id });

// ── deskInboundHook: webhooks, after the inbound message insert ───────────

/**
 * messageId null = this conversation's inbound messages of the last 10 minutes that have no
 * ticket yet, oldest first, at most 5 (the webhooks do not get the inserted row's id back).
 */
export async function deskInboundHook(
    input: { conversationId: string; messageId: string | null }, deps: InlineHookDeps = {},
): Promise<void> {
    await withinBudget('inbound', deps.budgetMs ?? DESK_INLINE_BUDGET_MS, undefined, (signal) => runInbound(input, deps, signal));
}

async function runInbound(input: { conversationId: string; messageId: string | null }, deps: InlineHookDeps, signal: AbortSignal): Promise<void> {
    const opened = await openHook(deps, signal);
    const goLiveAt = opened?.settings.go_live_at ?? null;
    if (opened === null || goLiveAt === null) return;
    const { settings, repo, now } = opened;
    const fromIso = new Date(now.getTime() - INBOUND_LOOKBACK_MS).toISOString();
    const [found, internal, listed] = await Promise.all([
        repo.getConversation(input.conversationId),
        matcherFor(repo, settings),
        repo.listConversationMessages(input.conversationId, fromIso, INBOUND_SCAN_LIMIT, 0),
    ]);
    if (found.outcome !== 'ok' || found.data === null || internal === null || listed.outcome !== 'ok') return;
    if (internal.isInternal(found.data.contacts?.phone)) return;
    const goLiveMs = Date.parse(goLiveAt);
    const todo = listed.data.filter((message) => message.direction === 'inbound' && message.ticket_id === null
        && Date.parse(message.created_at) > goLiveMs
        && (input.messageId === null || message.id === input.messageId)).slice(0, INBOUND_ATTACH_MAX);
    const ctx = engineContext(repo, settings, now, internal, signal);
    const conv: ConversationContext = { conversation: found.data, known: knownCustomer(repo, found.data.contacts?.phone) };
    for (const message of todo) {
        if (signal.aborted) return;
        const result = await attachInbound(ctx, conv, message, 'inline');   // T2b part 1 (planner D-8)
        if (!KEEP_GOING.has(result.outcome)) return;
    }
}

// ── deskOutboundHook: chat/send, after the message insert and the sent_by_* write ──

export async function deskOutboundHook(
    input: { conversationId: string; messageId: string; actor: DeskActor | null }, deps: InlineHookDeps = {},
): Promise<void> {
    await withinBudget('outbound', deps.budgetMs ?? DESK_INLINE_BUDGET_MS, undefined, (signal) => runOutbound(input, deps, signal));
}

async function runOutbound(
    input: { conversationId: string; messageId: string; actor: DeskActor | null }, deps: InlineHookDeps, signal: AbortSignal,
): Promise<void> {
    const opened = await openHook(deps, signal);
    if (opened === null) return;
    const { settings, repo, now } = opened;
    const [found, internal, unresolved] = await Promise.all([
        repo.getConversation(input.conversationId),
        matcherFor(repo, settings),
        repo.getUnresolvedTicket(input.conversationId),
    ]);
    if (found.outcome !== 'ok' || found.data === null || internal === null) return;
    if (internal.isInternal(found.data.contacts?.phone)) return;
    if (unresolved.outcome !== 'ok' || unresolved.data === null) return;
    const ctx = engineContext(repo, settings, now, internal, signal);
    if (input.actor !== null) {
        const store = await (deps.storeFor ?? createSupabaseInlineStore)(signal);
        await attributeReply(ctx, store, { ...input, actor: input.actor, ticketId: unresolved.data.id });
    }
    await deriveAndWrite(ctx, unresolved.data.id);
}

/** I4, then I13: the two writes the tick can never make, because it does not know who sent a reply. */
async function attributeReply(
    ctx: EngineContext, store: InlineStore,
    input: { conversationId: string; messageId: string; actor: DeskActor; ticketId: string },
): Promise<void> {
    const [read, clock] = await Promise.all([store.readMessage(input.messageId), ctx.repo.getTicketClock(input.ticketId)]);
    if (read.outcome !== 'ok' || read.data === null || clock.outcome !== 'ok' || clock.data === null) return;
    const message = read.data;
    if (message.conversation_id !== input.conversationId || message.source !== 'webapp' || !isHumanReply(message)) return;
    const { actor, ticketId } = input;
    const log: EventLog = { errors: 0 };
    const openedAt = clock.data.opened_at;
    if (clock.data.first_response_at === null && Date.parse(message.created_at) >= Date.parse(openedAt)) {
        const written = await store.writeFirstResponse(ticketId, {
            first_response_at: message.created_at, first_response_message_id: message.id,
            first_response_source: 'panel', first_response_by: actor.id,
        });
        if (written.outcome === 'ok' && written.data === 1) {
            await emitEvent(ctx, log, {
                ticketId, type: 'first_response', from: null, to: null, actor: eventActor(actor),
                data: { message_id: message.id, source: 'panel', by: actor.id, secs_since_open: wholeSeconds(openedAt, Date.parse(message.created_at)) },
            });
        }
    }
    const assigned = await store.autoAssign(ticketId, { assigned_to: actor.id, assigned_name: actor.name, assigned_at: ctx.now.toISOString() });
    if (assigned.outcome === 'ok' && assigned.data === 1) {
        await emitEvent(ctx, log, {
            ticketId, type: 'assigned', from: null, to: null, actor: eventActor(actor),
            data: { from: null, to: actor.id, to_name: actor.name, auto: true },
        });
    }
}

// ── deskConversationPatchHook: old-inbox PATCH, after a successful update ──

export async function deskConversationPatchHook(
    input: { conversationId: string; status?: 'open' | 'resolved'; assignedTo?: string | null; assignedName?: string | null },
    deps: InlineHookDeps = {},
): Promise<void> {
    // Mark-as-read and re-open PATCHes are the common case: no setting read, no query.
    if (input.status !== 'resolved' && input.assignedTo === undefined) return;
    await withinBudget('conversation_patch', deps.budgetMs ?? DESK_INLINE_BUDGET_MS, undefined, (signal) => runPatch(input, deps, signal));
}

async function runPatch(
    input: { conversationId: string; status?: 'open' | 'resolved'; assignedTo?: string | null; assignedName?: string | null },
    deps: InlineHookDeps, signal: AbortSignal,
): Promise<void> {
    const opened = await openHook(deps, signal);
    if (opened === null) return;
    const { settings, repo, now } = opened;
    const [found, internal] = await Promise.all([repo.getConversation(input.conversationId), matcherFor(repo, settings)]);
    if (found.outcome !== 'ok' || found.data === null || internal === null) return;
    if (internal.isInternal(found.data.contacts?.phone)) return;
    const ctx = engineContext(repo, settings, now, internal, signal);
    if (input.assignedTo !== undefined) {
        const store = await (deps.storeFor ?? createSupabaseInlineStore)(signal);
        await mirrorAssign(ctx, store, input.conversationId, input.assignedTo, input.assignedName ?? null);
    }
    if (input.status === 'resolved') await mirrorResolve(ctx, input.conversationId);
}

async function mirrorAssign(
    ctx: EngineContext, store: InlineStore, conversationId: string, assignedTo: string | null, assignedName: string | null,
): Promise<void> {
    const read = await store.readAssignment(conversationId);
    if (read.outcome !== 'ok' || read.data === null || read.data.assigned_to === assignedTo) return;
    const values = assignedTo === null
        ? { assigned_to: null, assigned_name: null, assigned_at: null }
        : { assigned_to: assignedTo, assigned_name: assignedName, assigned_at: ctx.now.toISOString() };
    const written = await store.mirrorAssignment(read.data.id, read.data.assigned_to, values);
    if (written.outcome !== 'ok' || written.data !== 1) return;
    await emitEvent(ctx, { errors: 0 }, {
        ticketId: read.data.id, type: 'assigned', from: null, to: null, actor: LEGACY_INBOX_ACTOR,
        data: { from: read.data.assigned_to, to: assignedTo, to_name: values.assigned_name, auto: false },
    });
}

/** Tick step 4a for one conversation, now: same guards (U1 manual rule, 120 s quiet), same I6b mirror guard. */
async function mirrorResolve(ctx: EngineContext, conversationId: string): Promise<void> {
    const unresolved = await ctx.repo.getUnresolvedTicket(conversationId);
    if (unresolved.outcome !== 'ok' || unresolved.data === null) return;
    const clock = await ctx.repo.getTicketClock(unresolved.data.id);
    if (clock.outcome !== 'ok' || clock.data === null || clock.data.status === 'resolved') return;
    const ticket = clock.data;
    if (ticket.origin === 'manual' && ticket.last_inbound_at === null) return;
    if (ticket.last_inbound_at !== null && ctx.now.getTime() - Date.parse(ticket.last_inbound_at) < MIRROR_QUIET_MS) return;
    await resolveBySystem(ctx, {
        id: ticket.id, status: ticket.status, category_slug: unresolved.data.category_slug, awaiting_reply_since: ticket.awaiting_reply_since,
    }, 'legacy_inbox', { kind: 'mirror', readLastInboundAt: ticket.last_inbound_at });
}

// ── resolveInlineActor: chat/send, the sender for sent_by_* and the outbound hook ──

/**
 * The caller's identity from the backend whoami (the cache Desk and the inbox gate share), never
 * from x-user-* headers or the body. Used only as a label, so a stale-on-error answer is accepted
 * for any caller (`() => true`). null on no token, a rejected token, an unreachable backend or the budget.
 */
export async function resolveInlineActor(authorization: string | null, deps: Pick<InlineHookDeps, 'budgetMs'> = {}): Promise<DeskActor | null> {
    const token = authorization !== null && authorization.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : '';
    if (token === '') return null;
    return withinBudget<DeskActor | null>('actor', deps.budgetMs ?? DESK_INLINE_BUDGET_MS, null, async () => {
        const result = await resolveWhoami(token, () => true);
        return result.kind === 'ok' ? result.whoami.user : null;
    });
}
