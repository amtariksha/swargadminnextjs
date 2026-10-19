'use client';

// Queries and mutations of the internal-contact flags and the Internal lane (unit P1e). Nothing here
// polls: the lane loads when it is opened and when a flag changes. Keys start with 'desk' so the P3b
// invalidations of ['desk', …] prefixes reach them too.

import {
    useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult,
} from '@tanstack/react-query';
import { LIST_MAX_LIMIT, type ContactFlagKind } from './constants';
import { deskFetch } from './client';
import { deskKeys, deskRetry, unwrapDesk } from './desk-query';
import type {
    ContactFlagResponse, ContactFlagsResponse, InternalConversationsResponse,
} from './types';

const LANE_STALE_MS = 60_000;
const JSON_HEADERS = { 'content-type': 'application/json' };

export const contactFlagKeys = {
    flags: (kind: ContactFlagKind | 'all') => ['desk', 'contact-flags', kind] as const,
    allFlags: () => ['desk', 'contact-flags'] as const,
    lane: () => ['desk', 'internal-conversations'] as const,
};

export function useInternalConversations(enabled: boolean): UseQueryResult<InternalConversationsResponse, unknown> {
    return useQuery({
        queryKey: contactFlagKeys.lane(),
        queryFn: async () => unwrapDesk(await deskFetch<InternalConversationsResponse>(
            `/api/desk/internal-conversations?limit=${LIST_MAX_LIMIT}`,
        )),
        enabled,
        staleTime: LANE_STALE_MS,
        refetchOnWindowFocus: false,
        retry: deskRetry,
    });
}

export function useContactFlags(enabled: boolean): UseQueryResult<ContactFlagsResponse, unknown> {
    return useQuery({
        queryKey: contactFlagKeys.flags('all'),
        queryFn: async () => unwrapDesk(await deskFetch<ContactFlagsResponse>(`/api/desk/contact-flags?limit=${LIST_MAX_LIMIT}`)),
        enabled,
        staleTime: LANE_STALE_MS,
        refetchOnWindowFocus: false,
        retry: deskRetry,
    });
}

export interface ContactFlagInput { phone: string; kind: ContactFlagKind; label?: string }

function useFlagMutation<V>(request: (input: V) => Promise<ContactFlagResponse>): UseMutationResult<ContactFlagResponse, Error, V> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: request,
        meta: { suppressToast: true },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: contactFlagKeys.allFlags() });
            void queryClient.invalidateQueries({ queryKey: contactFlagKeys.lane() });
            // The tick closes the contact's open tickets within a minute; the queue refreshes on its own poll.
            void queryClient.invalidateQueries({ queryKey: deskKeys.counts() });
        },
    });
}

export function useCreateContactFlag(): UseMutationResult<ContactFlagResponse, Error, ContactFlagInput> {
    return useFlagMutation(async (input: ContactFlagInput) => unwrapDesk(await deskFetch<ContactFlagResponse>(
        '/api/desk/contact-flags', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
    )));
}

export function useRemoveContactFlag(): UseMutationResult<ContactFlagResponse, Error, number> {
    return useFlagMutation(async (id: number) => unwrapDesk(await deskFetch<ContactFlagResponse>(
        '/api/desk/contact-flags', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ id, removed: true }) },
    )));
}
