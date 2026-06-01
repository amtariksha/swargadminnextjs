import type {
    Conversation,
    Contact,
    Template,
    SendMessagePayload,
    Message,
    WhatsAppNumber,
    Payment,
    PaymentSummary,
    CreatePaymentPayload,
    AppUser,
    QuickReply,
    Reminder,
    LocalTemplate,
    PaginatedContacts,
    WhatsAppLogsResponse,
    CTWAConfig,
    CTWAAd,
    CTWALog,
    BroadcastCampaign,
    BroadcastsResponse,
} from "./types";

import { wfetch } from "./wfetch";

const BASE_URL = "";

// ─── WhatsApp Numbers ──────────────────────────────────────
export async function getNumbers(): Promise<WhatsAppNumber[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/numbers`);
    if (!res.ok) throw new Error("Failed to fetch numbers");
    return res.json();
}

// ─── Conversations ─────────────────────────────────────────
export async function getConversations(
    status?: string,
    search?: string,
    integratedNumber?: string
): Promise<Conversation[]> {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (integratedNumber) params.set("integratedNumber", integratedNumber);
    const res = await wfetch(`${BASE_URL}/api/whatsapp/conversations?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch conversations");
    return res.json();
}

export async function getConversation(id: string): Promise<Conversation> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/conversations/${id}`);
    if (!res.ok) throw new Error("Failed to fetch conversation");
    return res.json();
}

export async function updateConversationStatus(
    id: string,
    status: string
): Promise<Conversation> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Failed to update conversation");
    return res.json();
}

export async function assignConversation(
    id: string,
    userId: string | null,
    userName?: string | null
): Promise<Conversation> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: userId, assigned_name: userName ?? null }),
    });
    if (!res.ok) throw new Error("Failed to assign conversation");
    return res.json();
}

export async function markConversationAsRead(id: string): Promise<void> {
    await wfetch(`${BASE_URL}/api/whatsapp/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unreadCount: 0 }),
    });
}

// ─── Messages ──────────────────────────────────────────────
export async function sendMessage(
    payload: SendMessagePayload
): Promise<Message> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to send message");
    return res.json();
}

// ─── Contacts ──────────────────────────────────────────────
export async function getContacts(search?: string, page = 1, limit = 25): Promise<PaginatedContacts> {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(limit));
    const res = await wfetch(`${BASE_URL}/api/whatsapp/contacts?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch contacts");
    return res.json();
}

export async function getContact(id: string): Promise<Contact> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/contacts/${id}`);
    if (!res.ok) throw new Error("Failed to fetch contact");
    return res.json();
}

export async function updateContactTags(
    id: string,
    tags: string[]
): Promise<Contact> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
    });
    if (!res.ok) throw new Error("Failed to update contact");
    return res.json();
}

export async function updateContact(
    id: string,
    payload: { name?: string; email?: string; customFields?: Record<string, string> }
): Promise<Contact> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update contact");
    return res.json();
}

// ─── Templates ─────────────────────────────────────────────
export async function getTemplates(): Promise<Template[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates`);
    if (!res.ok) throw new Error("Failed to fetch templates");
    return res.json();
}

// ─── Users ─────────────────────────────────────────────────
export async function getUsers(): Promise<AppUser[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/users`);
    if (!res.ok) throw new Error("Failed to fetch users");
    const data = await res.json();
    return data.map((u: Record<string, unknown>) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
    }));
}

// ─── Quick Replies ──────────────────────────────────────────
export async function getQuickReplies(): Promise<QuickReply[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/quick-replies`);
    if (!res.ok) throw new Error("Failed to fetch quick replies");
    return res.json();
}

export async function createQuickReply(data: {
    title: string;
    body: string;
    shortcut?: string;
}): Promise<QuickReply> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/quick-replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create quick reply");
    return res.json();
}

export async function updateQuickReply(
    id: string,
    data: { title?: string; body?: string; shortcut?: string }
): Promise<QuickReply> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/quick-replies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update quick reply");
    return res.json();
}

export async function deleteQuickReply(id: string): Promise<void> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/quick-replies/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete quick reply");
}

// ─── Reminders ─────────────────────────────────────────────
export async function getReminders(): Promise<Reminder[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/reminders`);
    if (!res.ok) throw new Error("Failed to fetch reminders");
    return res.json();
}

