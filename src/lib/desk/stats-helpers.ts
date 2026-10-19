// Pure helpers behind GET /api/desk/stats and GET /api/desk/review: query validation, the
// epoch rule, the time a ticket spent waiting, repeat-complainer grouping and a few predicates
// shared by both reports. Medians, percentiles, rates and business seconds are imported from
// stats.ts and business-hours.ts, never re-written here. No I/O, no clock.

import { z } from 'zod';
import {
    HUMAN_RESOLVED_VIA, NON_INBOUND_ORIGINS, REPEAT_COMPLAINER_MIN, STATS_EXCLUDED_CATEGORIES, STATS_MAX_DAYS,
} from './constants';
import type { Queue } from './constants';
import { statsQuery } from './contracts';
import type { DeskDbOutcome } from './repo';
import type { DeskSettings, IstDate, IsoDateTime, RepeatComplainer, Ticket } from './types';

const MS_PER_DAY = 86_400_000;
const MAX_REPEAT_COMPLAINERS = 50;

// ── Settings: the first instant Desk numbers may count ─────────────────────

type EpochSettings = Pick<DeskSettings, 'stats_from' | 'go_live_at'>;

/** stats_from, else go_live_at; a value Date.parse cannot read counts as missing. */
export function epochOf(settings: EpochSettings): IsoDateTime | null {
    for (const candidate of [settings.stats_from, settings.go_live_at]) {
        if (typeof candidate === 'string' && Number.isFinite(Date.parse(candidate))) return candidate;
    }
    return null;
}

/** The later of two instants as an ISO string in UTC, safe to put in a PostgREST filter. */
export function lowerOf(instant: string, epoch: string): IsoDateTime {
    return new Date(Math.max(Date.parse(instant), Date.parse(epoch))).toISOString();
}

export function isAtOrAfter(instant: string | null, epoch: string): boolean {
    return instant !== null && Date.parse(instant) >= Date.parse(epoch);
}

// ── Shared predicates ──────────────────────────────────────────────────────

export const isHumanVia = (via: string | null | undefined): boolean =>
    (HUMAN_RESOLVED_VIA as readonly string[]).includes(via ?? '');

/** NULL-safe: a ticket with no resolution code is still counted. */
export const isNotDuplicateOrSpam = (code: string | null): boolean => code !== 'duplicate' && code !== 'spam';

/** internal, spam and wrong_number tickets are left out of volume, timing, waiting and the review (plan section 8). */
export const isStatsExcluded = (categorySlug: string | null): boolean =>
    categorySlug !== null && (STATS_EXCLUDED_CATEGORIES as readonly string[]).includes(categorySlug);

export const isInboundOrigin = (origin: string): boolean => !(NON_INBOUND_ORIGINS as readonly string[]).includes(origin);

export function isHumanResolved(ticket: Pick<Ticket, 'resolved_via' | 'prior_resolution'>): boolean {
    return isHumanVia(ticket.resolved_via) || isHumanVia(ticket.prior_resolution?.resolved_via);
}

/** The population of the resolution-time metrics: resolved by a person, not a manual or backfill ticket. */
export function isResolutionCandidate(
    ticket: Pick<Ticket, 'status' | 'resolved_at' | 'resolved_via' | 'origin'>,
): boolean {
    return ticket.status === 'resolved' && ticket.resolved_at !== null
        && isHumanVia(ticket.resolved_via) && isInboundOrigin(ticket.origin);
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Compare two dimension keys: numbers numerically, text by code unit, null last. */
export function compareKeys(a: string | null, b: string | null): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    const bothNumeric = /^\d+$/.test(a) && /^\d+$/.test(b);
    if (bothNumeric) return Number(a) - Number(b);
    return a < b ? -1 : 1;
}

// ── Query validation ───────────────────────────────────────────────────────

export type StatsRange = { from: IstDate; to: IstDate; queue: Queue | null };
export type StatsQueryResult =
    | { ok: true; range: StatsRange }
    | { ok: false; code: 'validation_failed' | 'range_too_large'; message: string };

const daysInclusive = (from: string, to: string): number =>
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY + 1;

function firstIssue(error: z.ZodError): string {
    const issue = error.issues[0];
    const path = issue?.path.map(String).join('.') ?? '';
    return `${path || 'request'}: ${issue?.message ?? 'invalid'}`;
}

