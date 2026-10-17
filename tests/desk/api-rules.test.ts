import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsPutBody } from '@/lib/desk/contracts';
import {
    checkResolveRules, checkSettingsPut, settingToText,
    type ResolveRuleInput, type StoredSettingsText,
} from '@/lib/desk/api/rules';

const NOW = new Date('2026-10-20T06:00:00.000Z');
const EMPTY: StoredSettingsText = { desk_go_live_at: '', desk_ui_enabled: '0' };
const LIVE: StoredSettingsText = { desk_go_live_at: '2026-10-15T00:00:00+05:30', desk_ui_enabled: '0' };
const LIVE_UI: StoredSettingsText = { desk_go_live_at: '2026-10-15T00:00:00+05:30', desk_ui_enabled: '1' };

const run = (body: unknown, stored: StoredSettingsText) =>
    checkSettingsPut(settingsPutBody.parse(body), stored, NOW);
const codeOf = (result: ReturnType<typeof run>) => (result.ok ? 'ok' : result.code);

describe('checkSettingsPut', () => {
    it.each([
        ['S01', { desk_ui_enabled: true }, EMPTY, 'ok'],
        ['S02', { desk_go_live_at: '2026-10-20T05:30:00+00:00' }, EMPTY, 'ok'],
        ['S03', { desk_go_live_at: '2026-10-20T04:59:59+00:00' }, EMPTY, 'setting_locked'],
        ['S04', { desk_go_live_at: '2026-10-21T00:00:00+05:30' }, EMPTY, 'ok'],
        ['S05', { desk_go_live_at: '2026-10-21T00:00:00+05:30' }, LIVE, 'setting_locked'],
        ['S06', { desk_stats_from: '2026-10-14T00:00:00+05:30' }, LIVE, 'setting_locked'],
        ['S07', { desk_stats_from: '2026-10-16T00:00:00+05:30' }, LIVE, 'ok'],
        ['S08', { desk_stats_from: '2026-10-16T00:00:00+05:30' }, EMPTY, 'setting_locked'],
        ['S09', { desk_go_live_at: '2026-10-20T05:45:00+00:00', desk_stats_from: '2026-10-20T05:45:00+00:00' }, EMPTY, 'ok'],
        ['S10', { desk_cutover_redirect: true }, LIVE, 'setting_locked'],
        ['S11', { desk_cutover_redirect: true, desk_ui_enabled: true }, LIVE, 'ok'],
        ['S12', { desk_cutover_redirect: true }, LIVE_UI, 'ok'],
        ['S13', { desk_cutover_redirect: true, desk_ui_enabled: false }, LIVE_UI, 'setting_locked'],
        ['S14', { desk_cutover_redirect: false }, LIVE, 'ok'],
    ] as const)('%s', (_id, body, stored, expected) => {
        expect(codeOf(run(body, stored))).toBe(expected);
    });

    it('rejects a go-live that is not a full timestamp with an offset', () => {
        expect(settingsPutBody.safeParse({ desk_go_live_at: '2026-10-20' }).success).toBe(false);
    });
});

describe('settingsPutBody', () => {
    it.each([
        [{ desk_last_tick_at: '2026-10-20T05:45:00+00:00' }],
        [{}],
        [{ desk_ui_enabled: '1' }],
        [{ desk_go_live_at: '2026-10-20' }],
        [{ desk_reply_alert_mins: 0 }],
    ])('rejects %j', (body) => {
        expect(settingsPutBody.safeParse(body).success).toBe(false);
    });
});

describe('settingToText', () => {
    it.each([
        [true, '1'],
        [false, '0'],
        [15, '15'],
        ['shadow', 'shadow'],
        ['2026-10-20T05:45:00+00:00', '2026-10-20T05:45:00+00:00'],
        [{ '917090166111': 'sales' }, '{"917090166111":"sales"}'],
    ])('%j', (value, text) => {
        expect(settingToText(value)).toBe(text);
    });
});

