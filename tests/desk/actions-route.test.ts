import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
    tables: {} as Record<string, Row[]>, nextNo: 1000, nextActionId: 1, failTable: '', hideActionSelects: 0,
}));

vi.mock('@/lib/whatsapp/supabase', () => ({ supabaseAdmin: { from: (table: string) => new FakeQuery(table) } }));

const TICKET_COLUMNS = [
    'channel', 'conversation_id', 'contact_id', 'integrated_number', 'origin', 'previous_ticket_id', 'duplicate_of_ticket_id',
    'lead_id', 'customer_phone', 'customer_name', 'backend_user_id', 'customer_match', 'type', 'category_slug',
    'suggested_type', 'suggested_category', 'classification_source', 'classified_at', 'classified_by', 'assigned_to',
    'assigned_name', 'assigned_at', 'last_inbound_at', 'last_outbound_at', 'awaiting_reply_since', 'first_response_at',
    'follow_up_at', 'hold_reason', 'last_reopened_at', 'escalated_at', 'escalation_reason', 'resolved_at', 'resolved_by',
    'resolved_by_name', 'resolution_code', 'resolution_note', 'resolved_via', 'lost_reason', 'first_resolved_at',
    'first_resolved_by', 'first_resolved_code', 'root_cause', 'preventive_action', 'link_status', 'reviewed_at',
    'reviewed_by', 'review_note', 'product_name', 'delivery_date', 'order_id',
];

const asMs = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) : Number.NaN);
const sameKind = (a: unknown, b: unknown): number =>
    (Number.isFinite(asMs(a)) && Number.isFinite(asMs(b)) ? asMs(a) - asMs(b) : Number(a) - Number(b));

// In-memory stand-in for supabaseAdmin (copied from api-rules.test.ts, extended for desk_ticket_actions).
class FakeQuery implements PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null; count: number | null }> {
    private filters: Array<(row: Row) => boolean> = [];
    private action: 'select' | 'insert' | 'update' = 'select';
    private payload: Row = {};
    private returning = false;
    private wantCount = false;
    private cap = Infinity;
    private sortBy: { column: string; ascending: boolean } | null = null;
    private one = false;
    constructor(private readonly table: string) {}

    select(_columns?: string, options?: { count?: string }) { this.returning = true; this.wantCount = options?.count === 'exact'; return this; }
    insert(row: Row) { this.action = 'insert'; this.payload = row; return this; }
    update(patch: Row) { this.action = 'update'; this.payload = patch; return this; }
    eq(column: string, value: unknown) {
        const [base, path] = column.split('->>');
        return this.where((row) => (path === undefined ? row[column] : String((row[base] as Row | undefined)?.[path])) === value);
    }
    neq(column: string, value: unknown) { return this.where((row) => row[column] !== undefined && row[column] !== null && row[column] !== value); }
    is(column: string, value: null) { return this.where((row) => (row[column] ?? null) === value); }
    lte(column: string, value: string) { return this.where((row) => row[column] != null && sameKind(row[column], value) <= 0); }
    gte(column: string, value: string) { return this.where((row) => row[column] != null && sameKind(row[column], value) >= 0); }
    lt(column: string, value: string | number) { return this.where((row) => row[column] != null && sameKind(row[column], value) < 0); }
    in(column: string, values: unknown[]) { return this.where((row) => values.includes(row[column])); }
    not(column: string, _operator: string, value: string) {
        const list = value.replace(/[()]/g, '').split(',');
        return this.where((row) => row[column] != null && !list.includes(String(row[column])));
    }
    ilike(column: string, pattern: string) {
        const needle = pattern.replace(/%/g, '').toLowerCase();
        return this.where((row) => String(row[column] ?? '').toLowerCase().includes(needle));
    }
    order(column: string, options?: { ascending?: boolean }) { this.sortBy = { column, ascending: options?.ascending !== false }; return this; }
    limit(count: number) { this.cap = count; return this; }
    abortSignal() { return this; }
    maybeSingle() { this.one = true; return this; }
    private where(test: (row: Row) => boolean) { this.filters.push(test); return this; }

