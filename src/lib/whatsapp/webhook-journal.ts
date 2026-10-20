// Inbound journal for both WhatsApp webhooks (P1d, migration 017c): one webhook_debug row per call,
// written before processing ('received' / 'rejected') and closed with the outcome the route itself
// reported. The replay route feeds failed or unfinished rows back through the same handlers. Never
// blocks a webhook: writes give up after 1.5 s, the journal turns itself off for 10 minutes when
// 017c is missing, and a failure before processing falls back to pre-P1d behaviour (accept, no row).

import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase";
import type { AuthVerdict } from "./webhook-auth";

export type WebhookProvider = "msg91" | "meta";
export type JournalStatus = "received" | "processed" | "skipped" | "failed" | "rejected" | "replaying" | "abandoned";
export interface JournalOutcome { status: "processed" | "skipped" | "failed"; outcome: string }
export interface JournalRow {
    id: number; provider: string; payload: unknown; journal_status: JournalStatus | null;
    outcome: string | null; replay_count: number; last_replay_at: string | null; created_at: string;
}
export type RowDecision = "replay" | "wait" | "abandon_no_provider_id" | "abandon_status_only" | "abandon_unparseable";

export const NOT_STORED_OUTCOMES = ["contact_upsert_failed", "conversation_create_failed", "message_insert_failed"] as const;
export const SKIP_TYPES = ["duplicate_skipped", "echo_no_recipient"] as const;
export const REPLAY_MIN_AGE_MS = 120_000;         // a live call is never replayed
export const REPLAY_STALE_CLAIM_MS = 300_000;     // a crashed replay is retried
export const REPLAY_WINDOW_MS = 48 * 3_600_000;
export const REPLAY_MAX_ATTEMPTS = 3;
export const REPLAY_BATCH = 50;
export const REPLAY_BUDGET_MS = 45_000;

const TABLE = "webhook_debug";
const OPEN_STATUSES: readonly JournalStatus[] = ["received", "failed", "replaying"];
const WRITE_TIMEOUT_MS = 1_500, REPLAY_WRITE_TIMEOUT_MS = 5_000, SCAN_TIMEOUT_MS = 8_000;
const QUIET_MS = 10 * 60_000, KEEP_MS = 7 * 24 * 3_600_000;   // journal-off period and prune interval; retention
/** 017c not applied (column/table missing, schema cache stale) or the key has no grant. */
const NOT_INSTALLED_CODES = new Set(["42703", "PGRST204", "PGRST205", "42P01", "42501"]);
const STATUS_WORDS = ["sent", "delivered", "read", "failed"];
const MSG91_BODY_FIELDS = ["content", "message", "text", "body"];
const MSG91_DEDUP_ID = /^[A-Za-z0-9._:-]+$/;      // the only ids the MSG91 route's id dedup matches; others could store twice

const replayContext = new AsyncLocalStorage<{ journalId: number }>();
const journalContext = new AsyncLocalStorage<{ journalId: number | null; direction: string | null }>();
let disabledUntil = 0;
let lastPruneAt: number | null = null;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const nonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0;
const errorName = (err: unknown): string => (err instanceof Error ? err.name : "Error");
const codeOf = (error: unknown): string => String((error as { code?: unknown } | null)?.code || "unknown");
const includes = (list: readonly string[], value: unknown): boolean => typeof value === "string" && list.includes(value);
const timeout = (ms: number): AbortSignal => AbortSignal.timeout(ms);

export function outcomeFromResponseBody(body: unknown, httpStatus: number): JournalOutcome {
    if (httpStatus >= 500) return { status: "failed", outcome: `http_${httpStatus}` };
    if (!isObject(body)) return { status: "processed", outcome: "ok" };
    if (body.error_logged === true) return { status: "failed", outcome: "unhandled_error" };
    const { skipped, type } = body;
    if (typeof skipped === "string") return { status: includes(NOT_STORED_OUTCOMES, skipped) ? "failed" : "skipped", outcome: skipped };
    if (typeof type === "string") return { status: includes(SKIP_TYPES, type) ? "skipped" : "processed", outcome: type };
    if (typeof body.conversationId === "string") return { status: "processed", outcome: "stored" };
    return { status: "processed", outcome: "ok" };
}

