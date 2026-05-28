/**
 * Admin review moderation hooks — list + update.
 *
 * Backend endpoints:
 *   GET   /api/admin/reviews?status=pending&limit=…&offset=…
 *   PATCH /api/admin/reviews/:id  body: { status?, admin_response? }
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GET, PATCH } from '@/lib/api';
import type { Review, ReviewStatus, ReviewUpdatePayload } from '@/lib/types/reviews';

export interface ReviewListResponse {
    data: Review[];
    meta: { total: number; limit: number; offset: number; status: ReviewStatus };
}

/**
 * Moderation list. Status defaults to 'pending' so the queue lands on
 * fresh submissions first; admin can switch tabs to see approved /
 * rejected / archived without paging through everything.
 */
export function useAdminReviews(filters: {
    status?: ReviewStatus;
    productId?: number;
    limit?: number;
    offset?: number;
} = {}) {
    const status = filters.status ?? 'pending';
    return useQuery({
        queryKey: ['admin-reviews', status, filters.productId, filters.limit, filters.offset],
        queryFn: async () => {
            const params: Record<string, unknown> = { status };
            if (filters.productId != null) params.product_id = filters.productId;
            if (filters.limit != null) params.limit = filters.limit;
            if (filters.offset != null) params.offset = filters.offset;
            // GET endpoint returns { response, data, meta } — we want both data and meta.
            const res = await GET<Review[]>('/admin/reviews', params);
            return res as unknown as ReviewListResponse;
        },
    });
}

export function useUpdateReview() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...changes }: ReviewUpdatePayload & { id: number }) => {
            const res = await PATCH<Review>(`/admin/reviews/${id}`, changes as Record<string, unknown>);
            return res.data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-reviews'] });
        },
    });
}
