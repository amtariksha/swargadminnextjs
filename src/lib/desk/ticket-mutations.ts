'use client';

import {
    useMutation, useQueryClient, type QueryClient, type UseMutationResult,
} from '@tanstack/react-query';
import { LIST_MAX_LIMIT } from './constants';
import { deskFetch } from './client';
import type { TicketPatchBody, TicketResolveBody } from './contracts';
import {
    deskKeys, ticketListPath, toResolveOutcome, unwrapDesk, type ResolveOutcome, type TicketListParams,
} from './desk-query';
import type {
    TicketConflictData, TicketDetail, TicketListItem, TicketListResponse, TicketMutationResponse,
    TicketResolveResponse, TicketView,
} from './types';

const JSON_HEADERS = { 'content-type': 'application/json' };

/** Puts the server's ticket into the cached detail, then refetches everything a write can change. */
function refreshAfterWrite(queryClient: QueryClient, id: string, ticket: TicketView): void {
    queryClient.setQueryData<TicketDetail>(deskKeys.ticket(id), (old) => (old ? { ...old, ticket } : old));
    void queryClient.invalidateQueries({ queryKey: deskKeys.ticket(id) });
    void queryClient.invalidateQueries({ queryKey: deskKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: deskKeys.counts() });
}

export function useTicketPatch(id: string): UseMutationResult<TicketMutationResponse, Error, TicketPatchBody> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: TicketPatchBody) => unwrapDesk(
            await deskFetch<TicketMutationResponse>(`/api/desk/tickets/${id}`, {
                method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body),
            }),
        ),
        meta: { suppressToast: true },
        onSuccess: (data) => refreshAfterWrite(queryClient, id, data.ticket),
    });
}

export function useTicketResolve(id: string): UseMutationResult<ResolveOutcome, Error, TicketResolveBody> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: TicketResolveBody) => toResolveOutcome(
            await deskFetch<TicketResolveResponse, TicketConflictData>(`/api/desk/tickets/${id}/resolve`, {
                method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body),
            }),
        ),
        meta: { suppressToast: true },
        onSuccess: (outcome) => refreshAfterWrite(queryClient, id, outcome.ticket),
    });
}

/** Reads page after page, one request at a time, until the end or `maxRows`. */
export async function fetchAllTickets(
    filters: Omit<TicketListParams, 'view' | 'limit' | 'cursor' | 'with_counts'>,
    maxRows: number,
): Promise<{ rows: TicketListItem[]; capped: boolean }> {
    const rows: TicketListItem[] = [];
    let cursor: string | undefined;
    for (;;) {
        const page = unwrapDesk(await deskFetch<TicketListResponse>(
            ticketListPath({ ...filters, view: 'list', limit: LIST_MAX_LIMIT, cursor }),
        ));
        rows.push(...page.items);
        if (page.next_cursor === null) return { rows, capped: false };
        if (rows.length >= maxRows) return { rows: rows.slice(0, maxRows), capped: true };
        cursor = page.next_cursor;
    }
}
