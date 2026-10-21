'use client';

import { useMutation, useQueryClient, type QueryClient, type UseMutationResult } from '@tanstack/react-query';
import { postTicketAction, type ActionPostOutcome } from './action-client';
import type { TicketActionBody } from './contracts';
import { deskKeys } from './desk-query';
import { snapshotKeys } from './snapshot-client';
import type { TicketDetail, TicketView } from './types';

function ticketOf(outcome: ActionPostOutcome): TicketView {
    return outcome.kind === 'done' ? outcome.response.ticket : outcome.ticket;
}

function refreshAfterAction(queryClient: QueryClient, ticketId: string): void {
    void queryClient.invalidateQueries({ queryKey: deskKeys.ticket(ticketId) });
    void queryClient.invalidateQueries({ queryKey: deskKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: deskKeys.counts() });
    void queryClient.invalidateQueries({ queryKey: snapshotKeys.all() });
}

/** Records one action. The caller reports errors itself (meta.suppressToast) and passes the outcome to ctx.onRecorded. */
export function useTicketAction(ticketId: string): UseMutationResult<ActionPostOutcome, Error, TicketActionBody> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: TicketActionBody) => postTicketAction(ticketId, body),
        meta: { suppressToast: true },
        onSuccess: (outcome) => {
            const ticket = ticketOf(outcome);
            queryClient.setQueryData<TicketDetail>(deskKeys.ticket(ticketId), (old) => (old ? { ...old, ticket } : old));
        },
        onSettled: () => refreshAfterAction(queryClient, ticketId),
    });
}
