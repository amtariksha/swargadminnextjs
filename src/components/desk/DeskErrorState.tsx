'use client';

import { QueryError } from '@/components/QueryError';
import { DeskClientError, isHaltingDeskError } from '@/lib/desk/desk-query';
import { deskErrorText } from '@/lib/desk/ticket-labels';

interface DeskErrorStateProps {
    error: unknown;
    onRetry?: () => void;
}

/** Inline error for a failed Desk query. A halting error (no access, switched off) offers no retry. */
export function DeskErrorState({ error, onRetry }: DeskErrorStateProps) {
    const code = error instanceof DeskClientError ? error.code : 'internal_error';
    return (
        <QueryError
            error={error}
            title={deskErrorText(code, 'Something went wrong')}
            onRetry={isHaltingDeskError(error) ? undefined : onRetry}
        />
    );
}
