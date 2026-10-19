import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeWindowStart, runDeskTick } from '@/lib/desk/tick';
import type { DeskTickStats } from '@/lib/desk/types';
import {
    NOW, addMessage, addResolvedTicket, addTicket, createFakeDeskRepo, defaultSettings, eventsOf, hoursAgo, makeConversation,
    minutesAgo, ts, type FakeDeskRepo, type FakeSeed,
} from './fake-repo';

afterEach(() => { vi.restoreAllMocks(); });

function world(seed: FakeSeed = {}, settings: Record<string, string> = {}): FakeDeskRepo {
    return createFakeDeskRepo({
        conversations: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }],
        ...seed,
        settings: defaultSettings(settings),
    });
}
const tick = (fake: FakeDeskRepo, now: Date = NOW, clock?: () => number, staffPhones: string[] | null = null) =>
    runDeskTick({ repo: fake, now, clock, staffPhones });
const sweepable = (fake: FakeDeskRepo, conversationId = 'C1', createdAt = minutesAgo(5)) =>
    addMessage(fake, { conversation_id: conversationId, created_at: createdAt });
const tables = (fake: FakeDeskRepo): string[] => [...new Set(fake.writes.map((w) => w.table))].sort();

describe('step 1 — heartbeat and flags', () => {
    it('K01 unreadable settings skip the run and write no stats', async () => {
        const fake = world();
        sweepable(fake);
        fake.failNext('readSettingRows', 'XX000');
        const result = await tick(fake);
        expect(result).toMatchObject({ ran: false, skipped: 'settings_error', steps: {} });
        expect(tables(fake)).toEqual(['app_settings']);
        expect(fake.settings.get('desk_last_tick_stats')).toBe('');
        expect(fake.tickets).toHaveLength(0);
    });

    it('K02 migration 015a missing is not_installed and writes nothing', async () => {
        const fake = world();
        fake.setInstall('no_015a');
        const result = await tick(fake);
        expect(result).toMatchObject({ ran: false, skipped: 'not_installed', heartbeat_written: false });
        expect(fake.writes).toEqual([]);
    });

    it('K03 migration 015b missing still writes the heartbeat', async () => {
        const fake = world();
        fake.setInstall('no_015b');
        const result = await tick(fake);
        expect(result).toMatchObject({ skipped: 'not_installed', heartbeat_written: true });
        expect(fake.settings.get('desk_last_tick_at')).toBe(NOW.toISOString());
        expect(fake.tickets).toHaveLength(0);
    });

    it('K04 a missing service key is not_installed and writes nothing', async () => {
        const fake = world();
        fake.setInstall('no_service_key');
        expect(await tick(fake)).toMatchObject({ ran: false, skipped: 'not_installed', heartbeat_written: false });
        expect(fake.writes).toEqual([]);
    });

    it('K05 the engine flag off writes the heartbeat and stats only', async () => {
        const fake = world({}, { desk_engine_enabled: '0' });
        const message = sweepable(fake);
        const result = await tick(fake);
        expect(result).toMatchObject({ ran: false, skipped: 'engine_off', heartbeat_written: true, steps: {} });
        expect(tables(fake)).toEqual(['app_settings']);
        expect(message.ticket_id).toBeNull();
        const stats = JSON.parse(fake.settings.get('desk_last_tick_stats') as string) as DeskTickStats;
        expect(stats).toMatchObject({ at: NOW.toISOString(), orphans: 0, orphans_capped: false, oldest_orphan_age_s: null, failed_replies_24h: 0, steps: {} });
    });

    it.each(['', '2026-10-15'])('K06 go-live %j is no_go_live', async (value) => {
        const fake = world({}, { desk_go_live_at: value });
        sweepable(fake);
        expect(await tick(fake)).toMatchObject({ ran: false, skipped: 'no_go_live', heartbeat_written: true });
        expect(tables(fake)).toEqual(['app_settings']);
    });

    it('a probe that times out is treated as not installed (fail closed)', async () => {
        const fake = world();
        fake.failNext('probe', 'TIMEOUT');
        expect((await tick(fake)).skipped).toBe('not_installed');
    });
});