export function validateStatsQuery(raw: Record<string, string>): StatsQueryResult {
    const parsed = statsQuery.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'validation_failed', message: firstIssue(parsed.error) };
    const { from, to, queue } = parsed.data;
    if (to < from || daysInclusive(from, to) > STATS_MAX_DAYS) {
        return { ok: false, code: 'range_too_large', message: `Choose at most ${STATS_MAX_DAYS} days, ending on or after the start.` };
    }
    return { ok: true, range: { from, to, queue: queue ?? null } };
}

export function outcomeToError(outcome: DeskDbOutcome): 'not_installed' | 'internal_error' {
    return outcome === 'not_installed' ? 'not_installed' : 'internal_error';
}

// ── Time not spent waiting on the team ─────────────────────────────────────

export interface StatusEventLike {
    id: number;
    ticket_id: string;
    type: string;
    from_status: string | null;
    to_status: string | null;
    created_at: string;
}
type NetTicket = Pick<Ticket, 'id' | 'opened_at' | 'resolved_at'>;
const WAITING_STATES: readonly string[] = ['waiting_customer', 'on_hold'];
const STATE_EVENTS: readonly string[] = ['status_changed', 'resolved', 'reopened'];

function stateAfter(event: StatusEventLike): string | null {
    if (event.to_status !== null) return event.to_status;
    if (event.type === 'resolved') return 'resolved';
    return event.type === 'reopened' ? 'open' : null;
}

/** Seconds from open to resolve minus the time spent in waiting_customer and on_hold. */
export function netResolutionSecs(ticket: NetTicket, events: readonly StatusEventLike[]): number | null {
    if (ticket.resolved_at === null) return null;
    const openedMs = Date.parse(ticket.opened_at);
    const resolvedMs = Date.parse(ticket.resolved_at);
    const ordered = events
        .filter((event) => event.ticket_id === ticket.id && STATE_EVENTS.includes(event.type) && stateAfter(event) !== null)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
    let waitingMs = 0;
    ordered.forEach((event, index) => {
        if (!WAITING_STATES.includes(stateAfter(event) ?? '')) return;
        const start = Math.max(Date.parse(event.created_at), openedMs);
        const next = ordered[index + 1];
        const end = Math.min(next ? Date.parse(next.created_at) : resolvedMs, resolvedMs);
        if (end > start) waitingMs += end - start;
    });
    return Math.max(0, Math.floor((resolvedMs - openedMs - waitingMs) / 1000));
}

// ── Repeat complainers ─────────────────────────────────────────────────────

export interface ComplainerRow {
    ticket_no: number;
    customer_phone: string | null;
    customer_name: string | null;
    backend_user_id: number | null;
}

function userByPhone(rows: readonly ComplainerRow[]): Map<string, number> {
    const byPhone = new Map<string, number>();
    for (const row of rows) {
        if (row.customer_phone === null || row.backend_user_id === null) continue;
        const known = byPhone.get(row.customer_phone);
        if (known === undefined || row.backend_user_id < known) byPhone.set(row.customer_phone, row.backend_user_id);
    }
    return byPhone;
}

function customerKey(row: ComplainerRow, byPhone: Map<string, number>): string | null {
    const userId = row.backend_user_id ?? (row.customer_phone === null ? undefined : byPhone.get(row.customer_phone));
    if (userId !== undefined) return `u:${userId}`;
    return row.customer_phone === null ? null : `p:${row.customer_phone}`;
}

function summarise<T extends ComplainerRow>(group: T[]): RepeatComplainer {
    const newestFirst = [...group].sort((a, b) => b.ticket_no - a.ticket_no);
    const newestWith = <K extends 'backend_user_id' | 'customer_phone' | 'customer_name'>(field: K) =>
        newestFirst.find((row) => row[field] !== null)?.[field] ?? null;
    return {
        backend_user_id: newestWith('backend_user_id'),
        customer_phone: newestWith('customer_phone') ?? '',
        customer_name: newestWith('customer_name'),
        n: group.length,
        ticket_nos: group.map((row) => row.ticket_no).sort((a, b) => a - b),
    };
}

/** Customers with at least REPEAT_COMPLAINER_MIN complaints, one of which is in scope. */
export function findRepeatComplainers<T extends ComplainerRow>(
    rows: readonly T[],
    inScope: (row: T) => boolean,
): RepeatComplainer[] {
    const byPhone = userByPhone(rows);
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        const key = customerKey(row, byPhone);
        if (key !== null) groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()]
        .filter((group) => group.length >= REPEAT_COMPLAINER_MIN && group.some(inScope))
        .map(summarise)
        .sort((a, b) => b.n - a.n || compareKeys(a.customer_phone, b.customer_phone))
        .slice(0, MAX_REPEAT_COMPLAINERS);
}
