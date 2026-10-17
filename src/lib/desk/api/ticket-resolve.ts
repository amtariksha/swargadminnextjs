// Route 7: resolve a ticket from the panel. Never buries a customer message: the final UPDATE is
// conditional on the ticket's last_inbound_at as the client rendered it (blueprint D5). If a new
// customer message arrived the ticket stays open and the answer is 409 new_customer_message.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { z } from 'zod';
import type { HumanResolutionCode, LostReason } from '../constants';
import type { ticketResolveBody } from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import type { Category, DeskContext, Ticket, TicketResolveResponse } from '../types';
import { checkResolveRules } from './rules';
import {
    classifyTicket, loadCategory, mirrorToConversation, recordEvent, requireCategory, requireTicket,
    toView, TICKETS, updateTicket,
} from './ticket-store';

type ResolveBody = z.infer<typeof ticketResolveBody>;

const CONFLICT_MESSAGE = 'A new customer message arrived. Read it before resolving.';

async function applyLinkStatus(ctx: DeskContext, ticket: Ticket, body: ResolveBody): Promise<Ticket> {
    if (body.link_status === undefined || ticket.link_status !== null) return ticket;
    const row = await updateTicket(ticket.id, { link_status: body.link_status }, 'unresolved');
    if (row === null) return ticket;
    await recordEvent(ctx, ticket.id, 'delivery_linked', {
        link_status: body.link_status, order_id: null, daytime_order_id: null,
        delivery_date: null, product_name: null, driver_user_id: null,
    });
    return row;
}

async function categoryFor(ticket: Ticket, body: ResolveBody): Promise<Category | null> {
    if (body.category_slug) return requireCategory(body.category_slug, true);
    return ticket.category_slug ? loadCategory(ticket.category_slug) : null;
}

async function findDuplicateTarget(ticketNo: number | undefined): Promise<{ id: string; ticket_no: number } | null> {
    if (ticketNo === undefined) return null;
    const { data, error } = await supabaseAdmin
        .from(TICKETS).select('id, ticket_no').eq('ticket_no', ticketNo).limit(1).maybeSingle();
    dbGuard(error, TICKETS);
    return (data as { id: string; ticket_no: number } | null) ?? null;
}

interface Verdict {
    resolution_code: HumanResolutionCode;
    resolution_note: string | null;
    lost_reason: LostReason | null;
}

/** The conditional statement of blueprint D5. Returns the resolved row, or null when it matched nothing. */
async function resolveConditionally(
    ctx: DeskContext, ticket: Ticket, body: ResolveBody, verdict: Verdict, duplicateId: string | null,
): Promise<Ticket | null> {
    const patch = {
        status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: ctx.actor.id,
        resolved_by_name: ctx.actor.name, resolution_code: verdict.resolution_code,
        resolution_note: verdict.resolution_note, resolved_via: 'manual', lost_reason: verdict.lost_reason,
        awaiting_reply_since: null, follow_up_at: null, hold_reason: null,
        ...(duplicateId === null ? {} : { duplicate_of_ticket_id: duplicateId }),
    };
    const base = supabaseAdmin.from(TICKETS).update(patch).eq('id', ticket.id).neq('status', 'resolved');
    const guarded = body.seen_inbound_at === null
        ? base.is('last_inbound_at', null)
        : base.lte('last_inbound_at', body.seen_inbound_at);
    const { data, error } = await guarded.select('*');
    dbGuard(error, TICKETS);
    const rows = (data ?? []) as Ticket[];
    return rows.length === 1 ? rows[0] : null;
}

async function onNoRowMatched(ctx: DeskContext, ticket: Ticket, body: ResolveBody): Promise<TicketResolveResponse> {
    const fresh = await requireTicket(ticket.id);
    if (fresh.status === 'resolved') return { ticket: toView(fresh, ctx), already_resolved: true };
    await recordEvent(ctx, ticket.id, 'resolve_conflict', {
        attempted_via: 'manual', action_id: null,
        seen_inbound_at: body.seen_inbound_at, last_inbound_at: fresh.last_inbound_at,
    });
    throw new DeskApiError('new_customer_message', CONFLICT_MESSAGE, { ticket: toView(fresh, ctx), action: null });
}

async function writeFirstResolution(ctx: DeskContext, ticketId: string, resolved: Ticket): Promise<void> {
    const { error } = await supabaseAdmin
        .from(TICKETS)
        .update({
            first_resolved_at: resolved.resolved_at, first_resolved_by: ctx.actor.id,
            first_resolved_code: resolved.resolution_code,
        })
        .eq('id', ticketId).is('first_resolved_at', null).select('id');
    // The ticket is already resolved: a failure here is logged, not turned into a failed request.
    if (error) console.error('[desk-api] first resolution write failed');
}

async function afterResolve(
    ctx: DeskContext, before: Ticket, resolved: Ticket, verdict: Verdict, duplicate: { id: string; ticket_no: number } | null,
): Promise<void> {
    await writeFirstResolution(ctx, before.id, resolved);
    await recordEvent(ctx, before.id, 'resolved', {
        resolution_code: verdict.resolution_code, resolved_via: 'manual', note: verdict.resolution_note,
        lost_reason: verdict.lost_reason, action_id: null, duplicate_of_ticket_no: duplicate?.ticket_no ?? null,
    }, { from: before.status, to: 'resolved' });
    if (duplicate) {
        await recordEvent(ctx, before.id, 'duplicate_marked', {
            duplicate_of_ticket_id: duplicate.id, duplicate_of_ticket_no: duplicate.ticket_no,
        });
    }
    await mirrorToConversation(before.conversation_id, { status: 'resolved', unread_count: 0 }, 'resolve');
}

export async function resolveTicket(id: string, body: ResolveBody, ctx: DeskContext): Promise<TicketResolveResponse> {
    let ticket = await requireTicket(id);
    if (ticket.status === 'resolved') return { ticket: toView(ticket, ctx), already_resolved: true };
    ticket = await applyLinkStatus(ctx, ticket, body);
    const category = await categoryFor(ticket, body);
    const duplicate = await findDuplicateTarget(body.duplicate_of_ticket_no);
    const verdict = checkResolveRules({ mode: 'resolve', ticket, category, body, duplicateTarget: duplicate });
    if (!verdict.ok) throw new DeskApiError(verdict.code, verdict.message);
    if (category !== null && category.slug !== ticket.category_slug) {
        ticket = (await classifyTicket(ctx, ticket, category, body.classification_source ?? 'human')) ?? ticket;
    }
    const isDuplicate = verdict.resolution_code === 'duplicate' && duplicate !== null;
    const resolved = await resolveConditionally(ctx, ticket, body, verdict, isDuplicate ? duplicate.id : null);
    if (resolved === null) return onNoRowMatched(ctx, ticket, body);
    await afterResolve(ctx, ticket, resolved, verdict, isDuplicate ? duplicate : null);
    return { ticket: toView(resolved, ctx), already_resolved: false };
}