export async function createReminder(data: {
    conversationId: string;
    remindAt: string;
    note?: string;
}): Promise<Reminder> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create reminder");
    return res.json();
}

export async function dismissReminder(id: string): Promise<void> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_dismissed: true }),
    });
    if (!res.ok) throw new Error("Failed to dismiss reminder");
}

export async function deleteReminder(id: string): Promise<void> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/reminders/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete reminder");
}

// ─── Local Templates ───────────────────────────────────────
export async function getLocalTemplates(): Promise<LocalTemplate[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates/local`);
    if (!res.ok) throw new Error("Failed to fetch local templates");
    return res.json();
}

export async function createLocalTemplate(data: {
    name: string;
    category: string;
    language: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttons?: Record<string, unknown>[];
}): Promise<LocalTemplate> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates/local`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create template");
    return res.json();
}

export async function updateLocalTemplate(
    id: string,
    data: Record<string, unknown>
): Promise<LocalTemplate> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates/local/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update template");
    return res.json();
}

export async function deleteLocalTemplate(id: string): Promise<void> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates/local/${id}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete template");
}

export async function submitLocalTemplate(id: string): Promise<{
    success: boolean;
    status: string;
    msg91TemplateId?: string;
    error?: string;
    details?: unknown;
}> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates/local/${id}/submit`, {
        method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit template");
    return data;
}

export async function syncTemplates(): Promise<{ synced: number }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/templates/sync`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to sync templates");
    return res.json();
}

// ─── Fetch Numbers from MSG91 ──────────────────────────────
export async function fetchMsg91Numbers(): Promise<{
    numbers: { phone: string; name: string }[];
    imported: number;
    total: number;
}> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/numbers/fetch-msg91`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to fetch numbers from MSG91");
    return res.json();
}

// ─── Broadcasts ───────────────────────────────────────────
export async function getBroadcasts(params?: {
    search?: string;
    status?: string;
    days?: string;
}): Promise<BroadcastsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status && params.status !== "all") searchParams.set("status", params.status);
    if (params?.days && params.days !== "all") searchParams.set("days", params.days);
    const res = await wfetch(`${BASE_URL}/api/whatsapp/broadcast?${searchParams.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch broadcasts");
    return res.json();
}

export async function getBroadcast(id: string): Promise<BroadcastCampaign> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/broadcast/${id}`);
    if (!res.ok) throw new Error("Failed to fetch broadcast");
    return res.json();
}

export async function createBroadcast(payload: {
    name?: string;
    templateId: string;
    templateLanguage?: string;
    variables?: Record<string, string>;
    recipients: Array<string | { phone: string; variables?: Record<string, string> }>;
    integratedNumber?: string;
    csvFileName?: string;
}): Promise<BroadcastCampaign> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create broadcast");
    }
    return res.json();
}

export async function exportContacts(search?: string): Promise<Blob> {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await wfetch(`${BASE_URL}/api/whatsapp/contacts/export?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to export contacts");
    return res.blob();
}

// ─── MSG91 Balance ─────────────────────────────────────────
export async function getBalance(): Promise<{
    balance: number | null;
    currency: string;
}> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/balance`);
    if (!res.ok) throw new Error("Failed to check balance");
    return res.json();
}

// ─── App Settings ─────────────────────────────────────────
export async function getSettings(orgId?: string): Promise<Record<string, string>> {
    const params = orgId ? `?orgId=${orgId}` : "";
    const res = await wfetch(`${BASE_URL}/api/whatsapp/settings${params}`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
}

export async function updateSettings(
    settings: Record<string, string>,
    orgId?: string
): Promise<Record<string, string>> {
    const payload: Record<string, string> = { ...settings };
    if (orgId) {
        payload._orgId = orgId;
    }
    const res = await wfetch(`${BASE_URL}/api/whatsapp/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update settings");
    return res.json();
}

// ─── Payments ──────────────────────────────────────────────
export async function getPayments(params?: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}): Promise<{ payments: Payment[]; total: number; page: number; limit: number; summary: PaymentSummary }> {
    const searchParams = new URLSearchParams();
    if (params?.status && params.status !== "all")
        searchParams.set("status", params.status);
    if (params?.from) searchParams.set("from", params.from);
    if (params?.to) searchParams.set("to", params.to);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("limit", String(params?.limit || 20));
    const res = await wfetch(
        `${BASE_URL}/api/whatsapp/payments?${searchParams.toString()}`
    );
    if (!res.ok) throw new Error("Failed to fetch payments");
    return res.json();
}

