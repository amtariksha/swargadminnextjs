import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createContactOrReselect, findContactByPhone, findOrCreateConversation, type LookupDb,
} from '@/lib/whatsapp/conversation-lookup';
import { callsOf, createFakeStore, fakeClient, raceInsert, type FakeStore } from './fake-supabase';

let store: FakeStore;
let db: LookupDb;

const T1 = '2026-10-01T00:00:00.000Z';
const T2 = '2026-10-02T00:00:00.000Z';
const INSERT = { contact_id: 'c1', integrated_number: 'N', status: 'open', unread_count: 1 };
const find = (over: Partial<Parameters<typeof findOrCreateConversation>[0]> = {}) =>
    findOrCreateConversation({ contactId: 'c1', integratedNumber: 'N', insert: { ...INSERT }, ...over }, db);
const conversation = (id: string, createdAt: string, number: string | null = 'N') =>
    ({ id, contact_id: 'c1', integrated_number: number, created_at: createdAt, status: 'open', unread_count: 0 });

beforeEach(() => {
    store = createFakeStore();
    db = fakeClient(store) as unknown as LookupDb;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('findOrCreateConversation', () => {
    it('C01 returns the oldest of two rows and never inserts', async () => {
        store.tables.conversations = [conversation('B', T2), conversation('A', T1)];
        expect(await find()).toEqual({ row: { id: 'A' }, created: false });
        expect(callsOf(store, 'conversations', 'insert')).toHaveLength(0);
    });

    it('C02 inserts the payload unchanged when no row exists', async () => {
        const result = await find();
        expect(result?.created).toBe(true);
        const inserts = callsOf(store, 'conversations', 'insert');
        expect(inserts).toHaveLength(1);
        expect(inserts[0].payload).toEqual(INSERT);
    });

    it('C03 re-reads the winner after losing the insert race (23505)', async () => {
        raceInsert(store, 'conversations', conversation('X', T1));
        expect(await find()).toEqual({ row: { id: 'X' }, created: false });
        expect(store.tables.conversations).toHaveLength(1);
    });

    it('C04 answers null when the conflict leaves no row to read', async () => {
        store.failNext['conversations.insert'] = { code: '23505' };
        expect(await find()).toBeNull();
    });

    it('C05 answers null on any other insert error without re-selecting', async () => {
        store.failNext['conversations.insert'] = { code: '23502' };
        expect(await find()).toBeNull();
        const actions = callsOf(store, 'conversations').map((call) => call.action);
        expect(actions).toEqual(['select', 'insert']);
    });

    it('C06 find-only answers null and never inserts', async () => {
        expect(await find({ insert: null })).toBeNull();
        expect(callsOf(store, 'conversations', 'insert')).toHaveLength(0);
    });

    it('C07 find-only returns an existing row', async () => {
        store.tables.conversations = [conversation('A', T1)];
        expect(await find({ insert: null })).toEqual({ row: { id: 'A' }, created: false });
    });

    it('C08 treats a failed lookup as "not found" and still inserts', async () => {
        store.failNext['conversations.select'] = { code: '57014' };
        const result = await find();
        expect(result?.created).toBe(true);
        expect(callsOf(store, 'conversations', 'insert')).toHaveLength(1);
    });

    it('C09 matches a null number with IS NULL', async () => {
        store.tables.conversations = [conversation('A', T1, null), conversation('B', T1)];
        expect(await find({ integratedNumber: null })).toEqual({ row: { id: 'A' }, created: false });
    });

    it('C10 returns the joined contact when the select asks for it', async () => {
        store.tables.contacts = [{ id: 'c1', name: 'Ravi', phone: '919845012345' }];
        store.tables.conversations = [conversation('A', T1)];
        const result = await find({ select: '*, contacts(*)' });
        expect(result?.row).toMatchObject({ id: 'A', contacts: { id: 'c1', name: 'Ravi' } });
    });
});

describe('contact helpers', () => {
    it('C11 finds a contact by phone, and re-reads it after losing the insert race', async () => {
        const ravi = { id: 'P', name: 'Ravi', phone: '919845012345' };
        store.tables.contacts = [ravi];
        expect(await findContactByPhone('919845012345', db)).toEqual({ id: 'P', name: 'Ravi' });
        store.tables.contacts = [];
        raceInsert(store, 'contacts', ravi);
        expect(await createContactOrReselect({ name: 'Ravi', phone: '919845012345' }, db))
            .toEqual({ row: { id: 'P', name: 'Ravi' }, created: false });
    });

    it('C12 creates a contact with exactly the name and phone keys', async () => {
        const result = await createContactOrReselect({ name: 'Ravi', phone: '919845012345' }, db);
        expect(result?.created).toBe(true);
        const [insert] = callsOf(store, 'contacts', 'insert');
        expect(Object.keys(insert.payload as object).sort()).toEqual(['name', 'phone']);
    });

    it('answers null when a contact read or a non-conflict insert fails', async () => {
        store.failNext['contacts.select'] = { code: '57014' };
        expect(await findContactByPhone('919845012345', db)).toBeNull();
        store.failNext['contacts.insert'] = { code: '23502' };
        expect(await createContactOrReselect({ name: 'Ravi', phone: '919845012345' }, db)).toBeNull();
    });

    it('never throws when the client itself throws', async () => {
        store.failNext['conversations.select'] = { throws: true };
        store.failNext['conversations.insert'] = { throws: true };
        expect(await find()).toBeNull();
        store.failNext['contacts.select'] = { throws: true };
        expect(await findContactByPhone('919845012345', db)).toBeNull();
    });
});
