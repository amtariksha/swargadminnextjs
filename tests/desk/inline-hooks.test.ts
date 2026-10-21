import { afterEach, describe, expect, it, vi } from 'vitest';

const whoami = vi.hoisted(() => ({ impl: null as null | (() => Promise<unknown>) }));
vi.mock('@/lib/desk/whoami', () => ({
    resolveWhoami: (...args: unknown[]) => {
        void args;
        return whoami.impl ? whoami.impl() : Promise.resolve({ kind: 'unavailable' });
    },
}));

import {
    DESK_INLINE_BUDGET_MS, deskConversationPatchHook, deskInboundHook, deskOutboundHook, resolveInlineActor,
    type InlineHookDeps, type InlineStore,
} from '@/lib/desk/inline-hooks';
import { attachInbound, deriveAndWrite } from '@/lib/desk/engine';
import type { DeskDb } from '@/lib/desk/repo';
import type { DeskSettings, Ticket } from '@/lib/desk/types';
import {
    NOW, addMessage, addTicket, eventsOf, minutesAgo, setup, ts,
    type FakeDeskRepo, type FakeSeed, type Harness,
} from './fake-repo';

const ACTOR = { id: '7', name: 'Asha' };
const ok = <T>(data: T): DeskDb<T> => ({ outcome: 'ok', data });

/** Same filters as createSupabaseInlineStore, over the fake's rows. */
function fakeStore(fake: FakeDeskRepo): InlineStore & { calls: number } {
    const store = {
        calls: 0,
        readMessage: async (id: string) => { store.calls += 1; return ok(fake.messages.find((m) => m.id === id) ?? null); },
        writeFirstResponse: async (id: string, values: Partial<Ticket>) => {
            store.calls += 1;
            const t = fake.tickets.find((x) => x.id === id && x.first_response_at === null);
            if (!t) return ok(0);
            Object.assign(t, values);
            return ok(1);
        },
        autoAssign: async (id: string, values: Partial<Ticket>) => {
            store.calls += 1;
            const t = fake.tickets.find((x) => x.id === id && x.status !== 'resolved' && x.assigned_to === null);
            if (!t) return ok(0);
            Object.assign(t, values);
            return ok(1);
        },
        readAssignment: async (conversationId: string) => {
            store.calls += 1;
            const t = fake.tickets.find((x) => x.conversation_id === conversationId && x.status !== 'resolved');
            return ok(t ? { id: t.id, assigned_to: t.assigned_to } : null);
        },
        mirrorAssignment: async (id: string, read: string | null, values: Partial<Ticket>) => {
            store.calls += 1;
            const t = fake.tickets.find((x) => x.id === id && x.status !== 'resolved' && x.assigned_to === read);
            if (!t) return ok(0);
            Object.assign(t, values);
            return ok(1);
        },
    };
    return store as InlineStore & { calls: number };
}

interface Rig extends Harness { store: ReturnType<typeof fakeStore>; deps: InlineHookDeps; settingsReads: () => number }

/** The engine harness of fake-repo.ts with desk_inline_hooks on; `extra` overrides parsed settings (e.g. staff_phones). */
async function rig(seed: FakeSeed = {}, overrides: Record<string, string> = {}, extra: Partial<DeskSettings> = {}): Promise<Rig> {
    const h = await setup(seed, { desk_inline_hooks: '1', ...overrides });
    const store = fakeStore(h.fake);
    let reads = 0;
    const deps: InlineHookDeps = {
        repoFor: () => h.fake, storeFor: () => store, now: () => NOW,
        settings: async () => { reads += 1; return { ...h.ctx.settings, ...extra }; },
    };
    return { ...h, store, deps, settingsReads: () => reads };
}

const flags = (fake: FakeDeskRepo, result: Awaited<ReturnType<FakeDeskRepo['readContactFlags']>>) =>
    vi.spyOn(fake, 'readContactFlags').mockResolvedValue(result);

