// The reads behind GET /api/desk/stats. I/O only: every aggregation is stats-report.ts. Reads never
// write and never call an RPC. Every multi-row read is paged (PostgREST cuts a select at the
// project's "Max rows" without an error) and ends on an empty page, never on a short one.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { RECONTACT_WINDOW_HOURS, REPEAT_COMPLAINER_DAYS } from './constants';
import { fetchDeliveryCounts } from './stats-read-delivery';
import { addIstDays, istDayStartUtc, istRangeUtc } from './business-hours';
import { classifyDeskDbError, reportNotInstalled, type DeskDbOutcome } from './repo';
import { epochOf, isResolutionCandidate, lowerOf, outcomeToError } from './stats-helpers';
import { STATS_TICKET_COLUMNS } from './stats-report';
import type {
    ComplaintRow, DeliveryCounts, MoneyActionRow, StatsInput, StatsTicketRow, StatusEventRow,
} from './stats-report';
import type { DeskContext, IsoDateTime, Ticket } from './types';

// ── Paging ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;
const MAX_ROWS = 20_000;
const READ_TIMEOUT_MS = 8000;
const ID_CHUNK = 100;
const MS_PER_HOUR = 3_600_000;

interface DbErrorLike { code?: string | null; name?: string | null; message?: string | null }
export type PageFetcher<T> = (fromIndex: number, toIndex: number) =>
    PromiseLike<{ data: T[] | null; error: DbErrorLike | null }>;
export type PagedRead<T> = { ok: true; rows: T[]; truncated: boolean } | { ok: false; outcome: DeskDbOutcome };

/** Advances by the rows returned, not by the page size, so a lower "Max rows" loses nothing. */
export async function fetchAllPaged<T>(
    fetchPage: PageFetcher<T>,
    options?: { pageSize?: number; maxRows?: number },
): Promise<PagedRead<T>> {
    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const maxRows = options?.maxRows ?? MAX_ROWS;
    const rows: T[] = [];
    while (rows.length < maxRows) {
        const wanted = Math.min(pageSize, maxRows - rows.length);
        let result: Awaited<ReturnType<PageFetcher<T>>>;
        try {
            result = await fetchPage(rows.length, rows.length + wanted - 1);
        } catch (error) {
            return { ok: false, outcome: classifyDeskDbError(error instanceof Error ? error : { message: String(error) }) };
        }
        if (result.error) return { ok: false, outcome: classifyDeskDbError(result.error) };
        const page = result.data ?? [];
        if (page.length === 0) return { ok: true, rows, truncated: false };
        rows.push(...page);
    }
    return { ok: true, rows, truncated: true };
}

export const abortAfterReadTimeout = (): AbortSignal => AbortSignal.timeout(READ_TIMEOUT_MS);

export function chunksOf<T>(items: readonly T[], size: number = ID_CHUNK): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}

/** Runs one read per chunk of ids and joins the rows; the first failure ends it. */
export async function readInChunks<T>(
    ids: readonly string[],
    readChunk: (chunk: string[]) => Promise<PagedRead<T>>,
): Promise<PagedRead<T>> {
    const rows: T[] = [];
    let truncated = false;
    for (const chunk of chunksOf(ids)) {
        const result = await readChunk(chunk);
        if (!result.ok) return result;
        rows.push(...result.rows);
        truncated = truncated || result.truncated;
    }
    return { ok: true, rows, truncated };
}

export { fetchDeliveryCounts } from './stats-read-delivery';

// ── The reads of GET /api/desk/stats ───────────────────────────────────────

const TICKETS = 'desk_tickets';
const EVENTS = 'desk_ticket_events';
const ACTIONS = 'desk_ticket_actions';
const MONEY_ACTIONS = ['refund', 'wallet_credit'];
const TICKET_COLUMNS = STATS_TICKET_COLUMNS.join(', ');
const COMPLAINT_COLUMNS = 'id, ticket_no, queue, customer_phone, customer_name, backend_user_id, opened_at, resolution_code';
const MONEY_COLUMNS = 'id, ticket_id, action_type, amount, verified, actor_id, actor_name, created_at';
const STATUS_EVENT_TYPES = ['status_changed', 'resolved', 'reopened'];

export type StatsReadResult =
    | { ok: true; value: StatsInput }
    | { ok: false; code: 'not_installed' | 'internal_error'; message: string };
type CategoryRow = StatsInput['categories'][number];

function noteOutcome(table: string, outcome: DeskDbOutcome): void {
    if (outcome === 'not_installed') reportNotInstalled(table, 'stats');
}