const BASE: ResolveRuleInput = {
    mode: 'resolve',
    ticket: { id: 'T', link_status: null },
    category: { default_resolution_code: 'explained', requires_delivery_link: false },
    body: {},
    duplicateTarget: null,
};
const withCategory = (over: Partial<NonNullable<ResolveRuleInput['category']>>): ResolveRuleInput['category'] =>
    ({ default_resolution_code: 'explained', requires_delivery_link: false, ...over });
const resolveCode = (input: ResolveRuleInput) => {
    const result = checkResolveRules(input);
    return result.ok ? result.resolution_code : result.code;
};

describe('checkResolveRules', () => {
    it.each([
        ['R01', { ...BASE, category: null }, 'category_required'],
        ['R02', { ...BASE, category: withCategory({ default_resolution_code: null }) }, 'resolution_code_required'],
        ['R03', BASE, 'note_required'],
        ['R04', { ...BASE, body: { resolution_note: 'told the customer' } }, 'explained'],
        ['R05', { ...BASE, body: { resolution_code: 'done' } }, 'done'],
        ['R06', { ...BASE, body: { resolution_code: 'not_valid', resolution_note: '   ' } }, 'note_required'],
        ['R07', { ...BASE, body: { resolution_code: 'lost' } }, 'lost_reason_required'],
        ['R08', { ...BASE, body: { resolution_code: 'lost', lost_reason: 'price' } }, 'lost'],
        ['R09', { ...BASE, body: { resolution_code: 'lost', lost_reason: 'other' } }, 'note_required'],
        ['R10', { ...BASE, body: { resolution_code: 'lost', lost_reason: 'other', resolution_note: 'moved city' } }, 'lost'],
        ['R11', { ...BASE, body: { resolution_code: 'duplicate' }, duplicateTarget: null }, 'duplicate_target_required'],
        ['R12', { ...BASE, body: { resolution_code: 'duplicate' }, duplicateTarget: { id: 'T' } }, 'duplicate_target_required'],
        ['R13', { ...BASE, body: { resolution_code: 'duplicate' }, duplicateTarget: { id: 'U' } }, 'duplicate'],
        ['R14', { ...BASE, category: withCategory({ default_resolution_code: 'done', requires_delivery_link: true }) }, 'delivery_link_required'],
        ['R15', { ...BASE, category: withCategory({ default_resolution_code: 'done', requires_delivery_link: true }), body: { link_status: 'none_found' } }, 'done'],
        ['R16', { ...BASE, category: withCategory({ default_resolution_code: 'done', requires_delivery_link: true }), ticket: { id: 'T', link_status: 'linked' } }, 'done'],
        ['R17', { ...BASE, category: withCategory({ default_resolution_code: 'closed_unclassified' }) }, 'resolution_code_required'],
        ['R18', { ...BASE, mode: 'wrap_up', category: withCategory({ default_resolution_code: null, requires_delivery_link: true }), body: { resolution_code: 'duplicate' } }, 'duplicate'],
        ['R19', { ...BASE, mode: 'wrap_up', body: { resolution_code: 'not_possible' } }, 'note_required'],
        ['R20', { ...BASE, category: null, body: { resolution_code: 'done' } }, 'category_required'],
    ] as const)('%s', (_id, input, expected) => {
        expect(resolveCode(input as ResolveRuleInput)).toBe(expected);
    });

    it('returns the lost reason only for lost and trims the note', () => {
        const lost = checkResolveRules({ ...BASE, body: { resolution_code: 'lost', lost_reason: 'price', resolution_note: ' x ' } });
        expect(lost).toEqual({ ok: true, resolution_code: 'lost', resolution_note: 'x', lost_reason: 'price' });
        const done = checkResolveRules({ ...BASE, body: { resolution_code: 'done', lost_reason: 'price' } });
        expect(done).toMatchObject({ ok: true, lost_reason: null });
    });
});

