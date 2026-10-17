// The reads behind GET /api/desk/review. I/O only: every block is review-report.ts. Reads never
// write and never call an RPC; each multi-row read is paged and ends on an empty page.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { renderTemplateBody } from '@/lib/whatsapp/utils';
import { REPEAT_COMPLAINER_DAYS } from './constants';
import { addIstDays, istDayStartUtc } from './business-hours';
import { classifyDeskDbError, reportNotInstalled, type DeskDbOutcome } from './repo';
import { REVIEW_EXTRA_COLUMNS, reviewWindow } from './review-report';
import type { ReviewEventRow, ReviewInput, ReviewTicketItem } from './review-report';
import {
    abortAfterReadTimeout, chunksOf, fetchAllPaged, fetchDeliveryCounts, readInChunks, type PagedRead,
} from './stats-read';
import { epochOf, lowerOf, outcomeToError } from './stats-helpers';
import type { ComplaintRow, DeliveryCounts } from './stats-report';
import { computeTicketView } from './ticket-view';
import { TICKET_LIST_COLUMNS } from './types';
import type { ActionItem, DeskContext, DeskSettings, IsoDateTime, IstDate, Ticket, TicketAction } from './types';

const TICKETS = 'desk_tickets';
const EVENTS = 'desk_ticket_events';
const ACTIONS = 'desk_ticket_actions';
const REVIEW_COLUMNS = [...TICKET_LIST_COLUMNS, ...REVIEW_EXTRA_COLUMNS].join(', ');
const COMPLAINT_COLUMNS = 'id, ticket_no, queue, customer_phone, customer_name, backend_user_id, opened_at, resolution_code';
const EVENT_TYPES = ['created', 'reopened', 'resolved', 'ack_would_suppress', 'ack_suppressed'];
const MONEY_ACTIONS = ['refund', 'wallet_credit'];
const PREVIEW_CHARS = 140;
const ACTION_ITEM_LIMIT = 100;

export type ReviewReadResult =
    | { ok: true; value: ReviewInput }
    | { ok: false; code: 'not_installed' | 'internal_error'; message: string };
type CategoryRow = ReviewInput['categories'][number];
type RawTicket = Pick<Ticket, (typeof TICKET_LIST_COLUMNS)[number] | (typeof REVIEW_EXTRA_COLUMNS)[number]>;

// ── Ticket rows to list items ──────────────────────────────────────────────

type ConversationFields = Map<string, { preview: string; unread: number }>;
type ConversationRow = { id: string; last_message: string | null; unread_count: number | string | null };

/** One read per chunk of 100 ids. A missing column (42703) gives no previews instead of an error. */
async function readConversationFields(ids: string[]): Promise<{ ok: true; fields: ConversationFields } | { ok: false; outcome: DeskDbOutcome }> {
    const fields: ConversationFields = new Map();
    for (const chunk of chunksOf(ids)) {
        const { data, error } = await supabaseAdmin.from('conversations').select('id, last_message, unread_count')
            .in('id', chunk).limit(chunk.length).abortSignal(abortAfterReadTimeout());
        if (error?.code === '42703') {
            reportNotInstalled('conversations', '42703');
            return { ok: true, fields: new Map() };
        }
        if (error) return { ok: false, outcome: classifyDeskDbError(error) };
        for (const row of (data ?? []) as unknown as ConversationRow[]) {
            fields.set(row.id, { preview: renderTemplateBody(row.last_message).slice(0, PREVIEW_CHARS), unread: Number(row.unread_count ?? 0) });
        }
    }
    return { ok: true, fields };
}

/** Adds the attention clock and the conversation preview to ticket rows read with the review columns. */
export async function toListItems(
    rows: RawTicket[],
    now: Date,
    settings: Pick<DeskSettings, 'reply_alert_mins' | 'business_hours'>,
): Promise<{ ok: true; items: ReviewTicketItem[] } | { ok: false; outcome: DeskDbOutcome }> {
    const ids = [...new Set(rows.map((row) => row.conversation_id).filter((id): id is string => id !== null))];
    const read = await readConversationFields(ids);
    if (!read.ok) return read;
    return {
        ok: true,
        items: rows.map((row) => {
            const conversation = row.conversation_id === null ? undefined : read.fields.get(row.conversation_id);
            return {
                ...computeTicketView(row, settings, now),
                order_value: row.order_value === null ? null : Number(row.order_value),
                preview: conversation?.preview ?? null,
                unread_count: conversation?.unread ?? 0,
            };
        }),
    };
}

// ── Reads ──────────────────────────────────────────────────────────────────

function readTickets(apply: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string | null; name?: string | null; message?: string | null } | null }>): Promise<PagedRead<RawTicket>> {
    return fetchAllPaged<RawTicket>(async (from, to) => {
        const { data, error } = await apply(from, to);
        return { data: data as RawTicket[] | null, error };
    });
}

