// Route 6: record a business action on a ticket (contract §2.6, steps 1-15). The browser already
// did the work in the backend; this verifies it with the caller's token, records it, classifies and
// resolves (or holds) the ticket in the same call. Resolving is conditional on the seen-inbound token.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import {
    actionResolveCode, backstopFlag, canResolve, customerPatch, followUpProblem, isNoMoneyAction, needsTomorrowCheck,
    planOutcome, replayResult, requestProblem, snapshotColumnsPatch, type BackstopFlag, type OutcomePlan,
} from '../action-plan';
import { DeskApiError, dbGuard } from '../api-error';
import { REFUND_REPEAT_DAYS, UNIQUE_REF_ACTIONS } from '../constants';
import type { TicketActionBody } from '../contracts';
import { fetchSnapshotForTicket } from '../snapshot-server';
import type { Category, CustomerSnapshot, DeskContext, Ticket, TicketAction, TicketActionResponse } from '../types';
import { verifyAction, type VerifyOutcome } from './action-verify';
import { checkResolveRules, type ResolveRuleResult } from './rules';
import { writeFirstResolution } from './ticket-resolve';
import {
    classifyTicket, loadCategory, mirrorToConversation, recordEvent, requireCategory, requireTicket,
    toView, TICKETS, updateTicket,
} from './ticket-store';

const ACTIONS = 'desk_ticket_actions';
const MS_PER_DAY = 86_400_000;
const CONFLICT_MESSAGE = 'A new customer message arrived. Read it before resolving.';
const SNAPSHOT_TYPES: readonly string[] = [
    'refund', 'wallet_credit', 'holiday_added', 'day_order_created', 'app_order_created', 'subscription_updated',
];

type Outcome = TicketActionResponse['outcome'];
type ResolveVerdict = Extract<ResolveRuleResult, { ok: true }>;

const needsSnapshot = (body: TicketActionBody): boolean =>
    SNAPSHOT_TYPES.includes(body.action_type) || needsTomorrowCheck(body);

function answer(
    ctx: DeskContext, ticket: Ticket, action: TicketAction, outcome: Outcome, flagged: BackstopFlag = null,
): TicketActionResponse {
    return { ticket: toView(ticket, ctx), action, outcome, replayed: false, flagged };
}

function replayAnswer(ctx: DeskContext, ticket: Ticket, action: TicketAction): TicketActionResponse {
    return { ticket: toView(ticket, ctx), action, ...replayResult(action, ticket), replayed: true };
}

async function findByClientId(clientActionId: string): Promise<TicketAction | null> {
    const { data, error } = await supabaseAdmin
        .from(ACTIONS).select('*').eq('client_action_id', clientActionId).limit(1).maybeSingle();
    dbGuard(error, ACTIONS);
    return (data as TicketAction | null) ?? null;
}

async function findByReference(body: TicketActionBody): Promise<TicketAction | null> {
    if (!(UNIQUE_REF_ACTIONS as readonly string[]).includes(body.action_type)) return null;
    const { data, error } = await supabaseAdmin
        .from(ACTIONS).select('*').eq('ref_type', body.ref_type).eq('ref_id', body.ref_id)
        .in('action_type', [...UNIQUE_REF_ACTIONS]).limit(1).maybeSingle();
    dbGuard(error, ACTIONS);
    return (data as TicketAction | null) ?? null;
}

/** Steps 5 and 6: a stored row for this client id or money reference. */
async function findExisting(ctx: DeskContext, ticket: Ticket, body: TicketActionBody): Promise<TicketActionResponse | null> {
    const byClient = await findByClientId(body.client_action_id);
    if (byClient !== null) {
        if (byClient.ticket_id !== ticket.id) throw new DeskApiError('duplicate_reference', 'This action id belongs to another ticket.');
        return replayAnswer(ctx, ticket, byClient);
    }
    const byRef = await findByReference(body);
    if (byRef === null) return null;
    if (byRef.ticket_id !== ticket.id) throw new DeskApiError('duplicate_reference', 'This refund or credit is already recorded on another ticket.');
    return replayAnswer(ctx, ticket, byRef);
}

async function categoryOf(ticket: Ticket, body: TicketActionBody): Promise<Category | null> {
    if (body.category_slug) return requireCategory(body.category_slug, true);
    return ticket.category_slug ? loadCategory(ticket.category_slug) : null;
}

function resolveVerdict(ticket: Ticket, category: Category | null, body: TicketActionBody): ResolveVerdict {
    const verdict = checkResolveRules({
        mode: 'resolve', ticket, category,
        body: { resolution_code: actionResolveCode(body, category?.type ?? null) ?? undefined, resolution_note: body.resolution_note },
        duplicateTarget: null,
    });
    if (!verdict.ok) throw new DeskApiError(verdict.code, verdict.message);
    return verdict;
}

