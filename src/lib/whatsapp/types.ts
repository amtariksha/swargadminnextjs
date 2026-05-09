// ─── Organization ─────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

// ─── WhatsApp Number ───────────────────────────────────────
export interface WhatsAppNumber {
  id: string;
  number: string;       // e.g. "919999999999"
  label: string;        // e.g. "Sales", "Support"
  isDefault: boolean;
  provider?: "msg91" | "meta";
  metaWabaId?: string;
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
}

// ─── Contact ───────────────────────────────────────────────
export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags: string[];
  customFields?: Record<string, string>;
  createdAt: string;
}

export interface PaginatedContacts {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
}

// ─── Message ───────────────────────────────────────────────
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type MessageContentType = "text" | "image" | "document" | "template" | "interactive" | "location" | "contact";
export type MessageSource = "webapp" | "mobile_app" | "api" | "broadcast" | "customer" | "ctwa";

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  contentType: MessageContentType;
  body: string; // text body or caption
  mediaUrl?: string; // for image/document
  fileName?: string; // for document
  status: MessageStatus;
  isInternalNote: boolean;
  timestamp: string;
  source?: MessageSource;
}

// ─── Conversation ──────────────────────────────────────────
export type ConversationStatus = "open" | "resolved";
export type ConversationSource = "organic" | "ctwa";

export interface Conversation {
  id: string;
  contactId: string;
  contact: Contact;
  integratedNumber: string; // which WA number this conversation belongs to
  status: ConversationStatus;
  assignedTo?: string;
  assignedAt?: string;
  assignedUser?: { id: string; name: string };
  lastMessage?: string;
  lastMessageTime: string;
  lastIncomingTimestamp: string;
  unreadCount: number;
  messages: Message[];
  ctwaClid?: string;
  source?: ConversationSource;
}

// ─── Template ──────────────────────────────────────────────
export interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
}

export interface Template {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: TemplateComponent[];
}

// ─── Broadcast ─────────────────────────────────────────────
export type BroadcastStatus = "sending" | "completed" | "failed";

export interface BroadcastCampaign {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  integratedNumber?: string;
  recipientsCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  status: BroadcastStatus;
  csvFileName?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastSummary {
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
}

export interface BroadcastsResponse {
  campaigns: BroadcastCampaign[];
  summary: BroadcastSummary;
}

// ─── Payment ───────────────────────────────────────────────
export type PaymentStatus = "created" | "paid" | "unpaid" | "cancelled" | "expired";

export interface Payment {
  id: string;
  contactId?: string;
  conversationId?: string;
  contactName: string;
  phone: string;
  amount: number;
  currency: string;
  description?: string;
  razorpayLinkId?: string;
  razorpayPaymentId?: string;
  shortUrl?: string;
  transactionRef?: string;
  messageStatus: string;
  paymentStatus: PaymentStatus;
  createdBy: string;
  integratedNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummary {
  created: { count: number; total: number };
  paid: { count: number; total: number };
  unpaid: { count: number; total: number };
  cancelled: { count: number; total: number };
}

export interface CreatePaymentPayload {
  contactName: string;
  phone: string;
  amount: number;
  description?: string;
  contactId?: string;
  conversationId?: string;
  integratedNumber?: string;
  sendViaWhatsApp?: boolean;
}

// ─── API Payloads ──────────────────────────────────────────
export interface SendTextPayload {
  to: string;
  contentType: "text";
  text: string;
  conversationId: string;
  integratedNumber: string;
}

export interface SendTemplatePayload {
  to: string;
  contentType: "template";
  templateName: string;
  templateLanguage: string;
  components: Record<string, { type: string; value: string }>;
  conversationId: string;
  integratedNumber: string;
}

export interface SendMediaPayload {
  to: string;
  contentType: "image" | "document";
  text: string;
  conversationId: string;
  integratedNumber: string;
  fileName?: string;
  mediaUrl?: string;
}

export interface SendInteractivePayload {
  to: string;
  contentType: "interactive";
  interactive: Record<string, unknown>;
  conversationId: string;
  integratedNumber: string;
}

export interface SendLocationPayload {
  to: string;
  contentType: "location";
  location: {
    longitude: number;
    latitude: number;
    name: string;
    address: string;
  };
  conversationId: string;
  integratedNumber: string;
}

export interface SendContactPayload {
  to: string;
  contentType: "contact";
  contacts: Array<{
    name: {
      first_name: string;
      last_name?: string;
      formatted_name: string;
    };
    phones: Array<{
      phone: string;
      type?: string;
    }>;
  }>;
  conversationId: string;
  integratedNumber: string;
}

export type SendMessagePayload = SendTextPayload | SendTemplatePayload | SendMediaPayload | SendInteractivePayload | SendLocationPayload | SendContactPayload;

// ─── Socket Events ─────────────────────────────────────────
export interface IncomingMessageEvent {
  conversationId: string;
  message: Message;
}

export interface StatusUpdateEvent {
  messageId: string;
  status: MessageStatus;
}

// ─── Quick Reply ────────────────────────────────────────────
export interface QuickReply {
  id: string;
  title: string;
  body: string;
  shortcut?: string;
  createdBy?: string;
  createdAt: string;
}

// ─── Reminder ──────────────────────────────────────────────
export interface Reminder {
  id: string;
  conversationId: string;
  userId: string;
  remindAt: string;
  note?: string;
  isDismissed: boolean;
  createdAt: string;
  // joined fields
  contactName?: string;
  contactPhone?: string;
}

// ─── Local Template ────────────────────────────────────────
export type TemplateStatus = "draft" | "submitted" | "approved" | "rejected";

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";
  text: string;
  url?: string;
  url_type?: "static" | "dynamic";
  phone_number?: string;
  example?: string; // for COPY_CODE sample code
}

export interface LocalTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType?: string;
  headerContent?: string;
  body: string;
  footer?: string;
  buttons?: TemplateButton[];
  variableSamples?: Record<string, string>;
  status: TemplateStatus;
  msg91TemplateId?: string;
  submittedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── CTWA (Click-to-WhatsApp Ads) ─────────────────────────
export interface CTWAConfig {
  id: string;
  facebookUserId: string;
  facebookName?: string;
  accessToken: string;
  adAccountId?: string;
  adAccountName?: string;
  datasetId?: string;
  capiEnabled: boolean;
  capiLeadTag: string;
  capiPurchaseTag: string;
  connectedAt: string;
  updatedAt: string;
}

export interface CTWAAd {
  id: string;
  adAccountId: string;
  campaignId: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  status?: string;
  objective?: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  syncedAt: string;
}

export interface CTWALog {
  id: string;
  ctwaClid: string;
  conversationId?: string;
  contactId?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
  headline?: string;
  body?: string;
  mediaType?: string;
  mediaUrl?: string;
  adName?: string;
  campaignName?: string;
  createdAt: string;
  // Joined fields
  contactName?: string;
  contactPhone?: string;
  conversationStatus?: string;
}

// ─── WhatsApp Log ─────────────────────────────────────────
export interface WhatsAppLog {
  id: string;
  phone: string;
  direction: string;
  status: string;
  contentType: string;
  templateName?: string;
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  credits?: number;
}

export interface WhatsAppLogsResponse {
  logs: WhatsAppLog[];
  total: number;
  page: number;
  limit: number;
}

// ─── User (for assignment dropdowns etc.) ──────────────────
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "agent";
  isActive: boolean;
  orgId: string;
}