// ── Handler-level tests over an in-memory stand-in for supabaseAdmin ─────────

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, nextNo: 1000 }));

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
    eq(column: string, value: unknown) { return this.where((row) => row[column] === value); }
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

import { createTicket } from '@/lib/desk/api/ticket-create';
import { patchTicket } from '@/lib/desk/api/ticket-patch';
import { resolveTicket } from '@/lib/desk/api/ticket-resolve';
import { getTicketDetail } from '@/lib/desk/api/ticket-detail';
import { listTickets } from '@/lib/desk/api/tickets-read';
import { allOffDeskSettings } from '@/lib/desk/settings';
import { DeskApiError } from '@/lib/desk/api-error';
import type { DeskContext } from '@/lib/desk/types';

const TICKET = '00000000-0000-4000-8000-000000000001';
const SEEN = '2026-10-20T05:00:00.000000+00:00';

const ctxOf = (manager = false): DeskContext => ({
    actor: { id: '7', name: 'Asha' },
    rights: { agent: true, manager, money: true, inbox: true, via: 'permission' },
    token: 'tok',
    settings: { ...allOffDeskSettings(), readable: true, ui_enabled: true },
});

function seedTicket(over: Row = {}): Row {
    const row: Row = {
        ...Object.fromEntries(TICKET_COLUMNS.map((column) => [column, null])),
        id: TICKET, ticket_no: 41, channel: 'whatsapp', conversation_id: 'conv-1', origin: 'inbound', status: 'open',
        queue: 'care', priority: 3, opened_at: '2026-10-20T04:00:00+00:00', reopen_count: 0, is_ack_only: false,
        customer_phone: '919845012345', last_inbound_at: SEEN, awaiting_reply_since: SEEN, last_outbound_at: null,
        category_slug: 'milk_spoilage', type: 'complaint', ...over,
    };
    (store.tables.desk_tickets ??= []).push(row);
    return row;
}

const eventTypes = (): string[] => (store.tables.desk_ticket_events ?? []).map((event) => String(event.type));
const catching = async (task: Promise<unknown>): Promise<DeskApiError> => {
    try { await task; } catch (error) { return error as DeskApiError; }
    throw new Error('expected a DeskApiError');
};