    private matches(): Row[] {
        let rows = (store.tables[this.table] ?? []).filter((row) => this.filters.every((test) => test(row)));
        if (this.sortBy) {
            const { column, ascending } = this.sortBy;
            rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * sameKind(a[column], b[column]));
        }
        return rows;
    }

    private run() {
        const table = (store.tables[this.table] ??= []);
        if (store.failTable === this.table) return { data: null, error: { code: '42P01', message: 'missing' }, count: null };
        if (this.table === 'desk_ticket_actions' && this.action === 'select' && store.hideActionSelects > 0) {
            store.hideActionSelects -= 1;
            return { data: this.one ? null : [], error: null, count: null };
        }
        if (this.action === 'insert') return this.runInsert(table);
        const matched = this.matches();
        if (this.action === 'update') {
            for (const row of matched) Object.assign(row, this.payload);
            return { data: this.returning ? matched.map((row) => ({ ...row })) : null, error: null, count: null };
        }
        const limited = matched.slice(0, this.cap);
        if (this.one) {
            return limited.length > 1
                ? { data: null, error: { code: 'PGRST116', message: 'multiple rows' }, count: null }
                : { data: limited[0] ? { ...limited[0] } : null, error: null, count: null };
        }
        return { data: limited.map((row) => ({ ...row })), error: null, count: this.wantCount ? matched.length : null };
    }

    private runInsert(table: Row[]) {
        const row: Row = { ...this.payload };
        if (this.table === 'desk_tickets') {
            const clash = table.some((other) => other.conversation_id === row.conversation_id && other.status !== 'resolved');
            if (clash) return { data: null, error: { code: '23505', message: 'duplicate' }, count: null };
            Object.assign(row, {
                id: `00000000-0000-4000-8000-${String(store.nextNo).padStart(12, '0')}`, ticket_no: store.nextNo += 1,
                priority: 3, reopen_count: 0, is_ack_only: false, queue: 'care', ...Object.fromEntries(TICKET_COLUMNS.map((c) => [c, null])), ...row,
            });
        } else if (this.table === 'desk_ticket_actions') {
            const money = ['refund', 'wallet_credit'];
            const clash = table.some((other) => other.client_action_id === row.client_action_id
                || (money.includes(String(row.action_type)) && money.includes(String(other.action_type))
                    && other.ref_type === row.ref_type && other.ref_id === row.ref_id));
            if (clash) return { data: null, error: { code: '23505', message: 'duplicate' }, count: null };
            Object.assign(row, { id: store.nextActionId++, created_at: '2026-10-20T06:00:00.000Z', verified: false, resolved_ticket: false, ...row });
        } else if (this.table === 'desk_action_items') {
            Object.assign(row, { id: (store.nextNo += 1), status: 'open', ...row });
        }
        table.push(row);
        return { data: this.returning ? [{ ...row }] : null, error: null, count: null };
    }

    then<A, B>(onfulfilled?: ((value: ReturnType<FakeQuery['run']>) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
        return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
}


const backend = vi.hoisted(() => {
    const state = {
        calls: [] as string[],
        answers: {} as Record<string, () => Promise<Response>>,
        posts: [] as Array<[string, unknown]>,
        postStatus: 200,
        postFails: false,
    };
    return {
        state,
        deskBackendGet: (path: string): Promise<Response> => {
            state.calls.push(path);
            const answer = state.answers[path];
            return answer ? answer() : Promise.resolve(new Response('{}', { status: 404 }));
        },
        deskBackendPost: (path: string, _token: string, body: unknown): Promise<Response> => {
            state.posts.push([path, body]);
            if (state.postFails) return Promise.reject(new DOMException('timeout', 'TimeoutError'));
            return Promise.resolve(new Response('{}', { status: state.postStatus }));
        },
    };
});
vi.mock('@/lib/desk/backend', () => ({
    deskBackendGet: backend.deskBackendGet, deskBackendPost: backend.deskBackendPost,
}));

const schemaStub = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('@/lib/desk/snapshot-schema', () => ({ parseSnapshotEnvelope: () => schemaStub.result }));

const snapshotMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/desk/snapshot-server', () => ({ fetchSnapshotForTicket: snapshotMock }));

import { recordTicketAction } from '@/lib/desk/api/ticket-actions';
import {
    combineChecks, judgeCreditTxn, judgeDayOrder, judgeHolidayRows, judgePaymentLink, judgeRefundContext, judgeRefundTie,
    judgeUserInSet,
} from '@/lib/desk/api/action-verify';
import { DESK_WRAPPED } from '@/lib/desk/authz';
import { ticketActionBody, type TicketActionBody } from '@/lib/desk/contracts';
import { allOffDeskSettings } from '@/lib/desk/settings';
import { DeskApiError } from '@/lib/desk/api-error';
import type { CustomerSnapshot, DeskContext } from '@/lib/desk/types';

const NOW = new Date('2026-10-20T06:00:00.000Z');
const TICKET = '00000000-0000-4000-8000-000000000001';
const OTHER_TICKET = '00000000-0000-4000-8000-000000000002';
const SEEN = '2026-10-20T05:00:00.000000+00:00';
const C1 = '11111111-1111-4111-8111-111111111111';
const TOMORROW_0830 = '2026-10-21T03:00:00.000Z';

const ctxOf = (opts: { manager?: boolean; money?: boolean } = {}): DeskContext => ({
    actor: { id: '7', name: 'Asha' },
    rights: { agent: true, manager: opts.manager ?? false, money: opts.money ?? true, inbox: true, via: 'permission' },
    token: 'tok',
    settings: { ...allOffDeskSettings(), readable: true, ui_enabled: true, credit_max_agent: 200 },
});

const snap = (kind: string, user: number | null, candidates: number[], listGenerated = false): CustomerSnapshot => ({
    match: { kind, user_id: user, candidates: candidates.map((id) => ({ user_id: id })) },
    tomorrow: { list_generated: listGenerated },
} as unknown as CustomerSnapshot);

const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
const timeout = () => Promise.reject(new DOMException('timeout', 'TimeoutError'));
const txnAnswer = (
    id: number, user: number, amount: number, type = 1, paymentId: string | null = null,
    orderId: number | null = null, createdAt: string | null = null,
) => json({ response: 200, data: { id, user_id: user, amount, type, payment_id: paymentId, order_id: orderId, created_at: createdAt } });

function seedTicket(over: Row = {}, id = TICKET): Row {
    const row: Row = {
        ...Object.fromEntries(TICKET_COLUMNS.map((column) => [column, null])),
        id, ticket_no: 41, channel: 'whatsapp', conversation_id: 'conv-1', origin: 'inbound', status: 'open',
        queue: 'care', priority: 3, opened_at: '2026-10-20T04:00:00+00:00', reopen_count: 0, is_ack_only: false,
        customer_phone: '919845012345', last_inbound_at: SEEN, awaiting_reply_since: SEEN,
        category_slug: 'milk_spoilage', type: 'complaint', backend_user_id: 501, link_status: 'linked',
        daytime_order_id: null, order_value: null, payment_status: null, ...over,
    };
    (store.tables.desk_tickets ??= []).push(row);
    return row;
}

const ticketRow = (): Row => (store.tables.desk_tickets ?? []).find((row) => row.id === TICKET) as Row;
const actions = (): Row[] => store.tables.desk_ticket_actions ?? [];
const eventTypes = (): string[] => (store.tables.desk_ticket_events ?? []).map((event) => String(event.type));
const catching = async (task: Promise<unknown>): Promise<DeskApiError> => {
    try { await task; } catch (error) { return error as DeskApiError; }
    throw new Error('expected a DeskApiError');
};

const base = { client_action_id: C1, seen_inbound_at: SEEN, resolve: true };
const refundBody = (over: Record<string, unknown> = {}): TicketActionBody => ticketActionBody.parse({
    ...base, action_type: 'refund', ref_type: 'transaction', ref_id: '9101', amount: 32,
    data: {
        debit_txn_id: 8800, order_id: 812, delivery_date: '2026-10-19', refund_reason: 'Product quality',
        billed_to_driver: false, billed_driver_id: null, driver_deduction_amount: null, new_wallet_balance: 412.5,
        user_id: 501,
    },
    ...over,
});
const walletBody = (amount = 250, over: Record<string, unknown> = {}, data: Record<string, unknown> = {}): TicketActionBody =>
    ticketActionBody.parse({
        ...base, action_type: 'wallet_credit', ref_type: 'transaction', ref_id: '77', amount,
        data: { user_id: 501, description: 'Desk credit', payment_id: `desk-${C1}`, ...data }, ...over,
    });
const replacementBody = (followUp = '2026-10-21T08:30:00+05:30', over: Record<string, unknown> = {}): TicketActionBody =>
    ticketActionBody.parse({
        ...base, resolve: false, action_type: 'replacement_promised', ref_type: 'promise',
        ref_id: 'replacement:41:2026-10-21', amount: null, hold: { follow_up_at: followUp },
        data: { promised_date: '2026-10-21', note: 'Fresh packet tomorrow', product_name: null }, ...over,
    });
const appOrderBody = (over: Record<string, unknown> = {}): TicketActionBody => ticketActionBody.parse({
    ...base, action_type: 'app_order_created', ref_type: 'order', ref_id: '812', amount: 450,
    category_slug: 'change_subscription',
    data: { order_id: 812, product_id: 3, subscription_type: 3, start_date: null, affects_tomorrow: true }, ...over,
});
const dayOrderBody = (): TicketActionBody => ticketActionBody.parse({
    ...base, action_type: 'day_order_created', ref_type: 'daytime_order', ref_id: '300', amount: 120,
    category_slug: 'new_day_order', resolution_code: 'won',
    data: {
        daytime_order_id: 300, delivery_date: '2026-10-21', payment_step: 'link_sent', payment_status: 'unpaid',
        payment_mode: 'link', payment_link_id: null, new_customer: false,
    },
});

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    store.tables = {
        desk_categories: [
            { slug: 'milk_spoilage', type: 'complaint', queue: 'care', priority: 2, active: true, default_resolution_code: 'explained', requires_delivery_link: true },
            { slug: 'general_enquiry', type: 'enquiry', queue: 'care', priority: 3, active: true, default_resolution_code: 'answered', requires_delivery_link: false },
            { slug: 'change_subscription', type: 'request', queue: 'care', priority: 3, active: true, default_resolution_code: 'done', requires_delivery_link: false },
            { slug: 'new_day_order', type: 'sales', queue: 'sales', priority: 3, active: true, default_resolution_code: null, requires_delivery_link: false },
        ],
        conversations: [{ id: 'conv-1', status: 'open', unread_count: 2 }],
    };
    store.nextNo = 1000;
    store.nextActionId = 1;
    store.failTable = '';
    store.hideActionSelects = 0;
    backend.state.calls = [];
    backend.state.answers = {
        '/txn/9101': txnAnswer(9101, 501, 32, 1, null, 812, '2026-10-20 11:20:00.123456'),
        '/refund/order-context/8800': json({ response: 200, status: true, data: { is_debit: true, already_refunded: true, order_id: 812 } }),
    };
    snapshotMock.mockReset();
    snapshotMock.mockResolvedValue(snap('exact', 501, []));
    seedTicket();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const post = (body: TicketActionBody, ctx = ctxOf()) => recordTicketAction(TICKET, body, ctx);

describe('refund', () => {
    it('H01 verifies, resolves, mirrors to the conversation', async () => {
        const res = await post(refundBody());
        expect(res).toMatchObject({ outcome: 'resolved', replayed: false, flagged: null });
        expect(actions()).toHaveLength(1);
        expect(actions()[0]).toMatchObject({ verified: true, amount: 32, resolved_ticket: true, actor_id: '7' });
        expect(ticketRow()).toMatchObject({
            status: 'resolved', resolved_via: 'action', resolution_code: 'refunded', first_resolved_code: 'refunded', follow_up_at: null,
        });
        const resolved = (store.tables.desk_ticket_events ?? []).find((event) => event.type === 'resolved');
        expect(resolved?.data).toMatchObject({ action_id: actions()[0].id, resolved_via: 'action' });
        expect(store.tables.conversations[0]).toMatchObject({ status: 'resolved', unread_count: 0 });
    });

    it('H02 replays the same body', async () => {
        await post(refundBody());
        const events = eventTypes().length;
        const res = await post(refundBody());
        expect(res).toMatchObject({ replayed: true, outcome: 'resolved' });
        expect(actions()).toHaveLength(1);
        expect(eventTypes()).toHaveLength(events);
    });

    it('H03 the client id belongs to another ticket', async () => {
        seedTicket({ ticket_no: 42, conversation_id: 'conv-2' }, OTHER_TICKET);
        (store.tables.desk_ticket_actions ??= []).push({ id: 50, client_action_id: C1, ticket_id: OTHER_TICKET, action_type: 'refund', ref_type: 'transaction', ref_id: '1' });
        expect((await catching(post(refundBody()))).code).toBe('duplicate_reference');
        expect(actions()).toHaveLength(1);
    });

    it('H04 the reference belongs to another ticket (no backend call)', async () => {
        seedTicket({ ticket_no: 42, conversation_id: 'conv-2' }, OTHER_TICKET);
        (store.tables.desk_ticket_actions ??= []).push({ id: 50, client_action_id: '22222222-2222-4222-8222-222222222222', ticket_id: OTHER_TICKET, action_type: 'refund', ref_type: 'transaction', ref_id: '9101' });
        const error = await catching(post(refundBody()));
        expect(error.code).toBe('duplicate_reference');
        expect(actions()).toHaveLength(1);
        expect(backend.state.calls).toEqual([]);
    });

    it('H05 the reference is already recorded on this ticket', async () => {
        (store.tables.desk_ticket_actions ??= []).push({
            id: 50, client_action_id: '22222222-2222-4222-8222-222222222222', ticket_id: TICKET, action_type: 'refund',
            ref_type: 'transaction', ref_id: '9101', amount: 32, resolved_ticket: false,
        });
        const res = await post(refundBody());
        expect(res.replayed).toBe(true);
        expect(res.action.id).toBe(50);
    });

    it('H06-H07 and H10 contradictions are rejected without a write', async () => {
        backend.state.answers['/txn/9101'] = txnAnswer(9101, 601, 32);
        expect((await catching(post(refundBody()))).code).toBe('reference_mismatch');
        backend.state.answers['/txn/9101'] = txnAnswer(9101, 501, 32);
        snapshotMock.mockResolvedValue(snap('candidates', null, [601, 602]));
        expect((await catching(post(refundBody()))).code).toBe('reference_mismatch');
        snapshotMock.mockResolvedValue(snap('exact', 501, []));
        backend.state.answers['/txn/9101'] = json({}, 404);
        expect((await catching(post(refundBody()))).code).toBe('reference_mismatch');
        expect(actions()).toHaveLength(0);
        expect(ticketRow().status).toBe('open');
    });

    it('H08 no snapshot leaves verified false', async () => {
        snapshotMock.mockResolvedValue(null);
        const res = await post(refundBody());
        expect(res.outcome).toBe('resolved');
        expect(actions()[0]).toMatchObject({ verified: false, amount: 32 });
    });

    it('H09 a timeout leaves verified false and keeps the request amount', async () => {
        backend.state.answers['/txn/9101'] = timeout;
        const res = await post(refundBody());
        expect(res.outcome).toBe('resolved');
        expect(actions()[0]).toMatchObject({ verified: false, amount: 32 });
    });

    it('H11 a newer customer message keeps the ticket open and answers 409', async () => {
        const error = await catching(post(refundBody({ seen_inbound_at: '2026-10-20T04:00:00+00:00' })));
        expect(error.code).toBe('new_customer_message');
        const data = error.data as { ticket: { id: string }; action: { client_action_id: string } };
        expect(data.ticket.id).toBe(TICKET);
        expect(data.action.client_action_id).toBe(C1);
        expect(actions()[0].resolved_ticket).toBe(false);
        const conflict = (store.tables.desk_ticket_events ?? []).find((event) => event.type === 'resolve_conflict');
        expect(conflict?.data).toMatchObject({ attempted_via: 'action', action_id: actions()[0].id });
        expect(ticketRow().status).toBe('open');
    });

    it('H12 resolve false only records', async () => {
        const res = await post(refundBody({ resolve: false }));
        expect(res.outcome).toBe('recorded');
        expect(ticketRow().status).toBe('open');
        expect(eventTypes()).not.toContain('resolved');
    });

    it('H13 a delivery category needs a link', async () => {
        ticketRow().link_status = null;
        expect((await catching(post(refundBody()))).code).toBe('delivery_link_required');
        expect(actions()).toHaveLength(0);
        ticketRow().link_status = 'linked';
        expect((await post(refundBody())).outcome).toBe('resolved');
    });

    it('H14-H15 a category is required, or classifies in the same call', async () => {
        ticketRow().category_slug = null;
        expect((await catching(post(refundBody()))).code).toBe('category_required');
        expect(actions()).toHaveLength(0);
        const res = await post(refundBody({ category_slug: 'general_enquiry' }));
        expect(res.outcome).toBe('resolved');
        expect(ticketRow()).toMatchObject({ category_slug: 'general_enquiry', type: 'enquiry', resolution_code: 'refunded' });
        const types = eventTypes();
        expect(types.indexOf('classified')).toBeLessThan(types.indexOf('resolved'));
    });

    it('H18-H19 repeat refund inside 30 days is flagged for agents only', async () => {
        seedTicket({ ticket_no: 42, conversation_id: 'conv-2', backend_user_id: 501 }, OTHER_TICKET);
        (store.tables.desk_ticket_actions ??= []).push({
            id: 50, client_action_id: '22222222-2222-4222-8222-222222222222', ticket_id: OTHER_TICKET, action_type: 'refund',
            ref_type: 'transaction', ref_id: '1', created_at: '2026-10-10T06:00:00.000Z', data: { user_id: 501 },
        });
        const res = await post(refundBody());
        expect(res).toMatchObject({ outcome: 'recorded', flagged: 'repeat_refund' });
        expect(ticketRow()).toMatchObject({ status: 'open', escalation_reason: 'repeat_refund' });
        store.tables.desk_ticket_actions = [];
        (store.tables.desk_ticket_actions).push({
            id: 51, client_action_id: '33333333-3333-4333-8333-333333333333', ticket_id: OTHER_TICKET, action_type: 'refund',
            ref_type: 'transaction', ref_id: '2', created_at: '2026-09-19T06:00:00.000Z', data: { user_id: 501 },
        });
        ticketRow().escalation_reason = null;
        const later = await post(refundBody({ client_action_id: '44444444-4444-4444-8444-444444444444' }));
        expect(later).toMatchObject({ outcome: 'resolved', flagged: null });
    });

    it('H18b counts by the action user even when the ticket has no customer yet', async () => {
        ticketRow().backend_user_id = null;
        seedTicket({ ticket_no: 42, conversation_id: 'conv-2', backend_user_id: null }, OTHER_TICKET);
        (store.tables.desk_ticket_actions ??= []).push({
            id: 50, client_action_id: '22222222-2222-4222-8222-222222222222', ticket_id: OTHER_TICKET, action_type: 'wallet_credit',
            ref_type: 'transaction', ref_id: '1', created_at: '2026-10-10T06:00:00.000Z', data: { user_id: 501 },
        });
        expect(await post(refundBody())).toMatchObject({ outcome: 'recorded', flagged: 'repeat_refund' });
    });

    it('H18c a manager is never flagged by earlier actions', async () => {
        (store.tables.desk_ticket_actions ??= []).push({
            id: 50, client_action_id: '22222222-2222-4222-8222-222222222222', ticket_id: OTHER_TICKET, action_type: 'refund',
            ref_type: 'transaction', ref_id: '1', created_at: '2026-10-10T06:00:00.000Z', data: { user_id: 501 },
        });
        expect(await post(refundBody(), ctxOf({ manager: true }))).toMatchObject({ outcome: 'resolved', flagged: null });
    });

    it('H38 a credit that is not tied to the debit stays unverified but is recorded', async () => {
        backend.state.answers['/txn/9101'] = txnAnswer(9101, 501, 32, 1, null, 999, '2026-10-20 11:20:00');
        const res = await post(refundBody());
        expect(res.outcome).toBe('resolved');
        expect(actions()[0].verified).toBe(false);
    });

    it('H39 an old credit on the right order is unverified too', async () => {
        backend.state.answers['/txn/9101'] = txnAnswer(9101, 501, 32, 1, null, 812, '2026-10-12 11:20:00');
        await post(refundBody());
        expect(actions()[0].verified).toBe(false);
    });

    it('H40 the same reference with another amount is a conflict, not a replay', async () => {
        await post(refundBody({ resolve: false }));
        const error = await catching(post(refundBody({ resolve: false, amount: 40, client_action_id: '22222222-2222-4222-8222-222222222222' })));
        expect(error.code).toBe('duplicate_reference');
        expect(actions()).toHaveLength(1);
    });

    it('H41-H42 customer_linked only changes the ticket customer inside the snapshot set', async () => {
        const link = (user: number) => ticketActionBody.parse({
            ...base, resolve: false, action_type: 'customer_linked', ref_type: 'alternate_phone',
            ref_id: `user:${user}:9845012345`, amount: null,
            data: { user_id: user, phone: '9845012345', alternate_phone_id: null, already_linked: false },
        });
        snapshotMock.mockResolvedValue(snap('candidates', null, [601, 602]));
        const outside = await post(link(777));
        expect(outside.outcome).toBe('recorded');
        expect(ticketRow().backend_user_id).toBe(501);
        await post({ ...link(601), client_action_id: '22222222-2222-4222-8222-222222222222' } as TicketActionBody);
        expect(ticketRow()).toMatchObject({ backend_user_id: 601, customer_match: 'manual' });
    });

    it('H20 an already resolved ticket is not reopened or escalated', async () => {
        ticketRow().status = 'resolved';
        const res = await post(refundBody());
        expect(res.outcome).toBe('recorded');
        expect(ticketRow().status).toBe('resolved');
        expect(eventTypes()).not.toContain('resolved');
        expect(eventTypes()).not.toContain('escalated');
        expect(actions()[0].resolved_ticket).toBe(false);
    });

    it('H24 money:false is refused before anything runs', async () => {
        const error = await catching(post(refundBody(), ctxOf({ money: false })));
        expect(error.code).toBe('money_not_allowed');
        expect(actions()).toHaveLength(0);
        expect(backend.state.calls).toEqual([]);
    });

    it('H25 the ticket customer follows the confirmed one', async () => {
        ticketRow().backend_user_id = 601;
        snapshotMock.mockResolvedValue(snap('candidates', null, [501, 601]));
        const res = await post(refundBody());
        expect(res.outcome).toBe('resolved');
        expect(ticketRow()).toMatchObject({ backend_user_id: 501, customer_match: 'manual' });
        expect(eventTypes()).toContain('customer_matched');
    });

    it('H27 a lost select race falls back to the replay answer', async () => {
        await post(refundBody());
        store.hideActionSelects = 2;
        const res = await post(refundBody());
        expect(res.replayed).toBe(true);
        expect(actions()).toHaveLength(1);
    });

    it('H32 a missing actions table is not_installed', async () => {
        store.failTable = 'desk_ticket_actions';
        expect((await catching(post(refundBody()))).code).toBe('not_installed');
    });

    it('H33 makes exactly three backend requests', async () => {
        await post(refundBody());
        expect(backend.state.calls.length + snapshotMock.mock.calls.length).toBe(3);
    });
});

describe('wallet credit', () => {
    beforeEach(() => {
        backend.state.answers['/txn/77'] = txnAnswer(77, 501, 250, 1, `desk-${C1}`);
    });

    it('H16 an agent over the limit is escalated, not resolved', async () => {
        const res = await post(walletBody());
        expect(res).toMatchObject({ outcome: 'recorded', flagged: 'credit_over_limit' });
        expect(ticketRow()).toMatchObject({ status: 'open', escalation_reason: 'credit_over_limit' });
        const escalated = (store.tables.desk_ticket_events ?? []).find((event) => event.type === 'escalated');
        expect(escalated?.data).toMatchObject({ action_id: actions()[0].id });
    });

    it('H17 a manager resolves', async () => {
        const res = await post(walletBody(), ctxOf({ manager: true }));
        expect(res).toMatchObject({ outcome: 'resolved', flagged: null });
        expect(ticketRow().resolution_code).toBe('credit_given');
    });

    it('H36 a replay of a half-finished over-limit credit still escalates', async () => {
        (store.tables.desk_ticket_actions ??= []).push({
            id: 50, client_action_id: C1, ticket_id: TICKET, action_type: 'wallet_credit', ref_type: 'transaction',
            ref_id: '77', amount: 250, resolved_ticket: false, data: { user_id: 501, description: 'Desk credit', payment_id: `desk-${C1}` },
        });
        const res = await post(walletBody());
        expect(res).toMatchObject({ outcome: 'recorded', flagged: 'credit_over_limit', replayed: true });
        expect(ticketRow()).toMatchObject({ status: 'open', escalation_reason: 'credit_over_limit' });
        expect(actions()).toHaveLength(1);
        const again = await post(walletBody());
        expect(again).toMatchObject({ flagged: 'credit_over_limit', replayed: true });
        expect(eventTypes().filter((type) => type === 'escalated')).toHaveLength(1);
    });

    it('H37 a manager replay is left alone', async () => {
        (store.tables.desk_ticket_actions ??= []).push({
            id: 50, client_action_id: C1, ticket_id: TICKET, action_type: 'wallet_credit', ref_type: 'transaction',
            ref_id: '77', amount: 250, resolved_ticket: false, data: { user_id: 501 },
        });
        expect(await post(walletBody(), ctxOf({ manager: true }))).toMatchObject({ outcome: 'recorded', flagged: null });
        expect(eventTypes()).not.toContain('escalated');
    });

    it('H26 a payment id of another action is a 400 without backend calls', async () => {
        const error = await catching(post(walletBody(250, {}, { payment_id: 'desk-22222222-2222-4222-8222-222222222222' })));
        expect(error.code).toBe('validation_failed');
        expect(error.message.startsWith('data.payment_id')).toBe(true);
        expect(backend.state.calls).toEqual([]);
    });
});

describe('hold and tomorrow rule', () => {
    it('H21 a replacement promise holds the ticket without any backend call', async () => {
        const res = await post(replacementBody());
        expect(res.outcome).toBe('held');
        expect(ticketRow()).toMatchObject({
            status: 'on_hold', hold_reason: 'replacement_promised', follow_up_at: '2026-10-21T08:30:00+05:30',
        });
        expect(eventTypes()).toEqual(expect.arrayContaining(['status_changed', 'held']));
        expect(actions()[0].verified).toBe(false);
        expect(backend.state.calls).toEqual([]);
        expect(snapshotMock).not.toHaveBeenCalled();
    });

    it('H22-H23 a past follow-up and resolve:true are refused', async () => {
        expect((await catching(post(replacementBody('2026-10-20T05:00:00+00:00')))).code).toBe('follow_up_required');
        expect((await catching(post(replacementBody('2026-10-21T08:30:00+05:30', { resolve: true })))).code).toBe('action_cannot_resolve');
        expect(actions()).toHaveLength(0);
    });

    it('H28-H29 an app order that affects tomorrow is held only when the list exists', async () => {
        backend.state.answers['/get_order/812'] = json({ response: 200, data: { id: 812, user_id: 501 } });
        snapshotMock.mockResolvedValue(snap('exact', 501, [], true));
        const held = await post(appOrderBody());
        expect(held.outcome).toBe('held');
        expect(ticketRow()).toMatchObject({ hold_reason: 'verify_delivery', follow_up_at: TOMORROW_0830, order_value: 450, order_id: 812 });
    });

    it('H29 resolves with the request default when the list is not generated', async () => {
        backend.state.answers['/get_order/812'] = json({ response: 200, data: { id: 812, user_id: 501 } });
        const res = await post(appOrderBody());
        expect(res.outcome).toBe('resolved');
        expect(ticketRow().resolution_code).toBe('done');
    });

    it('H34 resolve:false after a 422 is record-only', async () => {
        backend.state.answers['/get_order/812'] = json({ response: 200, data: { id: 812, user_id: 501 } });
        ticketRow().category_slug = null;
        const body = appOrderBody({ category_slug: undefined });
        expect((await catching(post(body))).code).toBe('category_required');
        expect(actions()).toHaveLength(0);
        const res = await post({ ...body, resolve: false } as TicketActionBody);
        expect(res.outcome).toBe('recorded');
        expect(actions()).toHaveLength(1);
        expect(actions()[0].resolved_ticket).toBe(false);
        expect(ticketRow().status).toBe('open');
    });

    it('H35 a subscription edit with resolve:false never holds', async () => {
        snapshotMock.mockResolvedValue(snap('exact', 501, [], true));
        backend.state.answers['/get_order/812'] = json({ response: 200, data: { id: 812, user_id: 501 } });
        const body = ticketActionBody.parse({
            ...base, resolve: false, action_type: 'subscription_updated', ref_type: 'order_update',
            ref_id: `order:812:${C1}`, amount: null, data: { order_id: 812, changes: ['qty'], affects_tomorrow: true },
        });
        const res = await post(body);
        expect(res.outcome).toBe('recorded');
        expect(backend.state.calls.filter((path) => path === '/get_order/812')).toHaveLength(1);
    });
});

describe('day order', () => {
    const order = (user: number) => json({
        response: 200, status: true,
        data: { user_id: user, total_amount: 120, order_status: 'confirmed', payment_status: 'unpaid', payment_link_id: null },
    });

    it('H30 stores the customer and the order columns', async () => {
        ticketRow().backend_user_id = null;
        backend.state.answers['/daytime/orders/300'] = order(701);
        snapshotMock.mockResolvedValue(snap('exact', 701, []));
        const res = await post(dayOrderBody());
        expect(res.outcome).toBe('resolved');
        expect(ticketRow()).toMatchObject({
            resolution_code: 'won', backend_user_id: 701, customer_match: 'manual', daytime_order_id: 300,
            order_value: 120, payment_status: 'unpaid',
        });
    });

    it('H31 an order of someone else is rejected', async () => {
        backend.state.answers['/daytime/orders/300'] = order(701);
        expect((await catching(post(dayOrderBody()))).code).toBe('reference_mismatch');
    });
});

describe('route and judges', () => {
    it('L01 route 6 is wrapped at the agent level', async () => {
        const { POST } = await import('@/app/api/desk/tickets/[id]/actions/route');
        expect((POST as unknown as Record<symbol, unknown>)[DESK_WRAPPED]).toEqual({ level: 'agent', alwaysOn: false });
    });

    it('L02 answers 401 without a token', async () => {
        const { POST } = await import('@/app/api/desk/tickets/[id]/actions/route');
        const response = await POST(new Request('http://x/api/desk/tickets/t/actions', { method: 'POST' }) as never,
            { params: Promise.resolve({ id: TICKET }) } as never);
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ ok: false, error: { code: 'unauthorized' } });
    });

    it('J10 refund tie needs the same order and a recent credit', () => {
        const now = Date.parse('2026-10-20T06:00:00.000Z');
        const ok = { order_id: 812, created_at: '2026-10-20 11:20:00.5' };
        expect(judgeRefundTie(ok, { order_id: 812 }, now)).toBe('pass');
        expect(judgeRefundTie(ok, { order_id: 813 }, now)).toBe('unavailable');
        expect(judgeRefundTie({ ...ok, order_id: null }, { order_id: null }, now)).toBe('unavailable');
        expect(judgeRefundTie({ ...ok, created_at: '2026-10-19 10:00:00' }, { order_id: 812 }, now)).toBe('unavailable');
        expect(judgeRefundTie({ ...ok, created_at: '2026-10-20 12:30:00' }, { order_id: 812 }, now)).toBe('unavailable');
        expect(judgeRefundTie({ ...ok, created_at: 'garbage' }, { order_id: 812 }, now)).toBe('unavailable');
    });

    it('J01-J09 judges', () => {
        expect([judgeUserInSet(501, null), judgeUserInSet(501, new Set([501])), judgeUserInSet(501, new Set([601])), judgeUserInSet(null, new Set([501]))])
            .toEqual(['unavailable', 'pass', 'mismatch', 'mismatch']);
        const txn = { id: 1, type: 1, user_id: 501, amount: 32 };
        expect(judgeCreditTxn(txn, { userId: 501, amount: 32 })).toBe('pass');
        expect(judgeCreditTxn({ ...txn, type: 2 }, { userId: 501, amount: 32 })).toBe('mismatch');
        expect(judgeCreditTxn({ ...txn, user_id: 601 }, { userId: 501, amount: 32 })).toBe('mismatch');
        expect(judgeCreditTxn({ ...txn, amount: 33 }, { userId: 501, amount: 32 })).toBe('mismatch');
        expect(judgeCreditTxn({ ...txn, payment_id: `desk-${C1}` }, { userId: 501, amount: 32, paymentId: `desk-${C1}` })).toBe('pass');
        expect(judgeCreditTxn({ ...txn, payment_id: 'xxx-admin' }, { userId: 501, amount: 32, paymentId: `desk-${C1}` })).toBe('mismatch');
        expect([judgeRefundContext({ is_debit: true, already_refunded: true }), judgeRefundContext({ is_debit: true, already_refunded: false }), judgeRefundContext({ is_debit: false, already_refunded: true })])
            .toEqual(['pass', 'mismatch', 'mismatch']);
        expect([judgeHolidayRows([{ date: '2026-10-22' }], '2026-10-22'), judgeHolidayRows([], '2026-10-22')]).toEqual(['pass', 'mismatch']);
        const dayOrder = { user_id: 1, payment_status: null, payment_link_id: 'plink_A', order_status: 'confirmed', total_amount: 120 };
        expect([judgeDayOrder(dayOrder, 120), judgeDayOrder({ ...dayOrder, order_status: 'cancelled' }, 120), judgeDayOrder(dayOrder, 125)])
            .toEqual(['pass', 'mismatch', 'mismatch']);
        expect([judgePaymentLink(dayOrder, 'plink_A'), judgePaymentLink(dayOrder, 'plink_B')]).toEqual(['pass', 'mismatch']);
        expect([combineChecks([]), combineChecks(['pass']), combineChecks(['pass', 'unavailable']), combineChecks(['unavailable', 'mismatch'])])
            .toEqual(['unavailable', 'pass', 'unavailable', 'mismatch']);
    });
});