const openTicket = (fake: FakeDeskRepo, partial: Partial<Ticket> = {}): Ticket => {
    const ticket = addTicket(fake, { status: 'open', opened_at: minutesAgo(20), last_inbound_at: minutesAgo(20), awaiting_reply_since: minutesAgo(20), ...partial });
    addMessage(fake, { conversation_id: ticket.conversation_id, created_at: ticket.opened_at, ticket_id: ticket.id });
    return ticket;
};
/** The old-inbox PATCH has just stored status 'resolved' on C1. */
const RESOLVED_C1: FakeSeed = { conversations: [{ id: 'C1', status: 'resolved' }, { id: 'C2' }] };
const panelReply = (fake: FakeDeskRepo, partial = {}) => addMessage(fake, {
    conversation_id: 'C1', direction: 'outbound', source: 'webapp', status: 'sent', body: 'Sending a fresh pack today', created_at: ts(5), ...partial,
});

afterEach(() => { whoami.impl = null; vi.restoreAllMocks(); });

describe('deskInboundHook', () => {
    it('IH-01 does nothing while desk_inline_hooks is off', async () => {
        const r = await rig({}, { desk_inline_hooks: '0' });
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
        expect(r.fake.calls.getConversation).toBe(0);
    });

    it('IH-02 does nothing while the engine is off', async () => {
        const r = await rig({}, { desk_engine_enabled: '0' });
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-03 does nothing without a go-live time', async () => {
        const r = await rig({}, { desk_go_live_at: '' });
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-04 creates the ticket and links the message', async () => {
        const r = await rig();
        const message = addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(1);
        expect(r.fake.tickets[0]).toMatchObject({ origin: 'inbound', status: 'new', last_inbound_at: message.created_at });
        expect(message.ticket_id).toBe(r.fake.tickets[0].id);
        expect(eventsOf(r.fake, 'created')).toHaveLength(1);
    });

    it('IH-05 appends to the unresolved ticket', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const message = addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(1);
        expect(message.ticket_id).toBe(ticket.id);
        expect(ticket.last_inbound_at).toBe(message.created_at);
    });

    it('IH-06 skips a message stored before go-live', async () => {
        const r = await rig({}, { desk_go_live_at: new Date(NOW.getTime() - 60_000).toISOString() });
        addMessage(r.fake, { created_at: ts(120) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-07 leaves a message the tick already linked alone', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        addMessage(r.fake, { created_at: ts(3), ticket_id: ticket.id });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.calls.touchInbound).toBe(0);
        expect(r.fake.calls.insertTicket).toBe(0);
    });

    it('IH-08 never opens a ticket for a staff phone', async () => {
        const r = await rig({}, {}, { staff_phones: ['9900000011'] });
        const message = addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
        expect(message.ticket_id).toBeNull();
    });

    it('IH-09 a customer flag beats the staff list', async () => {
        const r = await rig({}, {}, { staff_phones: ['9900000011'] });
        flags(r.fake, ok([{ phone: '9900000011', kind: 'customer' }]));
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(1);
    });

    it('IH-10 leaves everything to the tick when the contact flags cannot be read', async () => {
        const r = await rig();
        flags(r.fake, { outcome: 'error', data: null });
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-11 treats a missing flags table (016 not applied) as no flags', async () => {
        const r = await rig();
        flags(r.fake, { outcome: 'not_installed', data: null });
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(1);
    });

    it('IH-12 resolves quietly before migration 015b', async () => {
        const r = await rig();
        r.fake.setInstall('no_015b');
        addMessage(r.fake, { created_at: ts(3) });
        await expect(deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps)).resolves.toBeUndefined();
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-13 links an earlier missed message and the new one to one ticket, oldest first', async () => {
        const r = await rig();
        const first = addMessage(r.fake, { created_at: ts(240), body: 'milk not delivered' });
        const second = addMessage(r.fake, { created_at: ts(3), body: 'hello?' });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.tickets).toHaveLength(1);
        expect(first.ticket_id).toBe(r.fake.tickets[0].id);
        expect(second.ticket_id).toBe(r.fake.tickets[0].id);
        expect(r.fake.tickets[0].opened_at).toBe(first.created_at);
    });

    it('IH-14 attaches at most five messages per call', async () => {
        const r = await rig();
        for (let i = 7; i >= 1; i -= 1) addMessage(r.fake, { created_at: ts(i * 10) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(r.fake.messages.filter((m) => m.ticket_id !== null)).toHaveLength(5);
    });

    it('IH-15 with a message id, attaches only that message', async () => {
        const r = await rig();
        const other = addMessage(r.fake, { created_at: ts(60) });
        const target = addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: target.id }, r.deps);
        expect(target.ticket_id).not.toBeNull();
        expect(other.ticket_id).toBeNull();
    });

    it('IH-16 racing the tick on the same message ends with one ticket and one link', async () => {
        const r = await rig();
        const message = addMessage(r.fake, { created_at: ts(3) });
        await Promise.all([deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps), attachInbound(r.ctx, r.conv('C1'), message)]);
        expect(r.fake.tickets.filter((t) => t.status !== 'resolved')).toHaveLength(1);
        expect(message.ticket_id).toBe(r.fake.tickets[0].id);
    });

    it('IH-17 returns by the budget when a query hangs, without throwing', async () => {
        const r = await rig();
        addMessage(r.fake, { created_at: ts(3) });
        vi.spyOn(r.fake, 'getConversation').mockImplementation(() => new Promise(() => undefined));
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const started = Date.now();
        await deskInboundHook({ conversationId: 'C1', messageId: null }, { ...r.deps, budgetMs: 40 });
        expect(Date.now() - started).toBeLessThan(400);
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-18 swallows a thrown error', async () => {
        const r = await rig();
        vi.spyOn(r.fake, 'getConversation').mockImplementation(() => { throw new TypeError('boom'); });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await expect(deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps)).resolves.toBeUndefined();
    });

    it('IH-19 settings that cannot be read mean off', async () => {
        const r = await rig();
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, { ...r.deps, settings: async () => { throw new Error('down'); } });
        expect(r.fake.tickets).toHaveLength(0);
    });

    it('IH-20 the default budget is 1.5 s', () => {
        expect(DESK_INLINE_BUDGET_MS).toBe(1500);
    });
});