describe('step 2 — message sweep', () => {
    it('K07 only messages older than 90 seconds are swept', async () => {
        const fake = world();
        const young = sweepable(fake, 'C1', ts(60));
        sweepable(fake, 'C2', ts(120));
        sweepable(fake, 'C3', minutesAgo(10));
        const first = await tick(fake);
        expect(first.steps.sweep).toMatchObject({ scanned: 2, created: 2 });
        expect(young.ticket_id).toBeNull();
        const second = await tick(fake, new Date(NOW.getTime() + 60_000));
        expect(second.steps.sweep).toMatchObject({ scanned: 1, created: 1 });
        expect(young.ticket_id).not.toBeNull();
    });

    it('K08 a message stored before go-live is never swept', async () => {
        const fake = world();
        const old = addMessage(fake, { created_at: '2026-10-11T23:29:00.123456+00:00' });
        expect((await tick(fake)).steps.sweep?.scanned).toBe(0);
        await tick(fake, new Date(NOW.getTime() + 3_600_000));
        expect(old.ticket_id).toBeNull();
    });

    it('K09 two messages of one conversation make one ticket', async () => {
        const fake = world();
        const first = sweepable(fake, 'C1', minutesAgo(6));
        const second = sweepable(fake, 'C1', minutesAgo(5));
        const result = await tick(fake);
        expect(result.steps.sweep).toMatchObject({ created: 1, appended: 1 });
        expect(fake.tickets).toHaveLength(1);
        expect(first.ticket_id).toBe(fake.tickets[0].id);
        expect(second.ticket_id).toBe(fake.tickets[0].id);
        expect(fake.tickets[0].opened_at).toBe(first.created_at);
    });

    it('K10 a message without a conversation is skipped and stays unclaimed', async () => {
        const fake = world();
        const orphan = sweepable(fake, 'GHOST');
        const result = await tick(fake);
        expect(result.steps.sweep).toMatchObject({ skipped_no_conversation: 1, created: 0 });
        expect(orphan.ticket_id).toBeNull();
    });

    it('K11 a second run with the same clock does nothing', async () => {
        const fake = world();
        sweepable(fake, 'C1', minutesAgo(6));
        sweepable(fake, 'C1', minutesAgo(5));
        await tick(fake);
        const tickets = fake.tickets.length;
        const events = fake.events.length;
        const second = await tick(fake);
        expect(second.steps.sweep).toMatchObject({ scanned: 0, created: 0, appended: 0, reopened: 0, gave_up: 0 });
        expect(fake.tickets).toHaveLength(tickets);
        expect(fake.events).toHaveLength(events);
    });

    it('K12 two ticks at once leave one ticket and one link per message', async () => {
        const fake = world();
        const messages = [sweepable(fake, 'C1', minutesAgo(6)), sweepable(fake, 'C1', minutesAgo(5))];
        const [a, b] = await Promise.all([tick(fake), tick(fake)]);
        expect(fake.tickets.filter((t) => t.status !== 'resolved')).toHaveLength(1);
        expect(messages.every((m) => m.ticket_id === fake.tickets[0].id)).toBe(true);
        expect((a.steps.sweep?.created ?? 0) + (b.steps.sweep?.created ?? 0)).toBe(1);
    });

    it('K26 stops starting new conversations after the time box and keeps going', async () => {
        const fake = world();
        const first = sweepable(fake, 'C1', minutesAgo(6));
        const second = sweepable(fake, 'C2', minutesAgo(5));
        let clock = 0;
        fake.before('getConversation', () => { clock += 10_000; });
        const result = await tick(fake, NOW, () => clock);
        expect(result.steps.sweep).toMatchObject({ timed_out: true, ok: false, created: 1 });
        expect(Object.keys(result.steps)).toEqual(['internal', 'sweep', 'derive', 'mirror', 'missing', 'lifecycle', 'health']);
        expect(first.ticket_id).not.toBeNull();
        expect(second.ticket_id).toBeNull();
        expect((await tick(fake, NOW, () => clock)).steps.sweep?.created).toBe(1);
        expect(second.ticket_id).not.toBeNull();
    });
});

