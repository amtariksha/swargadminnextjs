// Route 5: PATCH /api/desk/tickets/:id, one function per `op`. Every change is one conditional
// UPDATE ... RETURNING *; when no row matches, the ticket is read again and the answer comes from
// what it is now (404, 409, or the unchanged ticket). The assignment is copied to the
// conversation's existing columns (best-effort, `mirrorToConversation`); before migration 017a
// that copy fails with 22P02 and is logged.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { TicketPatchBody } from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import type { DeskContext, Ticket, TicketMutationResponse } from '../types';
import { checkResolveRules } from './rules';
import { resolveStaffName } from './staff';
import {
    classifyTicket, loadTicket, mirrorToConversation, recordEvent, requireCategory, requireTicket, toView, TICKETS, updateTicket,
} from './ticket-store';

type Op<K extends TicketPatchBody['op']> = Extract<TicketPatchBody, { op: K }>;

const nowIso = (): string => new Date().toISOString();

function withoutOp<T extends { op: string }>(body: T): Omit<T, 'op'> {
    const copy: Partial<T> = { ...body };
    delete copy.op;
    return copy as Omit<T, 'op'>;
}

/** The conditional update matched nothing: say why, from the ticket as it is now. */
async function explainNoMatch(id: string, want: 'unresolved' | 'resolved' | 'on_hold'): Promise<Ticket> {
    const current = await loadTicket(id);
    if (current === null) throw new DeskApiError('not_found', 'Ticket not found.');
    if (want === 'unresolved' && current.status === 'resolved') {
        throw new DeskApiError('ticket_resolved', 'This ticket is already resolved.');
    }
    if (want === 'resolved' && current.status !== 'resolved') {
        throw new DeskApiError('ticket_not_resolved', 'This ticket is not resolved yet.');
    }
    if (want === 'on_hold' && current.status === 'resolved') {
        throw new DeskApiError('ticket_resolved', 'This ticket is already resolved.');
    }
    return current;
}

async function patched(id: string, patch: Record<string, unknown>, state: 'unresolved' | 'resolved' | 'on_hold' | 'any'): Promise<Ticket> {
    const row = await updateTicket(id, patch, state);
    if (row !== null) return row;
    if (state === 'any') throw new DeskApiError('not_found', 'Ticket not found.');
    return explainNoMatch(id, state);
}

async function assign(ctx: DeskContext, ticket: Ticket, body: Op<'assign'>): Promise<Ticket> {
    if (ticket.status === 'resolved') throw new DeskApiError('ticket_resolved', 'This ticket is already resolved.');
    const name = body.assigned_to === null ? null : await resolveStaffName(ctx, body.assigned_to);
    const row = await patched(ticket.id, {
        assigned_to: body.assigned_to, assigned_name: name, assigned_at: body.assigned_to === null ? null : nowIso(),
    }, 'unresolved');
    await mirrorToConversation(ticket.conversation_id, {
        assigned_to: row.assigned_to, assigned_name: row.assigned_name, assigned_at: row.assigned_at,
    }, 'assign');
    await recordEvent(ctx, ticket.id, 'assigned', {
        from: ticket.assigned_to, to: body.assigned_to, to_name: name, auto: false,
    }, { assigneeId: body.assigned_to });
    return row;
}

async function classify(ctx: DeskContext, ticket: Ticket, body: Op<'classify'>): Promise<Ticket> {
    const category = await requireCategory(body.category_slug, true);
    const row = await classifyTicket(ctx, ticket, category, body.classification_source);
    if (row === null) throw new DeskApiError('not_found', 'Ticket not found.');
    return row;
}

async function hold(ctx: DeskContext, ticket: Ticket, body: Op<'hold'>): Promise<Ticket> {
    if (ticket.status === 'resolved') throw new DeskApiError('ticket_resolved', 'This ticket is already resolved.');
    if (!(Date.parse(body.follow_up_at) > Date.now())) {
        throw new DeskApiError('follow_up_required', 'Pick a follow-up time in the future.');
    }
    if (body.hold_reason === 'other' && !body.note) throw new DeskApiError('note_required', 'Add a note.');
    const row = await patched(ticket.id, {
        status: 'on_hold', hold_reason: body.hold_reason, follow_up_at: body.follow_up_at,
    }, 'unresolved');
    if (ticket.status !== 'on_hold') {
        await recordEvent(ctx, ticket.id, 'status_changed', { cause: 'hold' }, { from: ticket.status, to: 'on_hold' });
    }
    await recordEvent(ctx, ticket.id, 'held', {
        hold_reason: body.hold_reason, follow_up_at: body.follow_up_at, note: body.note ?? null,
    });
    return row;
}

/** The status the clocks stored on the ticket imply; the next tick corrects a stale value. */
const systemStatus = (ticket: Ticket): 'new' | 'open' | 'waiting_customer' => {
    if (ticket.last_outbound_at === null) return 'new';
    return ticket.awaiting_reply_since !== null ? 'open' : 'waiting_customer';
};

async function releaseHold(ctx: DeskContext, ticket: Ticket): Promise<Ticket> {
    if (ticket.status === 'resolved') throw new DeskApiError('ticket_resolved', 'This ticket is already resolved.');
    if (ticket.status !== 'on_hold') return ticket;
    const next = systemStatus(ticket);
    const row = await updateTicket(ticket.id, { status: next, hold_reason: null, follow_up_at: null }, 'on_hold');
    if (row === null) return explainNoMatch(ticket.id, 'on_hold');
    await recordEvent(ctx, ticket.id, 'status_changed', { cause: 'hold_released' }, { from: 'on_hold', to: next });
    return row;
}