describe('deskOutboundHook', () => {
    it('OH-01 does nothing while desk_inline_hooks is off', async () => {
        const r = await rig({}, { desk_inline_hooks: '0' });
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(r.store.calls).toBe(0);
        expect(ticket).toMatchObject({ assigned_to: null, first_response_at: null });
    });

    it('OH-02 records the first response, assigns the replier and derives the clock', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({
            first_response_at: reply.created_at, first_response_message_id: reply.id, first_response_source: 'panel', first_response_by: '7',
            assigned_to: '7', assigned_name: 'Asha', assigned_at: NOW.toISOString(),
            status: 'waiting_customer', awaiting_reply_since: null, last_outbound_at: reply.created_at,
        });
        expect(eventsOf(r.fake, 'first_response')).toEqual([expect.objectContaining({ actor_id: '7', data: expect.objectContaining({ by: '7', source: 'panel', message_id: reply.id }) })]);
        expect(eventsOf(r.fake, 'assigned')).toEqual([expect.objectContaining({ actor_id: '7', data: { from: null, to: '7', to_name: 'Asha', auto: true } })]);
        expect(eventsOf(r.fake, 'status_changed')).toHaveLength(1);
    });

    it('OH-03 keeps an existing assignee', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake, { assigned_to: '9', assigned_name: 'Ravi' });
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket.assigned_to).toBe('9');
        expect(eventsOf(r.fake, 'assigned')).toHaveLength(0);
    });

    it('OH-04 never overwrites a recorded first response', async () => {
        const r = await rig();
        const earlier = panelReply(r.fake, { created_at: minutesAgo(10) });
        const ticket = openTicket(r.fake, { first_response_at: earlier.created_at, first_response_message_id: earlier.id, first_response_source: 'panel', first_response_by: '9' });
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_message_id: earlier.id, first_response_by: '9' });
        expect(eventsOf(r.fake, 'first_response')).toHaveLength(0);
    });

    it('OH-05 a failed send is not a reply: no first response, no assignment', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake, { status: 'failed' });
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_at: null, assigned_to: null, status: 'new' });
    });

    it('OH-06 a template is not a reply', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake, { content_type: 'template', body: '[Template: payment_link2]' });
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_at: null, assigned_to: null });
    });

    it('OH-07 without an actor only the derive runs', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: null }, r.deps);
        expect(r.store.calls).toBe(0);
        expect(ticket).toMatchObject({ first_response_message_id: reply.id, first_response_by: null, assigned_to: null, status: 'waiting_customer' });
    });

    it('OH-08 no unresolved ticket: nothing is written', async () => {
        const r = await rig();
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(r.fake.tickets).toHaveLength(0);
        expect(r.store.calls).toBe(0);
    });

    it('OH-09 internal contact: nothing is written', async () => {
        const r = await rig({}, {}, { staff_phones: ['9900000011'] });
        const ticket = openTicket(r.fake, { origin: 'manual' });
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket.assigned_to).toBeNull();
        expect(r.store.calls).toBe(0);
    });

    it('OH-10 an earlier phone-app reply wins the first response after the derive', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const phone = addMessage(r.fake, { conversation_id: 'C1', direction: 'outbound', source: 'mobile_app', status: 'sent', body: 'checking', created_at: minutesAgo(5) });
        const reply = panelReply(r.fake);
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_message_id: phone.id, first_response_source: 'phone', first_response_by: null, assigned_to: '7' });
        expect(eventsOf(r.fake, 'first_response').map((e) => e.data.by)).toEqual(['7', null]);
    });

    it('OH-11 a message of another conversation is never attributed', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake, { conversation_id: 'C2' });
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_by: null, assigned_to: null });
    });

    it('OH-12 an internal note is not a reply', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const note = panelReply(r.fake, { is_internal_note: true });
        await deskOutboundHook({ conversationId: 'C1', messageId: note.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_at: null, assigned_to: null });
    });

    it('OH-13 the tick derived the reply before sent_by_* landed: the hook still attributes it', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        const reply = panelReply(r.fake);
        await deriveAndWrite(r.ctx, ticket.id);
        reply.sent_by_user_id = '7';
        await deskOutboundHook({ conversationId: 'C1', messageId: reply.id, actor: ACTOR }, r.deps);
        expect(ticket).toMatchObject({ first_response_message_id: reply.id, first_response_by: '7', assigned_to: '7' });
        expect(eventsOf(r.fake, 'first_response')).toHaveLength(1);
    });
});

