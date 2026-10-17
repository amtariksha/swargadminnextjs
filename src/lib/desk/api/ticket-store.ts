// Small shared reads and writes of the ticket routes (a split of the files listed in the P3a
// spec section 5.1): load a ticket or a category, run one conditional update, write one event,
// and mirror a change onto the existing conversation columns. Every call reads data and error and
// maps the error through dbGuard; no lookup uses .single().

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { EventType, TicketStatus } from '../constants';
import { DeskApiError, dbGuard } from '../api-error';
import { computeTicketView } from '../ticket-view';
import type { Category, DeskContext, EventDataMap, Ticket, TicketView } from '../types';

export const TICKETS = 'desk_tickets';
const CATEGORIES = 'desk_categories';
const EVENTS = 'desk_ticket_events';

export type StateFilter = 'any' | 'unresolved' | 'resolved' | 'on_hold';

export const toView = (ticket: Ticket, ctx: DeskContext): TicketView =>
    computeTicketView(ticket, ctx.settings, new Date());

export async function loadTicket(id: string): Promise<Ticket | null> {
    const { data, error } = await supabaseAdmin.from(TICKETS).select('*').eq('id', id).limit(1).maybeSingle();
    dbGuard(error, TICKETS);
    return (data as Ticket | null) ?? null;
}

export async function requireTicket(id: string): Promise<Ticket> {
    const ticket = await loadTicket(id);
    if (ticket === null) throw new DeskApiError('not_found', 'Ticket not found.');
    return ticket;
}

export async function loadCategory(slug: string): Promise<Category | null> {
    const { data, error } = await supabaseAdmin.from(CATEGORIES).select('*').eq('slug', slug).limit(1).maybeSingle();
    dbGuard(error, CATEGORIES);
    return (data as Category | null) ?? null;
}

/** A slug the client sends must exist; for a new classification it must also be active. */
export async function requireCategory(slug: string, mustBeActive: boolean): Promise<Category> {
    const category = await loadCategory(slug);
    if (category === null || (mustBeActive && !category.active)) {
        throw new DeskApiError('validation_failed', `category_slug: ${slug} is not an active category`);
    }
    return category;
}

/** One conditional UPDATE ... RETURNING *. null = no row matched (the state filter failed). */
export async function updateTicket(
    id: string,
    patch: Record<string, unknown>,
    state: StateFilter = 'any',
): Promise<Ticket | null> {
    let query = supabaseAdmin.from(TICKETS).update(patch).eq('id', id);
    if (state === 'unresolved') query = query.neq('status', 'resolved');
    if (state === 'resolved') query = query.eq('status', 'resolved');
    if (state === 'on_hold') query = query.eq('status', 'on_hold');
    const { data, error } = await query.select('*');
    dbGuard(error, TICKETS);
    const rows = (data ?? []) as Ticket[];
    return rows.length === 1 ? rows[0] : null;
}

export interface EventOptions {
    from?: TicketStatus | null;
    to?: TicketStatus | null;
    assigneeId?: string | null;
}

/** Inserted after the ticket write succeeded; a failure is logged and never fails the request. */
export async function recordEvent<K extends EventType>(
    ctx: DeskContext,
    ticketId: string,
    type: K,
    data: EventDataMap[K],
    options: EventOptions = {},
): Promise<void> {
    const { error } = await supabaseAdmin.from(EVENTS).insert({
        ticket_id: ticketId,
        type,
        from_status: options.from ?? null,
        to_status: options.to ?? null,
        assignee_id: options.assigneeId ?? null,
        actor_id: ctx.actor.id,
        actor_name: ctx.actor.name,
        data,
    });
    if (error) console.error(`[desk-api] event insert failed type=${type}`);
}

/** Best-effort copy onto existing conversation columns; logged and ignored on failure. */
export async function mirrorToConversation(
    conversationId: string | null,
    patch: Record<string, unknown>,
    what: string,
): Promise<void> {
    if (conversationId === null) return;
    try {
        const { error } = await supabaseAdmin.from('conversations').update(patch).eq('id', conversationId).select('id');
        if (error) console.error(`[desk-api] conversation mirror failed what=${what}`);
    } catch {
        console.error(`[desk-api] conversation mirror failed what=${what}`);
    }
}
