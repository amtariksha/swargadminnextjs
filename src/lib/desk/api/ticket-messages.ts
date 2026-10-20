// Route 3: the messages of a ticket's conversation, newest page first in the query, oldest first in
// the answer. The whole conversation (every episode, internal notes included), mapped like the old
// inbox's mapMessage plus the four Desk fields. Reads only; it does not mark anything read.

import type { z } from 'zod';
import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { renderTemplateBody } from '@/lib/whatsapp/utils';
import { dbGuard } from '../api-error';
import type { ticketMessagesQuery } from '../contracts';
import type { DeskContext, DeskMessage, TicketMessagesResponse } from '../types';
import { requireTicket } from './ticket-store';

export type TicketMessagesQuery = z.infer<typeof ticketMessagesQuery>;

export const DESK_THREAD_COLUMNS =
    'id, conversation_id, direction, content_type, body, media_url, file_name, status, is_internal_note, created_at, source, failure_reason, ticket_id, template_name, sent_by_user_id, sent_by_name';

export interface MessageRow {
    id: string;
    conversation_id: string | null;
    direction: string | null;
    content_type: string | null;
    body: string | null;
    media_url: string | null;
    file_name: string | null;
    status: string | null;
    is_internal_note: boolean | null;
    created_at: string | null;
    source: string | null;
    failure_reason: string | null;
    ticket_id: string | null;
    template_name: string | null;
    sent_by_user_id: string | null;
    sent_by_name: string | null;
}

export function toDeskMessage(row: MessageRow): DeskMessage {
    return {
        id: row.id,
        conversationId: row.conversation_id ?? '',
        direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
        contentType: row.content_type || 'text',
        body: renderTemplateBody(row.body),
        mediaUrl: row.media_url || undefined,
        fileName: row.file_name || undefined,
        status: row.status || 'sent',
        isInternalNote: row.is_internal_note === true || row.direction === 'internal',
        timestamp: row.created_at ?? '',
        source: row.source || undefined,
        failureReason: row.failure_reason || undefined,
        ticketId: row.ticket_id ?? null,
        templateName: row.template_name ?? null,
        sentByUserId: row.sent_by_user_id ?? null,
        sentByName: row.sent_by_name ?? null,
    };
}

/** `rowsNewestFirst` is the query order; the page is returned oldest first. */
export function toMessagesPage(rowsNewestFirst: readonly MessageRow[], limit: number): TicketMessagesResponse {
    const oldest = rowsNewestFirst.length >= limit ? rowsNewestFirst[rowsNewestFirst.length - 1] : undefined;
    return {
        items: [...rowsNewestFirst].reverse().map(toDeskMessage),
        older_cursor: oldest?.created_at ?? null,
    };
}

export async function listTicketMessages(
    id: string,
    query: TicketMessagesQuery,
    _ctx: DeskContext,
): Promise<TicketMessagesResponse> {
    const ticket = await requireTicket(id);
    if (ticket.conversation_id === null) return { items: [], older_cursor: null };
    let builder = supabaseAdmin
        .from('messages')
        .select(DESK_THREAD_COLUMNS)
        .eq('conversation_id', ticket.conversation_id);
    // `before` is the cursor exactly as the previous page returned it (microseconds included).
    if (query.before !== undefined) builder = builder.lte('created_at', query.before);
    const { data, error } = await builder
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(query.limit);
    dbGuard(error, 'messages');
    return toMessagesPage((data ?? []) as unknown as MessageRow[], query.limit);
}
