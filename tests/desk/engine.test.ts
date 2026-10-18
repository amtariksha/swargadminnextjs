import { describe, it, expect } from 'vitest';
import { deriveAndWrite, isAckMessage, resolveBySystem } from '@/lib/desk/engine';
import { buildInternalMatcher } from '@/lib/desk/internal-contacts';
import {
    NOW, addMessage, addResolvedTicket, addTicket, attach, eventsOf, makeMessage, makeTicket, minutesAgo, setup, ts,
} from './fake-repo';

describe('attachInbound', () => {
    it('E01 creates a ticket for a plain message from an unknown number', async () => {
        const h = await setup();
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('created');
        expect(h.fake.tickets).toHaveLength(1);
        const [ticket] = h.fake.tickets;
        expect(ticket).toMatchObject({
            origin: 'inbound', channel: 'whatsapp', status: 'new', queue: 'sales', backend_user_id: null, customer_match: null,
            opened_at: message.created_at, last_inbound_at: message.created_at, awaiting_reply_since: message.created_at,
            customer_phone: '919900000011', integrated_number: '917090166111', conversation_id: 'C1',
        });
        expect(message.ticket_id).toBe(ticket.id);
        expect(eventsOf(h.fake, 'created')).toEqual([expect.objectContaining({
            ticket_id: ticket.id, from_status: null, to_status: 'new', actor_id: 'system',
            data: { origin: 'inbound', via: 'tick', message_id: message.id, queue: 'sales', lag_secs: 300, previous_ticket_id: null },
        })]);
    });

    it('E02 a known customer starts in care and is matched', async () => {
        const h = await setup();
        const message = addMessage(h.fake, { created_at: minutesAgo(5) });
        const { attachInbound } = await import('@/lib/desk/engine');
        const result = await attachInbound(h.ctx, h.conv('C1', { backend_user_id: 4711 }), message);
        expect(result.outcome).toBe('created');
        expect(h.fake.tickets[0]).toMatchObject({ queue: 'care', backend_user_id: 4711, customer_match: 'exact' });
    });

    it('E03 appends to the unresolved ticket and moves last_inbound_at forward', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, { last_inbound_at: minutesAgo(20) });
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('appended');
        expect(h.fake.tickets).toHaveLength(1);
        expect(ticket.last_inbound_at).toBe(message.created_at);
        expect(message.ticket_id).toBe(ticket.id);
    });

    it('E04 never moves last_inbound_at backwards', async () => {
        const h = await setup();
        const newer = addMessage(h.fake, { created_at: minutesAgo(2) });
        const ticket = addTicket(h.fake, { last_inbound_at: newer.created_at, opened_at: minutesAgo(30) });
        newer.ticket_id = ticket.id;
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('appended');
        expect(ticket.last_inbound_at).toBe(newer.created_at);
        expect(message.ticket_id).toBe(ticket.id);
    });

    it('E05 reopens a ticket resolved inside the window and keeps the old resolution', async () => {
        const h = await setup();
        const ticket = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 });
        const resolvedAt = ticket.resolved_at;
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(ticket).toMatchObject({
            status: 'open', resolved_at: null, resolved_by: null, resolved_by_name: null, resolution_code: null,
            resolution_note: null, resolved_via: null, lost_reason: null, reopen_count: 1,
            last_reopened_at: message.created_at, last_inbound_at: message.created_at, awaiting_reply_since: message.created_at,
            prior_resolution: {
                resolved_at: resolvedAt, resolved_by: '7', resolved_by_name: 'Asha', resolution_code: 'answered',
                resolution_note: null, resolved_via: 'manual', lost_reason: null,
            },
        });
        expect(eventsOf(h.fake, 'reopened')).toEqual([expect.objectContaining({
            from_status: 'resolved', to_status: 'open', data: expect.objectContaining({ reason: 'customer_message', message_id: message.id }),
        })]);
    });

    it('E05 leaves first_resolved_* alone', async () => {
        const h = await setup();
        const ticket = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 }, {
            first_resolved_at: minutesAgo(30), first_resolved_by: '7', first_resolved_code: 'answered',
        });
        await attach(h, { created_at: minutesAgo(5) });
        expect(ticket).toMatchObject({ first_resolved_at: minutesAgo(30), first_resolved_by: '7', first_resolved_code: 'answered' });
    });

    it('E06 reopens to new when no reply was ever sent', async () => {
        const h = await setup();
        const ticket = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30, replyBody: null });
        const { result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(ticket.status).toBe('new');
    });

    it('E07 a message stored before the resolution reopens as unseen_message', async () => {
        const h = await setup();
        addResolvedTicket(h.fake, { resolvedMinutesAgo: 2 });
        const { result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(eventsOf(h.fake, 'reopened')[0].data.reason).toBe('unseen_message');
    });

    it('E08 outside the window starts a linked new ticket', async () => {
        const h = await setup();
        const previous = addResolvedTicket(h.fake, { resolvedMinutesAgo: 180 });
        const before = { ...previous };
        const { result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('created');
        const created = h.fake.tickets.find((t) => t.id !== previous.id);
        expect(created?.previous_ticket_id).toBe(previous.id);
        expect(previous).toEqual(before);
    });

    it('E09 shadow mode reopens an ack and records what would have been suppressed', async () => {
        const h = await setup();
        addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 });
        const { message, result } = await attach(h, { body: 'ok thanks', created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(eventsOf(h.fake, 'reopened')[0].data.reason).toBe('ack');
        expect(eventsOf(h.fake, 'ack_would_suppress')).toEqual([expect.objectContaining({ data: { message_id: message.id, text: 'ok thanks' } })]);
        expect(h.fake.calls.listConversationMessages).toBe(2);
    });

    it('E10 mode on attaches the ack to the resolved ticket and leaves it resolved', async () => {
        const h = await setup({}, { desk_ack_suppress: 'on' });
        const ticket = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 });
        const before = { ...ticket };
        const { message, result } = await attach(h, { body: 'ok thanks', created_at: minutesAgo(5) });
        expect(result.outcome).toBe('ack_attached');
        expect(ticket).toEqual(before);
        expect(message.ticket_id).toBe(ticket.id);
        expect(eventsOf(h.fake, 'ack_suppressed')).toHaveLength(1);
        expect(eventsOf(h.fake, 'reopened')).toHaveLength(0);
    });

    it('E11 an ack that answers a question reopens even in mode on', async () => {
        const h = await setup({}, { desk_ack_suppress: 'on' });
        addResolvedTicket(h.fake, { resolvedMinutesAgo: 30, replyBody: 'Shall I add 1L for tomorrow?' });
        const { result } = await attach(h, { body: 'ok', created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(eventsOf(h.fake, 'reopened')[0].data.reason).toBe('ack');
        expect(eventsOf(h.fake, 'ack_would_suppress')).toHaveLength(0);
        expect(eventsOf(h.fake, 'ack_suppressed')).toHaveLength(0);
    });

    it('E12 reads no messages for the ack rules after a system resolution', async () => {
        const h = await setup({}, { desk_ack_suppress: 'on' });
        addResolvedTicket(h.fake, { resolvedMinutesAgo: 30, via: 'auto_idle' });
        const { result } = await attach(h, { body: 'ok', created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(h.fake.calls.listConversationMessages).toBe(1);
    });

    it('E13 a click-to-WhatsApp "ok" is a sales lead, not an ack', async () => {
        const h = await setup();
        await attach(h, { body: 'ok', source: 'ctwa' });
        expect(h.fake.tickets[0]).toMatchObject({ is_ack_only: false, suggested_type: 'sales', suggested_category: 'new_app_subscription', priority: 3 });
    });

    it('E14 an ack-only first message goes to the ack lane at priority 4', async () => {
        const h = await setup();
        await attach(h, { body: 'ok thanks' });
        expect(h.fake.tickets[0]).toMatchObject({ is_ack_only: true, priority: 4 });
    });

    it('E15 a real message on an ack-only ticket adds the suggestion and raises the priority', async () => {
        const h = await setup();
        const earlier = addMessage(h.fake, { body: 'ok', created_at: minutesAgo(20) });
        const ticket = addTicket(h.fake, {
            priority: 4, is_ack_only: true, opened_at: earlier.created_at, last_inbound_at: earlier.created_at,
            awaiting_reply_since: earlier.created_at, status: 'new',
        });
        earlier.ticket_id = ticket.id;
        const { result } = await attach(h, { body: 'delivery is late today', created_at: minutesAgo(5) });
        expect(result.outcome).toBe('appended');
        expect(ticket).toMatchObject({
            priority: 2, suggested_type: 'complaint', suggested_category: 'late_delivery', is_ack_only: false, type: null, category_slug: null,
        });
        expect(eventsOf(h.fake, 'suggested')).toEqual([expect.objectContaining({
            data: expect.objectContaining({ matched_keyword: 'late', suggested_category: 'late_delivery' }),
        })]);
    });

    it('E16 a competing insert makes the message join that ticket', async () => {
        const h = await setup();
        h.fake.before('insertTicket', () => { addTicket(h.fake, { status: 'new', last_inbound_at: minutesAgo(1) }); });
        const { message, result } = await attach(h);
        expect(result.outcome).toBe('appended');
        expect(h.fake.tickets.filter((t) => t.status !== 'resolved')).toHaveLength(1);
        expect(message.ticket_id).toBe(h.fake.tickets[0].id);
    });

    it('E17 a ticket resolved between read and write is reopened on the next pass', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, { last_inbound_at: minutesAgo(20), opened_at: minutesAgo(30) });
        h.fake.before('touchInbound', () => {
            Object.assign(ticket, { status: 'resolved', resolved_at: ts(60), resolved_via: 'manual', resolution_code: 'answered' });
        });
        const { result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('reopened');
        expect(ticket.status).toBe('new');
        expect(h.fake.calls.touchInbound).toBe(1);
        expect(h.fake.calls.reopenTicket).toBe(1);
    });

    it('E18 a conflict on reopen appends to the ticket that now exists', async () => {
        const h = await setup();
        const resolved = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 });
        let competitor = '';
        h.fake.before('reopenTicket', () => { competitor = addTicket(h.fake, { status: 'new', last_inbound_at: minutesAgo(1) }).id; });
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('appended');
        expect(message.ticket_id).toBe(competitor);
        expect(resolved.status).toBe('resolved');
    });

    it('E18 a reopen that matches no row (another worker got there first) retries from a fresh read', async () => {
        const h = await setup();
        const resolved = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 });
        h.fake.before('reopenTicket', () => {
            Object.assign(resolved, { status: 'open', resolved_at: null, resolved_via: null, resolution_code: null });
        });
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('appended');
        expect(message.ticket_id).toBe(resolved.id);
        expect(h.fake.calls.reopenTicket).toBe(1);
    });

    it('E19 gives up after three passes and leaves the message unclaimed', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, { last_inbound_at: minutesAgo(20) });
        let moved = 0;
        h.fake.before('touchInbound', () => { moved += 1; ticket.last_inbound_at = ts(1000 + moved); }, 3);
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('gave_up');
        expect(message.ticket_id).toBeNull();
        expect(h.fake.calls.touchInbound).toBe(3);
    });

    it('E20 a permission error on insert is not_installed and writes nothing', async () => {
        const h = await setup();
        h.fake.failNext('insertTicket', '42501');
        const { result } = await attach(h);
        expect(result.outcome).toBe('not_installed');
        expect(h.fake.writes).toEqual([]);
    });

    it('E21 a missing column on claim leaves the ticket and an unclaimed message', async () => {
        const h = await setup();
        h.fake.failNext('claimMessage', 'PGRST204');
        const { message, result } = await attach(h);
        expect(result.outcome).toBe('not_installed');
        expect(h.fake.tickets).toHaveLength(1);
        expect(message.ticket_id).toBeNull();
    });

    it('E22 any other insert error is an error and leaves the message unclaimed', async () => {
        const h = await setup();
        h.fake.failNext('insertTicket', 'XX000');
        const { message, result } = await attach(h);
        expect(result.outcome).toBe('error');
        expect(h.fake.writes).toEqual([]);
        expect(message.ticket_id).toBeNull();
    });

    it('E23 a claim that returns 0 rows does not undo the transition', async () => {
        const h = await setup();
        const message = addMessage(h.fake);
        h.fake.before('claimMessage', () => { message.ticket_id = 'other-ticket'; });
        const { attachInbound } = await import('@/lib/desk/engine');
        expect((await attachInbound(h.ctx, h.conv(), message)).outcome).toBe('created');
        expect(h.fake.tickets).toHaveLength(1);
    });

    it('E24 a failed event insert is counted and does not block the ticket', async () => {
        const h = await setup();
        h.fake.failNext('insertEvent', 'XX000');
        const { message, result } = await attach(h);
        expect(result).toMatchObject({ outcome: 'created', event_errors: 1 });
        expect(message.ticket_id).toBe(h.fake.tickets[0].id);
    });

    it('E25 a timeout while reading state is an error with nothing written', async () => {
        const h = await setup();
        h.fake.failNext('getUnresolvedTicket', 'TIMEOUT');
        const { result } = await attach(h);
        expect(result).toMatchObject({ outcome: 'error', timed_out: true });
        expect(h.fake.writes).toEqual([]);
    });

    it('does not read the time box before the first pass but stops retrying after it', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, { last_inbound_at: minutesAgo(20) });
        h.fake.before('touchInbound', () => { ticket.last_inbound_at = ts(500); });
        const ctx = { ...h.ctx, expired: () => true };
        const message = addMessage(h.fake);
        const { attachInbound } = await import('@/lib/desk/engine');
        expect((await attachInbound(ctx, h.conv(), message)).outcome).toBe('gave_up');
        expect(h.fake.calls.touchInbound).toBe(1);
    });
});