describe('deskConversationPatchHook', () => {
    it('PH-01 a mark-as-read PATCH reads nothing', async () => {
        const r = await rig();
        await deskConversationPatchHook({ conversationId: 'C1' }, r.deps);
        await deskConversationPatchHook({ conversationId: 'C1', status: 'open' }, r.deps);
        expect(r.settingsReads()).toBe(0);
    });

    it('PH-02 does nothing while desk_inline_hooks is off', async () => {
        const r = await rig({}, { desk_inline_hooks: '0' });
        const ticket = openTicket(r.fake);
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket.status).toBe('open');
    });

    it('PH-03 an old-inbox resolve closes the ticket as legacy_inbox', async () => {
        const r = await rig(RESOLVED_C1);
        const ticket = openTicket(r.fake, { awaiting_reply_since: null, status: 'waiting_customer' });
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket).toMatchObject({ status: 'resolved', resolved_via: 'legacy_inbox', resolution_code: 'closed_unclassified', first_resolved_code: 'closed_unclassified' });
        expect(eventsOf(r.fake, 'resolved')).toEqual([expect.objectContaining({ actor_id: 'legacy_inbox', data: expect.not.objectContaining({ over_unanswered: true }) })]);
    });

    it('PH-04 uses the category default code', async () => {
        const r = await rig(RESOLVED_C1);
        const ticket = openTicket(r.fake, { category_slug: 'general_enquiry' });
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket.resolution_code).toBe('answered');
    });

    it('PH-05 marks a resolve over a waiting customer', async () => {
        const r = await rig(RESOLVED_C1);
        openTicket(r.fake);
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(eventsOf(r.fake, 'resolved')[0].data).toMatchObject({ over_unanswered: true });
    });

    it('PH-06 waits 120 s after the last customer message (the tick mirrors it later)', async () => {
        const r = await rig(RESOLVED_C1);
        const ticket = openTicket(r.fake, { last_inbound_at: ts(30) });
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket.status).toBe('open');
    });

    it('PH-07 leaves a manual ticket without a customer message to the panel', async () => {
        const r = await rig(RESOLVED_C1);
        const ticket = addTicket(r.fake, { origin: 'manual', status: 'new', last_inbound_at: null, opened_at: minutesAgo(10) });
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket.status).toBe('new');
    });

    it('PH-08 a customer message linked meanwhile keeps the ticket open', async () => {
        const r = await rig(RESOLVED_C1);
        const ticket = openTicket(r.fake);
        r.fake.before('resolveSystem', () => { ticket.last_inbound_at = ts(1); });
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket.status).toBe('open');
    });

    it('PH-14 a conversation reopened since the PATCH keeps the ticket open', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved' }, r.deps);
        expect(ticket.status).toBe('open');
        expect(r.fake.calls.resolveSystem).toBe(0);
    });

    it('PH-09 copies an old-inbox assignment to the ticket', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake);
        await deskConversationPatchHook({ conversationId: 'C1', assignedTo: '12', assignedName: 'Meena' }, r.deps);
        expect(ticket).toMatchObject({ assigned_to: '12', assigned_name: 'Meena', assigned_at: NOW.toISOString() });
        expect(eventsOf(r.fake, 'assigned')).toEqual([expect.objectContaining({ actor_id: 'legacy_inbox', data: { from: null, to: '12', to_name: 'Meena', auto: false } })]);
    });

    it('PH-10 the same assignee again changes nothing', async () => {
        const r = await rig();
        openTicket(r.fake, { assigned_to: '12', assigned_name: 'Meena' });
        await deskConversationPatchHook({ conversationId: 'C1', assignedTo: '12', assignedName: 'Meena' }, r.deps);
        expect(eventsOf(r.fake, 'assigned')).toHaveLength(0);
    });

    it('PH-11 an unassign clears the ticket assignee', async () => {
        const r = await rig();
        const ticket = openTicket(r.fake, { assigned_to: '12', assigned_name: 'Meena', assigned_at: minutesAgo(5) });
        await deskConversationPatchHook({ conversationId: 'C1', assignedTo: null, assignedName: null }, r.deps);
        expect(ticket).toMatchObject({ assigned_to: null, assigned_name: null, assigned_at: null });
        expect(eventsOf(r.fake, 'assigned')[0].data).toEqual({ from: '12', to: null, to_name: null, auto: false });
    });

    it('PH-12 internal contact: nothing is mirrored', async () => {
        const r = await rig({}, {}, { staff_phones: ['9900000011'] });
        const ticket = openTicket(r.fake, { origin: 'manual' });
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved', assignedTo: '12' }, r.deps);
        expect(ticket).toMatchObject({ status: 'open', assigned_to: null });
    });

    it('PH-13 assign and resolve in one PATCH: assigned first, then resolved', async () => {
        const r = await rig(RESOLVED_C1);
        const ticket = openTicket(r.fake);
        await deskConversationPatchHook({ conversationId: 'C1', status: 'resolved', assignedTo: '12', assignedName: 'Meena' }, r.deps);
        expect(ticket).toMatchObject({ status: 'resolved', assigned_to: '12' });
        expect(r.fake.events.map((e) => e.type)).toEqual(['assigned', 'resolved']);
    });
});

