// The shared client for POST /api/desk/tickets/:id/actions (route 6, unit P4a). Browser-safe:
// type-only imports from the rest of lib/desk, and the network goes through deskFetch.

import { deskFetch } from './client';
import type { DeskEnvelope, TicketActionBody } from './contracts';
import { DeskClientError } from './desk-query';
import type { TicketAction, TicketActionResponse, TicketConflictData, TicketView } from './types';

export type ActionPostOutcome =
    | { kind: 'done'; response: TicketActionResponse }
    | { kind: 'conflict'; ticket: TicketView; action: TicketAction | null };

function hex(bytes: Uint8Array, from: number, to: number): string {
    return Array.from(bytes.slice(from, to), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** RFC 4122 version 4 text from 16 random bytes (lower-case, as /^desk-[0-9a-f-]{36}$/ needs). */
export function uuidFromBytes(input: Uint8Array): string {
    const bytes = Uint8Array.from(input.slice(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return `${hex(bytes, 0, 4)}-${hex(bytes, 4, 6)}-${hex(bytes, 6, 8)}-${hex(bytes, 8, 10)}-${hex(bytes, 10, 16)}`;
}

/** A new client_action_id. Create it once when a drawer opens and reuse it for every retry of that action. */
export function newClientActionId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
}

/** The 409 body carries `data` although DeskEnvelope types it as absent, so it is read as unknown. */
function conflictOf(data: unknown): { ticket: TicketView; action: TicketAction | null } | null {
    if (typeof data !== 'object' || data === null) return null;
    const { ticket, action } = data as { ticket?: unknown; action?: unknown };
    if (typeof ticket !== 'object' || ticket === null || typeof (ticket as { id?: unknown }).id !== 'string') return null;
    const isAction = typeof action === 'object' && action !== null && typeof (action as { id?: unknown }).id === 'number';
    return { ticket: ticket as TicketView, action: isAction ? (action as TicketAction) : null };
}

/** 200 → done; 409 new_customer_message with data.ticket → conflict; anything else throws DeskClientError. */
export function toActionOutcome(envelope: DeskEnvelope<TicketActionResponse, TicketConflictData>): ActionPostOutcome {
    if (envelope.ok) return { kind: 'done', response: envelope.data };
    if (envelope.error.code === 'new_customer_message') {
        const conflict = conflictOf(envelope.data);
        if (conflict !== null) return { kind: 'conflict', ...conflict };
    }
    throw new DeskClientError(envelope.error.code, envelope.error.message);
}

export async function postTicketAction(ticketId: string, body: TicketActionBody): Promise<ActionPostOutcome> {
    return toActionOutcome(await deskFetch<TicketActionResponse, TicketConflictData>(
        `/api/desk/tickets/${ticketId}/actions`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    ));
}
