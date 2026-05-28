'use client';

import { useQuery } from '@tanstack/react-query';
import { GET } from '@/lib/api';

export type AudienceType = 'all' | 'custom' | 'driver';

export interface AudienceInput {
    type: AudienceType;
    userIds?: number[];
    driverUserId?: number | '';
}

interface AudienceCountResponse {
    count: number;
    audience_type: string;
}

/**
 * Live recipient-count for the composer's audience selector. Calls
 * `GET /broadcast/audience_count` — the backend reuses
 * resolveAudienceInput + resolveAudience({ countOnly:true }) so the
 * preview number can never drift from the actual dispatch count.
 *
 * For audience.type === 'custom' the count is `userIds.length` (no
 * network call needed). For 'all' / 'driver' the query fires only
 * when its required input is present, and disables otherwise so we
 * don't 400 the backend with half-formed inputs while the operator
 * is still picking.
 */
export function useAudienceCount(audience: AudienceInput) {
    const enabled =
        (audience.type === 'all') ||
        (audience.type === 'driver' &&
            typeof audience.driverUserId === 'number' &&
            audience.driverUserId > 0);

    const params: Record<string, string> = { audience_type: audience.type };
    if (audience.type === 'driver' && typeof audience.driverUserId === 'number') {
        params.driver_user_id = String(audience.driverUserId);
    }

    const query = useQuery({
        queryKey: ['audience-count', audience.type, audience.driverUserId ?? ''],
        queryFn: async () =>
            (await GET<AudienceCountResponse>('/broadcast/audience_count', params))
                .data,
        enabled,
        // Recipient counts move slowly (driver assignments, new signups) —
        // a minute of staleness is fine and avoids spamming the endpoint.
        staleTime: 60_000,
    });

    if (audience.type === 'custom') {
        return {
            count: audience.userIds?.length ?? 0,
            isLoading: false,
            ready: (audience.userIds?.length ?? 0) > 0,
        };
    }

    return {
        count: query.data?.count ?? null,
        isLoading: query.isLoading,
        ready: enabled && !query.isLoading && query.data != null,
    };
}