async function insertAction(
    ctx: DeskContext, ticket: Ticket, body: TicketActionBody, verification: VerifyOutcome,
): Promise<TicketAction | 'conflict'> {
    const { data, error } = await supabaseAdmin.from(ACTIONS).insert({
        client_action_id: body.client_action_id, ticket_id: ticket.id, action_type: body.action_type,
        ref_type: body.ref_type, ref_id: body.ref_id, amount: verification.amount ?? body.amount,
        verified: verification.verified, data: body.data, resolved_ticket: false,
        actor_id: ctx.actor.id, actor_name: ctx.actor.name,
    }).select('*');
    if (dbGuard(error, ACTIONS) === 'conflict') return 'conflict';
    const rows = (data ?? []) as TicketAction[];
    if (rows.length !== 1) throw new DeskApiError('internal_error', 'Database error.');
    return rows[0];
}

/** Step 10: the snapshot columns the action owns, then the ticket's customer (D-5). */
async function applyTicketColumns(
    ctx: DeskContext, ticket: Ticket, body: TicketActionBody, verification: VerifyOutcome,
): Promise<Ticket> {
    const userId = body.action_type === 'customer_linked' ? body.data.user_id : verification.confirmedUserId;
    const customer = customerPatch(ticket, userId);
    const patch = { ...snapshotColumnsPatch(body, ticket, verification), ...(customer ?? {}) };
    if (Object.keys(patch).length === 0) return ticket;
    const updated = (await updateTicket(ticket.id, patch, 'any')) ?? ticket;
    if (customer !== null) await recordEvent(ctx, ticket.id, 'customer_matched', customer);
    return updated;
}

