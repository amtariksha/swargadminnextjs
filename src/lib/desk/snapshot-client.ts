'use client';

// The customer snapshot in the browser: one backend call per ticket open and one after each action
// (rule R-B2). The browser calls the backend directly through wfetch (Bearer from localStorage['admin']);
// never the axios helpers of lib/api.ts, whose interceptor navigates to the sign-in page.

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getApiUrl } from '@/config/tenant';
import { wfetch } from '@/lib/whatsapp/wfetch';
import { describeSnapshotFailure, parseSnapshotEnvelope, snapshotParseIssue } from './snapshot-schema';
import { SNAPSHOT_STALE_MS, snapshotMatchPatch, snapshotPhone, snapshotRetry } from './snapshot-format';
import { useTicketPatch } from './ticket-mutations';
import type { CustomerSnapshot, TicketView } from './types';

export interface SnapshotRequest { phone: string; user_id?: number; actions_since?: string }

export class SnapshotError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'SnapshotError';
        this.status = status;
        this.code = code;
    }
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        // An HTML error page or an empty body: the status alone describes the failure.
        return null;
    }
}

/** POST {phone, user_id?} to the backend. Throws SnapshotError; never navigates. */
export async function fetchCustomerSnapshot(req: SnapshotRequest): Promise<CustomerSnapshot> {
    let response: Response;
    try {
        response = await wfetch(`${getApiUrl()}/support/customer-snapshot`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(req),
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        throw new SnapshotError(0, 'network', 'Network error');
    }
    const body = await readJson(response);
    if (response.ok) {
        const snapshot = parseSnapshotEnvelope(body);
        if (snapshot !== null) return snapshot;
        throw new SnapshotError(response.status, 'bad_response', `Unexpected snapshot (field: ${snapshotParseIssue(body) ?? '?'})`);
    }
    const failure = describeSnapshotFailure(response.status, body);
    throw new SnapshotError(response.status, failure.code, failure.message);
}

export const snapshotKeys = {
    all: () => ['desk', 'snapshot'] as const,
    ticket: (ticketId: string, userId: number | null) => ['desk', 'snapshot', ticketId, userId ?? 0] as const,
};

/** One call per ticket open (and per picked candidate); no polling, no refetch on focus. */
export function useCustomerSnapshot(
    ticket: Pick<TicketView, 'id' | 'customer_phone' | 'opened_at'>,
    userId: number | null,
): UseQueryResult<CustomerSnapshot, Error> {
    const phone = snapshotPhone(ticket.customer_phone);
    const base: SnapshotRequest = { phone: phone ?? '', actions_since: ticket.opened_at };
    return useQuery<CustomerSnapshot, Error>({
        queryKey: snapshotKeys.ticket(ticket.id, userId),
        queryFn: () => fetchCustomerSnapshot(userId === null ? base : { ...base, user_id: userId }),
        enabled: phone !== null,
        staleTime: SNAPSHOT_STALE_MS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: snapshotRetry,
    });
}

/**
 * Writes `op=customer_snapshot` once per loaded snapshot when the exact or alternate match differs
 * from the ticket (snapshotMatchPatch). Returns the error of that write, for a muted note.
 */
export function useSnapshotMatchWrite(ticket: TicketView, snapshot: CustomerSnapshot | undefined): Error | null {
    const patch = useTicketPatch(ticket.id);
    const { mutate } = patch;
    const attempted = useRef<string | null>(null);
    const body = useMemo(
        () => (snapshot === undefined ? null : snapshotMatchPatch(ticket, snapshot)),
        [ticket, snapshot],
    );
    const key = body === null || snapshot === undefined
        ? null
        : `${ticket.id}|${snapshot.generated_at}|${body.backend_user_id ?? 0}|${body.customer_match}`;
    useEffect(() => {
        if (body === null || key === null || attempted.current === key) return;
        attempted.current = key;
        mutate(body);
    }, [body, key, mutate]);
    return patch.error;
}
