'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Queue, RootCause } from '@/lib/desk/constants';
import { deskFetch } from '@/lib/desk/client';
import type { ReviewView } from '@/lib/desk/review-report';
import type { DeskStats, IstDate, TicketListResponse, TicketMutationResponse } from '@/lib/desk/types';

const REPORT_STALE_MS = 60_000;
const DRILLDOWN_LIMIT = 100;

function queryString(values: Record<string, string | null | undefined>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== null && value !== undefined && value !== '') params.set(key, value);
    }
    return params.toString();
}

export function useDeskStats(from: IstDate, to: IstDate, queue: Queue | null, enabled = true) {
    return useQuery({
        queryKey: ['desk', 'stats', from, to, queue],
        queryFn: () => deskFetch<DeskStats>(`/api/desk/stats?${queryString({ from, to, queue })}`),
        staleTime: REPORT_STALE_MS,
        retry: false,
        enabled,
    });
}

export function useDeskReview(date: IstDate) {
    return useQuery({
        queryKey: ['desk', 'review', date],
        queryFn: () => deskFetch<ReviewView>(`/api/desk/review?${queryString({ date })}`),
        staleTime: REPORT_STALE_MS,
        retry: false,
    });
}

export interface ReviewChange {
    id: string;
    reviewed: boolean;
    root_cause?: RootCause | null;
    preventive_action?: string | null;
    review_note?: string | null;
}

/** Sends op:'review' through the existing ticket PATCH; the review list reloads when it succeeds. */
export function useReviewTicket() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...fields }: ReviewChange) => deskFetch<TicketMutationResponse>(`/api/desk/tickets/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ op: 'review', ...fields }),
        }),
        onSuccess: (envelope) => {
            if (envelope.ok) void queryClient.invalidateQueries({ queryKey: ['desk', 'review'] });
        },
    });
}

/** The complaints of one category in the range, for the dashboard drill-down. */
export function useCategoryTickets(from: IstDate, to: IstDate, slug: string | null, queue: Queue | null) {
    return useQuery({
        queryKey: ['desk', 'category-tickets', from, to, slug, queue],
        queryFn: () => deskFetch<TicketListResponse>(`/api/desk/tickets?${queryString({
            view: 'list', from, to, category_slug: slug, queue, limit: String(DRILLDOWN_LIMIT),
        })}`),
        staleTime: REPORT_STALE_MS,
        retry: false,
        enabled: slug !== null,
    });
}