describe('isAckMessage', () => {
    it('is false for a ctwa message and for media, true for a plain ack', () => {
        expect(isAckMessage(makeMessage({ body: 'ok' }))).toBe(true);
        expect(isAckMessage(makeMessage({ body: 'ok', source: 'ctwa' }))).toBe(false);
        expect(isAckMessage(makeMessage({ body: 'ok', media_url: 'https://x/y.jpg' }))).toBe(false);
        expect(isAckMessage(makeMessage({ body: null }))).toBe(false);
    });
});

describe('deriveAndWrite', () => {
    const opened = minutesAgo(10);
    const inboundTicket = (overrides = {}) => ({
        status: 'new' as const, opened_at: opened, last_inbound_at: opened, awaiting_reply_since: opened, ...overrides,
    });

    it('V01 a panel reply makes the ticket waiting_customer and records the first response', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        addMessage(h.fake, { created_at: opened });
        const reply = addMessage(h.fake, { direction: 'outbound', source: 'webapp', status: 'sent', created_at: minutesAgo(6) });
        const result = await deriveAndWrite(h.ctx, ticket.id);
        expect(result.outcome).toBe('updated');
        expect(ticket).toMatchObject({
            status: 'waiting_customer', awaiting_reply_since: null, last_outbound_at: reply.created_at,
            first_response_at: reply.created_at, first_response_message_id: reply.id, first_response_source: 'panel', first_response_by: null,
        });
        expect(eventsOf(h.fake, 'status_changed')).toEqual([expect.objectContaining({ from_status: 'new', to_status: 'waiting_customer', data: { cause: 'human_reply' } })]);
        expect(eventsOf(h.fake, 'first_response')).toEqual([expect.objectContaining({
            data: { message_id: reply.id, source: 'panel', by: null, secs_since_open: 240 },
        })]);
    });

    it('V02 a reply that later failed is taken back', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        addMessage(h.fake, { created_at: opened });
        const reply = addMessage(h.fake, { direction: 'outbound', source: 'webapp', status: 'sent', created_at: minutesAgo(6) });
        await deriveAndWrite(h.ctx, ticket.id);
        h.fake.events.length = 0;
        reply.status = 'failed';
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('updated');
        expect(ticket).toMatchObject({
            status: 'new', awaiting_reply_since: opened, last_outbound_at: null,
            first_response_at: null, first_response_message_id: null, first_response_source: null,
        });
        expect(eventsOf(h.fake, 'status_changed')).toEqual([expect.objectContaining({ data: { cause: 'reply_failed' } })]);
        expect(eventsOf(h.fake, 'first_response')).toHaveLength(0);
    });

    function waitingWithNewInbound(h: Awaited<ReturnType<typeof setup>>, status: 'waiting_customer' | 'on_hold') {
        const reply = minutesAgo(6);
        const ticket = addTicket(h.fake, {
            status, opened_at: opened, last_inbound_at: opened, last_outbound_at: reply, awaiting_reply_since: null,
            first_response_at: reply, first_response_source: 'panel',
        });
        addMessage(h.fake, { created_at: opened });
        const replyRow = addMessage(h.fake, { direction: 'outbound', source: 'webapp', status: 'sent', created_at: reply });
        ticket.first_response_message_id = replyRow.id;
        const newer = addMessage(h.fake, { created_at: minutesAgo(1) });
        return { ticket, newer };
    }

    it('V03 a new customer message moves waiting_customer to open', async () => {
        const h = await setup();
        const { ticket } = waitingWithNewInbound(h, 'waiting_customer');
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('updated');
        expect(ticket.status).toBe('open');
        expect(eventsOf(h.fake, 'status_changed')[0].data.cause).toBe('inbound');
    });

    it('V04 never overwrites on_hold', async () => {
        const h = await setup();
        const { ticket, newer } = waitingWithNewInbound(h, 'on_hold');
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket).toMatchObject({ status: 'on_hold', awaiting_reply_since: newer.created_at, last_inbound_at: newer.created_at });
        expect(eventsOf(h.fake, 'status_changed')).toHaveLength(0);
    });

    it('V05 skips a resolved ticket', async () => {
        const h = await setup();
        const ticket = addResolvedTicket(h.fake, { resolvedMinutesAgo: 30 });
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('skipped');
        expect(h.fake.calls.writeDerived).toBe(0);
    });

    it('V06 writes nothing when nothing differs', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        addMessage(h.fake, { created_at: opened });
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('unchanged');
        expect(h.fake.calls.writeDerived).toBe(0);
    });

    it('V07 reports a race and writes no event', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        addMessage(h.fake, { created_at: opened });
        addMessage(h.fake, { direction: 'outbound', source: 'webapp', status: 'sent', created_at: minutesAgo(6) });
        h.fake.before('writeDerived', () => { ticket.status = 'on_hold'; });
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('raced');
        expect(h.fake.events).toHaveLength(0);
    });

    it('V08 a missing-message ticket keeps its awaiting clock', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket({ origin: 'missing_message' }));
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('unchanged');
        expect(ticket.awaiting_reply_since).toBe(opened);
    });

    it('V09 a reply clears the clock of a missing-message ticket', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket({ origin: 'missing_message' }));
        addMessage(h.fake, { direction: 'outbound', source: 'webapp', status: 'sent', created_at: minutesAgo(6) });
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('updated');
        expect(ticket).toMatchObject({ status: 'waiting_customer', awaiting_reply_since: null });
    });

    it('V10 refuses a ticket with more than three pages of messages', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        for (let index = 0; index < 3001; index += 1) addMessage(h.fake, { created_at: ts(500 - (index % 400)), id: `bulk-${index}` });
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('too_large');
        expect(h.fake.calls.writeDerived).toBe(0);
    });

    it('V10 accepts exactly three full pages', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        for (let index = 0; index < 3000; index += 1) addMessage(h.fake, { created_at: ts(500 - (index % 400)), id: `bulk-${index}` });
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).not.toBe('too_large');
    });

    it('V11 is_ack_only follows the customer messages', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket({ is_ack_only: false }));
        addMessage(h.fake, { body: 'ok', created_at: opened });
        addMessage(h.fake, { body: 'thanks', created_at: minutesAgo(8) });
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket.is_ack_only).toBe(true);
        addMessage(h.fake, { body: 'where is my milk', created_at: minutesAgo(2) });
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket.is_ack_only).toBe(false);
    });

    it('V11 the synthetic missing-message row is never an ack', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket({ origin: 'missing_message', is_ack_only: true }));
        await deriveAndWrite(h.ctx, ticket.id);
        expect(ticket.is_ack_only).toBe(false);
    });

    it('V12 skips a ticket without a conversation and reads no message', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket({ conversation_id: null }));
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('skipped');
        expect(h.fake.calls.listConversationMessages).toBe(0);
    });

    it('V13 a missing column while reading messages is not_installed and writes nothing', async () => {
        const h = await setup();
        const ticket = addTicket(h.fake, inboundTicket());
        h.fake.failNext('listConversationMessages', '42703');
        expect((await deriveAndWrite(h.ctx, ticket.id)).outcome).toBe('not_installed');
        expect(h.fake.writes).toEqual([]);
    });

    it('returns an unknown ticket as skipped', async () => {
        const h = await setup();
        expect((await deriveAndWrite(h.ctx, 'nope')).outcome).toBe('skipped');
    });
});

