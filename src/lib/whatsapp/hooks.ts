"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { SendMessagePayload, Message, Conversation, CreatePaymentPayload, BroadcastsResponse } from "./types";
import { generateId } from "./utils";
import { useAppStore } from "./store";
import { useEffect, useCallback } from "react";

// ─── WhatsApp Numbers ──────────────────────────────────────
export function useNumbers() {
    const setNumbers = useAppStore((s) => s.setNumbers);

    const query = useQuery({
        queryKey: ["numbers"],
        queryFn: api.getNumbers,
        staleTime: Infinity, // numbers don't change during session
    });

    useEffect(() => {
        if (query.data) {
            setNumbers(query.data);
        }
    }, [query.data, setNumbers]);

    return query;
}

// ─── Conversations ─────────────────────────────────────────
export function useConversations(status?: string, search?: string) {
    return useQuery({
        queryKey: ["conversations", status, search],
        queryFn: () => api.getConversations(status, search),
        refetchInterval: 10000,
    });
}

export function useConversation(id: string | null) {
    return useQuery({
        queryKey: ["conversation", id],
        queryFn: () => api.getConversation(id!),
        enabled: !!id,
    });
}

// Mark a conversation as read (reset unread count to 0)
export function useMarkAsRead() {
    const queryClient = useQueryClient();
    return useCallback(
        async (id: string) => {
            // Optimistically update conversations list to clear badge immediately
            queryClient.setQueriesData<any>(
                { queryKey: ["conversations"] },
                (old: any) => {
                    if (!Array.isArray(old)) return old;
                    return old.map((c: any) =>
                        c.id === id ? { ...c, unreadCount: 0 } : c
                    );
                }
            );
            // Fire the API call (don't await — best effort)
            api.markConversationAsRead(id).catch(() => {});
        },
        [queryClient]
    );
}

// ─── Send Message with Optimistic Update ───────────────────
export function useSendMessage() {
    const queryClient = useQueryClient();
    const activeConversationId = useAppStore((s) => s.activeConversationId);

    return useMutation({
        mutationFn: (payload: SendMessagePayload) => api.sendMessage(payload),
        onMutate: async (payload) => {
            await queryClient.cancelQueries({
                queryKey: ["conversation", activeConversationId],
            });

            const previousConversation = queryClient.getQueryData([
                "conversation",
                activeConversationId,
            ]);

            const optimisticMessage: Message = {
                id: generateId(),
                conversationId: payload.conversationId,
                direction: "outbound",
                contentType: payload.contentType,
                body:
                    payload.contentType === "text"
                        ? payload.text
                        : `Template: ${(payload as { templateName: string }).templateName}`,
                status: "sending",
                isInternalNote: false,
                timestamp: new Date().toISOString(),
            };

            queryClient.setQueryData(
                ["conversation", activeConversationId],
                (old: Conversation | undefined) => {
                    if (!old) return old;
                    return {
                        ...old,
                        messages: [...old.messages, optimisticMessage],
                        lastMessage: optimisticMessage.body,
                        lastMessageTime: optimisticMessage.timestamp,
                    };
                }
            );

            return { previousConversation };
        },
        onSuccess: (data: any) => {
            if (data?.status === "failed" && data?.providerError) {
                console.error(
                    `[SendMessage] Message delivery failed via ${data.providerError.provider}:`,
                    data.providerError.response,
                    "\nHint:", data.providerError.hint
                );
            }
        },
        onError: (_err, _payload, context) => {
            if (context?.previousConversation) {
                queryClient.setQueryData(
                    ["conversation", activeConversationId],
                    context.previousConversation
                );
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: ["conversation", activeConversationId],
            });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
    });
}

// ─── Resolve/Reopen Conversation ───────────────────────────
export function useUpdateConversationStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            api.updateConversationStatus(id, status),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation"] });
        },
    });
}

// ─── Assign Conversation ───────────────────────────────────
export function useAssignConversation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, userId }: { id: string; userId: string | null }) =>
            api.assignConversation(id, userId),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation"] });
        },
    });
}

// ─── Users ─────────────────────────────────────────────────
export function useUsers() {
    return useQuery({
        queryKey: ["users"],
        queryFn: api.getUsers,
        staleTime: 60 * 1000,
    });
}

