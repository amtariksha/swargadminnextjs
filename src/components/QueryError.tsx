'use client';

import { ApiError } from '@/lib/api-error';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface QueryErrorProps {
    /** The error from a failed query/mutation. ApiError is preferred;
     *  raw errors get a generic fallback. */
    error: unknown;
    /** Click handler to retry the failed call. */
    onRetry?: () => void;
    /** Optional override for the headline. Defaults to a sensible
     *  per-error-class string. */
    title?: string;
    /** When provided, replaces the default "Try again" button copy. */
    retryLabel?: string;
    /** Inline / banner / card visual variant. Defaults to "banner". */
    variant?: 'banner' | 'card';
}

/**
 * Inline error banner with a Try-again CTA. Drop into any list or
 * detail page that shows fetched data.
 *
 *     {isError ? <QueryError error={error} onRetry={refetch} /> : ...}
 *
 * Renders the canonical [ApiError.userMessage] and surfaces the
 * request_id in a small footer for support. For network errors,
 * shows a different headline ("Connection lost") so users know
 * it's not a server problem.
 */
export function QueryError({
    error,
    onRetry,
    title,
    retryLabel = 'Try again',
    variant = 'banner',
}: QueryErrorProps) {
    const apiError = error instanceof ApiError ? error : null;

    const headline =
        title ??
        (apiError?.isTransient
            ? 'Could not load — please retry'
            : apiError?.isAuth
                ? 'You were signed out'
                : apiError?.isValidation
                    ? 'Some data is invalid'
                    : 'Something went wrong');

    const message = apiError?.userMessage
        ?? (error instanceof Error ? error.message : 'An unexpected error occurred');

    const requestId = apiError?.requestId;

    const wrapperClasses = variant === 'card'
        ? 'glass rounded-xl p-6 border border-red-500/30 bg-red-500/5'
        : 'rounded-xl px-4 py-3 border border-red-500/30 bg-red-500/10';

    return (
        <div className={wrapperClasses} role="alert">
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-red-200">{headline}</h3>
                    <p className="text-sm text-slate-400 mt-1 break-words">{message}</p>
                    {requestId && requestId !== 'no-request-id' && (
                        <p className="text-xs text-slate-500 mt-2 font-mono">
                            Error ref: {requestId}
                        </p>
                    )}
                </div>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {retryLabel}
                    </button>
                )}
            </div>
        </div>
    );
}