/** D-11: other refund / credit actions for the customer inside REFUND_REPEAT_DAYS (any ticket). */
async function countOtherMoneyActions(ticket: Ticket, action: TicketAction, nowMs: number): Promise<number> {
    if (ticket.backend_user_id === null) return 0;
    const { data: tickets, error: ticketError } = await supabaseAdmin
        .from(TICKETS).select('id').eq('backend_user_id', ticket.backend_user_id).limit(200);
    dbGuard(ticketError, TICKETS);
    const ids = ((tickets ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (ids.length === 0) return 0;
    const { data, error } = await supabaseAdmin.from(ACTIONS).select('id')
        .in('ticket_id', ids).in('action_type', ['refund', 'wallet_credit'])
        .gte('created_at', new Date(nowMs - REFUND_REPEAT_DAYS * MS_PER_DAY).toISOString())
        .neq('id', action.id).limit(1);
    dbGuard(error, ACTIONS);
    return (data ?? []).length;
}

async function escalate(
    ctx: DeskContext, ticket: Ticket, action: TicketAction, flag: NonNullable<BackstopFlag>, nowMs: number,
): Promise<TicketActionResponse> {
    const row = await updateTicket(ticket.id, { escalated_at: new Date(nowMs).toISOString(), escalation_reason: flag }, 'unresolved');
    if (row !== null) await recordEvent(ctx, ticket.id, 'escalated', { escalation_reason: flag, note: null, action_id: action.id });
    return answer(ctx, row ?? ticket, action, 'recorded', flag);
}

async function holdByAction(
    ctx: DeskContext, ticket: Ticket, action: TicketAction, plan: Extract<OutcomePlan, { kind: 'hold' }>,
): Promise<TicketActionResponse> {
    const row = await updateTicket(
        ticket.id, { status: 'on_hold', hold_reason: plan.hold_reason, follow_up_at: plan.follow_up_at }, 'unresolved',
    );
    if (row === null) return answer(ctx, await requireTicket(ticket.id), action, 'recorded');
    if (ticket.status !== 'on_hold') {
        await recordEvent(ctx, ticket.id, 'status_changed', { cause: 'hold' }, { from: ticket.status, to: 'on_hold' });
    }
    await recordEvent(ctx, ticket.id, 'held', { hold_reason: plan.hold_reason, follow_up_at: plan.follow_up_at, note: null });
    return answer(ctx, row, action, 'held');
}

/** Idiom I6: one conditional UPDATE; the token goes into .lte() exactly as the client sent it. */
async function resolveRow(ctx: DeskContext, ticket: Ticket, body: TicketActionBody, verdict: ResolveVerdict): Promise<Ticket | null> {
    const patch = {
        status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: ctx.actor.id,
        resolved_by_name: ctx.actor.name, resolution_code: verdict.resolution_code,
        resolution_note: verdict.resolution_note, resolved_via: 'action', lost_reason: verdict.lost_reason,
        awaiting_reply_since: null, follow_up_at: null, hold_reason: null,
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

async function onResolved(
    ctx: DeskContext, ticket: Ticket, resolved: Ticket, action: TicketAction, verdict: ResolveVerdict,
): Promise<TicketActionResponse> {
    const { error } = await supabaseAdmin.from(ACTIONS).update({ resolved_ticket: true }).eq('id', action.id).select('id');
    if (error) console.error('[desk-api] action resolved flag write failed');
    await writeFirstResolution(ctx, ticket.id, resolved);
    await recordEvent(ctx, ticket.id, 'resolved', {
        resolution_code: verdict.resolution_code, resolved_via: 'action', note: verdict.resolution_note,
        lost_reason: verdict.lost_reason, action_id: action.id, duplicate_of_ticket_no: null,
    }, { from: ticket.status, to: 'resolved' });
    await mirrorToConversation(ticket.conversation_id, { status: 'resolved', unread_count: 0 }, 'action');
    return answer(ctx, resolved, { ...action, resolved_ticket: true }, 'resolved');
}

async function resolveByAction(
    ctx: DeskContext, ticket: Ticket, action: TicketAction, body: TicketActionBody, verdict: ResolveVerdict,
): Promise<TicketActionResponse> {
    const resolved = await resolveRow(ctx, ticket, body, verdict);
    if (resolved !== null) return onResolved(ctx, ticket, resolved, action, verdict);
    const fresh = await requireTicket(ticket.id);
    if (fresh.status === 'resolved') return answer(ctx, fresh, action, 'recorded');
    await recordEvent(ctx, ticket.id, 'resolve_conflict', {
        attempted_via: 'action', action_id: action.id,
        seen_inbound_at: body.seen_inbound_at, last_inbound_at: fresh.last_inbound_at,
    });
    throw new DeskApiError('new_customer_message', CONFLICT_MESSAGE, { ticket: toView(fresh, ctx), action });
}

/** Steps 2-8: everything checked before a row is written. */
async function prepare(id: string, body: TicketActionBody, ctx: DeskContext, nowMs: number) {
    const ticket = await requireTicket(id);
    if (!ctx.rights.money && !isNoMoneyAction(body.action_type)) {
        throw new DeskApiError('money_not_allowed', 'Your Desk access does not include this action.');
    }
    if (body.resolve && !canResolve(body.action_type)) {
        throw new DeskApiError('action_cannot_resolve', 'This action does not close a ticket.');
    }
    const problem = requestProblem(body, ticket.ticket_no);
    if (problem !== null) throw new DeskApiError('validation_failed', problem);
    const followUp = followUpProblem(body, nowMs);
    if (followUp !== null) throw new DeskApiError(followUp, 'The follow-up time must be in the future.');
    const existing = await findExisting(ctx, ticket, body);
    if (existing !== null) return { ticket, existing } as const;
    const category = await categoryOf(ticket, body);
    const snapshot: Promise<CustomerSnapshot | null> = needsSnapshot(body) && ticket.customer_phone
        ? fetchSnapshotForTicket(ctx.token, ticket.customer_phone)
        : Promise.resolve(null);
    const verification = await verifyAction(body, ctx.token, snapshot);
    const listGenerated = needsTomorrowCheck(body) ? ((await snapshot)?.tomorrow.list_generated ?? null) : null;
    const plan = planOutcome({ body, ticketResolved: ticket.status === 'resolved', listGenerated, nowMs });
    const verdict = plan.kind === 'resolve' ? resolveVerdict(ticket, category, body) : null;
    return { ticket, existing: null, category, verification, plan, verdict } as const;
}

export async function recordTicketAction(id: string, body: TicketActionBody, ctx: DeskContext): Promise<TicketActionResponse> {
    const nowMs = Date.now();
    const prepared = await prepare(id, body, ctx, nowMs);
    if (prepared.existing !== null) return prepared.existing;
    const { category, verification, plan, verdict } = prepared;
    const inserted = await insertAction(ctx, prepared.ticket, body, verification);
    if (inserted === 'conflict') {
        const again = await findExisting(ctx, prepared.ticket, body);
        if (again === null) throw new DeskApiError('internal_error', 'Database error.');
        return again;
    }
    let ticket = await applyTicketColumns(ctx, prepared.ticket, body, verification);
    if (category !== null && category.slug !== prepared.ticket.category_slug) {
        ticket = (await classifyTicket(ctx, ticket, category, body.classification_source ?? 'human')) ?? ticket;
    }
    if (prepared.ticket.status === 'resolved') return answer(ctx, ticket, inserted, 'recorded');
    const isMoney = body.action_type === 'refund' || body.action_type === 'wallet_credit';
    const others = isMoney && !ctx.rights.manager ? await countOtherMoneyActions(ticket, inserted, nowMs) : 0;
    const flag = backstopFlag({
        isManager: ctx.rights.manager, actionType: body.action_type, amount: inserted.amount,
        creditMaxAgent: ctx.settings.credit_max_agent, otherMoneyActions: others,
    });
    if (flag !== null) return escalate(ctx, ticket, inserted, flag, nowMs);
    if (plan.kind === 'hold') return holdByAction(ctx, ticket, inserted, plan);
    if (plan.kind === 'resolve' && verdict !== null) return resolveByAction(ctx, ticket, inserted, body, verdict);
    return answer(ctx, ticket, inserted, 'recorded');
}