// ─── Contacts ──────────────────────────────────────────────
export function useContacts(search?: string, page = 1, limit = 25) {
    return useQuery({
        queryKey: ["contacts", search, page, limit],
        queryFn: () => api.getContacts(search, page, limit),
        placeholderData: (prev) => prev, // keep previous data while loading next page
    });
}

export function useUpdateContactTags() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
            api.updateContactTags(id, tags),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation"] });
            queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
        },
    });
}

export function useUpdateContact() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            payload,
        }: {
            id: string;
            payload: { name?: string; email?: string; customFields?: Record<string, string> };
        }) => api.updateContact(id, payload),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation"] });
            queryClient.invalidateQueries({ queryKey: ["contact", data.id] });
        },
    });
}

// ─── Broadcasts ───────────────────────────────────────────
export function useBroadcasts(params?: {
    search?: string;
    status?: string;
    days?: string;
}) {
    return useQuery({
        queryKey: ["broadcasts", params],
        queryFn: () => api.getBroadcasts(params),
        placeholderData: (prev: BroadcastsResponse | undefined) => prev,
        refetchInterval: 15000,
    });
}

export function useBroadcast(id: string | null) {
    return useQuery({
        queryKey: ["broadcast", id],
        queryFn: () => api.getBroadcast(id!),
        enabled: !!id,
    });
}

export function useCreateBroadcast() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: Parameters<typeof api.createBroadcast>[0]) =>
            api.createBroadcast(payload),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
        },
    });
}

// ─── Templates ─────────────────────────────────────────────
export function useTemplates() {
    return useQuery({
        queryKey: ["templates"],
        queryFn: api.getTemplates,
        staleTime: 5 * 60 * 1000,
    });
}

// ─── Quick Replies ─────────────────────────────────────────
export function useQuickReplies() {
    return useQuery({
        queryKey: ["quick-replies"],
        queryFn: api.getQuickReplies,
    });
}

export function useCreateQuickReply() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { title: string; body: string; shortcut?: string }) =>
            api.createQuickReply(data),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
        },
    });
}

export function useDeleteQuickReply() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteQuickReply(id),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
        },
    });
}

// ─── Reminders ─────────────────────────────────────────────
export function useReminders() {
    return useQuery({
        queryKey: ["reminders"],
        queryFn: api.getReminders,
        refetchInterval: 30000, // check every 30s
    });
}

export function useCreateReminder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { conversationId: string; remindAt: string; note?: string }) =>
            api.createReminder(data),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["reminders"] });
        },
    });
}

export function useDismissReminder() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.dismissReminder(id),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["reminders"] });
        },
    });
}

// ─── Local Templates ───────────────────────────────────────
export function useLocalTemplates() {
    return useQuery({
        queryKey: ["local-templates"],
        queryFn: api.getLocalTemplates,
    });
}

export function useCreateLocalTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: {
            name: string;
            category: string;
            language: string;
            headerText?: string;
            bodyText: string;
            footerText?: string;
        }) => api.createLocalTemplate(data),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["local-templates"] });
        },
    });
}

export function useDeleteLocalTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.deleteLocalTemplate(id),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["local-templates"] });
        },
    });
}

export function useSyncTemplates() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.syncTemplates(),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["local-templates"] });
            queryClient.invalidateQueries({ queryKey: ["templates"] });
        },
    });
}

// ─── Fetch Numbers from MSG91 ──────────────────────────────
export function useFetchMsg91Numbers() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.fetchMsg91Numbers(),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["numbers"] });
        },
    });
}

// ─── MSG91 Balance ─────────────────────────────────────────
export function useBalance() {
    return useQuery({
        queryKey: ["balance"],
        queryFn: api.getBalance,
        staleTime: 60 * 1000, // 1 minute
        refetchInterval: 5 * 60 * 1000, // refresh every 5 mins
    });
}

// ─── App Settings ─────────────────────────────────────────
export function useSettings(orgId?: string) {
    return useQuery({
        queryKey: ["settings", orgId],
        queryFn: () => api.getSettings(orgId),
        staleTime: 5 * 60 * 1000, // settings rarely change
    });
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ settings, orgId }: { settings: Record<string, string>; orgId?: string }) =>
            api.updateSettings(settings, orgId),
        onSuccess: (data, variables) => {
            queryClient.setQueryData(["settings", variables.orgId], data);
        },
    });
}

