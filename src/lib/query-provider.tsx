'use client';

import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from './api-error';

/**
 * Global TanStack Query provider with sensible error-handling
 * defaults for the admin panel.
 *
 * Mutations default to toasting `error.userMessage`. Forms that
 * render inline field errors opt out via:
 *
 *     useMutation({
 *         meta: { suppressToast: true },
 *         ...
 *     });
 *
 * Queries don't toast by default — they should render an inline
 * <QueryError onRetry={refetch}/> banner instead.
 *
 * Auth (401 with code:token_expired) is handled by the axios
 * interceptor in src/lib/api.ts — it removes the token and
 * redirects to /login before TanStack Query sees the error.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() =>
        new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 5 * 60 * 1000, // 5 minutes
                    refetchOnWindowFocus: false,
                    retry: (failureCount, error) => {
                        // Don't retry validation / auth / not-found errors —
                        // they won't fix themselves on retry. Do retry
                        // transient (5xx, network).
                        if (error instanceof ApiError) {
                            if (error.isValidation || error.isAuth ||
                                error.isNotFound || error.isConflict) {
                                return false;
                            }
                        }
                        return failureCount < 1;
                    },
                },
            },
            mutationCache: new MutationCache({
                onError: (error, _variables, _context, mutation) => {
                    // Opt-out for forms that render field errors inline.
                    if (mutation.meta && (mutation.meta as { suppressToast?: boolean }).suppressToast) {
                        return;
                    }
                    // Auth errors are already handled by the interceptor;
                    // skip the duplicate toast.
                    if (error instanceof ApiError && error.isTokenExpired) {
                        return;
                    }
                    const message = error instanceof ApiError
                        ? error.userMessage
                        : (error instanceof Error ? error.message : 'Something went wrong');
                    toast.error(message);
                },
            }),
        })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