describe('resolveInlineActor', () => {
    it('AC-01 no bearer token: null, whoami not asked', async () => {
        const spy = vi.fn();
        whoami.impl = spy;
        expect(await resolveInlineActor(null)).toBeNull();
        expect(await resolveInlineActor('Basic abc')).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });

    it('AC-02 whoami answers: the backend user', async () => {
        whoami.impl = async () => ({ kind: 'ok', stale: false, whoami: { user: ACTOR, agent: true, manager: false, money: false, inbox: true, via: 'role' } });
        expect(await resolveInlineActor('Bearer t')).toEqual(ACTOR);
    });

    it('AC-03 whoami unavailable or rejected: null', async () => {
        whoami.impl = async () => ({ kind: 'unavailable' });
        expect(await resolveInlineActor('Bearer t')).toBeNull();
        whoami.impl = async () => ({ kind: 'unauthorized' });
        expect(await resolveInlineActor('Bearer t')).toBeNull();
    });

    it('AC-04 whoami hangs: null within the budget', async () => {
        whoami.impl = () => new Promise(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const started = Date.now();
        expect(await resolveInlineActor('Bearer t', { budgetMs: 40 })).toBeNull();
        expect(Date.now() - started).toBeLessThan(400);
    });

    it('AC-05 whoami throws: null', async () => {
        whoami.impl = async () => { throw new Error('x'); };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await resolveInlineActor('Bearer t')).toBeNull();
    });
});