const ticketSelect = () => supabaseAdmin.from(TICKETS).select(REVIEW_COLUMNS);

function readWindowTickets(from: IsoDateTime, before: IsoDateTime) {
    return readTickets((a, b) => ticketSelect().gte('opened_at', from).lt('opened_at', before)
        .order('opened_at', { ascending: true }).order('id', { ascending: true }).range(a, b).abortSignal(abortAfterReadTimeout()));
}

function readOpenTickets(epoch: IsoDateTime) {
    return readTickets((a, b) => ticketSelect().neq('status', 'resolved').eq('is_ack_only', false).gte('opened_at', epoch)
        .order('opened_at', { ascending: true }).order('id', { ascending: true }).range(a, b).abortSignal(abortAfterReadTimeout()));
}

function readResolvedTickets(epoch: IsoDateTime, from: IsoDateTime, before: IsoDateTime) {
    return readTickets((a, b) => ticketSelect().gte('resolved_at', from).lt('resolved_at', before).gte('opened_at', epoch)
        .order('resolved_at', { ascending: true }).order('id', { ascending: true }).range(a, b).abortSignal(abortAfterReadTimeout()));
}

function readLookupTickets(ids: string[], epoch: IsoDateTime): Promise<PagedRead<RawTicket>> {
    return readInChunks(ids, (chunk) => readTickets((a, b) => ticketSelect().in('id', chunk).gte('opened_at', epoch)
        .order('id', { ascending: true }).range(a, b).abortSignal(abortAfterReadTimeout())));
}

function readComplaints(from: IsoDateTime, before: IsoDateTime): Promise<PagedRead<ComplaintRow>> {
    return fetchAllPaged<ComplaintRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(TICKETS).select(COMPLAINT_COLUMNS)
            .eq('type', 'complaint').gte('opened_at', from).lt('opened_at', before)
            .order('opened_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as ComplaintRow[] | null, error };
    });
}

function readEvents(from: IsoDateTime, before: IsoDateTime): Promise<PagedRead<ReviewEventRow>> {
    return fetchAllPaged<ReviewEventRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(EVENTS).select('id, ticket_id, type, data, created_at')
            .in('type', EVENT_TYPES).gte('created_at', from).lt('created_at', before)
            .order('created_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as ReviewEventRow[] | null, error };
    });
}

function readMoney(from: IsoDateTime, before: IsoDateTime): Promise<PagedRead<TicketAction>> {
    return fetchAllPaged<TicketAction>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from(ACTIONS).select('*')
            .in('action_type', MONEY_ACTIONS).gte('created_at', from).lt('created_at', before)
            .order('created_at', { ascending: true }).order('id', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as TicketAction[] | null, error };
    });
}

async function readCategories(): Promise<PagedRead<CategoryRow>> {
    return fetchAllPaged<CategoryRow>(async (a, b) => {
        const { data, error } = await supabaseAdmin.from('desk_categories').select('slug, label, report_group, category_group')
            .order('sort_order', { ascending: true }).order('slug', { ascending: true })
            .range(a, b).abortSignal(abortAfterReadTimeout());
        return { data: data as unknown as CategoryRow[] | null, error };
    });
}

async function readActionItemsDue(date: IstDate): Promise<{ ok: true; rows: ActionItem[] } | { ok: false; outcome: DeskDbOutcome }> {
    const { data, error } = await supabaseAdmin.from('desk_action_items').select('*')
        .eq('status', 'open').lte('due_date', date)
        .order('due_date', { ascending: true }).order('id', { ascending: true })
        .limit(ACTION_ITEM_LIMIT).abortSignal(abortAfterReadTimeout());
    return error ? { ok: false, outcome: classifyDeskDbError(error) } : { ok: true, rows: (data ?? []) as unknown as ActionItem[] };
}

// ── Assembly ───────────────────────────────────────────────────────────────

function emptyInput(date: IstDate, ctx: DeskContext, now: Date): ReviewInput {
    return {
        now, date, settings: ctx.settings, categories: [], windowTickets: [], openTickets: [], resolvedTickets: [],
        lookupTickets: [], complaintsWindow: [], events: [], moneyActions: [], actionItemsDue: [],
        deliveryCounts: null, truncated: false,
    };
}

type ReviewFailure = Extract<ReviewReadResult, { ok: false }>;

const failure = (table: string, outcome: DeskDbOutcome): ReviewFailure => {
    if (outcome === 'not_installed') reportNotInstalled(table, 'review');
    const code = outcomeToError(outcome);
    return { ok: false, code, message: code === 'not_installed' ? 'Desk is not installed.' : 'Could not read the morning review.' };
};