describe('fetchSnapshotForTicket', () => {
    const load = async () => (await vi.importActual<typeof import('@/lib/desk/snapshot-server')>('@/lib/desk/snapshot-server')).fetchSnapshotForTicket;

    it('S01-S02 posts the phone (and user id) and returns the parsed snapshot', async () => {
        backend.state.postStatus = 200;
        backend.state.posts = [];
        schemaStub.result = { stub: true };
        const fetchSnapshotForTicket = await load();
        expect(await fetchSnapshotForTicket('tok', '919845012345')).toEqual({ stub: true });
        expect(backend.state.posts[0]).toEqual(['/support/customer-snapshot', { phone: '919845012345' }]);
        await fetchSnapshotForTicket('tok', '919845012345', 501);
        expect(backend.state.posts[1][1]).toEqual({ phone: '919845012345', user_id: 501 });
    });

    it.each([404, 422, 429, 503])('S03 %i gives null', async (status) => {
        backend.state.postStatus = status;
        expect(await (await load())('tok', '919845012345')).toBeNull();
    });

    it('S04-S05 a timeout or an unparseable body gives null', async () => {
        backend.state.postFails = true;
        expect(await (await load())('tok', '919845012345')).toBeNull();
        backend.state.postFails = false;
        backend.state.postStatus = 200;
        schemaStub.result = null;
        expect(await (await load())('tok', '919845012345')).toBeNull();
    });
});