describe('engine changes (P1c T2b)', () => {
    it('EN-01 a ticket created by the hook logs via inline', async () => {
        const r = await rig();
        addMessage(r.fake, { created_at: ts(3) });
        await deskInboundHook({ conversationId: 'C1', messageId: null }, r.deps);
        expect(eventsOf(r.fake, 'created').map((e) => e.data.via)).toEqual(['inline']);
    });

    it('EN-02 attachInbound without a via still logs tick', async () => {
        const h = await setup();
        const message = addMessage(h.fake, { created_at: ts(120) });
        await attachInbound(h.ctx, h.conv('C1'), message);
        expect(eventsOf(h.fake, 'created').map((e) => e.data.via)).toEqual(['tick']);
    });

    it('EN-03 the derive records the panel sender of the first response', async () => {
        const h = await setup();
        const ticket = openTicket(h.fake);
        const reply = panelReply(h.fake, { sent_by_user_id: '7' });
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket).toMatchObject({ first_response_message_id: reply.id, first_response_source: 'panel', first_response_by: '7' });
        expect(eventsOf(h.fake, 'first_response').map((e) => e.data.by)).toEqual(['7']);
    });

    it('EN-04 a phone-app first response stays unattributed', async () => {
        const h = await setup();
        const ticket = openTicket(h.fake);
        const reply = panelReply(h.fake, { source: 'mobile_app' });
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket).toMatchObject({ first_response_message_id: reply.id, first_response_source: 'phone', first_response_by: null });
        expect(eventsOf(h.fake, 'first_response').map((e) => e.data.by)).toEqual([null]);
    });

    it('EN-05 a first response that later fails is cleared with its sender', async () => {
        const h = await setup();
        const ticket = openTicket(h.fake);
        const reply = panelReply(h.fake, { sent_by_user_id: '7' });
        await deriveAndWrite(h.ctx, ticket.id);
        reply.status = 'failed';
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket).toMatchObject({
            first_response_at: null, first_response_message_id: null, first_response_source: null, first_response_by: null,
        });
    });

    it('EN-06 a sender written after the derive picked the reply is filled in by the next derive', async () => {
        const h = await setup();
        const ticket = openTicket(h.fake);
        const reply = panelReply(h.fake);
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket.first_response_by).toBeNull();
        reply.sent_by_user_id = '7';
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('updated');
        expect(ticket).toMatchObject({ first_response_message_id: reply.id, first_response_by: '7' });
        expect(eventsOf(h.fake, 'first_response')).toHaveLength(1);
    });

    it('EN-07 a settled first response is not rewritten, and a recorded sender is never replaced', async () => {
        const h = await setup();
        const ticket = openTicket(h.fake);
        panelReply(h.fake, { sent_by_user_id: '7' });
        await deriveAndWrite(h.ctx, ticket.id);
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('unchanged');
        ticket.first_response_by = '9';
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('unchanged');
        expect(ticket.first_response_by).toBe('9');
    });
});
