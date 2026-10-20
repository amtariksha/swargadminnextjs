/**
 * Pure thread helpers of the Desk chat: path building, message mapping, merging by id, gap
 * detection, seen / read decisions and the composer's Conversation (spec vectors 8.1 - 8.9).
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import type { Message } from '@/lib/whatsapp/types';
import { MESSAGES_MAX_LIMIT } from '@/lib/desk/constants';
import {
    MESSAGES_FIRST_LIMIT, MESSAGES_OLDER_LIMIT, MESSAGES_POLL_LIMIT, MESSAGES_POLL_MS,
    appendSent, compareThreadMessages, initialThread, lastIncomingAt, markReadStep, mergeById, mergeOlder,
    mergePoll, messagesPath, newestInbound, shouldMarkSeen, toComposerConversation, toInboxMessage,
    type ThreadState,
} from '@/lib/desk/thread-format';
import type { ConversationBrief, DeskMessage } from '@/lib/desk/types';

const T1 = '2026-10-12T02:30:00.123456+00:00';
const T1b = '2026-10-12T02:30:00.123457+00:00';   // same millisecond as T1, one microsecond later
const T2 = '2026-10-12T02:31:00+00:00';
const T3 = '2026-10-12T02:32:00.5+00:00';
const ID = '11111111-2222-4333-8444-555555555555';

const inb = (id: string, timestamp: string, over: Partial<Message> = {}): Message => ({
    id, conversationId: 'c1', direction: 'inbound', contentType: 'text', body: id, status: 'delivered',
    isInternalNote: false, timestamp, ...over,
});
const out = (id: string, timestamp: string, over: Partial<Message> = {}): Message => ({
    id, conversationId: 'c1', direction: 'outbound', contentType: 'text', body: id, status: 'sent',
    isInternalNote: false, timestamp, ...over,
});
const desk = (id: string, timestamp: string, direction: 'inbound' | 'outbound', over: Partial<DeskMessage> = {}): DeskMessage => ({
    id, conversationId: 'c1', direction, contentType: 'text', body: id, status: direction === 'inbound' ? 'delivered' : 'sent',
    isInternalNote: false, timestamp, ticketId: 't1', templateName: null, sentByUserId: null, sentByName: null, ...over,
});
const ids = (messages: readonly Message[]): string[] => messages.map((message) => message.id);

describe('constants', () => {
    it('pin the polling rhythm and the first page to the route cap', () => {
        expect(MESSAGES_POLL_MS).toBe(5_000);
        expect(MESSAGES_POLL_LIMIT).toBe(30);
        expect(MESSAGES_FIRST_LIMIT).toBe(MESSAGES_MAX_LIMIT);
        expect(MESSAGES_OLDER_LIMIT).toBe(MESSAGES_MAX_LIMIT);
    });
});

describe('messagesPath (8.1)', () => {
    it('puts limit first and omits an absent cursor', () => {
        expect(messagesPath(ID, 200)).toBe(`/api/desk/tickets/${ID}/messages?limit=200`);
        expect(messagesPath(ID, 30, null)).toBe(`/api/desk/tickets/${ID}/messages?limit=30`);
        expect(messagesPath(ID, 30, '')).toBe(`/api/desk/tickets/${ID}/messages?limit=30`);
    });

    it('encodes the cursor byte for byte (a raw + would arrive as a space)', () => {
        expect(messagesPath(ID, 200, T1)).toBe(
            `/api/desk/tickets/${ID}/messages?limit=200&before=2026-10-12T02%3A30%3A00.123456%2B00%3A00`,
        );
    });
});

describe('toInboxMessage (8.2)', () => {
    it('keeps the Message fields and drops the Desk fields', () => {
        const input = desk('m1', T1, 'outbound', {
            contentType: 'voice_call', body: 'Voice call initiated', status: 'sent', source: 'webapp',
            ticketId: 't1', templateName: null, sentByUserId: '42', sentByName: 'Asha',
        });
        const result = toInboxMessage(input);
        expect(result).toEqual({
            id: 'm1', conversationId: 'c1', direction: 'outbound', contentType: 'voice_call', body: 'Voice call initiated',
            status: 'sent', isInternalNote: false, timestamp: T1, source: 'webapp',
        });
        expect('ticketId' in result).toBe(false);
        expect('sentByName' in result).toBe(false);
        expect('templateName' in result).toBe(false);
    });

    it('keeps media fields and a received status as they are', () => {
        const result = toInboxMessage(desk('m2', T1, 'inbound', {
            status: 'received', contentType: 'image', mediaUrl: 'https://x/a.jpg', fileName: 'a.jpg',
        }));
        expect(result).toMatchObject({ status: 'received', contentType: 'image', mediaUrl: 'https://x/a.jpg', fileName: 'a.jpg' });
    });

    it('keeps the failure reason of a failed send', () => {
        const result = toInboxMessage(desk('m3', T1, 'outbound', { status: 'failed', failureReason: 'MSG91 error: x' }));
        expect(result.failureReason).toBe('MSG91 error: x');
    });

    it('does not mutate its input', () => {
        const input = desk('m4', T1, 'outbound', { source: 'webapp' });
        const copy = structuredClone(input);
        toInboxMessage(input);
        expect(input).toEqual(copy);
    });
});

describe('compareThreadMessages / mergeById (8.3)', () => {
    it.each([
        ['keeps order when nothing is incoming', [inb('a', T1), out('b', T2)], [], ['a', 'b']],
        ['sorts incoming rows', [], [out('b', T2), inb('a', T1)], ['a', 'b']],
        ['orders by microsecond inside one millisecond', [inb('a', T1)], [inb('c', T1b)], ['a', 'c']],
        ['breaks equal timestamps by id', [inb('x', T1), inb('w', T1)], [], ['w', 'x']],
        ['falls back to the string for an unparseable timestamp', [inb('a', T3)], [inb('z', 'not a date')], ['a', 'z']],
    ] as const)('%s', (_label, current, incoming, expected) => {
        expect(ids(mergeById(current, incoming))).toEqual(expected);
    });

    it('replaces a held row with the incoming version of the same id', () => {
        const merged = mergeById([out('a', T1, { status: 'sent' })], [out('a', T1, { status: 'read' })]);
        expect(merged).toHaveLength(1);
        expect(merged[0].status).toBe('read');
    });

    it('does not mutate either input and does not throw on garbage', () => {
        const current = [inb('a', T3)];
        const incoming = [inb('z', 'not a date')];
        const copies = [structuredClone(current), structuredClone(incoming)];
        expect(() => mergeById(current, incoming)).not.toThrow();
        expect([current, incoming]).toEqual(copies);
    });

    it('compares equal timestamps by id', () => {
        expect(compareThreadMessages({ id: 'a', timestamp: T1 }, { id: 'b', timestamp: T1 })).toBeLessThan(0);
        expect(compareThreadMessages({ id: 'b', timestamp: T1 }, { id: 'a', timestamp: T1 })).toBeGreaterThan(0);
        expect(compareThreadMessages({ id: 'a', timestamp: T1 }, { id: 'a', timestamp: T1 })).toBe(0);
    });
});

describe('initialThread / mergePoll (8.4)', () => {
    const S: ThreadState = { messages: [inb('a', T1), out('b', T2)], olderCursor: T1 };
    const new30 = Array.from({ length: 30 }, (_, index) =>
        desk(`n${String(index).padStart(2, '0')}`, `2026-10-12T03:00:${String(index).padStart(2, '0')}+00:00`, 'inbound'));

    it('builds the first state from the first page', () => {
        expect(initialThread({ items: [desk('a', T1, 'inbound'), desk('b', T2, 'outbound')], older_cursor: T1 })).toEqual(S);
        expect(initialThread({ items: [], older_cursor: null })).toEqual({ messages: [], olderCursor: null });
    });

    it('merges new rows and fresher statuses and leaves the cursor alone', () => {
        const merged = mergePoll(S, {
            items: [desk('b', T2, 'outbound', { status: 'read' }), desk('c', T3, 'inbound')],
            older_cursor: T2,
        }, 30);
        expect(merged).not.toBeNull();
        expect(ids(merged!.messages)).toEqual(['a', 'b', 'c']);
        expect(merged!.messages[1].status).toBe('read');
        expect(merged!.olderCursor).toBe(T1);
    });

    it('returns an equal state for an empty poll', () => {
        expect(mergePoll(S, { items: [], older_cursor: null }, 30)).toEqual(S);
    });

    it('signals a gap when 30 brand-new rows all lie after the cache', () => {
        expect(mergePoll(S, { items: new30, older_cursor: null }, 30)).toBeNull();
    });

    it('overlaps when the poll still contains a held id', () => {
        const merged = mergePoll(S, { items: [desk('b', T2, 'outbound'), ...new30.slice(0, 29)], older_cursor: null }, 30);
        expect(merged).not.toBeNull();
        expect(merged!.messages).toHaveLength(31);
    });

    it('is not a gap when fewer rows than the limit came back', () => {
        expect(mergePoll(S, { items: new30, older_cursor: null }, 200)).not.toBeNull();
    });

    it('is not a gap against an empty cache', () => {
        const merged = mergePoll({ messages: [], olderCursor: null }, { items: new30, older_cursor: null }, 30);
        expect(merged).not.toBeNull();
        expect(merged!.messages).toHaveLength(30);
    });

    it('is not a gap when the oldest incoming row is not newer than the newest held row', () => {
        const items = [desk('m00', T2, 'inbound'), ...new30.slice(1)];
        expect(mergePoll(S, { items, older_cursor: null }, 30)).not.toBeNull();
    });
});

describe('mergeOlder (8.5)', () => {
    const S2: ThreadState = { messages: [inb('c', T3, { status: 'read' })], olderCursor: T3 };

    it('adds older rows, keeps the held version and takes the page cursor', () => {
        const merged = mergeOlder(S2, {
            items: [desk('a', T1, 'inbound'), desk('b', T2, 'outbound'), desk('c', T3, 'inbound', { status: 'delivered' })],
            older_cursor: T1,
        });
        expect(ids(merged.messages)).toEqual(['a', 'b', 'c']);
        expect(merged.messages[2].status).toBe('read');
        expect(merged.olderCursor).toBe(T1);
    });

    it('ends paging when a page adds nothing', () => {
        const merged = mergeOlder(S2, { items: [desk('c', T3, 'inbound')], older_cursor: T3 });
        expect(ids(merged.messages)).toEqual(['c']);
        expect(merged.olderCursor).toBeNull();
    });

    it('takes a null cursor from the last page', () => {
        const merged = mergeOlder(S2, { items: [desk('b', T2, 'outbound')], older_cursor: null });
        expect(ids(merged.messages)).toEqual(['b', 'c']);
        expect(merged.olderCursor).toBeNull();
    });
});

describe('appendSent (8.6)', () => {
    const S: ThreadState = { messages: [inb('a', T1), out('b', T2)], olderCursor: T1 };
    const answer = { ...out('n', T3), providerResponse: { x: 1 } } as Message;

    it('appends only the Message fields', () => {
        const next = appendSent(S, answer);
        expect(ids(next.messages)).toEqual(['a', 'b', 'n']);
        expect('providerResponse' in next.messages[2]).toBe(false);
        expect(next.olderCursor).toBe(T1);
    });

    it('is idempotent', () => {
        expect(ids(appendSent(appendSent(S, answer), answer).messages)).toEqual(['a', 'b', 'n']);
    });
});

describe('newestInbound / lastIncomingAt (8.7)', () => {
    it.each([
        [[inb('a', T1), out('b', T2)], null, 'a', T1],
        [[inb('a', T1), out('b', T2)], T2, 'a', T2],
        [[inb('a', T1), inb('c', T3, { isInternalNote: true })], null, 'a', T1],
        [[], null, null, null],
        [[], T1, null, T1],
        [[out('b', T2)], null, null, null],
        [[inb('a', T1)], 'garbage', 'a', T1],
        [[inb('a', T1)], T1, 'a', T1],
    ] as const)('%#', (messages, ticketLastInboundAt, newestId, window) => {
        expect(newestInbound(messages)?.id ?? null).toBe(newestId);
        expect(lastIncomingAt(messages, ticketLastInboundAt)).toBe(window);
    });
});

describe('shouldMarkSeen (8.8)', () => {
    it.each([
        ['the newest inbound is rendered and unseen', [inb('a', T1)], T1, null, true],
        ['nothing newer than the token', [inb('a', T1)], T1, T1, false],
        ['the thread lacks the ticket\'s newer message', [inb('a', T1)], T2, T1, false],
        ['a newer message is on screen', [inb('a', T1), inb('c', T3)], T2, T1, true],
        ['same millisecond, other string', [inb('a', T1)], T1b, null, false],
        ['no inbound rendered', [out('b', T2)], T1, null, false],
        ['only an internal note is newer', [inb('a', T1), inb('c', T3, { isInternalNote: true })], T3, T1, false],
        ['empty thread, no token', [], null, null, false],
        ['no ticket inbound time', [inb('a', T1)], null, null, false],
    ] as const)('%s', (_label, messages, lastInboundAt, seen, expected) => {
        expect(shouldMarkSeen(messages, lastInboundAt, seen)).toBe(expected);
    });
});

describe('markReadStep / toComposerConversation (8.9)', () => {
    it.each([
        [undefined, [inb('a', T1)], 2, { patch: true, markedId: 'a' }],
        [undefined, [inb('a', T1)], 0, { patch: false, markedId: 'a' }],
        ['a', [inb('a', T1)], 3, { patch: false, markedId: 'a' }],
        ['a', [inb('a', T1), inb('c', T3)], 0, { patch: true, markedId: 'c' }],
        ['a', [inb('a', T1), out('b', T2)], 0, { patch: false, markedId: 'a' }],
        [undefined, [out('b', T2)], 1, { patch: false, markedId: null }],
        [null, [out('b', T2), inb('c', T3)], 0, { patch: true, markedId: 'c' }],
    ] as const)('%#', (previous, messages, unreadCount, expected) => {
        expect(markReadStep(previous, messages, unreadCount)).toEqual(expected);
    });

    const brief: ConversationBrief = {
        id: 'c1', status: 'open', unread_count: 2, integrated_number: '917090166111',
        contact: { id: 'k1', name: null, phone: '919876543210' },
    };

    it('builds the composer conversation', () => {
        expect(toComposerConversation(brief, T1)).toEqual({
            id: 'c1', contactId: 'k1', contact: { id: 'k1', name: '', phone: '919876543210', tags: [], createdAt: '' },
            integratedNumber: '917090166111', status: 'open', lastMessageTime: '', lastIncomingTimestamp: T1,
            unreadCount: 2, messages: [],
        });
    });

    it('uses an empty string for an unknown last incoming time (session expired)', () => {
        expect(toComposerConversation(brief, null).lastIncomingTimestamp).toBe('');
    });
});

describe('purity', () => {
    it('keeps thread-format.ts free of clocks, I/O and any', () => {
        const source = readFileSync(new URL('../../src/lib/desk/thread-format.ts', import.meta.url), 'utf8');
        expect(source).not.toMatch(/Date\.now\(|new Date\(\)|supabase|window\.|process\.env|toLocale|: any\b|as any\b|export default/);
    });
});