describe('sanity of the fixtures', () => {
    it('NOW is 12:00 IST and a ts() is a microsecond timestamptz string', () => {
        expect(NOW.toISOString()).toBe('2026-10-12T06:30:00.000Z');
        expect(ts(60)).toBe('2026-10-12T06:29:00.123456+00:00');
        expect(makeTicket().status).toBe('open');
    });
});

describe('internal contacts (P1e)', () => {
    const STAFF = buildInternalMatcher({ staffPhones: ['9900000011'], flags: [] });

    it('EI1 an internal phone with no ticket: skipped, unclaimed, no event', async () => {
        const h = await setup({}, {}, STAFF);
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result).toEqual({ outcome: 'internal_skipped', ticket_id: null, event_errors: 0 });
        expect(h.fake.tickets).toHaveLength(0);
        expect(message.ticket_id).toBeNull();
        expect(h.fake.events).toHaveLength(0);
    });

    it('EI2 an open manual ticket on an internal phone still takes the message', async () => {
        const h = await setup({}, {}, STAFF);
        const ticket = addTicket(h.fake, { origin: 'manual', last_inbound_at: null });
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('appended');
        expect(message.ticket_id).toBe(ticket.id);
    });

    it('EI3 an open inbound ticket on an internal phone does not take the message', async () => {
        const h = await setup({}, {}, STAFF);
        addTicket(h.fake, { last_inbound_at: minutesAgo(20) });
        const { message, result } = await attach(h, { created_at: minutesAgo(5) });
        expect(result.outcome).toBe('internal_skipped');
        expect(message.ticket_id).toBeNull();
    });

    it('EI4 a resolved inbound ticket inside the window is not reopened; a manual one is', async () => {
        const inbound = await setup({}, {}, STAFF);
        addResolvedTicket(inbound.fake, { resolvedMinutesAgo: 30 });
        expect((await attach(inbound, { created_at: minutesAgo(5) })).result.outcome).toBe('internal_skipped');
        const manual = await setup({}, {}, STAFF);
        addResolvedTicket(manual.fake, { resolvedMinutesAgo: 30 }, { origin: 'manual' });
        expect((await attach(manual, { created_at: minutesAgo(5) })).result.outcome).toBe('reopened');
    });

    it('EI5 a customer flag on a staff phone, and any other phone, behave as before', async () => {
        const override = buildInternalMatcher({ staffPhones: ['9900000011'], flags: [{ phone: '919900000011', kind: 'customer' }] });
        expect((await attach(await setup({}, {}, override), { created_at: minutesAgo(5) })).result.outcome).toBe('created');
        const other = buildInternalMatcher({ staffPhones: ['9811111111'], flags: [] });
        expect((await attach(await setup({}, {}, other), { created_at: minutesAgo(5) })).result.outcome).toBe('created');
    });

    it('EI6 resolveBySystem internal: classifies, resolves, auto_internal then resolved', async () => {
        const h = await setup({}, {}, STAFF);
        const ticket = addTicket(h.fake, { status: 'on_hold', customer_phone: '919900000011', follow_up_at: minutesAgo(-60), hold_reason: 'other' });
        const row = { id: ticket.id, status: ticket.status, customer_phone: ticket.customer_phone }; // as the repo returns it
        const result = await resolveBySystem(h.ctx, row, 'internal', { kind: 'internal' });
        expect(result).toEqual({ outcome: 'resolved', event_errors: 0 });
        expect(ticket).toMatchObject({
            status: 'resolved', resolved_at: NOW.toISOString(), resolution_code: 'no_action', resolved_via: 'system',
            category_slug: 'internal', type: 'other', classified_at: NOW.toISOString(), classified_by: null,
            classification_source: null, follow_up_at: null, hold_reason: null, first_resolved_code: 'no_action',
        });
        expect(h.fake.events.map((e) => [e.type, e.from_status, e.to_status, e.actor_id, e.data])).toEqual([
            ['auto_internal', null, null, 'system', { source: 'staff_list' }],
            ['resolved', 'on_hold', 'resolved', 'system', {
                resolution_code: 'no_action', resolved_via: 'system', note: null, lost_reason: null, action_id: null, duplicate_of_ticket_no: null,
            }],
        ]);
    });

    it('EI7 resolveBySystem internal skips a manual ticket and a phone that is not internal', async () => {
        const h = await setup({}, {}, STAFF);
        const manual = addTicket(h.fake, { origin: 'manual', customer_phone: '919900000011' });
        expect((await resolveBySystem(h.ctx, manual, 'internal', { kind: 'internal' })).outcome).toBe('skipped');
        const customer = addTicket(h.fake, { conversation_id: 'C2', customer_phone: '919811111111' });
        expect((await resolveBySystem(h.ctx, customer, 'internal', { kind: 'internal' })).outcome).toBe('skipped');
        expect(manual.status).toBe('open');
        expect(customer.status).toBe('open');
        expect(h.fake.calls.resolveSystem).toBe(1);
    });
});