const fail = (table: string, outcome: DeskDbOutcome): StatsReadResult => {
    noteOutcome(table, outcome);
    const code = outcomeToError(outcome);
    return { ok: false, code, message: code === 'not_installed' ? 'Desk is not installed.' : 'Could not read the Desk statistics.' };
};

function readCategories(): Promise<PagedRead<CategoryRow>> {
    return fetchAllPaged<CategoryRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from('desk_categories').select('slug, label, report_group, category_group')
            .order('sort_order', { ascending: true }).order('slug', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as CategoryRow[] | null, error };
    });
}

function readRangeTickets(from: IsoDateTime, before: IsoDateTime): Promise<PagedRead<StatsTicketRow>> {
    return fetchAllPaged<StatsTicketRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(TICKETS).select(TICKET_COLUMNS)
            .gte('opened_at', from).lt('opened_at', before)
            .order('opened_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as StatsTicketRow[] | null, error };
    });
}

function readOpenTickets(epoch: IsoDateTime): Promise<PagedRead<StatsTicketRow>> {
    return fetchAllPaged<StatsTicketRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(TICKETS).select(TICKET_COLUMNS)
            .neq('status', 'resolved').eq('is_ack_only', false).gte('opened_at', epoch)
            .order('opened_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as StatsTicketRow[] | null, error };
    });
}

async function readWrapUpBacklog(epoch: IsoDateTime, queue: StatsInput['range']['queue']): Promise<number | DeskDbOutcome> {
    let query = supabaseAdmin.from(TICKETS).select('id', { count: 'exact' })
        .eq('status', 'resolved').is('category_slug', null).eq('is_ack_only', false)
        .not('resolved_via', 'in', '(system,migration)').gte('opened_at', epoch);
    if (queue !== null) query = query.eq('queue', queue);
    const { count: total, error } = await query.limit(1).abortSignal(abortAfterReadTimeout());
    return error ? classifyDeskDbError(error) : (total ?? 0);
}

function readComplaintWindow(from: IsoDateTime, before: IsoDateTime): Promise<PagedRead<ComplaintRow>> {
    return fetchAllPaged<ComplaintRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(TICKETS).select(COMPLAINT_COLUMNS)
            .eq('type', 'complaint').gte('opened_at', from).lt('opened_at', before)
            .order('opened_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as ComplaintRow[] | null, error };
    });
}

function readMoneyActions(from: IsoDateTime, before: IsoDateTime): Promise<PagedRead<MoneyActionRow>> {
    return fetchAllPaged<MoneyActionRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(ACTIONS).select(MONEY_COLUMNS)
            .in('action_type', MONEY_ACTIONS).gte('created_at', from).lt('created_at', before)
            .order('created_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as MoneyActionRow[] | null, error };
    });
}

function readActionTickets(ids: string[]): Promise<PagedRead<StatsInput['actionTickets'][number]>> {
    return readInChunks(ids, (chunk) => fetchAllPaged(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(TICKETS).select('id, queue, category_slug, opened_at')
            .in('id', chunk).order('id', { ascending: true }).range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as StatsInput['actionTickets'] | null, error };
    }));
}

function readStatusEvents(from: IsoDateTime, until: IsoDateTime): Promise<PagedRead<StatusEventRow>> {
    return fetchAllPaged<StatusEventRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(EVENTS).select('id, ticket_id, type, from_status, to_status, created_at')
            .in('type', STATUS_EVENT_TYPES).gte('created_at', from).lte('created_at', until)
            .order('created_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as StatusEventRow[] | null, error };
    });
}

type HeldRow = { ticket_id: string; created_at: IsoDateTime };

async function readHeldAt(ids: string[]): Promise<PagedRead<HeldRow>> {
    return readInChunks(ids, (chunk) => fetchAllPaged<HeldRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(EVENTS).select('id, ticket_id, created_at')
            .eq('type', 'held').in('ticket_id', chunk)
            .order('created_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as HeldRow[] | null, error };
    }));
}

function newestPerTicket(rows: HeldRow[]): Record<string, IsoDateTime> {
    const newest: Record<string, IsoDateTime> = {};
    for (const row of rows) {
        const known = newest[row.ticket_id];
        if (known === undefined || Date.parse(row.created_at) > Date.parse(known)) newest[row.ticket_id] = row.created_at;
    }
    return newest;
}

/** Latest resolved_at of the resolution population, plus one millisecond; null when there is none. */
function resolutionHorizon(tickets: StatsTicketRow[]): IsoDateTime | null {
    const latest = tickets
        .filter(isResolutionCandidate)
        .map((ticket) => Date.parse(ticket.resolved_at ?? ''))
        .filter(Number.isFinite);
    return latest.length === 0 ? null : new Date(Math.max(...latest) + 1).toISOString();
}

