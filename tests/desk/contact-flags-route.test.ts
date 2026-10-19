import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, nextId: 1, failTable: null as string | null }));

/** The smallest PostgREST stand-in these services need; desk_contact_flags has its partial unique index. */
class FakeQuery implements PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> {
    private filters: Array<(row: Row) => boolean> = [];
    private action: 'select' | 'insert' | 'update' = 'select';
    private payload: Row = {};
    private cap = Infinity;
    private sortBy: { column: string; ascending: boolean } | null = null;
    constructor(private readonly table: string) {}
    select() { return this; }
    insert(row: Row) { this.action = 'insert'; this.payload = row; return this; }
    update(patch: Row) { this.action = 'update'; this.payload = patch; return this; }
    eq(column: string, value: unknown) { return this.where((row) => row[column] === value); }
    is(column: string, value: null) { return this.where((row) => (row[column] ?? null) === value); }
    in(column: string, values: unknown[]) { return this.where((row) => values.includes(row[column])); }
    gte(column: string, value: string) { return this.where((row) => typeof row[column] === 'string' && Date.parse(row[column] as string) >= Date.parse(value)); }
    order(column: string, options?: { ascending?: boolean }) { this.sortBy = { column, ascending: options?.ascending !== false }; return this; }
    limit(count: number) { this.cap = count; return this; }
    private where(test: (row: Row) => boolean) { this.filters.push(test); return this; }
    private run(): { data: unknown; error: { code?: string; message?: string } | null } {
        if (store.failTable === this.table) return { data: null, error: { code: 'PGRST205', message: 'missing' } };
        const table = (store.tables[this.table] ??= []);
        if (this.action === 'insert') {
            if (this.table === 'desk_contact_flags' && table.some((row) => row.phone === this.payload.phone && row.removed_at === null)) {
                return { data: null, error: { code: '23505', message: 'duplicate' } };
            }
            const row: Row = { id: store.nextId++, added_at: '2026-10-18T05:00:00+00:00', removed_at: null, removed_by: null, removed_by_name: null, label: null, ...this.payload };
            table.push(row);
            return { data: [{ ...row }], error: null };
        }
        let rows = table.filter((row) => this.filters.every((test) => test(row)));
        if (this.action === 'update') {
            rows.forEach((row) => Object.assign(row, this.payload));
            return { data: rows.map((row) => ({ ...row })), error: null };
        }
        if (this.sortBy) {
            const { column, ascending } = this.sortBy;
            rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0));
        }
        return { data: rows.slice(0, this.cap).map((row) => ({ ...row })), error: null };
    }
    then<A, B>(onfulfilled?: ((value: ReturnType<FakeQuery['run']>) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
        return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
}

vi.mock('@/lib/whatsapp/supabase', () => ({ supabaseAdmin: { from: (table: string) => new FakeQuery(table) } }));
vi.mock('@/lib/desk/repo-supabase', () => ({
    createSupabaseDeskRepo: () => ({
        readSettingRows: async () => ({ outcome: 'ok', data: [
            { key: 'desk_engine_enabled', value: '1' }, { key: 'desk_staff_phones', value: '["9900000011"]' },
        ] }),
    }),
}));

import { DESK_WRAPPED } from '@/lib/desk/authz';
import { DeskApiError } from '@/lib/desk/api-error';
import { allOffDeskSettings } from '@/lib/desk/settings';
import { contactFlagCreateBody, contactFlagPatchBody, contactFlagsQuery, tickBody } from '@/lib/desk/contracts';
import {
    createContactFlag, listContactFlags, listInternalConversations, patchContactFlag,
} from '@/lib/desk/api/contact-flags';
import { readSettingsResponse } from '@/lib/desk/api/settings-write';
import * as flagsRoute from '@/app/api/desk/contact-flags/route';
import * as laneRoute from '@/app/api/desk/internal-conversations/route';
import type { DeskContext } from '@/lib/desk/types';

const ctxOf = (manager: boolean, staffPhones: string[] = []): DeskContext => ({
    actor: { id: '7', name: 'Asha' },
    rights: { agent: true, manager, money: true, inbox: true, via: 'permission' },
    token: 'tok',
    settings: { ...allOffDeskSettings(), readable: true, ui_enabled: true, staff_phones: staffPhones },
});
const MANAGER = ctxOf(true);
const AGENT = ctxOf(false);
const catching = async (task: Promise<unknown>): Promise<DeskApiError> => {
    try { await task; } catch (error) { return error as DeskApiError; }
    throw new Error('expected a DeskApiError');
};
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();

beforeEach(() => {
    store.tables = {};
    store.nextId = 1;
    store.failTable = null;
});

describe('route levels', () => {
    it.each([
        [flagsRoute.GET, 'agent'], [flagsRoute.POST, 'manager'], [flagsRoute.PATCH, 'manager'], [laneRoute.GET, 'agent'],
    ] as const)('CF1 %#', (handler, level) => {
        expect((handler as unknown as Record<symbol, unknown>)[DESK_WRAPPED]).toEqual({ level, alwaysOn: false });
    });
});

describe('schemas', () => {
    it.each([
        [contactFlagCreateBody, { phone: '919876543210', kind: 'internal' }, true],
        [contactFlagCreateBody, { phone: '919876543210', kind: 'internal', label: 'Ravi (driver)' }, true],
        [contactFlagCreateBody, { phone: '919876543210', kind: 'staff' }, false],
        [contactFlagCreateBody, { phone: '98765-43210', kind: 'internal' }, false],
        [contactFlagCreateBody, { phone: '919876543210', kind: 'internal', label: 'x'.repeat(81) }, false],
        [contactFlagCreateBody, { phone: '919876543210', kind: 'internal', extra: 1 }, false],
        [contactFlagPatchBody, { id: 3, removed: true }, true],
        [contactFlagPatchBody, { id: 3, removed: false }, false],
        [contactFlagPatchBody, { id: '3', removed: true }, false],
        [contactFlagsQuery, { limit: '50' }, true],
        [contactFlagsQuery, { limit: '50', include_removed: '1', kind: 'customer' }, true],
        [contactFlagsQuery, {}, false],
        [contactFlagsQuery, { limit: '101' }, false],
        [tickBody, {}, true],
        [tickBody, { staff_phones: ['9876543210'], other: true }, true],
        [tickBody, { staff_phones: ['919876543210'] }, false],
        [tickBody, { staff_phones: Array.from({ length: 5001 }, () => '9876543210') }, false],
    ] as const)('CF2 %#', (schema, value, valid) => {
        expect(schema.safeParse(value).success).toBe(valid);
    });
});

describe('flags', () => {
    it('CF3 POST stores the 10-digit phone and the actor; the same kind again answers the row', async () => {
        const first = await createContactFlag({ phone: '919876543210', kind: 'internal', label: 'Ravi (driver)' }, MANAGER);
        expect(first.created).toBe(true);
        expect(first.response.item).toMatchObject({ phone: '9876543210', kind: 'internal', label: 'Ravi (driver)', added_by: '7', added_by_name: 'Asha', removed_at: null });
        const again = await createContactFlag({ phone: '9876543210', kind: 'internal' }, MANAGER);
        expect(again).toEqual({ response: { item: first.response.item }, created: false });
    });

    it('CF4 the other kind on an active phone is refused; a phone that is not Indian is refused', async () => {
        await createContactFlag({ phone: '9876543210', kind: 'internal' }, MANAGER);
        expect((await catching(createContactFlag({ phone: '9876543210', kind: 'customer' }, MANAGER))).code).toBe('validation_failed');
        expect((await catching(createContactFlag({ phone: '12345678', kind: 'internal' }, MANAGER))).code).toBe('validation_failed');
    });

    it('CF5 PATCH removes once, answers the row again, 404 for an unknown id; the phone can be flagged again', async () => {
        const { response } = await createContactFlag({ phone: '9876543210', kind: 'internal' }, MANAGER);
        const removed = await patchContactFlag({ id: response.item.id, removed: true }, MANAGER);
        expect(removed.item).toMatchObject({ removed_by: '7', removed_by_name: 'Asha' });
        expect(removed.item.removed_at).not.toBeNull();
        expect(await patchContactFlag({ id: response.item.id, removed: true }, MANAGER)).toEqual(removed);
        expect((await catching(patchContactFlag({ id: 999, removed: true }, MANAGER))).code).toBe('not_found');
        expect((await createContactFlag({ phone: '9876543210', kind: 'customer' }, MANAGER)).created).toBe(true);
    });

    it('CF6 GET lists active rows; removed rows only for a manager', async () => {
        const { response } = await createContactFlag({ phone: '9876543210', kind: 'internal' }, MANAGER);
        await createContactFlag({ phone: '9811111111', kind: 'customer' }, MANAGER);
        await patchContactFlag({ id: response.item.id, removed: true }, MANAGER);
        expect((await listContactFlags({ limit: 50 }, AGENT)).items.map((row) => row.phone)).toEqual(['9811111111']);
        expect((await listContactFlags({ limit: 50, kind: 'internal' }, AGENT)).items).toEqual([]);
        expect((await catching(listContactFlags({ limit: 50, include_removed: '1' }, AGENT))).code).toBe('forbidden');
        expect((await listContactFlags({ limit: 50, include_removed: '1' }, MANAGER)).items).toHaveLength(2);
    });

    it('CF7 migration 016 missing is not_installed', async () => {
        store.failTable = 'desk_contact_flags';
        expect((await catching(listContactFlags({ limit: 50 }, AGENT))).code).toBe('not_installed');
        expect((await catching(createContactFlag({ phone: '9876543210', kind: 'internal' }, MANAGER))).code).toBe('not_installed');
    });
});

describe('internal conversations (route 24)', () => {
    beforeEach(() => {
        store.tables.contacts = [
            { id: 'k1', name: 'Ravi', phone: '919900000011' },
            { id: 'k2', name: 'Farm', phone: '919811111111' },
            { id: 'k3', name: 'Meera', phone: '919822222222' },
            { id: 'k4', name: 'Old', phone: '919833333333' },
        ];
        store.tables.conversations = [
            { id: 'c1', contact_id: 'k1', integrated_number: '917996196111', last_incoming_timestamp: hoursAgo(1) },
            { id: 'c2', contact_id: 'k2', integrated_number: '917090166111', last_incoming_timestamp: hoursAgo(2) },
            { id: 'c3', contact_id: 'k3', integrated_number: '917996196111', last_incoming_timestamp: hoursAgo(1) },
            { id: 'c4', contact_id: 'k4', integrated_number: '917996196111', last_incoming_timestamp: hoursAgo(24 * 9) },
        ];
        store.tables.desk_contact_flags = [
            { id: 1, phone: '9811111111', kind: 'internal', label: 'Farm staff', removed_at: null },
            { id: 2, phone: '9833333333', kind: 'internal', label: null, removed_at: null },
        ];
    });

    it('CF8 staff list and internal flags, newest first, phone tail only, last 7 IST days', async () => {
        const result = await listInternalConversations({ limit: 50 }, ctxOf(false, ['9900000011']));
        expect(result.items).toEqual([
            { conversation_id: 'c1', integrated_number: '917996196111', contact_name: 'Ravi', phone_tail: '0011', source: 'staff_list', last_inbound_at: store.tables.conversations[0].last_incoming_timestamp, label: null },
            { conversation_id: 'c2', integrated_number: '917090166111', contact_name: 'Farm', phone_tail: '1111', source: 'flag', last_inbound_at: store.tables.conversations[1].last_incoming_timestamp, label: 'Farm staff' },
        ]);
        expect(JSON.stringify(result)).not.toContain('9900000011');
    });

    it('CF9 a customer flag removes a staff phone; no list and no flag gives nothing', async () => {
        store.tables.desk_contact_flags.push({ id: 3, phone: '9900000011', kind: 'customer', label: null, removed_at: null });
        expect((await listInternalConversations({ limit: 50 }, ctxOf(false, ['9900000011']))).items.map((item) => item.conversation_id)).toEqual(['c2']);
        store.tables.desk_contact_flags = [];
        expect((await listInternalConversations({ limit: 50 }, AGENT)).items).toEqual([]);
    });
});

describe('GET /api/desk/settings hides the staff list (planner decision Q-10)', () => {
    it('CF10 neither raw nor settings carry the phones', async () => {
        const response = await readSettingsResponse();
        expect(response.raw).toEqual({ desk_engine_enabled: '1' });
        expect(response.settings.staff_phones).toEqual([]);
        expect(JSON.stringify(response)).not.toContain('9900000011');
    });
});
