'use client';

// Client hooks of the Desk chat thread. useTicketMessages owns the one messages interval of the ticket
// screen (5 s, foreground only, stopped by a halting error): call it once per ticket.

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Message } from '@/lib/whatsapp/types';
import { wfetch } from '@/lib/whatsapp/wfetch';
import { deskFetch } from './client';
import { deskKeys, deskPollInterval, deskRetry, describeDeskError, unwrapDesk } from './desk-query';
import {
    MESSAGES_FIRST_LIMIT, MESSAGES_OLDER_LIMIT, MESSAGES_POLL_LIMIT, MESSAGES_POLL_MS,
    appendSent, initialThread, mergeOlder, mergePoll, messagesPath, type ThreadState,
} from './thread-format';
import type { TicketMessagesResponse } from './types';

const EMPTY_MESSAGES: Message[] = [];
const messagesKey = (ticketId: string) => ['desk', 'messages', ticketId] as const;

async function fetchPage(ticketId: string, limit: number, before?: string | null): Promise<TicketMessagesResponse> {
    return unwrapDesk(await deskFetch<TicketMessagesResponse>(messagesPath(ticketId, limit, before)));
}

export interface TicketThread {
    /** Oldest first; a stable empty array before the first load. */
    messages: Message[];
    hasData: boolean;
    /** The latest fetch error, also after an earlier success. */
    error: Error | null;
    hasOlder: boolean;
    loadingOlder: boolean;
    loadOlder: () => void;
    refresh: () => void;
    addSent: (message: Message) => void;
}

export function useTicketMessages(ticketId: string, hasConversation: boolean): TicketThread {
    const queryClient = useQueryClient();
    const [loadingOlder, setLoadingOlder] = useState(false);
    const query = useQuery<ThreadState, Error>({
        queryKey: messagesKey(ticketId),
        queryFn: async (): Promise<ThreadState> => {
            const limit = queryClient.getQueryData<ThreadState>(messagesKey(ticketId)) === undefined
                ? MESSAGES_FIRST_LIMIT : MESSAGES_POLL_LIMIT;
            const page = await fetchPage(ticketId, limit);
            const latest = queryClient.getQueryData<ThreadState>(messagesKey(ticketId)); // read AFTER the await
            if (latest === undefined) return initialThread(page);
            return mergePoll(latest, page, limit) ?? initialThread(await fetchPage(ticketId, MESSAGES_FIRST_LIMIT));
        },
        enabled: hasConversation,
        staleTime: 0,
        refetchInterval: (current) => deskPollInterval(MESSAGES_POLL_MS, current.state.error),
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: deskRetry,
    });
    const { refetch } = query;

    const loadOlder = useCallback(() => {
        const key = messagesKey(ticketId);
        const cursor = queryClient.getQueryData<ThreadState>(key)?.olderCursor ?? null;
        if (cursor === null || loadingOlder) return;
        setLoadingOlder(true);
        void (async () => {
            try {
                const page = await fetchPage(ticketId, MESSAGES_OLDER_LIMIT, cursor);
                // Stop an in-flight poll (it would overwrite this page); merge only a page that still continues from this cursor.
                await queryClient.cancelQueries({ queryKey: key });
                queryClient.setQueryData<ThreadState>(key, (current) => (current === undefined || current.olderCursor !== cursor ? current : mergeOlder(current, page)));
            } catch (error) {
                toast.error(describeDeskError(error instanceof Error ? error : new Error('Could not load older messages')).text);
            } finally {
                setLoadingOlder(false);
            }
        })();
    }, [queryClient, ticketId, loadingOlder]);

    const addSent = useCallback((message: Message) => {
        const key = messagesKey(ticketId);
        void queryClient.cancelQueries({ queryKey: key }).then(() => {
            queryClient.setQueryData<ThreadState>(key, (current) => (current === undefined ? current : appendSent(current, message)));
        });
    }, [queryClient, ticketId]);

    const refresh = useCallback(() => { void refetch(); }, [refetch]);

    return {
        messages: query.data?.messages ?? EMPTY_MESSAGES,
        hasData: query.data !== undefined,
        error: query.error,
        hasOlder: (query.data?.olderCursor ?? null) !== null,
        loadingOlder,
        loadOlder,
        refresh,
        addSent,
    };
}

export const NEAR_BOTTOM_PX = 80;

export interface ThreadScroll {
    scrollRef: RefObject<HTMLDivElement | null>;
    atBottom: boolean;
    showNewPill: boolean;
    onScroll: () => void;
    scrollToBottom: () => void;
    keepPositionForOlder: () => void;
}

/** Follows new messages only while the exec is at the bottom; otherwise offers a "New messages" pill. */
export function useThreadScroll(messages: readonly Message[]): ThreadScroll {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const restoreRef = useRef<{ height: number; top: number } | null>(null);
    const [atBottom, setAtBottom] = useState(true);
    const [bottomNewestId, setBottomNewestId] = useState<string | null>(null);
    const newestId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const oldestId = messages.length > 0 ? messages[0].id : null;

    const onScroll = useCallback(() => {
        const element = scrollRef.current;
        if (element === null) return;
        const near = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
        setAtBottom(near);
        if (near) setBottomNewestId(newestId);
    }, [newestId]);

    useLayoutEffect(() => {
        const element = scrollRef.current;
        if (element !== null && atBottom) element.scrollTop = element.scrollHeight;
    }, [newestId, atBottom]);

    useLayoutEffect(() => {
        const element = scrollRef.current;
        const restore = restoreRef.current;
        if (element === null || restore === null) return;
        element.scrollTop = element.scrollHeight - restore.height + restore.top;
        restoreRef.current = null;
    }, [oldestId]);

    const scrollToBottom = useCallback(() => {
        const element = scrollRef.current;
        if (element !== null) element.scrollTop = element.scrollHeight;
        setAtBottom(true);
        setBottomNewestId(newestId);
    }, [newestId]);

    const keepPositionForOlder = useCallback(() => {
        const element = scrollRef.current;
        if (element !== null) restoreRef.current = { height: element.scrollHeight, top: element.scrollTop };
    }, []);

    return {
        scrollRef,
        atBottom,
        showNewPill: !atBottom && newestId !== null && newestId !== bottomNewestId,
        onScroll,
        scrollToBottom,
        keepPositionForOlder,
    };
}

export function useMarkConversationRead(): (conversationId: string) => void {
    const queryClient = useQueryClient();
    return useCallback((conversationId: string) => {
        void wfetch(`/api/whatsapp/conversations/${encodeURIComponent(conversationId)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ unreadCount: 0 }),
        })
            .then(() => queryClient.invalidateQueries({ queryKey: deskKeys.lists() }))
            .catch(() => undefined); // best effort, exactly like the old inbox's useMarkAsRead (hooks.ts:49-69)
    }, [queryClient]);
}

export interface VoiceCallInput {
    phone: string;
    integratedNumber: string;
    conversationId: string;
}

export function useDeskVoiceCall(onDone: () => void): UseMutationResult<void, Error, VoiceCallInput> {
    return useMutation({
        mutationFn: async (input: VoiceCallInput): Promise<void> => {
            const response = await wfetch('/api/whatsapp/chat/call', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(input),
            });
            if (!response.ok) throw new Error('Could not start the call.');
        },
        meta: { suppressToast: true },
        onSuccess: () => {
            toast.success('Call started');
            onDone();
        },
        onError: (error) => { toast.error(error.message); },
    });
}