function emptyInput(range: StatsInput['range'], ctx: DeskContext, now: Date): StatsInput {
    return {
        now, range, settings: ctx.settings, categories: [], tickets: [], openTickets: [], wrapUpBacklog: 0,
        complaintsWindow: [], moneyActions: [], actionTickets: [], statusEvents: null, heldAt: {},
        deliveryCounts: null, truncated: false,
    };
}

export async function readStatsInput(range: StatsInput['range'], ctx: DeskContext, now: Date): Promise<StatsReadResult> {
    const epoch = epochOf(ctx.settings);
    if (epoch === null) return { ok: true, value: emptyInput(range, ctx, now) };
    const epochIso = new Date(Date.parse(epoch)).toISOString();
    const bounds = istRangeUtc(range.from, range.to);
    const complaintsFrom = lowerOf(istDayStartUtc(addIstDays(range.to, -(REPEAT_COMPLAINER_DAYS - 1))).toISOString(), epoch);
    const [categories, tickets, open, backlog, complaints, actions, deliveryCounts] = await Promise.all([
        readCategories(),
        readRangeTickets(lowerOf(bounds.gte, epoch), new Date(Date.parse(bounds.lt) + RECONTACT_WINDOW_HOURS * MS_PER_HOUR).toISOString()),
        readOpenTickets(epochIso),
        readWrapUpBacklog(epochIso, range.queue),
        readComplaintWindow(complaintsFrom, bounds.lt),
        readMoneyActions(lowerOf(bounds.gte, epoch), bounds.lt),
        fetchDeliveryCounts(ctx.token, range.from, range.to),
    ]);
    if (!categories.ok) return fail('desk_categories', categories.outcome);
    if (!tickets.ok) return fail(TICKETS, tickets.outcome);
    if (!open.ok) return fail(TICKETS, open.outcome);
    if (typeof backlog === 'string') return fail(TICKETS, backlog);
    if (!complaints.ok) return fail(TICKETS, complaints.outcome);
    if (!actions.ok) return fail(ACTIONS, actions.outcome);
    return readSecondRound({ range, ctx, now, epoch, parts: { categories, tickets, open, backlog, complaints, actions, deliveryCounts } });
}

interface FirstRound {
    categories: Extract<PagedRead<CategoryRow>, { ok: true }>;
    tickets: Extract<PagedRead<StatsTicketRow>, { ok: true }>;
    open: Extract<PagedRead<StatsTicketRow>, { ok: true }>;
    backlog: number;
    complaints: Extract<PagedRead<ComplaintRow>, { ok: true }>;
    actions: Extract<PagedRead<MoneyActionRow>, { ok: true }>;
    deliveryCounts: DeliveryCounts | null;
}

async function readSecondRound(args: {
    range: StatsInput['range']; ctx: DeskContext; now: Date; epoch: string; parts: FirstRound;
}): Promise<StatsReadResult> {
    const { range, ctx, now, epoch, parts } = args;
    const knownIds = new Set(parts.tickets.rows.map((ticket: Pick<Ticket, 'id'>) => ticket.id));
    const missingIds = [...new Set(parts.actions.rows.map((action) => action.ticket_id))].filter((id) => !knownIds.has(id));
    const holdIds = parts.open.rows.filter((ticket) => ticket.status === 'on_hold').map((ticket) => ticket.id);
    const horizon = resolutionHorizon(parts.tickets.rows);
    const bounds = istRangeUtc(range.from, range.to);
    const [actionTickets, events, held] = await Promise.all([
        readActionTickets(missingIds),
        horizon === null ? Promise.resolve<PagedRead<StatusEventRow>>({ ok: true, rows: [], truncated: false })
            : readStatusEvents(lowerOf(bounds.gte, epoch), horizon),
        readHeldAt(holdIds),
    ]);
    if (!actionTickets.ok) return fail(TICKETS, actionTickets.outcome);
    if (!held.ok) return fail(EVENTS, held.outcome);
    const eventsUsable = events.ok && !events.truncated;
    return {
        ok: true,
        value: {
            now, range, settings: ctx.settings,
            categories: parts.categories.rows,
            tickets: parts.tickets.rows,
            openTickets: parts.open.rows,
            wrapUpBacklog: parts.backlog,
            complaintsWindow: parts.complaints.rows,
            moneyActions: parts.actions.rows,
            actionTickets: actionTickets.rows,
            statusEvents: eventsUsable ? events.rows : null,
            heldAt: newestPerTicket(held.rows),
            deliveryCounts: parts.deliveryCounts,
            truncated: parts.tickets.truncated || parts.open.truncated || parts.complaints.truncated
                || parts.actions.truncated || (events.ok && events.truncated),
        },
    };
}