async function snapshot(ctx: DeskContext, ticket: Ticket, body: Op<'customer_snapshot'>): Promise<Ticket> {
    const row = await patched(ticket.id, withoutOp(body), 'any');
    if (body.backend_user_id !== null && ticket.customer_phone) {
        const { error } = await supabaseAdmin
            .from(TICKETS).update({ backend_user_id: body.backend_user_id })
            .eq('customer_phone', ticket.customer_phone).is('backend_user_id', null).neq('id', ticket.id).select('id');
        dbGuard(error, TICKETS);
    }
    if (ticket.backend_user_id !== body.backend_user_id || ticket.customer_match !== body.customer_match) {
        await recordEvent(ctx, ticket.id, 'customer_matched', {
            backend_user_id: body.backend_user_id, customer_match: body.customer_match,
        });
    }
    return row;
}

async function linkDelivery(ctx: DeskContext, ticket: Ticket, body: Op<'link_delivery'>): Promise<Ticket> {
    const patch: Record<string, unknown> = { ...withoutOp(body) };
    if (body.driver_user_id === null) delete patch.driver_user_id;
    if (body.driver_name === null) delete patch.driver_name;
    const row = await patched(ticket.id, patch, 'any');
    await recordEvent(ctx, ticket.id, 'delivery_linked', {
        link_status: body.link_status, order_id: body.order_id, daytime_order_id: body.daytime_order_id,
        delivery_date: body.delivery_date, product_name: body.product_name, driver_user_id: body.driver_user_id,
    });
    return row;
}

async function escalate(ctx: DeskContext, ticket: Ticket, body: Op<'escalate'>): Promise<Ticket> {
    if (ticket.status === 'resolved') throw new DeskApiError('ticket_resolved', 'This ticket is already resolved.');
    const row = await patched(ticket.id, { escalated_at: nowIso(), escalation_reason: body.escalation_reason }, 'unresolved');
    await recordEvent(ctx, ticket.id, 'escalated', {
        escalation_reason: body.escalation_reason, note: body.note ?? null, action_id: null,
    });
    return row;
}

async function wrapUp(ctx: DeskContext, ticket: Ticket, body: Op<'wrap_up'>): Promise<Ticket> {
    if (ticket.status !== 'resolved') throw new DeskApiError('ticket_not_resolved', 'This ticket is not resolved yet.');
    const category = await requireCategory(body.category_slug, true);
    const verdict = checkResolveRules({ mode: 'wrap_up', ticket, category, body, duplicateTarget: null });
    if (!verdict.ok) throw new DeskApiError(verdict.code, verdict.message);
    const row = await patched(ticket.id, {
        category_slug: category.slug, type: category.type, queue: category.queue, priority: category.priority,
        classification_source: 'human', classified_at: nowIso(), classified_by: ctx.actor.id,
        resolution_code: verdict.resolution_code, resolution_note: verdict.resolution_note, lost_reason: verdict.lost_reason,
    }, 'resolved');
    await recordEvent(ctx, ticket.id, 'classified', {
        category_slug: category.slug, type: category.type, queue: category.queue,
        previous_category: ticket.category_slug, source: 'human', after_resolution: true,
    });
    await recordEvent(ctx, ticket.id, 'resolution_updated', {
        resolution_code: verdict.resolution_code, previous_code: ticket.resolution_code, note: verdict.resolution_note,
    });
    return row;
}

async function review(ctx: DeskContext, ticket: Ticket, body: Op<'review'>): Promise<Ticket> {
    const patch: Record<string, unknown> = body.reviewed
        ? { reviewed_at: nowIso(), reviewed_by: ctx.actor.id }
        : { reviewed_at: null, reviewed_by: null };
    if (body.root_cause !== undefined) patch.root_cause = body.root_cause;
    if (body.preventive_action !== undefined) patch.preventive_action = body.preventive_action;
    if (body.review_note !== undefined) patch.review_note = body.review_note;
    const row = await patched(ticket.id, patch, 'any');
    await recordEvent(ctx, ticket.id, 'reviewed', {
        root_cause: row.root_cause, preventive_action: row.preventive_action, review_note: row.review_note,
    });
    return row;
}

async function apply(ctx: DeskContext, ticket: Ticket, body: TicketPatchBody): Promise<Ticket> {
    switch (body.op) {
        case 'assign': return assign(ctx, ticket, body);
        case 'classify': return classify(ctx, ticket, body);
        case 'hold': return hold(ctx, ticket, body);
        case 'release_hold': return releaseHold(ctx, ticket);
        case 'customer_snapshot': return snapshot(ctx, ticket, body);
        case 'link_delivery': return linkDelivery(ctx, ticket, body);
        case 'escalate': return escalate(ctx, ticket, body);
        case 'wrap_up': return wrapUp(ctx, ticket, body);
        case 'review': return review(ctx, ticket, body);
    }
}

export async function patchTicket(id: string, body: TicketPatchBody, ctx: DeskContext): Promise<TicketMutationResponse> {
    // Manager-only op: refused before anything is read.
    if (body.op === 'review' && !ctx.rights.manager) {
        throw new DeskApiError('forbidden', 'Reviewing a ticket needs the Desk manager permission.');
    }
    const ticket = await requireTicket(id);
    return { ticket: toView(await apply(ctx, ticket, body), ctx) };
}
