// Pure helpers behind the Desk chat thread: map the messages route into the inbox Message shape,
// merge polled and older pages by id, and decide when the thread counts as read. Timestamps are
// opaque strings (microseconds included): compare with Date.parse or string equality, never
// re-serialise them, and never use a message timestamp as the seen-token (that is the ticket's
// last_inbound_at).

import type { Conversation, Message, MessageSource } from '@/lib/whatsapp/types';
import { isNewerInbound } from './ticket-format';
import type { ConversationBrief, DeskMessage, TicketMessagesResponse } from './types';

export const MESSAGES_POLL_MS = 5_000;
/** Equals MESSAGES_MAX_LIMIT (the route's cap); pinned by a test. */
export const MESSAGES_FIRST_LIMIT = 200;
export const MESSAGES_POLL_LIMIT = 30;
export const MESSAGES_OLDER_LIMIT = 200;

export interface ThreadState {
    /** Oldest first. */
    messages: Message[];
    /** The `before` for the next older page; null = nothing older. */
    olderCursor: string | null;
}

export function messagesPath(ticketId: string, limit: number, before?: string | null): string {
    const params = new URLSearchParams({ limit: String(limit) });
    if (typeof before === 'string' && before !== '') params.set('before', before);
    return `/api/desk/tickets/${encodeURIComponent(ticketId)}/messages?${params.toString()}`;
}

/** The raw contentType, status and source strings are kept so a bubble renders like the old inbox. */
export function toInboxMessage(message: DeskMessage): Message {
    return {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        contentType: message.contentType as Message['contentType'],
        body: message.body,
        ...(message.mediaUrl !== undefined ? { mediaUrl: message.mediaUrl } : {}),
        ...(message.fileName !== undefined ? { fileName: message.fileName } : {}),
        status: message.status as Message['status'],
        isInternalNote: message.isInternalNote,
        timestamp: message.timestamp,
        ...(message.source !== undefined ? { source: message.source as MessageSource } : {}),
        ...(message.failureReason !== undefined ? { failureReason: message.failureReason } : {}),
    };
}

export function compareThreadMessages(
    a: Pick<Message, 'id' | 'timestamp'>,
    b: Pick<Message, 'id' | 'timestamp'>,
): number {
    if (a.timestamp === b.timestamp) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const difference = Date.parse(a.timestamp) - Date.parse(b.timestamp);
    if (Number.isFinite(difference) && difference !== 0) return difference;
    // Same millisecond (different microseconds) or an unparseable value: the strings decide.
    return a.timestamp < b.timestamp ? -1 : 1;
}

/** An incoming row replaces a held row with the same id (fresher status). */
export function mergeById(current: readonly Message[], incoming: readonly Message[]): Message[] {
    const byId = new Map<string, Message>();
    for (const message of current) byId.set(message.id, message);
    for (const message of incoming) byId.set(message.id, message);
    return [...byId.values()].sort(compareThreadMessages);
}

export function initialThread(page: TicketMessagesResponse): ThreadState {
    return { messages: mergeById([], page.items.map(toInboxMessage)), olderCursor: page.older_cursor };
}

/** null = the poll cannot overlap the cache (a gap): the caller reloads the first page. */
export function mergePoll(state: ThreadState, page: TicketMessagesResponse, limit: number): ThreadState | null {
    const incoming = mergeById([], page.items.map(toInboxMessage));
    const held = new Set(state.messages.map((message) => message.id));
    const newestHeld = state.messages[state.messages.length - 1];
    const gap = incoming.length >= limit
        && newestHeld !== undefined
        && !incoming.some((message) => held.has(message.id))
        && Date.parse(incoming[0].timestamp) > Date.parse(newestHeld.timestamp);
    if (gap) return null;
    return { messages: mergeById(state.messages, incoming), olderCursor: state.olderCursor };
}