describe('step 4 — mirror', () => {
    const resolvedConversation = { conversations: [{ id: 'C1', status: 'resolved' as const }, { id: 'C2' }, { id: 'C3' }] };

    it('K13 an old-inbox resolve closes the ticket as legacy_inbox', async () => {
        const fake = world(resolvedConversation);
        const ticket = addTicket(fake, { last_inbound_at: minutesAgo(5), awaiting_reply_since: minutesAgo(5), opened_at: minutesAgo(30) });
        const result = await tick(fake);
        expect(result.steps.mirror?.legacy_resolved).toBe(1);
        expect(ticket).toMatchObject({
            status: 'resolved', resolved_via: 'legacy_inbox', resolution_code: 'closed_unclassified', resolved_by: null,
            first_resolved_code: 'closed_unclassified', awaiting_reply_since: null,
        });
        expect(eventsOf(fake, 'resolved')).toEqual([expect.objectContaining({
            actor_id: 'legacy_inbox', data: expect.objectContaining({ over_unanswered: true }),
        })]);
    });

    it('K14 uses the category default and omits over_unanswered when nobody was waiting', async () => {
        const fake = world(resolvedConversation);
        const ticket = addTicket(fake, { category_slug: 'general_enquiry', type: 'enquiry', last_inbound_at: minutesAgo(5), awaiting_reply_since: null });
        const result = await tick(fake);
        expect(result.steps.mirror?.legacy_resolved).toBe(1);
        expect(ticket).toMatchObject({ resolution_code: 'answered', category_slug: 'general_enquiry', type: 'enquiry' });
        expect(eventsOf(fake, 'resolved')[0].data).not.toHaveProperty('over_unanswered');
    });

    it('K15 waits two minutes after the last customer message', async () => {
        const fake = world(resolvedConversation);
        const ticket = addTicket(fake, { last_inbound_at: ts(60) });
        expect((await tick(fake)).steps.mirror?.legacy_resolved).toBe(0);
        expect(ticket.status).not.toBe('resolved');
    });

    it('does not close a manual ticket that has no customer message', async () => {
        const fake = world(resolvedConversation);
        const ticket = addTicket(fake, { origin: 'manual', last_inbound_at: null });
        expect((await tick(fake)).steps.mirror?.legacy_resolved).toBe(0);
        expect(ticket.status).not.toBe('resolved');
    });

    function claimedInboundAfterResolution(fake: FakeDeskRepo) {
        const ticket = addResolvedTicket(fake, { resolvedMinutesAgo: 10 });
        const message = addMessage(fake, { created_at: minutesAgo(5), ticket_id: ticket.id });
        return { ticket, message };
    }

    it('K16 a claimed customer message after the resolution reopens the ticket', async () => {
        const fake = world();
        const { ticket, message } = claimedInboundAfterResolution(fake);
        const result = await tick(fake);
        expect(result.steps.mirror?.invariant_reopened).toBe(1);
        expect(ticket.last_reopened_at).toBe(message.created_at);
        expect(eventsOf(fake, 'reopened')[0].data.reason).toBe('unseen_message');
    });

    it('K17 a recorded suppressed ack does not reopen', async () => {
        const fake = world();
        const { ticket, message } = claimedInboundAfterResolution(fake);
        await fake.insertEvent({
            ticket_id: ticket.id, type: 'ack_suppressed', from_status: null, to_status: null, actor_id: 'system',
            actor_name: 'Desk engine', data: { message_id: message.id, text: 'ok' },
        });
        expect((await tick(fake)).steps.mirror?.invariant_reopened).toBe(0);
        expect(ticket.status).toBe('resolved');
    });

    it('K18 another unresolved ticket on the conversation counts a conflict', async () => {
        const fake = world();
        const { ticket } = claimedInboundAfterResolution(fake);
        addTicket(fake, { status: 'new', last_inbound_at: minutesAgo(1), opened_at: minutesAgo(2) });
        const result = await tick(fake);
        expect(result.steps.mirror).toMatchObject({ reopen_conflicts: 1, invariant_reopened: 0 });
        expect(ticket.status).toBe('resolved');
    });
});

