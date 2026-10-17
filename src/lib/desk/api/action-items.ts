// Routes 14 to 16: morning-meeting follow-ups (manager). The id of a PATCH is in the body.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { z } from 'zod';
import type { actionItemCreateBody, actionItemPatchBody, actionItemsQuery } from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import { istToday } from '../business-hours';
import type { ActionItem, ActionItemResponse, ActionItemsResponse, DeskContext } from '../types';
import { resolveStaffName } from './staff';
import { loadTicket } from './ticket-store';

const TABLE = 'desk_action_items';

export async function listActionItems(query: z.infer<typeof actionItemsQuery>): Promise<ActionItemsResponse> {
    let builder = supabaseAdmin.from(TABLE).select('*');
    if (query.status) builder = builder.eq('status', query.status);
    if (query.ticket_id) builder = builder.eq('ticket_id', query.ticket_id);
    if (query.cursor !== undefined) {
        if (!/^[0-9]{1,15}$/.test(query.cursor)) throw new DeskApiError('validation_failed', 'cursor: not a valid cursor');
        builder = builder.lt('id', Number(query.cursor));
    }
    const { data, error } = await builder.order('id', { ascending: false }).limit(query.limit + 1);
    dbGuard(error, TABLE);
    const rows = (data ?? []) as ActionItem[];
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    return { items, next_cursor: rows.length > query.limit && last ? String(last.id) : null };
}

export async function createActionItem(
    body: z.infer<typeof actionItemCreateBody>,
    ctx: DeskContext,
): Promise<ActionItemResponse> {
    if (body.ticket_id && (await loadTicket(body.ticket_id)) === null) {
        throw new DeskApiError('not_found', 'Ticket not found.');
    }
    const ownerName = body.owner_id ? await resolveStaffName(ctx, body.owner_id) : null;
    const { data, error } = await supabaseAdmin.from(TABLE).insert({
        title: body.title,
        detail: body.detail ?? null,
        ticket_id: body.ticket_id ?? null,
        owner_id: body.owner_id ?? null,
        owner_name: ownerName,
        due_date: body.due_date ?? null,
        review_date: body.review_date ?? istToday(new Date()),
        data: body.data ?? {},
        created_by: ctx.actor.id,
        created_by_name: ctx.actor.name,
    }).select('*');
    dbGuard(error, TABLE);
    const row = (data ?? [])[0] as ActionItem | undefined;
    if (!row) throw new DeskApiError('internal_error', 'Could not create the action item.');
    return { item: row };
}

function statusFields(body: z.infer<typeof actionItemPatchBody>, ctx: DeskContext, nowIso: string): Record<string, unknown> {
    if (body.status === undefined) return body.done_note === undefined ? {} : { done_note: body.done_note };
    if (body.status === 'open') return { done_at: null, done_by: null, done_by_name: null, done_note: null };
    return {
        done_at: nowIso, done_by: ctx.actor.id, done_by_name: ctx.actor.name,
        ...(body.done_note === undefined ? {} : { done_note: body.done_note }),
    };
}

export async function patchActionItem(
    body: z.infer<typeof actionItemPatchBody>,
    ctx: DeskContext,
): Promise<ActionItemResponse> {
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: nowIso, ...statusFields(body, ctx, nowIso) };
    if (body.title !== undefined) patch.title = body.title;
    if (body.detail !== undefined) patch.detail = body.detail;
    if (body.due_date !== undefined) patch.due_date = body.due_date;
    if (body.status !== undefined) patch.status = body.status;
    if (body.owner_id !== undefined) {
        patch.owner_id = body.owner_id;
        patch.owner_name = body.owner_id === null ? null : await resolveStaffName(ctx, body.owner_id);
    }
    const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq('id', body.id).select('*');
    dbGuard(error, TABLE);
    const row = (data ?? [])[0] as ActionItem | undefined;
    if (!row) throw new DeskApiError('not_found', 'Action item not found.');
    return { item: row };
}