beforeEach(() => {
    store.tables = {
        desk_categories: [
            { slug: 'milk_spoilage', type: 'complaint', queue: 'care', priority: 2, active: true, default_resolution_code: 'done', requires_delivery_link: false },
            { slug: 'retired', type: 'enquiry', queue: 'care', priority: 3, active: false, default_resolution_code: null, requires_delivery_link: false },
            { slug: 'not_delivered', type: 'complaint', queue: 'care', priority: 1, active: true, default_resolution_code: 'done', requires_delivery_link: true },
        ],
        conversations: [{ id: 'conv-1', status: 'open', unread_count: 3, integrated_number: '917090166111', last_message: 'hello', assigned_to: null }],
    };
    store.nextNo = 1000;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('POST resolve', () => {
    it('resolves, writes the timeline and closes the conversation', async () => {
        seedTicket();
        const result = await resolveTicket(TICKET, { seen_inbound_at: SEEN, resolution_code: 'done' }, ctxOf());
        expect(result.already_resolved).toBe(false);
        expect(result.ticket).toMatchObject({ status: 'resolved', resolved_by: '7', resolved_via: 'manual', awaiting_reply_since: null });
        expect(store.tables.desk_tickets[0]).toMatchObject({ first_resolved_code: 'done', first_resolved_by: '7' });
        expect(eventTypes()).toEqual(['resolved']);
        expect(store.tables.conversations[0]).toMatchObject({ status: 'resolved', unread_count: 0 });
    });

    it('answers 409 and keeps the ticket open when a customer message is newer than the one seen', async () => {
        seedTicket({ last_inbound_at: '2026-10-20T05:30:00.000000+00:00' });
        const error = await catching(resolveTicket(TICKET, { seen_inbound_at: SEEN, resolution_code: 'done' }, ctxOf()));
        expect(error.code).toBe('new_customer_message');
        expect(error.data).toMatchObject({ action: null, ticket: { status: 'open' } });
        expect(store.tables.desk_tickets[0].status).toBe('open');
        expect(eventTypes()).toEqual(['resolve_conflict']);
        expect(store.tables.conversations[0].status).toBe('open');
    });

    it('treats a null token as "no customer message seen"', async () => {
        seedTicket();
        const error = await catching(resolveTicket(TICKET, { seen_inbound_at: null, resolution_code: 'done' }, ctxOf()));
        expect(error.code).toBe('new_customer_message');
    });

    it('is idempotent on a resolved ticket', async () => {
        seedTicket({ status: 'resolved', resolved_at: SEEN });
        const result = await resolveTicket(TICKET, { seen_inbound_at: SEEN, resolution_code: 'done' }, ctxOf());
        expect(result.already_resolved).toBe(true);
        expect(eventTypes()).toEqual([]);
    });

    it('classifies in the same call and enforces the delivery-link rule', async () => {
        seedTicket({ category_slug: null, type: null });
        const blocked = await catching(resolveTicket(TICKET, { seen_inbound_at: SEEN, category_slug: 'not_delivered' }, ctxOf()));
        expect(blocked.code).toBe('delivery_link_required');
        const result = await resolveTicket(TICKET, { seen_inbound_at: SEEN, category_slug: 'not_delivered', link_status: 'none_found' }, ctxOf());
        expect(result.ticket).toMatchObject({ category_slug: 'not_delivered', priority: 1, link_status: 'none_found', status: 'resolved' });
    });

    it('rejects an unknown or inactive category and a ticket that does not exist', async () => {
        seedTicket({ category_slug: null });
        expect((await catching(resolveTicket(TICKET, { seen_inbound_at: SEEN, category_slug: 'retired' }, ctxOf()))).code).toBe('validation_failed');
        const missing = '00000000-0000-4000-8000-0000000000ff';
        expect((await catching(resolveTicket(missing, { seen_inbound_at: SEEN }, ctxOf()))).code).toBe('not_found');
    });
});

describe('PATCH ticket', () => {
    it('assign to the caller writes the ticket and never the conversation', async () => {
        seedTicket();
        const result = await patchTicket(TICKET, { op: 'assign', assigned_to: '7' }, ctxOf());
        expect(result.ticket).toMatchObject({ assigned_to: '7', assigned_name: 'Asha' });
        expect(store.tables.conversations[0].assigned_to).toBeNull();
        expect(store.tables.conversations[0]).not.toHaveProperty('assigned_name');
        expect(eventTypes()).toEqual(['assigned']);
    });

    it('assign refuses a user who holds only the customer role and a resolved ticket', async () => {
        seedTicket();
        const answer = (roles: Array<{ role_id: number }>) => vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
            new Response(JSON.stringify({ response: 200, data: { name: 'Raj', role: roles } }), { status: 200 }))));
        answer([{ role_id: 3 }]);
        expect((await catching(patchTicket(TICKET, { op: 'assign', assigned_to: '9' }, ctxOf()))).code).toBe('assignee_invalid');
        answer([{ role_id: 7 }]);
        expect((await patchTicket(TICKET, { op: 'assign', assigned_to: '9' }, ctxOf())).ticket.assigned_name).toBe('Raj');
        store.tables.desk_tickets[0].status = 'resolved';
        expect((await catching(patchTicket(TICKET, { op: 'assign', assigned_to: null }, ctxOf()))).code).toBe('ticket_resolved');
    });

    it('hold needs a future follow-up and a note for "other", and release restores the system status', async () => {
        seedTicket();
        const past = await catching(patchTicket(TICKET, { op: 'hold', hold_reason: 'other', follow_up_at: '2020-01-01T00:00:00+00:00' }, ctxOf()));
        expect(past.code).toBe('follow_up_required');
        const future = new Date(Date.now() + 3_600_000).toISOString();
        expect((await catching(patchTicket(TICKET, { op: 'hold', hold_reason: 'other', follow_up_at: future }, ctxOf()))).code).toBe('note_required');
        const held = await patchTicket(TICKET, { op: 'hold', hold_reason: 'other', follow_up_at: future, note: 'waiting for the dairy' }, ctxOf());
        expect(held.ticket.status).toBe('on_hold');
        const released = await patchTicket(TICKET, { op: 'release_hold' }, ctxOf());
        expect(released.ticket).toMatchObject({ status: 'new', hold_reason: null, follow_up_at: null });
        expect(eventTypes()).toEqual(['status_changed', 'held', 'status_changed']);
    });

    it('review is manager-only and wrap_up needs a resolved ticket', async () => {
        seedTicket({ category_slug: null });
        expect((await catching(patchTicket(TICKET, { op: 'review', reviewed: true }, ctxOf()))).code).toBe('forbidden');
        const body = { op: 'wrap_up', category_slug: 'milk_spoilage', resolution_code: 'done' } as const;
        expect((await catching(patchTicket(TICKET, body, ctxOf()))).code).toBe('ticket_not_resolved');
        store.tables.desk_tickets[0].status = 'resolved';
        store.tables.desk_tickets[0].resolved_via = 'auto_idle';
        const wrapped = await patchTicket(TICKET, body, ctxOf());
        expect(wrapped.ticket).toMatchObject({ category_slug: 'milk_spoilage', resolution_code: 'done', resolved_via: 'auto_idle' });
        const reviewed = await patchTicket(TICKET, { op: 'review', reviewed: true, root_cause: null }, ctxOf(true));
        expect(reviewed.ticket.reviewed_by).toBe('7');
    });

    it('customer_snapshot also fills the same phone on earlier tickets without a user', async () => {
        seedTicket();
        seedTicket({ id: '00000000-0000-4000-8000-000000000002', ticket_no: 40, conversation_id: 'conv-0', status: 'resolved', resolved_at: SEEN });
        await patchTicket(TICKET, {
            op: 'customer_snapshot', backend_user_id: 55, customer_match: 'exact', customer_name: 'Asha', address_id: null,
            apartment_name: null, flat_no: null, area: null, pincode: null, driver_user_id: null, driver_name: null,
            drop_point_id: null, drop_point_name: null,
        }, ctxOf());
        expect(store.tables.desk_tickets.map((row) => row.backend_user_id)).toEqual([55, 55]);
        expect(eventTypes()).toEqual(['customer_matched']);
    });
});