describe('step 5 — missing-message sweep', () => {
    const gap = (overrides = {}) => ({
        id: 'C3', status: 'open' as const, last_incoming_timestamp: minutesAgo(5), last_message: 'hello', created_at: hoursAgo(48), ...overrides,
    });
    const gapWorld = (overrides = {}, extra: FakeSeed = {}) => world({ conversations: [{ id: 'C1' }, { id: 'C2' }, gap(overrides)], ...extra });

    it('K19 flags a conversation whose message was never stored, once', async () => {
        const fake = gapWorld();
        const result = await tick(fake);
        expect(result.steps.missing).toMatchObject({ scanned: 1, flagged: 1 });
        expect(fake.tickets[0]).toMatchObject({
            origin: 'missing_message', conversation_id: 'C3', opened_at: minutesAgo(5), awaiting_reply_since: minutesAgo(5),
            last_inbound_at: minutesAgo(5), priority: 3, is_ack_only: false, status: 'new',
        });
        expect(eventsOf(fake, 'created')[0].data).toMatchObject({ origin: 'missing_message', message_id: null });
        expect(eventsOf(fake, 'missing_message_flagged')).toHaveLength(1);
        expect((await tick(fake)).steps.missing?.flagged).toBe(0);
    });

    it('K20a ignores a conversation created by the "new chat" button', async () => {
        const fake = gapWorld({ last_message: '', created_at: minutesAgo(5) });
        expect((await tick(fake)).steps.missing?.flagged).toBe(0);
    });

    it('K20b ignores a conversation that already has an unresolved ticket', async () => {
        const fake = gapWorld();
        addTicket(fake, { conversation_id: 'C3', status: 'new', last_inbound_at: minutesAgo(40) });
        expect((await tick(fake)).steps.missing?.flagged).toBe(0);
        expect(fake.tickets).toHaveLength(1);
    });

    it('K20c ignores a conversation whose stored message is within two minutes of the timestamp', async () => {
        const fake = gapWorld({}, {});
        addMessage(fake, { conversation_id: 'C3', created_at: ts(5 * 60 + 30), ticket_id: 'earlier' });
        expect((await tick(fake)).steps.missing?.flagged).toBe(0);
    });

    it('K20d ignores a timestamp younger than two minutes', async () => {
        const fake = gapWorld({ last_incoming_timestamp: ts(60) });
        expect((await tick(fake)).steps.missing?.flagged).toBe(0);
    });

    it('ignores a resolved ticket opened right after the timestamp', async () => {
        const fake = gapWorld();
        addResolvedTicket(fake, { resolvedMinutesAgo: 1, conversationId: 'C3' }, { opened_at: minutesAgo(5) });
        expect((await tick(fake)).steps.missing?.flagged).toBe(0);
    });

    it('uses the queue of the number and never writes the conversation', async () => {
        const fake = gapWorld({ integrated_number: '917090166111' });
        await tick(fake);
        expect(fake.tickets[0].queue).toBe('sales');
        expect(tables(fake)).not.toContain('conversations');
    });
});