function missingTicketIds(known: RawTicket[], events: ReviewEventRow[], actions: TicketAction[]): string[] {
    const have = new Set(known.map((ticket) => ticket.id));
    const wanted = [...events.map((event) => event.ticket_id), ...actions.map((action) => action.ticket_id)];
    return [...new Set(wanted)].filter((id) => !have.has(id));
}

type FirstRound = {
    categories: CategoryRow[]; inWindow: PagedOk<RawTicket>; open: PagedOk<RawTicket>; resolved: PagedOk<RawTicket>;
    complaints: PagedOk<ComplaintRow>; events: PagedOk<ReviewEventRow>; money: PagedOk<TicketAction>;
    items: ActionItem[]; deliveryCounts: DeliveryCounts | null;
};
type PagedOk<T> = Extract<PagedRead<T>, { ok: true }>;

async function readFirstRound(date: IstDate, ctx: DeskContext, epoch: string, now: Date): Promise<FirstRound | ReviewFailure> {
    const epochIso = new Date(Date.parse(epoch)).toISOString();
    const window = reviewWindow(date, now);
    const skip = <T,>(): Promise<PagedRead<T>> => Promise.resolve({ ok: true, rows: [], truncated: false });
    const complaintsFrom = lowerOf(istDayStartUtc(addIstDays(date, -(REPEAT_COMPLAINER_DAYS - 1))).toISOString(), epoch);
    const [categories, inWindow, open, resolved, complaints, events, money, items, deliveryCounts] = await Promise.all([
        readCategories(),
        window.empty ? skip<RawTicket>() : readWindowTickets(lowerOf(window.from, epoch), window.to),
        readOpenTickets(epochIso),
        window.empty ? skip<RawTicket>() : readResolvedTickets(epochIso, window.from, window.to),
        readComplaints(complaintsFrom, window.to),
        window.empty ? skip<ReviewEventRow>() : readEvents(window.from, window.to),
        window.empty ? skip<TicketAction>() : readMoney(window.from, window.to),
        readActionItemsDue(date),
        window.empty ? Promise.resolve(null) : fetchDeliveryCounts(ctx.token, addIstDays(date, -1), date),
    ]);
    if (!categories.ok) return failure('desk_categories', categories.outcome);
    if (!inWindow.ok) return failure(TICKETS, inWindow.outcome);
    if (!open.ok) return failure(TICKETS, open.outcome);
    if (!resolved.ok) return failure(TICKETS, resolved.outcome);
    if (!complaints.ok) return failure(TICKETS, complaints.outcome);
    if (!events.ok) return failure(EVENTS, events.outcome);
    if (!money.ok) return failure(ACTIONS, money.outcome);
    if (!items.ok) return failure('desk_action_items', items.outcome);
    return { categories: categories.rows, inWindow, open, resolved, complaints, events, money, items: items.rows, deliveryCounts };
}

const isFailure = (value: FirstRound | ReviewFailure): value is ReviewFailure => 'code' in value;

export async function readReviewInput(date: IstDate, ctx: DeskContext, now: Date): Promise<ReviewReadResult> {
    const epoch = epochOf(ctx.settings);
    if (epoch === null) return { ok: true, value: emptyInput(date, ctx, now) };
    const round = await readFirstRound(date, ctx, epoch, now);
    if (isFailure(round)) return round;
    const { inWindow, open, resolved, events, money } = round;
    const lookup = await readLookupTickets(
        missingTicketIds([...inWindow.rows, ...open.rows, ...resolved.rows], events.rows, money.rows),
        new Date(Date.parse(epoch)).toISOString(),
    );
    if (!lookup.ok) return failure(TICKETS, lookup.outcome);
    const shaped = await toListItems([inWindow.rows, open.rows, resolved.rows, lookup.rows].flat(), now, ctx.settings);
    if (!shaped.ok) return failure('conversations', shaped.outcome);
    const byId = new Map(shaped.items.map((item) => [item.id, item]));
    const pick = (rows: RawTicket[]): ReviewTicketItem[] =>
        rows.flatMap((row) => { const item = byId.get(row.id); return item === undefined ? [] : [item]; });
    return {
        ok: true,
        value: {
            now, date, settings: ctx.settings, categories: round.categories,
            windowTickets: pick(inWindow.rows), openTickets: pick(open.rows),
            resolvedTickets: pick(resolved.rows), lookupTickets: pick(lookup.rows),
            complaintsWindow: round.complaints.rows, events: events.rows,
            moneyActions: money.rows.map((action) => ({ ...action, amount: action.amount === null ? null : Number(action.amount) })),
            actionItemsDue: round.items, deliveryCounts: round.deliveryCounts,
            truncated: [inWindow, open, resolved, round.complaints, events, money].some((part) => part.truncated),
        },
    };
}