describe('POST tickets', () => {
    it('creates a manual ticket assigned to the caller and reopens a resolved conversation', async () => {
        store.tables.conversations[0].status = 'resolved';
        store.tables.contacts = [];
        Object.assign(store.tables.conversations[0], { contact_id: 'c1', contacts: { id: 'c1', name: 'Ravi', phone: '9845012345' } });
        const { response, status } = await createTicket({ channel: 'whatsapp', conversation_id: 'conv-1', category_slug: 'milk_spoilage' }, ctxOf());
        expect(status).toBe(201);
        expect(response.created).toBe(true);
        expect(response.ticket).toMatchObject({ origin: 'manual', assigned_to: '7', customer_phone: '919845012345', category_slug: 'milk_spoilage', status: 'new' });
        expect(eventTypes()).toEqual(['created', 'assigned', 'classified']);
        expect(store.tables.conversations[0].status).toBe('open');
        const again = await createTicket({ channel: 'whatsapp', conversation_id: 'conv-1' }, ctxOf());
        expect(again.status).toBe(200);
        expect(again.response.created).toBe(false);
    });

    it('answers 404 for an unknown conversation', async () => {
        const error = await catching(createTicket({ channel: 'whatsapp', conversation_id: '00000000-0000-4000-8000-0000000000aa' }, ctxOf()));
        expect(error.code).toBe('not_found');
    });
});