describe('step 6 — lifecycle', () => {
    /** A ticket whose stored history says: customer wrote, a person replied `replyHoursAgo` ago. */
    function waitingTicket(fake: FakeDeskRepo, conversationId: string, replyHoursAgo: number, overrides = {}) {
        const inboundAt = hoursAgo(replyHoursAgo + 1);
        const replyAt = hoursAgo(replyHoursAgo);
        const ticket = addTicket(fake, {
            conversation_id: conversationId, status: 'waiting_customer', opened_at: inboundAt, last_inbound_at: inboundAt,
            last_outbound_at: replyAt, awaiting_reply_since: null, first_response_at: replyAt, first_response_source: 'panel', ...overrides,
        });
        addMessage(fake, { conversation_id: conversationId, created_at: inboundAt, ticket_id: ticket.id });
        const reply = addMessage(fake, { conversation_id: conversationId, direction: 'outbound', source: 'webapp', status: 'sent', created_at: replyAt });
        ticket.first_response_message_id = reply.id;
        return ticket;
    }

    it('K21 closes only a waiting_customer ticket that nobody is waiting on', async () => {
        const fake = world();
        const idle = waitingTicket(fake, 'C1', 25);
        const held = waitingTicket(fake, 'C2', 25, { status: 'on_hold' });
        const awaiting = waitingTicket(fake, 'C3', 25, { awaiting_reply_since: hoursAgo(26) });
        const result = await tick(fake);
        expect(result.steps.lifecycle?.idle_closed).toBe(1);
        expect(idle).toMatchObject({ status: 'resolved', resolved_via: 'auto_idle', resolution_code: 'no_response' });
        expect(held.status).toBe('on_hold');
        expect(awaiting.status).toBe('waiting_customer');
    });

    function ackTicket(fake: FakeDeskRepo, conversationId: string) {
        const at = hoursAgo(3);
        const ticket = addTicket(fake, {
            conversation_id: conversationId, status: 'new', is_ack_only: true, priority: 4, opened_at: at,
            last_inbound_at: at, awaiting_reply_since: at,
        });
        addMessage(fake, { conversation_id: conversationId, body: 'ok', created_at: at, ticket_id: ticket.id });
        return ticket;
    }

    it('K22 closes an ack-only ticket unless a customer message is still unlinked', async () => {
        // A cutoff of a few seconds, so that the unlinked-message check (not the cutoff) is what holds T1 back.
        const fake = world({}, { desk_ack_autoclose_hours: '0.001' });
        const closable = ackTicket(fake, 'C1');
        const blocked = ackTicket(fake, 'C2');
        addMessage(fake, { conversation_id: 'C2', body: 'ok', created_at: ts(60) });
        const result = await tick(fake);
        expect(result.steps.lifecycle?.ack_closed).toBe(1);
        expect(closable).toMatchObject({ status: 'resolved', resolved_via: 'system', resolution_code: 'no_action' });
        expect(blocked.status).not.toBe('resolved');
    });

    it('K24 counts due follow-ups and writes nothing', async () => {
        const fake = world();
        addTicket(fake, { status: 'on_hold', follow_up_at: ts(60) });
        const result = await tick(fake);
        expect(result.steps.lifecycle?.followups_due).toBe(1);
        expect(tables(fake)).toEqual(['app_settings']);
    });

    it('K25 watches the cutoff only inside the last 90 minutes before it', async () => {
        const fake = world();
        addTicket(fake, { status: 'new', category_slug: null });
        const evening = await tick(fake, new Date('2026-10-12T15:30:00.000Z'));
        expect(evening.steps.lifecycle?.cutoff_watch).toBe(1);
        expect(fake.calls.listCutoffWatchIds).toBe(1);
        const noon = await tick(fake);
        expect(noon.steps.lifecycle?.cutoff_watch).toBe(0);
        expect(fake.calls.listCutoffWatchIds).toBe(1);
        expect(eventsOf(fake, 'cutoff_alerted')).toHaveLength(0);
    });
});