// ─── Payments ──────────────────────────────────────────────
export function usePayments(params?: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}) {
    return useQuery({
        queryKey: ["payments", params],
        queryFn: () => api.getPayments(params),
        placeholderData: (prev) => prev,
        refetchInterval: 15000,
    });
}

export function useCreatePayment() {
    const queryClient = useQueryClient();
    const activeConversationId = useAppStore((s) => s.activeConversationId);

    return useMutation({
        mutationFn: (payload: CreatePaymentPayload) =>
            api.createPayment(payload),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            // Refetch the active conversation's messages so the payment link appears immediately
            if (activeConversationId) {
                queryClient.invalidateQueries({
                    queryKey: ["conversation", activeConversationId],
                });
            }
        },
    });
}

export function useUpdatePayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...payload }: { id: string; paymentStatus?: string; transactionRef?: string }) =>
            api.updatePayment(id, payload),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["payments"] });
        },
    });
}

export function useSyncPayment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.syncPayment(id),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
    });
}

// ─── WhatsApp Logs ─────────────────────────────────────────
export function useLogs(params?: {
    from?: string;
    to?: string;
    phone?: string;
    status?: string;
    page?: number;
    limit?: number;
}) {
    return useQuery({
        queryKey: ["logs", params],
        queryFn: () => api.getLogs(params),
        placeholderData: (prev) => prev,
        refetchInterval: 30000,
    });
}

// ─── Voice Call ────────────────────────────────────────────
export function useVoiceCall() {
    const queryClient = useQueryClient();
    const activeConversationId = useAppStore((s) => s.activeConversationId);

    return useMutation({
        mutationFn: ({ phone, integratedNumber, conversationId }: {
            phone: string;
            integratedNumber: string;
            conversationId: string;
        }) => api.initiateVoiceCall(phone, integratedNumber, conversationId),
        onSettled: () => {
            if (activeConversationId) {
                queryClient.invalidateQueries({
                    queryKey: ["conversation", activeConversationId],
                });
            }
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
    });
}

// ─── CTWA (Click-to-WhatsApp Ads) ─────────────────────────
export function useCTWAConfig() {
    return useQuery({
        queryKey: ["ctwa-config"],
        queryFn: api.getCTWAConfig,
        staleTime: 30 * 1000,
    });
}

export function useUpdateCTWAConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: {
            adAccountId?: string;
            adAccountName?: string;
            datasetId?: string;
            capiEnabled?: boolean;
            capiLeadTag?: string;
            capiPurchaseTag?: string;
        }) => api.updateCTWAConfig(data),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["ctwa-config"] });
        },
    });
}

export function useCTWAAds() {
    return useQuery({
        queryKey: ["ctwa-ads"],
        queryFn: api.getCTWAAds,
    });
}

export function useSyncCTWAAds() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api.syncCTWAAds(),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["ctwa-ads"] });
        },
    });
}

export function useCTWALogs(params?: {
    from?: string;
    to?: string;
    campaign?: string;
    page?: number;
    limit?: number;
}) {
    return useQuery({
        queryKey: ["ctwa-logs", params],
        queryFn: () => api.getCTWALogs(params),
        placeholderData: (prev) => prev,
    });
}

export function useCTWALogForConversation(conversationId: string | null, source?: string) {
    return useQuery({
        queryKey: ["ctwa-log", conversationId],
        queryFn: () => api.getCTWALogForConversation(conversationId!),
        enabled: !!conversationId && source === "ctwa",
        staleTime: 60 * 1000,
    });
}

// ─── WA Native Payment ────────────────────────────────────
export function useWaPayment() {
    const queryClient = useQueryClient();
    const activeConversationId = useAppStore((s) => s.activeConversationId);

    return useMutation({
        mutationFn: (payload: {
            phone: string;
            integratedNumber: string;
            conversationId: string;
            bodyText: string;
            footerText?: string;
            headerImageUrl?: string;
            items: { name: string; amount: number; quantity: number }[];
        }) => api.sendWaPayment(payload),
        onSettled: () => {
            if (activeConversationId) {
                queryClient.invalidateQueries({
                    queryKey: ["conversation", activeConversationId],
                });
            }
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
    });
}
