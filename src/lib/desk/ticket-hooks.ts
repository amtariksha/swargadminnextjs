'use client';

// Every Desk query of the queue and ticket screens. All polling lives in this file: three queries
// poll (queue 10 s, counts 30 s, health 60 s) and nothing else does. A halting error (no access,
// switched off, not installed) stops the interval so a denied screen does not hammer the API.

import { useMemo } from 'react';
import {
    useInfiniteQuery, useQuery, useQueryClient,
    type InfiniteData, type QueryClient, type UseInfiniteQueryResult, type UseQueryResult,
} from '@tanstack/react-query';
import { LIST_MAX_LIMIT, type Queue } from './constants';
import { deskFetch } from './client';
import {
    COUNTS_POLL_MS, DeskClientError, HEALTH_POLL_MS, QUEUE_POLL_MS, WRAP_UP_PAGE_LIMIT, deskKeys,
    deskPollInterval, deskRetry, ticketListPath, unwrapDesk, type TicketListParams,
} from './desk-query';
import type {
    Category, CategoriesResponse, DeskHealth, TicketDetail, TicketListItem, TicketListResponse,
} from './types';

export type QueueView = 'mine' | 'unassigned' | 'all' | 'acks';
export type TicketCounts = NonNullable<TicketListResponse['counts']>;
export type TicketListFilters = Omit<TicketListParams, 'view' | 'limit' | 'cursor' | 'with_counts'>;

const CATEGORIES_STALE_MS = 300_000;
const TICKET_LOOKUP_STALE_MS = 60_000;
const TICKET_LIST_STALE_MS = 30_000;
const NO_CATEGORIES: Category[] = [];

async function fetchTicketList(params: TicketListParams): Promise<TicketListResponse> {
    return unwrapDesk(await deskFetch<TicketListResponse>(ticketListPath(params)));
}

export function useDeskHealth(): UseQueryResult<DeskHealth, unknown> {
    return useQuery({
        queryKey: deskKeys.health(),
        queryFn: async () => unwrapDesk(await deskFetch<DeskHealth>('/api/desk/health')),
        staleTime: 0,
        refetchInterval: (query) => deskPollInterval(HEALTH_POLL_MS, query.state.error),
        refetchOnWindowFocus: true,
        placeholderData: (previous) => previous,
        retry: deskRetry,
    });
}

export interface DeskCategories {
    items: Category[];
    bySlug: ReadonlyMap<string, Category>;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => void;
}

export function useDeskCategories(): DeskCategories {
    const query = useQuery({
        queryKey: deskKeys.categories(),
        queryFn: async () => unwrapDesk(await deskFetch<CategoriesResponse>('/api/desk/categories')),
        staleTime: CATEGORIES_STALE_MS,
        refetchOnWindowFocus: false,
        retry: deskRetry,
    });
    const items = query.data?.items ?? NO_CATEGORIES;
    const bySlug = useMemo(() => new Map(items.map((category) => [category.slug, category] as const)), [items]);
    return {
        items,
        bySlug,
        isPending: query.isPending,
        isError: query.isError,
        error: query.error,
        refetch: () => { void query.refetch(); },
    };
}

export function useDeskCounts(): UseQueryResult<TicketCounts, unknown> {
    return useQuery({
        queryKey: deskKeys.counts(),
        queryFn: async () => {
            const response = await fetchTicketList({ view: 'mine', limit: 1, with_counts: true });
            if (response.counts === null) throw new DeskClientError('internal_error', 'counts missing');
            return response.counts;
        },
        staleTime: 0,
        refetchInterval: (query) => deskPollInterval(COUNTS_POLL_MS, query.state.error),
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
        placeholderData: (previous) => previous,
        retry: deskRetry,
    });
}

/** The tab badges follow the 10 s queue poll. A queue filter narrows the counts, so only the unfiltered answer is shared. */
function shareCounts(queryClient: QueryClient, queue: Queue | undefined, counts: TicketListResponse['counts']): void {
    if (counts !== null && queue === undefined) queryClient.setQueryData(deskKeys.counts(), counts);
}

export function useDeskQueue(
    view: QueueView,
    queue: Queue | undefined,
    enabled: boolean,
): UseQueryResult<TicketListResponse, unknown> {
    const queryClient = useQueryClient();
    const params: TicketListParams = { view, limit: LIST_MAX_LIMIT, queue, with_counts: view !== 'acks' };
    return useQuery({
        queryKey: deskKeys.list(params),
        queryFn: async () => {
            const response = await fetchTicketList(params);
            shareCounts(queryClient, queue, response.counts);
            return response;
        },
        enabled,
        staleTime: 0,
        refetchInterval: (query) => deskPollInterval(QUEUE_POLL_MS, query.state.error),
        refetchOnWindowFocus: true,
        // Keep the old rows while the queue filter changes, but never show another tab's rows under this tab.
        placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2].view === view ? previous : undefined),
        retry: deskRetry,
    });
}

type PagedTickets = UseInfiniteQueryResult<InfiniteData<TicketListResponse, string | null>, unknown>;

function usePagedTickets(
    params: TicketListParams,
    enabled: boolean,
    staleTime: number,
    refetchOnWindowFocus: boolean,
): PagedTickets {
    return useInfiniteQuery({
        queryKey: deskKeys.list(params),
        queryFn: ({ pageParam }) => fetchTicketList({ ...params, cursor: pageParam ?? undefined }),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.next_cursor,
        enabled,
        staleTime,
        refetchOnWindowFocus,
        retry: deskRetry,
    });
}

export function useWrapUpList(queue: Queue | undefined, enabled: boolean): PagedTickets {
    return usePagedTickets({ view: 'wrap_up', limit: WRAP_UP_PAGE_LIMIT, queue }, enabled, 0, true);
}

export function useTicketList(filters: TicketListFilters, enabled: boolean): PagedTickets {
    return usePagedTickets({ view: 'list', limit: LIST_MAX_LIMIT, ...filters }, enabled, TICKET_LIST_STALE_MS, false);
}

/** Key and function for "which ticket is number N": also used by fetchQuery in the duplicate preset. */
export function ticketByNoOptions(ticketNo: number) {
    return {
        queryKey: deskKeys.ticketNo(ticketNo),
        queryFn: async (): Promise<TicketListItem | null> => {
            const response = await fetchTicketList({ view: 'list', limit: 1, ticket_no: ticketNo });
            return response.items[0] ?? null;
        },
        staleTime: TICKET_LOOKUP_STALE_MS,
    };
}

export function useTicketByNo(ticketNo: number | null): UseQueryResult<TicketListItem | null, unknown> {
    return useQuery({
        ...ticketByNoOptions(ticketNo ?? 0),
        enabled: ticketNo !== null,
        refetchOnWindowFocus: false,
        retry: deskRetry,
    });
}

export function useTicketDetail(id: string | null): UseQueryResult<TicketDetail, unknown> {
    return useQuery({
        queryKey: deskKeys.ticket(id ?? ''),
        queryFn: async () => unwrapDesk(await deskFetch<TicketDetail>(`/api/desk/tickets/${id}`)),
        enabled: id !== null,
        staleTime: 0,
        refetchOnWindowFocus: true,
        retry: deskRetry,
    });
}