function metaValue(payload: Json): Json | null {
    const entry = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
    const change = isObject(entry) && Array.isArray(entry.changes) ? entry.changes[0] : undefined;
    return isObject(change) && isObject(change.value) ? change.value : null;
}

function firstId(list: unknown): string | null {
    const first = Array.isArray(list) ? list[0] : undefined;
    return isObject(first) && typeof first.id === "string" && first.id !== "" ? first.id : null;
}

export function providerMessageId(provider: WebhookProvider, payload: unknown): string | null {
    if (!isObject(payload)) return null;
    const msg91Id = String(payload.uuid ?? payload.requestId ?? "").trim();
    if (provider === "msg91") return MSG91_DEDUP_ID.test(msg91Id) ? msg91Id : null;
    const value = metaValue(payload);
    return value === null ? null : (firstId(value.messages) ?? firstId(value.statuses));
}

export function isStatusOnlyPayload(provider: WebhookProvider, payload: unknown): boolean {
    if (!isObject(payload)) return false;
    const value = provider === "meta" ? metaValue(payload) : null;
    if (provider === "meta") return value !== null && nonEmptyArray(value.statuses) && !nonEmptyArray(value.messages);
    const isStatusEvent = String(payload.webhookType ?? "") === "3"
        || STATUS_WORDS.includes(String(payload.status ?? "").toLowerCase())
        || STATUS_WORDS.includes(String(payload.eventName ?? payload.event ?? "").toLowerCase());
    return isStatusEvent && MSG91_BODY_FIELDS.every((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
}

export function decideJournalRow(row: JournalRow, now: Date): RowDecision {
    if (row.provider !== "msg91" && row.provider !== "meta") return "wait";
    const provider: WebhookProvider = row.provider;
    const age = now.getTime() - Date.parse(row.created_at);
    if (row.replay_count >= REPLAY_MAX_ATTEMPTS || !includes(OPEN_STATUSES, row.journal_status)
        || !(age >= REPLAY_MIN_AGE_MS) || age > REPLAY_WINDOW_MS) return "wait";
    if (row.journal_status === "replaying" && row.last_replay_at !== null
        && now.getTime() - Date.parse(row.last_replay_at) < REPLAY_STALE_CLAIM_MS) return "wait";
    if (isObject(row.payload) && row.payload._unparseable === true) return "abandon_unparseable";
    if (row.journal_status === "failed" && includes(NOT_STORED_OUTCOMES, row.outcome)) return "replay";
    if (isStatusOnlyPayload(provider, row.payload)) return "abandon_status_only";
    if (providerMessageId(provider, row.payload) === null) return "abandon_no_provider_id";
    return "replay";
}

export function parseJournalPayload(rawBody: string): unknown {
    try { return JSON.parse(rawBody); } catch { return { _unparseable: true, raw: rawBody.slice(0, 4000) }; }
}

const journalDisabled = (): boolean => Date.now() < disabledUntil;

function noteWriteError(what: string, code: string): void {
    if (!NOT_INSTALLED_CODES.has(code)) {
        console.error(`[webhook-journal] journal ${what} failed code=${code}`);
    } else if (!journalDisabled()) {
        disabledUntil = Date.now() + QUIET_MS;
        console.error(`[webhook-journal] journal unavailable (017c not applied or no grant) code=${code}`);
    }
}

async function pruneOldRows(): Promise<void> {
    const now = Date.now();
    if (lastPruneAt !== null && now - lastPruneAt < QUIET_MS) return;
    lastPruneAt = now;
    try {
        await supabaseAdmin.from(TABLE).delete().lt("created_at", new Date(now - KEEP_MS).toISOString()).abortSignal(timeout(WRITE_TIMEOUT_MS));
    } catch (err) {
        console.error(`[webhook-journal] prune failed ${errorName(err)}`);
    }
}

async function journalOpen(provider: WebhookProvider, payload: unknown, verdict: AuthVerdict): Promise<number | null> {
    if (process.env.WA_WEBHOOK_DEBUG === "false" || journalDisabled()) return null;
    await pruneOldRows();
    try {
        const { data, error } = await supabaseAdmin.from(TABLE).insert({
            provider, payload, journal_status: verdict.accept ? "received" : "rejected", auth_result: verdict.result,
            outcome: verdict.accept ? null : `auth_${verdict.result}`, processed_at: verdict.accept ? null : new Date().toISOString(),
        }).select("id").abortSignal(timeout(WRITE_TIMEOUT_MS)).single();
        if (error) noteWriteError("insert", codeOf(error));
        const id = Number((data as { id?: unknown } | null)?.id);
        return !error && Number.isSafeInteger(id) ? id : null;
    } catch (err) {
        console.error(`[webhook-journal] journal insert failed ${errorName(err)}`);
        return null;
    }
}

async function journalClose(journalId: number, outcome: JournalOutcome, direction: string | null): Promise<void> {
    try {
        const { error } = await supabaseAdmin.from(TABLE).update({
            journal_status: outcome.status, outcome: outcome.outcome, processed_at: new Date().toISOString(),
            ...(direction ? { classified_direction: direction } : {}),
        }).eq("id", journalId).select("id").abortSignal(timeout(WRITE_TIMEOUT_MS));
        if (error) noteWriteError("update", codeOf(error));
    } catch (err) {
        console.error(`[webhook-journal] journal update failed ${errorName(err)}`);
    }
}

/** The response's JSON body without consuming it, or null. */
const readJson = (response: Response): Promise<unknown> => Promise.resolve().then(() => response.clone().json()).catch(() => null);

/** Called by the handler once it knows the direction; true when the journal row will carry it. */
export function noteClassifiedDirection(direction: string): boolean {
    const store = journalContext.getStore();
    if (typeof store?.journalId !== "number") return false;
    store.direction = direction;
    return true;
}

interface WebhookSpec {
    provider: WebhookProvider;
    request: NextRequest;
    authenticate: (request: NextRequest, rawBody: string) => Promise<AuthVerdict>;
    reject: (verdict: AuthVerdict) => NextResponse;
    process: (request: NextRequest) => Promise<NextResponse>;
}

/** Auth + journal row for a live call; `rejected` is the reply when the caller failed auth. */
async function admit(spec: WebhookSpec): Promise<{ journalId: number | null; rejected: NextResponse | null }> {
    let verdict: AuthVerdict;
    let journalId: number | null;
    try {
        const rawBody = await spec.request.clone().text();
        verdict = await spec.authenticate(spec.request, rawBody);
        journalId = await journalOpen(spec.provider, parseJournalPayload(rawBody), verdict);
    } catch (err) {
        // Fail open: behave as before P1d (accept, no journal row).
        console.error(`[webhook-journal] ${spec.provider} pre-processing failed ${errorName(err)}`);
        return { journalId: null, rejected: null };
    }
    if (verdict.accept) return { journalId, rejected: null };
    console.warn(`[${spec.provider} webhook] auth=${verdict.result}: request dropped`);
    return { journalId, rejected: spec.reject(verdict) };
}

export async function runJournaledWebhook(spec: WebhookSpec): Promise<NextResponse> {
    const replay = replayContext.getStore();
    let journalId: number | null = replay ? replay.journalId : null;
    if (!replay) {
        const admitted = await admit(spec);
        if (admitted.rejected) return admitted.rejected;
        journalId = admitted.journalId;
    }
    const store: { journalId: number | null; direction: string | null } = { journalId, direction: null };
    let response: NextResponse;
    let forced: JournalOutcome | null = null;
    try {
        response = await journalContext.run(store, () => spec.process(spec.request));
    } catch (err) {
        console.error(`[webhook-journal] ${spec.provider} handler threw ${errorName(err)}`);
        response = NextResponse.json({ received: true, error_logged: true }, { status: 200 });
        forced = { status: "failed", outcome: "unhandled_error" };
    }
    if (journalId !== null) await journalClose(journalId, forced ?? outcomeFromResponseBody(await readJson(response), response.status), store.direction);
    return response;
}

export class JournalNotInstalledError extends Error {}
export interface ReplayResult { scanned: number; replayed: number; failed: number }
type Handlers = Record<WebhookProvider, (request: NextRequest) => Promise<Response>>;

async function scanPending(now: Date): Promise<JournalRow[]> {
    const { data, error } = await supabaseAdmin.from(TABLE)
        .select("id, provider, payload, journal_status, outcome, replay_count, last_replay_at, created_at")
        .in("journal_status", [...OPEN_STATUSES]).lt("replay_count", REPLAY_MAX_ATTEMPTS)
        .gte("created_at", new Date(now.getTime() - REPLAY_WINDOW_MS).toISOString())
        .lt("created_at", new Date(now.getTime() - REPLAY_MIN_AGE_MS).toISOString())
        .order("created_at", { ascending: true }).limit(REPLAY_BATCH).abortSignal(timeout(SCAN_TIMEOUT_MS));
    if (!error) return (data ?? []) as JournalRow[];
    if (NOT_INSTALLED_CODES.has(codeOf(error))) throw new JournalNotInstalledError("Migration 017c is not applied.");
    throw new Error("journal scan failed");
}

/** Conditional on the row still being open (and, for a claim, on the replay_count we read). */
async function updateOpenRow(row: JournalRow, patch: Json, claim: boolean): Promise<boolean> {
    try {
        const byId = supabaseAdmin.from(TABLE).update(patch).eq("id", row.id);
        const query = claim ? byId.eq("replay_count", row.replay_count) : byId;
        const { data, error } = await query.in("journal_status", [...OPEN_STATUSES]).select("id").abortSignal(timeout(REPLAY_WRITE_TIMEOUT_MS));
        if (error) console.error(`[webhook-journal] replay update failed row=${row.id} code=${codeOf(error)}`);
        return !error && Array.isArray(data) && data.length > 0;
    } catch (err) {
        console.error(`[webhook-journal] replay update failed row=${row.id} ${errorName(err)}`);
        return false;
    }
}

async function replayRow(row: JournalRow, handlers: Handlers, now: Date): Promise<"replayed" | "failed" | "skipped"> {
    const claim = { journal_status: "replaying", replay_count: row.replay_count + 1, last_replay_at: now.toISOString() };
    if (!(await updateOpenRow(row, claim, true))) return "skipped";   // another run has it
    const provider = row.provider as WebhookProvider;
    const request = new NextRequest(`http://localhost/api/whatsapp/webhooks/${provider}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(row.payload),
    });
    try {
        // The handler's own runJournaledWebhook closes the row (replayContext carries its id).
        const response = await replayContext.run({ journalId: row.id }, () => handlers[provider](request));
        return outcomeFromResponseBody(await readJson(response), response.status).status === "failed" ? "failed" : "replayed";
    } catch (err) {
        console.error(`[webhook-journal] replay of row ${row.id} threw ${errorName(err)}`);
        return "failed";
    }
}

export async function replayJournal(input: {
    handlers: Handlers;
    now?: () => Date;                 // default () => new Date()
    budgetMs?: number;                // default REPLAY_BUDGET_MS
}): Promise<ReplayResult> {            // throws JournalNotInstalledError when 017c is missing
    const now = input.now ?? (() => new Date());
    const budgetMs = input.budgetMs ?? REPLAY_BUDGET_MS;
    const startedAt = Date.now();
    const rows = await scanPending(now());
    let replayed = 0, failed = 0, abandoned = 0;
    for (const row of rows) {
        if (Date.now() - startedAt >= budgetMs) break;
        const at = now();
        const decision = decideJournalRow(row, at);
        if (decision === "replay") {
            const result = await replayRow(row, input.handlers, at);
            if (result === "replayed") replayed += 1;
            if (result === "failed") failed += 1;
        } else if (decision !== "wait") {
            const patch = { journal_status: "abandoned", outcome: decision.replace(/^abandon_/, ""), processed_at: at.toISOString() };
            if (await updateOpenRow(row, patch, false)) abandoned += 1;
        }
    }
    console.log(`[webhook-journal] replay scanned=${rows.length} replayed=${replayed} failed=${failed} abandoned=${abandoned}`);
    return { scanned: rows.length, replayed, failed };
}

/** Tests only. */
export function clearWebhookJournalState(): void {
    disabledUntil = 0;
    lastPruneAt = null;
}