describe('GET tickets', () => {
    const query = (over: Row) => ({ view: 'all', limit: 10, ...over }) as Parameters<typeof listTickets>[0];

    it('orders a queue view by attention and filters mine / unassigned / acks', async () => {
        seedTicket({ id: 'a', ticket_no: 1, awaiting_reply_since: '2026-10-20T03:00:00+00:00', assigned_to: '7' });
        seedTicket({ id: 'b', ticket_no: 2, conversation_id: 'c2', awaiting_reply_since: '2026-10-20T02:00:00+00:00', assigned_to: '9' });
        seedTicket({ id: 'c', ticket_no: 3, conversation_id: 'c3', is_ack_only: true });
        seedTicket({ id: 'd', ticket_no: 4, conversation_id: 'c4', awaiting_reply_since: '2026-10-20T03:30:00+00:00' });
        const all = await listTickets(query({ view: 'all', with_counts: '1' }), ctxOf());
        expect(all.items.map((item) => item.id)).toEqual(['b', 'a', 'd']);
        expect(all.counts).toMatchObject({ all: 3, acks: 1, wrap_up: 0 });
        expect((await listTickets(query({ view: 'unassigned' }), ctxOf())).items.map((item) => item.id)).toEqual(['d']);
        expect((await listTickets(query({ view: 'mine' }), ctxOf())).items.map((item) => item.id)).toEqual(['a']);
        expect((await listTickets(query({ view: 'acks' }), ctxOf())).items.map((item) => item.id)).toEqual(['c']);
        expect((await listTickets(query({ view: 'all', limit: 1 }), ctxOf())).next_cursor).toBe('1');
    });

    it('keeps ticket lists beyond the queue views for managers, except a lookup by ticket number', async () => {
        seedTicket();
        const range = { view: 'list', from: '2026-10-01', to: '2026-10-31' };
        expect((await catching(listTickets(query(range), ctxOf()))).code).toBe('forbidden');
        expect((await listTickets(query(range), ctxOf(true))).items).toHaveLength(1);
        expect((await catching(listTickets(query({ view: 'list' }), ctxOf()))).code).toBe('range_too_large');
        expect((await catching(listTickets(query({ ...range, to: '2027-03-01' }), ctxOf(true)))).code).toBe('range_too_large');
        expect((await listTickets(query({ view: 'list', ticket_no: 41, limit: 1 }), ctxOf())).items).toHaveLength(1);
        expect((await catching(listTickets(query({ view: 'list', ticket_no: 41, q: 'ravi' }), ctxOf()))).code).toBe('forbidden');
    });

    it('lists resolved tickets without a category under wrap_up', async () => {
        seedTicket({ status: 'resolved', resolved_at: SEEN, category_slug: null, resolved_via: 'auto_idle' });
        seedTicket({ id: 'x', ticket_no: 5, conversation_id: 'c5', status: 'resolved', resolved_at: SEEN, category_slug: null, resolved_via: 'system' });
        const result = await listTickets(query({ view: 'wrap_up' }), ctxOf());
        expect(result.items.map((item) => item.ticket_no)).toEqual([41]);
    });

    it('returns the ticket detail with related tickets and a 404 for an unknown id', async () => {
        seedTicket();
        seedTicket({ id: 'old', ticket_no: 30, conversation_id: 'conv-0', status: 'resolved', resolved_at: SEEN });
        const detail = await getTicketDetail(TICKET, ctxOf());
        expect(detail.ticket.id).toBe(TICKET);
        expect(detail.previous_tickets.map((ticket) => ticket.ticket_no)).toEqual([30]);
        expect(detail.lead).toBeNull();
        expect(detail.other_open_tickets).toEqual([]);
        expect((await catching(getTicketDetail('00000000-0000-4000-8000-0000000000ff', ctxOf()))).code).toBe('not_found');
    });
});
