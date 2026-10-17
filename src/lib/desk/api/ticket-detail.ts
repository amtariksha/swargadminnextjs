// Route 2: the ticket detail. Reads only; it does not mark the conversation read. Related
// tickets are matched by customer_phone and by backend_user_id and merged.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import { REFUND_REPEAT_DAYS } from '../constants';
import { dbGuard } from '../api-error';
import type {
    Category, ConversationBrief, DeskContext, MoneyActionBrief, Ticket, TicketAction, TicketDetail,
    TicketEvent, TicketSummary,
} from '../types';
import { loadCategory, requireTicket, toView, TICKETS } from './ticket-store';

const SUMMARY_COLUMNS =
    'id, ticket_no, status, queue, type, category_slug, integrated_number, opened_at, resolved_at, resolution_code, assigned_name, conversation_id';
const MS_PER_DAY = 86_400_000;

type SummaryRow = TicketSummary & { conversation_id: string | null };

async function readSummaries(column: 'customer_phone' | 'backend_user_id', value: string | number): Promise<SummaryRow[]> {
    const { data, error } = await supabaseAdmin
        .from(TICKETS).select(SUMMARY_COLUMNS).eq(column, value).order('ticket_no', { ascending: false }).limit(30);
    dbGuard(error, TICKETS);
    return (data ?? []) as SummaryRow[];
}

async function relatedTickets(ticket: Ticket): Promise<SummaryRow[]> {
    const reads: Array<Promise<SummaryRow[]>> = [];
    if (ticket.customer_phone) reads.push(readSummaries('customer_phone', ticket.customer_phone));
    if (ticket.backend_user_id !== null) reads.push(readSummaries('backend_user_id', ticket.backend_user_id));
    const merged = new Map<string, SummaryRow>();
    for (const row of (await Promise.all(reads)).flat()) {
        if (row.id !== ticket.id) merged.set(row.id, row);
    }
    return [...merged.values()].sort((a, b) => b.ticket_no - a.ticket_no);
}

async function readConversation(conversationId: string | null): Promise<ConversationBrief | null> {
    if (conversationId === null) return null;
    const { data, error } = await supabaseAdmin
        .from('conversations')
        .select('id, status, unread_count, integrated_number, contacts(id, name, phone)')
        .eq('id', conversationId).limit(1).maybeSingle();
    dbGuard(error, 'conversations');
    if (!data) return null;
    const contact = Array.isArray(data.contacts) ? data.contacts[0] : data.contacts;
    return {
        id: data.id, status: data.status, unread_count: Number(data.unread_count ?? 0),
        integrated_number: data.integrated_number,
        contact: { id: contact?.id ?? '', name: contact?.name ?? null, phone: contact?.phone ?? '' },
    };
}

async function readTimeline(table: 'desk_ticket_events' | 'desk_ticket_actions', ticketId: string): Promise<unknown[]> {
    const { data, error } = await supabaseAdmin
        .from(table).select('*').eq('ticket_id', ticketId).order('id').limit(200);
    dbGuard(error, table);
    return data ?? [];
}

async function readMoneyActions(backendUserId: number | null): Promise<MoneyActionBrief[]> {
    if (backendUserId === null) return [];
    const { data: owned, error: ownedError } = await supabaseAdmin
        .from(TICKETS).select('id, ticket_no').eq('backend_user_id', backendUserId).limit(200);
    dbGuard(ownedError, TICKETS);
    const numbers = new Map((owned ?? []).map((row: { id: string; ticket_no: number }) => [row.id, row.ticket_no]));
    if (numbers.size === 0) return [];
    const since = new Date(Date.now() - REFUND_REPEAT_DAYS * MS_PER_DAY).toISOString();
    const { data, error } = await supabaseAdmin
        .from('desk_ticket_actions')
        .select('id, ticket_id, action_type, amount, actor_name, created_at')
        .in('ticket_id', [...numbers.keys()]).in('action_type', ['refund', 'wallet_credit'])
        .gte('created_at', since).order('created_at', { ascending: false }).limit(50);
    dbGuard(error, 'desk_ticket_actions');
    return (data ?? []).map((row: Omit<MoneyActionBrief, 'ticket_no'>) => ({ ...row, ticket_no: numbers.get(row.ticket_id) ?? 0 }));
}

function toSummary(row: SummaryRow): TicketSummary {
    const summary: Partial<SummaryRow> = { ...row };
    delete summary.conversation_id;
    return summary as TicketSummary;
}

export async function getTicketDetail(id: string, ctx: DeskContext): Promise<TicketDetail> {
    const ticket = await requireTicket(id);
    const [category, conversation, events, actions, related, money] = await Promise.all([
        ticket.category_slug ? loadCategory(ticket.category_slug) : Promise.resolve<Category | null>(null),
        readConversation(ticket.conversation_id),
        readTimeline('desk_ticket_events', id),
        readTimeline('desk_ticket_actions', id),
        relatedTickets(ticket),
        readMoneyActions(ticket.backend_user_id),
    ]);
    return {
        ticket: toView(ticket, ctx),
        category,
        conversation,
        events: events as TicketEvent[],
        actions: actions as TicketAction[],
        previous_tickets: related.slice(0, 10).map(toSummary),
        other_open_tickets: related
            .filter((row) => row.status !== 'resolved' && row.conversation_id !== ticket.conversation_id)
            .map(toSummary),
        prior_money_actions: money,
        lead: null,
    };
}