/** A page that adds nothing ends paging, so the client can never loop on one cursor. */
export function mergeOlder(state: ThreadState, page: TicketMessagesResponse): ThreadState {
    const held = new Set(state.messages.map((message) => message.id));
    const added = page.items.map(toInboxMessage).filter((message) => !held.has(message.id));
    return {
        messages: mergeById(state.messages, added),
        olderCursor: added.length === 0 ? null : page.older_cursor,
    };
}

/** The chat/send answer also carries provider fields; only the Message fields are kept. */
export function appendSent(state: ThreadState, message: Message): ThreadState {
    const picked: Message = {
        id: message.id,
        conversationId: message.conversationId,
        direction: message.direction,
        contentType: message.contentType,
        body: message.body,
        ...(message.mediaUrl !== undefined ? { mediaUrl: message.mediaUrl } : {}),
        ...(message.fileName !== undefined ? { fileName: message.fileName } : {}),
        status: message.status,
        isInternalNote: message.isInternalNote,
        timestamp: message.timestamp,
        ...(message.source !== undefined ? { source: message.source } : {}),
        ...(message.failureReason !== undefined ? { failureReason: message.failureReason } : {}),
    };
    return { messages: mergeById(state.messages, [picked]), olderCursor: state.olderCursor };
}

export function newestInbound(messages: readonly Message[]): Message | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.direction === 'inbound' && message.isInternalNote !== true) return message;
    }
    return null;
}

function parseable(value: string | null): string | null {
    return value !== null && Number.isFinite(Date.parse(value)) ? value : null;
}

/** The customer's newest message time; the composer's 24-hour session runs from it. */
export function lastIncomingAt(messages: readonly Message[], ticketLastInboundAt: string | null): string | null {
    const fromThread = parseable(newestInbound(messages)?.timestamp ?? null);
    const fromTicket = parseable(ticketLastInboundAt);
    if (fromThread === null) return fromTicket;
    if (fromTicket === null) return fromThread;
    return Date.parse(fromTicket) > Date.parse(fromThread) ? fromTicket : fromThread;
}

/**
 * True only when the ticket has an unseen customer message AND that message (or a newer one) is
 * in the rendered thread. The same millisecond with a different string is not enough.
 */
export function shouldMarkSeen(messages: readonly Message[], lastInboundAt: string | null, seen: string | null): boolean {
    if (lastInboundAt === null || !isNewerInbound(lastInboundAt, seen)) return false;
    const target = Date.parse(lastInboundAt);
    return messages.some((message) => message.direction === 'inbound'
        && message.isInternalNote !== true
        && (message.timestamp === lastInboundAt || Date.parse(message.timestamp) > target));
}

export interface MarkReadStep {
    patch: boolean;
    markedId: string | null;
}

/** `previous` undefined = first look at the thread; the PATCH fires on a new newest inbound message. */
export function markReadStep(previous: string | null | undefined, messages: readonly Message[], unreadCount: number): MarkReadStep {
    const newest = newestInbound(messages)?.id ?? null;
    if (newest === null) return { patch: false, markedId: previous ?? null };
    if (previous === undefined) return { patch: unreadCount > 0, markedId: newest };
    if (newest !== previous) return { patch: true, markedId: newest };
    return { patch: false, markedId: previous };
}

/** The slice of the inbox Conversation that the composer and its dialogs read. */
export function toComposerConversation(brief: ConversationBrief, lastIncomingTimestamp: string | null): Conversation {
    return {
        id: brief.id,
        contactId: brief.contact.id,
        contact: {
            id: brief.contact.id,
            name: brief.contact.name ?? '',
            phone: brief.contact.phone,
            tags: [],
            createdAt: '',
        },
        integratedNumber: brief.integrated_number,
        status: brief.status,
        lastMessageTime: '',
        lastIncomingTimestamp: lastIncomingTimestamp ?? '',
        unreadCount: brief.unread_count,
        messages: [],
    };
}
