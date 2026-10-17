// Route 4: start a ticket by hand (manual / outbound start) on a conversation that already exists.
// The route never creates a conversation. Blueprint U1: a manual ticket on a resolved conversation
// sets that conversation back to open (best effort), so the old inbox does not show it as closed.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { z } from 'zod';
import type { ticketCreateBody } from '../contracts';
import { DeskApiError, dbGuard, repoGuard } from '../api-error';
import { contactFields, type ConversationRow } from '../repo';
import { createSupabaseDeskRepo } from '../repo-supabase';
import { resolveQueueForNumber } from '../rules';
import type { Category, DeskContext, Ticket, TicketCreateResponse } from '../types';
import { mirrorToConversation, recordEvent, requireCategory, requireTicket, toView, TICKETS } from './ticket-store';

type CreateBody = z.infer<typeof ticketCreateBody>;
type LoadedConversation = ConversationRow & { status: string };

async function loadConversation(id: string): Promise<LoadedConversation> {
    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('id, status, contact_id, integrated_number, contacts(id, name, phone)')
        .eq('id', id).limit(1).maybeSingle();
    dbGuard(error, 'conversations');
    if (!data) throw new DeskApiError('not_found', 'Conversation not found.');
    const contact = Array.isArray(data.contacts) ? (data.contacts[0] ?? null) : (data.contacts ?? null);
    return { ...data, contacts: contact } as LoadedConversation;
}

async function findUnresolved(conversationId: string): Promise<Ticket | null> {
    const { data, error } = await supabaseAdmin
        .from(TICKETS).select('*').eq('conversation_id', conversationId).neq('status', 'resolved')
        .order('opened_at', { ascending: false }).limit(1).maybeSingle();
    dbGuard(error, TICKETS);
    return (data as Ticket | null) ?? null;
}

function newTicketRow(conversation: LoadedConversation, category: Category | null, ctx: DeskContext, nowIso: string) {
    const classified = category === null ? {} : {
        category_slug: category.slug, type: category.type, priority: category.priority,
        classification_source: 'human' as const, classified_at: nowIso, classified_by: ctx.actor.id,
    };
    return {
        channel: 'whatsapp' as const,
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        integrated_number: conversation.integrated_number,
        origin: 'manual' as const,
        status: 'new' as const,
        opened_at: nowIso,
        ...contactFields(conversation.contacts),
        assigned_to: ctx.actor.id,
        assigned_name: ctx.actor.name,
        assigned_at: nowIso,
        queue: category?.queue ?? resolveQueueForNumber(conversation.integrated_number, ctx.settings.number_queues),
        ...classified,
    };
}

async function writeCreateEvents(ctx: DeskContext, ticket: Ticket, category: Category | null): Promise<void> {
    await recordEvent(ctx, ticket.id, 'created', {
        origin: 'manual', via: 'api', message_id: null, queue: ticket.queue, lag_secs: null, previous_ticket_id: null,
    }, { to: 'new' });
    await recordEvent(ctx, ticket.id, 'assigned', {
        from: null, to: ctx.actor.id, to_name: ctx.actor.name, auto: true,
    }, { assigneeId: ctx.actor.id });
    if (category === null) return;
    await recordEvent(ctx, ticket.id, 'classified', {
        category_slug: category.slug, type: category.type, queue: category.queue,
        previous_category: null, source: 'human', after_resolution: false,
    });
}

export async function createTicket(
    body: CreateBody,
    ctx: DeskContext,
): Promise<{ response: TicketCreateResponse; status: 200 | 201 }> {
    const conversation = await loadConversation(body.conversation_id);
    const category = body.category_slug ? await requireCategory(body.category_slug, true) : null;
    const existing = await findUnresolved(conversation.id);
    if (existing) return { response: { ticket: toView(existing, ctx), created: false }, status: 200 };
    const inserted = repoGuard(
        await createSupabaseDeskRepo().insertTicket(newTicketRow(conversation, category, ctx, new Date().toISOString())),
        TICKETS,
    );
    if (inserted.outcome === 'conflict' || inserted.data === null) {
        const winner = await findUnresolved(conversation.id);
        if (winner === null) throw new DeskApiError('internal_error', 'Could not create the ticket.');
        return { response: { ticket: toView(winner, ctx), created: false }, status: 200 };
    }
    const ticket = await requireTicket(inserted.data.id);
    await writeCreateEvents(ctx, ticket, category);
    if (conversation.status === 'resolved') {
        await mirrorToConversation(conversation.id, { status: 'open' }, 'create_reopen');
    }
    return { response: { ticket: toView(ticket, ctx), created: true }, status: 201 };
}
