// Pure helpers for the Desk browser code: envelope unwrapping, retry and poll rules, list URLs and
// query keys. No React, no window. The hooks that use them live in ticket-hooks.ts.

import type { DeskEnvelope, DeskErrorCode, TicketListView } from './contracts';
import { deskErrorText } from './ticket-labels';
import type { Queue, TicketStatus, TicketType } from './constants';
import type { TicketConflictData, TicketResolveResponse, TicketView } from './types';

export const QUEUE_POLL_MS = 10_000;
export const COUNTS_POLL_MS = 30_000;
export const HEALTH_POLL_MS = 60_000;
export const WRAP_UP_PAGE_LIMIT = 50;
export const EXPORT_MAX_ROWS = 5_000;

const MIN_SEARCH_CHARS = 2;
const HALTING_CODES: readonly DeskErrorCode[] = ['unauthorized', 'forbidden', 'ui_disabled', 'not_installed'];
const RETRYABLE_CODES: readonly DeskErrorCode[] = ['internal_error', 'authz_unavailable'];

export class DeskClientError extends Error {
    readonly code: DeskErrorCode;

    constructor(code: DeskErrorCode, message: string) {
        super(message);
        this.name = 'DeskClientError';
        this.code = code;
    }
}

/** Returns data, or throws DeskClientError(code, message). */
export function unwrapDesk<T>(envelope: DeskEnvelope<T>): T {
    if (envelope.ok) return envelope.data;
    throw new DeskClientError(envelope.error.code, envelope.error.message);
}

export type ResolveOutcome =
    | { kind: 'resolved'; ticket: TicketView; already_resolved: boolean }
    | { kind: 'conflict'; ticket: TicketView };

/** The 409 body carries `data` although DeskEnvelope types it as absent, so it is read as unknown. */
function conflictTicket(data: unknown): TicketView | null {
    if (typeof data !== 'object' || data === null) return null;
    const ticket = (data as { ticket?: unknown }).ticket;
    if (typeof ticket !== 'object' || ticket === null) return null;
    return typeof (ticket as { id?: unknown }).id === 'string' ? (ticket as TicketView) : null;
}

/** 409 new_customer_message with data.ticket is a 'conflict'. Any other failure throws DeskClientError. */
export function toResolveOutcome(
    envelope: DeskEnvelope<TicketResolveResponse, TicketConflictData>,
): ResolveOutcome {
    if (envelope.ok) {
        return { kind: 'resolved', ticket: envelope.data.ticket, already_resolved: envelope.data.already_resolved };
    }
    if (envelope.error.code === 'new_customer_message') {
        const ticket = conflictTicket(envelope.data);
        if (ticket !== null) return { kind: 'conflict', ticket };
    }
    throw new DeskClientError(envelope.error.code, envelope.error.message);
}

/** unauthorized | forbidden | ui_disabled | not_installed: polling must stop. */
export function isHaltingDeskError(error: unknown): boolean {
    return error instanceof DeskClientError && HALTING_CODES.includes(error.code);
}

/** One retry for a non-Desk error, internal_error and authz_unavailable; none otherwise. */
export function deskRetry(failureCount: number, error: unknown): boolean {
    if (failureCount >= 1) return false;
    if (!(error instanceof DeskClientError)) return true;
    return RETRYABLE_CODES.includes(error.code);
}

export function deskPollInterval(ms: number, error: unknown): number | false {
    return isHaltingDeskError(error) ? false : ms;
}

export interface TicketListParams {
    view: TicketListView;
    limit: number;
    cursor?: string;
    queue?: Queue;
    status?: TicketStatus;
    type?: TicketType;
    category_slug?: string;
    assigned_to?: string;
    ticket_no?: number;
    q?: string;
    from?: string;
    to?: string;
    with_counts?: boolean;
}

/** Keys in the order of TicketListParams; undefined values, with_counts: false and a short q are left out. */
export function ticketListPath(params: TicketListParams): string {
    const search = new URLSearchParams();
    search.set('view', params.view);
    search.set('limit', String(params.limit));
    if (params.cursor !== undefined) search.set('cursor', params.cursor);
    if (params.queue !== undefined) search.set('queue', params.queue);
    if (params.status !== undefined) search.set('status', params.status);
    if (params.type !== undefined) search.set('type', params.type);
    if (params.category_slug !== undefined) search.set('category_slug', params.category_slug);
    if (params.assigned_to !== undefined) search.set('assigned_to', params.assigned_to);
    if (params.ticket_no !== undefined) search.set('ticket_no', String(params.ticket_no));
    const q = params.q?.trim();
    if (q !== undefined && q.length >= MIN_SEARCH_CHARS) search.set('q', q);
    if (params.from !== undefined) search.set('from', params.from);
    if (params.to !== undefined) search.set('to', params.to);
    if (params.with_counts === true) search.set('with_counts', '1');
    return `/api/desk/tickets?${search.toString()}`;
}

export const deskKeys = {
    health: () => ['desk', 'health'] as const,
    categories: () => ['desk', 'categories'] as const,
    counts: () => ['desk', 'counts'] as const,
    lists: () => ['desk', 'tickets'] as const,
    list: (params: TicketListParams) => ['desk', 'tickets', params] as const,
    ticketNo: (ticketNo: number) => ['desk', 'ticket-no', ticketNo] as const,
    ticket: (id: string) => ['desk', 'ticket', id] as const,
};

/** Refusals a dialog shows under its fields; every other error is a toast. */
const INLINE_CODES: readonly DeskErrorCode[] = [
    'category_required', 'resolution_code_required', 'note_required', 'lost_reason_required',
    'duplicate_target_required', 'delivery_link_required',
];

export function describeDeskError(error: Error): { code: DeskErrorCode; text: string; inline: boolean } {
    const code = error instanceof DeskClientError ? error.code : 'internal_error';
    return { code, text: deskErrorText(code, error.message), inline: INLINE_CODES.includes(code) };
}