export async function createPayment(
    payload: CreatePaymentPayload
): Promise<Payment> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create payment");
    return res.json();
}

export async function updatePayment(
    id: string,
    payload: { paymentStatus?: string; transactionRef?: string }
): Promise<Payment> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update payment");
    return res.json();
}

export async function syncPayment(id: string): Promise<{ success: boolean; status: string }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/payments/${id}/sync`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to sync payment");
    return res.json();
}

// ─── WhatsApp Logs ─────────────────────────────────────────
export async function getLogs(params?: {
    from?: string;
    to?: string;
    phone?: string;
    status?: string;
    page?: number;
    limit?: number;
}): Promise<WhatsAppLogsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set("from", params.from);
    if (params?.to) searchParams.set("to", params.to);
    if (params?.phone) searchParams.set("phone", params.phone);
    if (params?.status && params.status !== "all") searchParams.set("status", params.status);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("limit", String(params?.limit || 25));
    const res = await wfetch(`${BASE_URL}/api/whatsapp/logs?${searchParams.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch logs");
    return res.json();
}

// ─── Voice Call ────────────────────────────────────────────
export async function initiateVoiceCall(
    phone: string,
    integratedNumber: string,
    conversationId: string
): Promise<{ success: boolean; callData?: unknown }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/chat/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, integratedNumber, conversationId }),
    });
    if (!res.ok) throw new Error("Failed to initiate voice call");
    return res.json();
}

// ─── WA Native Payment ────────────────────────────────────
export async function sendWaPayment(payload: {
    phone: string;
    integratedNumber: string;
    conversationId: string;
    bodyText: string;
    footerText?: string;
    headerImageUrl?: string;
    items: { name: string; amount: number; quantity: number }[];
}): Promise<{ success: boolean }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/chat/wa-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to send WA payment");
    return res.json();
}

// ─── CTWA (Click-to-WhatsApp Ads) ─────────────────────────
export async function getCTWAConfig(): Promise<CTWAConfig & { connected: boolean }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/config`);
    if (!res.ok) throw new Error("Failed to fetch CTWA config");
    return res.json();
}

export async function updateCTWAConfig(data: {
    adAccountId?: string;
    adAccountName?: string;
    datasetId?: string;
    capiEnabled?: boolean;
    capiLeadTag?: string;
    capiPurchaseTag?: string;
}): Promise<{ success: boolean }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update CTWA config");
    return res.json();
}

export async function getCTWAAuthUrl(): Promise<{ url: string }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/auth-url`);
    if (!res.ok) throw new Error("Failed to get CTWA auth URL");
    return res.json();
}

export async function disconnectCTWA(): Promise<{ success: boolean }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/disconnect`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to disconnect CTWA");
    return res.json();
}

export async function getCTWAAds(): Promise<CTWAAd[]> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/ads`);
    if (!res.ok) throw new Error("Failed to fetch CTWA ads");
    return res.json();
}

export async function syncCTWAAds(): Promise<{ success: boolean; synced: number }> {
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/ads`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to sync CTWA ads");
    return res.json();
}

export async function getCTWALogs(params?: {
    from?: string;
    to?: string;
    campaign?: string;
    conversationId?: string;
    page?: number;
    limit?: number;
}): Promise<{ logs: CTWALog[]; total: number; page: number; limit: number }> {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set("from", params.from);
    if (params?.to) searchParams.set("to", params.to);
    if (params?.campaign) searchParams.set("campaign", params.campaign);
    if (params?.conversationId) searchParams.set("conversationId", params.conversationId);
    searchParams.set("page", String(params?.page || 1));
    searchParams.set("limit", String(params?.limit || 20));
    const res = await wfetch(`${BASE_URL}/api/whatsapp/ctwa/logs?${searchParams.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch CTWA logs");
    return res.json();
}

export async function getCTWALogForConversation(conversationId: string): Promise<CTWALog | null> {
    const data = await getCTWALogs({ conversationId, limit: 1 });
    return data.logs[0] || null;
}