describe('the whole run', () => {
    it('K23 writes only desk tables, messages.ticket_id and the settings rows', async () => {
        const fake = world({ conversations: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3', status: 'resolved' }, { id: 'C4', last_incoming_timestamp: minutesAgo(5) }] });
        sweepable(fake, 'C1');
        addTicket(fake, { conversation_id: 'C2', last_inbound_at: minutesAgo(20), opened_at: minutesAgo(30) });
        sweepable(fake, 'C2');
        addResolvedTicket(fake, { resolvedMinutesAgo: 30, conversationId: 'C5' });
        addTicket(fake, { conversation_id: 'C3', last_inbound_at: minutesAgo(10), awaiting_reply_since: minutesAgo(10) });
        await tick(fake);
        expect(fake.writes.length).toBeGreaterThan(5);
        for (const write of fake.writes) {
            expect(['desk_tickets', 'desk_ticket_events', 'messages', 'app_settings']).toContain(write.table);
            if (write.table === 'messages') expect(write.columns).toEqual(['ticket_id']);
        }
        expect(fake.writes.filter((w) => w.table === 'app_settings').every((w) => w.columns.join() === 'value')).toBe(true);
    });

    it('K27 a step that throws is reported and the later steps still run', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const fake = world();
        fake.before('listActiveConversationIds', () => { throw new Error('boom'); });
        const result = await tick(fake);
        expect(result.ran).toBe(true);
        expect(result.steps.derive?.ok).toBe(false);
        expect(Object.keys(result.steps)).toEqual(['internal', 'sweep', 'derive', 'mirror', 'missing', 'lifecycle', 'health']);
        expect(result.steps.mirror?.ok).toBe(true);
        expect(error).toHaveBeenCalledWith('[desk-tick] step failed', 'derive', 'Error');
    });

    it('K28 reports orphans and failed replies and writes the stats row', async () => {
        const fake = world();
        fake.failNext('getConversation', 'XX000', 99);
        const oldest = sweepable(fake, 'C1', minutesAgo(30));
        sweepable(fake, 'C1', minutesAgo(20));
        sweepable(fake, 'C1', minutesAgo(10));
        addMessage(fake, { conversation_id: 'C2', direction: 'outbound', source: 'webapp', status: 'failed', created_at: hoursAgo(2) });
        addMessage(fake, { conversation_id: 'C3', direction: 'outbound', source: 'webapp', status: 'failed', created_at: hoursAgo(3) });
        const result = await tick(fake);
        expect(oldest.ticket_id).toBeNull();
        expect(result.steps.health).toMatchObject({ orphans: 3, orphans_capped: false, oldest_orphan_age_s: 1800, failed_replies_24h: 2, stats_written: true });
        const stats = JSON.parse(fake.settings.get('desk_last_tick_stats') as string) as DeskTickStats;
        expect(stats.at).toBe(result.tick_at);
        expect(stats).toMatchObject({ orphans: 3, failed_replies_24h: 2 });
        expect(stats.steps.health?.stats_written).toBe(true);
    });

    it('K29 an unseeded stats row is not an error', async () => {
        const fake = world();
        fake.settings.delete('desk_last_tick_stats');
        const result = await tick(fake);
        expect(result.ran).toBe(true);
        expect(result.steps.health).toMatchObject({ stats_written: false, errors: 0, ok: true });
    });

    it('caps the orphan count at 100', async () => {
        const fake = world();
        fake.failNext('getConversation', 'XX000', 999);
        for (let index = 0; index < 101; index += 1) sweepable(fake, 'C1', minutesAgo(10 + (index % 5)));
        const health = (await tick(fake)).steps.health;
        expect(health).toMatchObject({ orphans: 100, orphans_capped: true });
    });

    it('a call that becomes not_installed mid-run stops that step only', async () => {
        const fake = world();
        sweepable(fake);
        fake.failNext('insertTicket', '42501');
        const result = await tick(fake);
        expect(result.steps.sweep).toMatchObject({ not_installed: true, ok: false });
        expect(result.steps.lifecycle?.ok).toBe(true);
    });

    it('the result carries counts and no message text, name or phone number', async () => {
        const fake = world();
        sweepable(fake);
        const json = JSON.stringify(await tick(fake));
        expect(json).not.toContain('hello');
        expect(json).not.toContain('919900000011');
        expect(json).not.toContain('Customer');
    });

    it('K30 the window reaches back to the last tick, within 15 minutes and 24 hours', () => {
        const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
        expect(computeWindowStart(NOW, at(3 * 3_600_000)).getTime()).toBe(NOW.getTime() - 3 * 3_600_000 - 5 * 60_000);
        expect(computeWindowStart(NOW, null).getTime()).toBe(NOW.getTime() - 15 * 60_000);
        expect(computeWindowStart(NOW, 'never').getTime()).toBe(NOW.getTime() - 15 * 60_000);
        expect(computeWindowStart(NOW, at(3 * 86_400_000)).getTime()).toBe(NOW.getTime() - 24 * 3_600_000);
        expect(computeWindowStart(NOW, at(60_000)).getTime()).toBe(NOW.getTime() - 15 * 60_000);
    });

    it('a conversation helper builds what the fake expects', () => {
        expect(makeConversation({ id: 'C9' }).contacts?.phone).toBe('919900000011');
    });
});

describe('step internal — internal contacts (P1e)', () => {
    // Every fixture conversation's contact phone is 919900000011 (makeConversation).
    const STAFF = ['9900000011'];
    const recent = minutesAgo(3);
    const staffWorld = (seed: FakeSeed = {}): FakeDeskRepo => world({
        conversations: [
            { id: 'C1', last_incoming_timestamp: recent },
            { id: 'C2', contacts: { id: 'contact-C2', name: 'Customer C2', phone: '919811111111' } },
        ],
        ...seed,
    });

    it('I01 a staff phone in the body opens no ticket and the message is excluded, not an orphan', async () => {
        const fake = staffWorld();
        const message = sweepable(fake, 'C1', minutesAgo(10));
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(fake.tickets).toHaveLength(0);
        expect(message.ticket_id).toBeNull();
        expect(result.steps.internal).toMatchObject({ ok: true, staff_list: 1, flags: 0, skipped_messages: 0, resolved: 0 });
        expect(result.steps.sweep?.scanned).toBe(0);
        expect(result.steps.health?.orphans).toBe(0);
    });

    it('I02 without a list in the body nothing is suppressed', async () => {
        const fake = staffWorld();
        sweepable(fake, 'C1');
        const result = await tick(fake);
        expect(fake.tickets).toHaveLength(1);
        expect(result.steps.internal?.staff_list).toBeNull();
    });

    it('I03 an open inbound ticket of a staff phone is closed as internal, a manual one is not', async () => {
        const fake = staffWorld();
        const auto = addTicket(fake, { conversation_id: 'C1', customer_phone: '919900000011', status: 'open', last_inbound_at: minutesAgo(20), awaiting_reply_since: minutesAgo(20) });
        const manual = addTicket(fake, { conversation_id: 'C3', origin: 'manual', customer_phone: '919900000011', status: 'waiting_customer' });
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(auto).toMatchObject({
            status: 'resolved', category_slug: 'internal', type: 'other', resolution_code: 'no_action', resolved_via: 'system',
            resolved_by: null, awaiting_reply_since: null, classification_source: null, first_resolved_code: 'no_action',
        });
        expect(auto.classified_at).toBe(NOW.toISOString());
        expect(manual.status).toBe('waiting_customer');
        expect(result.steps.internal?.resolved).toBe(1);
        expect(eventsOf(fake, 'auto_internal').map((e) => [e.ticket_id, e.data])).toEqual([[auto.id, { source: 'staff_list' }]]);
        expect(eventsOf(fake, 'resolved').map((e) => e.data.resolved_via)).toEqual(['system']);
    });

    it('I04 an internal flag works without a staff list; a customer flag beats the list', async () => {
        const flagged = staffWorld({ flags: [{ phone: '9811111111', kind: 'internal' }] });
        sweepable(flagged, 'C2');
        const first = await tick(flagged);
        expect(flagged.tickets.filter((t) => t.conversation_id === 'C2')).toHaveLength(0);
        expect(first.steps.internal).toMatchObject({ staff_list: null, flags: 1 });

        const override = staffWorld({ flags: [{ phone: '9900000011', kind: 'customer' }] });
        sweepable(override, 'C1');
        await tick(override, NOW, undefined, STAFF);
        expect(override.tickets.filter((t) => t.conversation_id === 'C1' && t.origin === 'inbound')).toHaveLength(1);
    });

    it('I05 desk_staff_phones is written only when the list changes', async () => {
        const fake = staffWorld();
        await tick(fake, NOW, undefined, ['9900000012', '9900000011', '9900000011']);
        expect(fake.settings.get('desk_staff_phones')).toBe('["9900000011","9900000012"]');
        expect(fake.settingWrites.filter((key) => key === 'desk_staff_phones')).toHaveLength(1);
        await tick(fake, NOW, undefined, ['9900000011', '9900000012']);
        await tick(fake);
        expect(fake.settingWrites.filter((key) => key === 'desk_staff_phones')).toHaveLength(1);
    });

    it('I06 migration 016 missing: the staff list still works and the step reports not_installed', async () => {
        const fake = staffWorld();
        fake.setInstall('no_016');
        fake.settings.delete('desk_staff_phones');
        const auto = addTicket(fake, { conversation_id: 'C1', customer_phone: '919900000011', status: 'open' });
        const second = addTicket(fake, { conversation_id: 'C3', customer_phone: '919900000011', status: 'new' });
        sweepable(fake, 'C2');
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(result.steps.internal).toMatchObject({ not_installed: true, ok: false, flags: 0, resolved: 2 });
        expect([auto.status, second.status]).toEqual(['resolved', 'resolved']);
        expect(fake.tickets.filter((t) => t.conversation_id === 'C2')).toHaveLength(1);
        expect(result.steps.sweep?.ok).toBe(true);
    });

    it('I07 a failed flag read skips the close for this run but still suppresses', async () => {
        const fake = staffWorld();
        fake.failNext('readContactFlags', 'XX000');
        const auto = addTicket(fake, { conversation_id: 'C1', customer_phone: '919900000011', status: 'open' });
        sweepable(fake, 'C1');
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(auto.status).not.toBe('resolved');
        expect(result.steps.internal).toMatchObject({ errors: 1, resolved: 0 });
        expect(fake.tickets).toHaveLength(1);
    });

    it('I08 safety net: an internal conversation the query did not exclude is skipped and counted', async () => {
        const fake = staffWorld({ conversations: [{ id: 'C1', last_incoming_timestamp: null }] });
        sweepable(fake, 'C1', minutesAgo(10));
        sweepable(fake, 'C1', minutesAgo(9));
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(fake.tickets).toHaveLength(0);
        expect(result.steps.internal?.skipped_messages).toBe(2);
        expect(result.steps.sweep).toMatchObject({ created: 0, scanned: 2 });
    });

    it('I09 101 unexcluded internal messages do not starve a customer message (re-list)', async () => {
        const fake = staffWorld({ conversations: [{ id: 'C1', last_incoming_timestamp: null }, { id: 'C2', contacts: { id: 'contact-C2', name: 'Customer C2', phone: '919811111111' } }] });
        for (let index = 0; index < 101; index += 1) sweepable(fake, 'C1', ts(3000 - index));
        const customer = sweepable(fake, 'C2', minutesAgo(5));
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(customer.ticket_id).not.toBeNull();
        expect(result.steps.internal?.skipped_messages).toBe(100);
        expect(result.steps.sweep).toMatchObject({ created: 1, scanned: 101 });
    });

    it('I09b internal messages the safety net skipped are not counted as orphans', async () => {
        const fake = staffWorld({ conversations: [{ id: 'C1', last_incoming_timestamp: null }, { id: 'C2', contacts: { id: 'contact-C2', name: 'Customer C2', phone: '919811111111' } }] });
        for (let index = 0; index < 101; index += 1) sweepable(fake, 'C1', ts(3000 - index));
        sweepable(fake, 'C2', minutesAgo(5));
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(result.steps.health?.orphans).toBe(0);
    });

    it('I10 the missing-message step never flags an internal conversation', async () => {
        const fake = staffWorld({ conversations: [{ id: 'C1', last_incoming_timestamp: minutesAgo(5) }] });
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(fake.tickets).toHaveLength(0);
        expect(result.steps.missing).toMatchObject({ scanned: 1, flagged: 0 });
    });

    it('I11 mirror does not reopen a resolved non-manual ticket of an internal phone', async () => {
        const fake = staffWorld();
        const resolved = addResolvedTicket(fake, { resolvedMinutesAgo: 30, conversationId: 'C1' }, { customer_phone: '919900000011' });
        addMessage(fake, { conversation_id: 'C1', created_at: minutesAgo(10), ticket_id: resolved.id });
        const result = await tick(fake, NOW, undefined, STAFF);
        expect(resolved.status).toBe('resolved');
        expect(result.steps.mirror?.invariant_reopened).toBe(0);
    });

    it('I12 a run carries no phone number of the staff list', async () => {
        const fake = staffWorld();
        const json = JSON.stringify(await tick(fake, NOW, undefined, STAFF));
        expect(json).not.toContain('9900000011');
    });
});
