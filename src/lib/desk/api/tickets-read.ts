// Routes 1 and 2: the ticket list and the ticket detail. Reads only. Queue views read every
// matching unresolved ticket (capped), compute the attention clock and order in TypeScript,
// because attention_since is not a column. List views page by ticket_no.

import type { z } from 'zod';
import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { renderTemplateBody } from '@/lib/whatsapp/utils';
import { QUEUE_SCAN_CAP, STATS_MAX_DAYS } from '../constants';
import type { ticketListQuery } from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import { istRangeUtc } from '../business-hours';
import { compareQueue, computeTicketView, inQueueView, parseTicketSearch } from '../ticket-view';
import {
    TICKET_LIST_COLUMNS,
    type DeskContext, type Ticket, type TicketListItem, type TicketListResponse,
} from '../types';
import { TICKETS } from './ticket-store';

export type TicketListQuery = z.infer<typeof ticketListQuery>;
type ListRow = Pick<Ticket, (typeof TICKET_LIST_COLUMNS)[number]>;

/** The filter methods these helpers call; PostgREST builders return `this` from each of them. */
interface Filterable<B> {
    eq(column: string, value: string | number | boolean): B;
    is(column: string, value: null): B;
    gte(column: string, value: string): B;
    lt(column: string, value: string | number): B;
    ilike(column: string, pattern: string): B;
    not(column: string, operator: string, value: string): B;
}

const LIST_COLUMNS = TICKET_LIST_COLUMNS.join(', ');
const QUEUE_VIEWS = ['mine', 'unassigned', 'all', 'acks'] as const;
const PREVIEW_CHARS = 140;
const MS_PER_DAY = 86_400_000;

const isQueueView = (view: TicketListQuery['view']): boolean => (QUEUE_VIEWS as readonly string[]).includes(view);

function parseCursor(cursor: string | undefined): number | null {
    if (cursor === undefined) return null;
    if (!/^[0-9]{1,15}$/.test(cursor)) throw new DeskApiError('validation_failed', 'cursor: not a valid cursor');
    return Number(cursor);
}

// ── Filters shared by every view ───────────────────────────────────────────

function narrow<B extends Filterable<B>>(builder: B, query: TicketListQuery): B {
    let next = builder;
    if (query.queue) next = next.eq('queue', query.queue);
    if (query.type) next = next.eq('type', query.type);
    if (query.category_slug) next = next.eq('category_slug', query.category_slug);
    if (query.assigned_to) next = next.eq('assigned_to', query.assigned_to);
    return next;
}

// ── Queue views ────────────────────────────────────────────────────────────

async function scanUnresolved(query: TicketListQuery): Promise<{ rows: ListRow[]; truncated: boolean }> {
    const { data, error } = await narrow(
        supabaseAdmin.from(TICKETS).select(LIST_COLUMNS).neq('status', 'resolved'), query,
    ).order('opened_at').limit(QUEUE_SCAN_CAP + 1);
    dbGuard(error, TICKETS);
    const rows = (data ?? []) as unknown as ListRow[];
    return { rows: rows.slice(0, QUEUE_SCAN_CAP), truncated: rows.length > QUEUE_SCAN_CAP };
}

async function countWrapUp(query: TicketListQuery): Promise<number> {
    let builder = supabaseAdmin
        .from(TICKETS)
        .select('id', { count: 'exact' })
        .eq('status', 'resolved')
        .is('category_slug', null)
        .eq('is_ack_only', false)
        .not('resolved_via', 'in', '(system,migration)');
    if (query.queue) builder = builder.eq('queue', query.queue);
    if (query.type) builder = builder.eq('type', query.type);
    if (query.category_slug) builder = builder.eq('category_slug', query.category_slug);
    if (query.assigned_to) builder = builder.eq('assigned_to', query.assigned_to);
    const { count, error } = await builder.limit(1);
    dbGuard(error, TICKETS);
    return count ?? 0;
}

function wrapUpFilter<B extends Filterable<B>>(builder: B): B {
    return builder.eq('status', 'resolved').is('category_slug', null).eq('is_ack_only', false)
        .not('resolved_via', 'in', '(system,migration)');
}

async function queueResponse(query: TicketListQuery, ctx: DeskContext): Promise<TicketListResponse> {
    const { rows, truncated } = await scanUnresolved(query);
    const now = new Date();
    const viewed = rows.map((row) => computeTicketView(row, ctx.settings, now));
    const members = viewed.filter((row) => inQueueView(row, query.view, ctx.actor.id)).sort(compareQueue);
    const offset = parseCursor(query.cursor) ?? 0;
    const page = members.slice(offset, offset + query.limit);
    const counts = query.with_counts === '1'
        ? {
            mine: viewed.filter((row) => inQueueView(row, 'mine', ctx.actor.id)).length,
            unassigned: viewed.filter((row) => inQueueView(row, 'unassigned', ctx.actor.id)).length,
            all: viewed.filter((row) => inQueueView(row, 'all', ctx.actor.id)).length,
            acks: viewed.filter((row) => inQueueView(row, 'acks', ctx.actor.id)).length,
            wrap_up: await countWrapUp(query),
        }
        : null;
    return {
        items: await withConversationFields(page),
        next_cursor: offset + query.limit < members.length ? String(offset + query.limit) : null,
        truncated,
        counts,
    };
}

// ── Page views (wrap_up, list) ─────────────────────────────────────────────

const daysInclusive = (from: string, to: string): number =>
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY + 1;

const hasIdentityFilter = (query: TicketListQuery): boolean =>
    query.ticket_no !== undefined || query.backend_user_id !== undefined
    || query.conversation_id !== undefined || query.q !== undefined;

/** The one list an agent may read: a single ticket by number (how /desk?ticket=N finds its ticket). */
function isSingleTicketLookup(query: TicketListQuery): boolean {
    const others: Array<unknown> = [
        query.backend_user_id, query.conversation_id, query.q, query.from, query.to, query.status,
        query.assigned_to, query.category_slug, query.type, query.queue, query.cursor,
    ];
    return query.ticket_no !== undefined && others.every((value) => value === undefined);
}

function checkListRange(query: TicketListQuery): void {
    const { from, to } = query;
    if (from !== undefined && to !== undefined) {
        const days = daysInclusive(from, to);
        if (days < 1 || days > STATS_MAX_DAYS) {
            throw new DeskApiError('range_too_large', `The date range must be between 1 and ${STATS_MAX_DAYS} days.`);
        }
        return;
    }
    if (!hasIdentityFilter(query)) {
        throw new DeskApiError('range_too_large', 'Send from and to, or a ticket, customer, conversation or search filter.');
    }
}

function assertListAllowed(query: TicketListQuery, ctx: DeskContext): void {
    if (query.view !== 'list' || isSingleTicketLookup(query)) return;
    checkListRange(query);
    if (!ctx.rights.manager) {
        throw new DeskApiError('forbidden', 'Ticket lists need the Desk manager permission.');
    }
}

function applyListFilters<B extends Filterable<B>>(builder: B, query: TicketListQuery): B {
    let next = narrow(builder, query);
    if (query.status) next = next.eq('status', query.status);
    if (query.ticket_no !== undefined) next = next.eq('ticket_no', query.ticket_no);
    if (query.backend_user_id !== undefined) next = next.eq('backend_user_id', query.backend_user_id);
    if (query.conversation_id !== undefined) next = next.eq('conversation_id', query.conversation_id);
    if (query.from !== undefined && query.to !== undefined) {
        const range = istRangeUtc(query.from, query.to);
        next = next.gte('opened_at', range.gte).lt('opened_at', range.lt);
    }
    return applySearch(next, query.q);
}

function applySearch<B extends Filterable<B>>(builder: B, q: string | undefined): B {
    if (q === undefined) return builder;
    const search = parseTicketSearch(q);
    if (search === null) throw new DeskApiError('validation_failed', 'q: type at least two letters or digits');
    return search.kind === 'phone'
        ? builder.ilike('customer_phone', `%${search.digits}%`)
        : builder.ilike('customer_name', `%${search.text}%`);
}

async function lookupTicketNo(q: string | undefined): Promise<ListRow | null> {
    const search = q === undefined ? null : parseTicketSearch(q);
    if (search === null || search.kind !== 'phone' || search.ticketNo === null) return null;
    const { data, error } = await supabaseAdmin
        .from(TICKETS).select(LIST_COLUMNS).eq('ticket_no', search.ticketNo).limit(1).maybeSingle();
    dbGuard(error, TICKETS);
    return (data as unknown as ListRow | null) ?? null;
}

async function pageResponse(query: TicketListQuery, ctx: DeskContext): Promise<TicketListResponse> {
    const cursor = parseCursor(query.cursor);
    let builder = supabaseAdmin.from(TICKETS).select(LIST_COLUMNS);
    builder = query.view === 'wrap_up' ? narrow(wrapUpFilter(builder), query) : applyListFilters(builder, query);
    if (cursor !== null) builder = builder.lt('ticket_no', cursor);
    const { data, error } = await builder.order('ticket_no', { ascending: false }).limit(query.limit + 1);
    dbGuard(error, TICKETS);
    const rows = (data ?? []) as unknown as ListRow[];
    const pageRows = rows.slice(0, query.limit);
    if (cursor === null && query.view === 'list') {
        const direct = await lookupTicketNo(query.q);
        if (direct && !pageRows.some((row) => row.id === direct.id)) pageRows.unshift(direct);
    }
    const hasMore = rows.length > query.limit;
    const last = pageRows[pageRows.length - 1];
    const now = new Date();
    return {
        items: await withConversationFields(pageRows.map((row) => computeTicketView(row, ctx.settings, now))),
        next_cursor: hasMore && last ? String(last.ticket_no) : null,
        truncated: false,
        counts: null,
    };
}

// ── Conversation preview and unread count ──────────────────────────────────

async function withConversationFields(rows: Array<ListRow & { attention_since: string | null; overdue: boolean; waiting_secs: number | null }>): Promise<TicketListItem[]> {
    const ids = [...new Set(rows.map((row) => row.conversation_id).filter((id): id is string => id !== null))];
    const byId = new Map<string, { preview: string; unread: number }>();
    if (ids.length > 0) {
        const { data, error } = await supabaseAdmin
            .from('conversations').select('id, last_message, unread_count').in('id', ids).limit(ids.length);
        dbGuard(error, 'conversations');
        for (const row of data ?? []) {
            byId.set(String(row.id), {
                preview: renderTemplateBody(row.last_message).slice(0, PREVIEW_CHARS),
                unread: Number(row.unread_count ?? 0),
            });
        }
    }
    return rows.map((row) => {
        const conversation = row.conversation_id === null ? undefined : byId.get(row.conversation_id);
        return { ...row, preview: row.conversation_id === null ? null : (conversation?.preview ?? null), unread_count: conversation?.unread ?? 0 };
    });
}

export async function listTickets(query: TicketListQuery, ctx: DeskContext): Promise<TicketListResponse> {
    assertListAllowed(query, ctx);
    return isQueueView(query.view) ? queueResponse(query, ctx) : pageResponse(query, ctx);
}
