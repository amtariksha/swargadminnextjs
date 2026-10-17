// AD/src/lib/desk/constants.ts — vocabulary of the Desk module. No imports, no I/O.
// Only `status` has a CHECK constraint in the database; every other list here is
// enforced by zod at the API boundary (contracts.ts). Adding a value = edit this file
// and deploy; it never needs a migration.

// ── Ticket status ──────────────────────────────────────────────────────────
export const TICKET_STATUSES = ['new', 'open', 'waiting_customer', 'on_hold', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
/** Set by the engine from message direction. An exec never chooses these. */
export const SYSTEM_SET_STATUSES = ['new', 'open', 'waiting_customer'] as const;
/** Everything except 'resolved'. Queries express "unresolved" as status <> 'resolved'. */
export const UNRESOLVED_STATUSES = ['new', 'open', 'waiting_customer', 'on_hold'] as const;

// ── Queue, type, report group ──────────────────────────────────────────────
export const QUEUES = ['care', 'sales'] as const;
export type Queue = (typeof QUEUES)[number];
export const DEFAULT_QUEUE: Queue = 'care';

export const TICKET_TYPES = ['complaint', 'sales', 'request', 'enquiry', 'other'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const REPORT_GROUPS = ['complaint', 'sales', 'other'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

/** desk_categories.deadline_rule. NULL on the category means "no deadline". */
export const DEADLINE_RULES = ['before_cutoff'] as const;
export type DeadlineRule = (typeof DEADLINE_RULES)[number];

/** 1 = most urgent. health_concern is seeded with 1. */
export const PRIORITIES = [1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITIES)[number];
export const DEFAULT_PRIORITY: Priority = 3;

// ── Channel and origin ─────────────────────────────────────────────────────
export const CHANNELS = ['whatsapp', 'phone', 'app', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];
/** Channels the v1 API accepts on POST /api/desk/tickets. */
export const V1_CHANNELS = ['whatsapp'] as const;

export const ORIGINS = ['inbound', 'missing_message', 'manual', 'backfill'] as const;
export type Origin = (typeof ORIGINS)[number];
/** Origins excluded from response-time and resolution-time metrics. */
export const NON_INBOUND_ORIGINS = ['manual', 'backfill'] as const;

// ── Resolution ─────────────────────────────────────────────────────────────
export const RESOLVED_VIA = [
    'manual', 'action', 'auto_idle', 'legacy_inbox', 'system', 'migration', 'auto_converted',
] as const;
export type ResolvedVia = (typeof RESOLVED_VIA)[number];
export const HUMAN_RESOLVED_VIA = ['manual', 'action'] as const;
export const SYSTEM_RESOLVED_VIA = [
    'auto_idle', 'legacy_inbox', 'system', 'migration', 'auto_converted',
] as const;

export const RESOLUTION_CODES = [
    'refunded', 'credit_given', 'replacement_promised', 'explained', 'not_valid',
    'won', 'lost', 'done', 'not_possible', 'answered', 'no_action', 'duplicate',
    'no_response', 'spam', 'closed_unclassified',
] as const;
export type ResolutionCode = (typeof RESOLUTION_CODES)[number];
/** A human resolve with one of these codes needs a non-empty resolution_note. */
export const NOTE_REQUIRED_CODES = ['explained', 'not_valid', 'not_possible'] as const;
/** A resolve with this code needs lost_reason. */
export const LOST_REASON_REQUIRED_CODES = ['lost'] as const;
/** A human resolve with this code needs duplicate_of_ticket_no. */
export const DUPLICATE_REQUIRED_CODES = ['duplicate'] as const;
/** Written by the system only; rejected on POST /resolve and on wrap-up. */
export const SYSTEM_ONLY_CODES = ['closed_unclassified'] as const;
export const HUMAN_RESOLUTION_CODES = [
    'refunded', 'credit_given', 'replacement_promised', 'explained', 'not_valid',
    'won', 'lost', 'done', 'not_possible', 'answered', 'no_action', 'duplicate',
    'no_response', 'spam',
] as const;
export type HumanResolutionCode = (typeof HUMAN_RESOLUTION_CODES)[number];

/**
 * The six system resolutions. They skip the category / resolution-code rule and leave
 * type and category_slug as they are. legacy_inbox uses the ticket category's
 * default_resolution_code when the ticket has one; otherwise the code below.
 */
export const SYSTEM_RESOLUTIONS = {
    idle_close: { resolved_via: 'auto_idle', resolution_code: 'no_response' },
    ack_autoclose: { resolved_via: 'system', resolution_code: 'no_action' },
    phantom: { resolved_via: 'system', resolution_code: 'duplicate' },
    legacy_inbox: { resolved_via: 'legacy_inbox', resolution_code: 'closed_unclassified' },
    migration: { resolved_via: 'migration', resolution_code: 'closed_unclassified' },
    first_order: { resolved_via: 'auto_converted', resolution_code: 'won' },
} as const satisfies Record<string, { resolved_via: ResolvedVia; resolution_code: ResolutionCode }>;

export const LOST_REASONS = [
    'price', 'area_not_served', 'product_unavailable', 'timing_not_suitable',
    'chose_competitor', 'not_interested', 'no_response', 'other',
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const ROOT_CAUSES = [
    'delivery_boy', 'driver', 'packaging', 'production', 'cold_chain',
    'customer_care', 'app_system', 'customer', 'unknown',
] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

// ── Classification, matching, linking ──────────────────────────────────────
/** human = exec picked it; rules / ai = exec confirmed that suggestion unchanged. */
export const CLASSIFICATION_SOURCES = ['human', 'rules', 'ai'] as const;
export type ClassificationSource = (typeof CLASSIFICATION_SOURCES)[number];

export const CUSTOMER_MATCHES = ['exact', 'alternate', 'candidates', 'staff', 'none', 'manual'] as const;
export type CustomerMatch = (typeof CUSTOMER_MATCHES)[number];

export const LINK_STATUSES = ['linked', 'none_found', 'not_a_customer'] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

/** app_db delivery.status, stored unchanged in desk_tickets.delivery_status (SMALLINT). */
export const DELIVERY_STATUS_CODES = [1, 2, 3] as const;
export type DeliveryStatusCode = (typeof DELIVERY_STATUS_CODES)[number];
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatusCode, 'pending' | 'not_delivered' | 'delivered'> = {
    1: 'pending', 2: 'not_delivered', 3: 'delivered',
};
/** A linked day order has a text delivery status; it is stored as the matching code. */
export const DAYTIME_DELIVERY_STATUS_CODE: Record<'pending' | 'claimed' | 'delivered', DeliveryStatusCode> = {
    pending: 1, claimed: 1, delivered: 3,
};

export const FIRST_RESPONSE_SOURCES = ['panel', 'phone'] as const;
export type FirstResponseSource = (typeof FIRST_RESPONSE_SOURCES)[number];

// ── Hold and escalation ────────────────────────────────────────────────────
export const HOLD_REASONS = [
    'replacement_promised', 'verify_delivery', 'app_link_sent', 'needs_approval',
    'checking_internally', 'callback_scheduled', 'customer_to_confirm', 'other',
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];
/** An exec may pick only these in the hold dialog; the others are set by actions. */
export const EXEC_HOLD_REASONS = [
    'needs_approval', 'checking_internally', 'callback_scheduled', 'customer_to_confirm', 'other',
] as const;

export const ESCALATION_REASONS = [
    'health_concern', 'b2b_customer', 'repeat_complainer', 'credit_over_limit', 'repeat_refund', 'manual',
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

// ── Actions ────────────────────────────────────────────────────────────────
export const ACTION_TYPES = [
    'refund', 'wallet_credit', 'holiday_added', 'day_order_created', 'app_order_created',
    'subscription_updated', 'replacement_promised', 'delivery_marked_not_delivered',
    'customer_linked', 'payment_link_sent', 'app_link_sent',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const REF_TYPES = [
    'transaction', 'holiday', 'daytime_order', 'order', 'order_update', 'promise',
    'delivery', 'alternate_phone', 'payment_link', 'message',
] as const;
export type RefType = (typeof REF_TYPES)[number];

/** ref_type of each action_type. One row of the Action Contract. */
export const ACTION_REF_TYPE: Record<ActionType, RefType> = {
    refund: 'transaction',
    wallet_credit: 'transaction',
    holiday_added: 'holiday',
    day_order_created: 'daytime_order',
    app_order_created: 'order',
    subscription_updated: 'order_update',
    replacement_promised: 'promise',
    delivery_marked_not_delivered: 'delivery',
    customer_linked: 'alternate_phone',
    payment_link_sent: 'payment_link',
    app_link_sent: 'message',
};

/** What recording the action does to the ticket (blueprint "Action outcome table"). */
export const ACTION_OUTCOMES = ['resolve', 'resolve_unless_tomorrow', 'hold', 'none'] as const;
export type ActionOutcomeRule = (typeof ACTION_OUTCOMES)[number];
export const ACTION_OUTCOME: Record<ActionType, ActionOutcomeRule> = {
    refund: 'resolve',
    wallet_credit: 'resolve',
    holiday_added: 'resolve',
    day_order_created: 'resolve', // the request schema makes the payment step mandatory
    app_order_created: 'resolve_unless_tomorrow',
    subscription_updated: 'resolve_unless_tomorrow',
    replacement_promised: 'hold',
    delivery_marked_not_delivered: 'none',
    customer_linked: 'none',
    payment_link_sent: 'none',
    app_link_sent: 'hold',
};

/** Resolution code used when the request sends none. null = the action never resolves. */
export const ACTION_DEFAULT_CODE: Record<ActionType, HumanResolutionCode | null> = {
    refund: 'refunded',
    wallet_credit: 'credit_given',
    holiday_added: 'done',
    day_order_created: 'won',
    app_order_created: 'won', // 'done' when the ticket's category type is 'request'
    subscription_updated: 'done',
    replacement_promised: null,
    delivery_marked_not_delivered: null,
    customer_linked: null,
    payment_link_sent: null,
    app_link_sent: null,
};

/** hold_reason written when ACTION_OUTCOME is 'hold' or the tomorrow rule applies. */
export const ACTION_HOLD_REASON: Partial<Record<ActionType, HoldReason>> = {
    replacement_promised: 'replacement_promised',
    app_link_sent: 'app_link_sent',
    app_order_created: 'verify_delivery',
    subscription_updated: 'verify_delivery',
};

/** One (ref_type, ref_id) of these action types may exist on one ticket only. */
export const UNIQUE_REF_ACTIONS = ['refund', 'wallet_credit'] as const;
/** Action types a caller with money:false (delivery-app WebView) may record. */
export const NO_MONEY_ACTIONS = ['app_link_sent'] as const;

export const DAY_ORDER_PAYMENT_STEPS = ['link_sent', 'marked_paid', 'collect_on_delivery'] as const;
export type DayOrderPaymentStep = (typeof DAY_ORDER_PAYMENT_STEPS)[number];

/** app_db daytime_order.payment_status. Verified in daytimePaymentController.js. */
export const DAYTIME_PAYMENT_STATUSES = ['unpaid', 'link_sent', 'paid', 'cash', 'wallet_deducted'] as const;
export type DaytimePaymentStatus = (typeof DAYTIME_PAYMENT_STATUSES)[number];
export const DAYTIME_PAID_STATUSES = ['paid', 'cash', 'wallet_deducted'] as const;
/** Modes accepted by POST /daytime/orders/:id/mark_paid. */
export const MARK_PAID_MODES = ['cash', 'upi', 'wallet'] as const;
export type MarkPaidMode = (typeof MARK_PAID_MODES)[number];

// ── Events ─────────────────────────────────────────────────────────────────
export const EVENT_TYPES = [
    'created', 'reopened', 'status_changed', 'assigned', 'suggested', 'classified',
    'customer_matched', 'delivery_linked', 'first_response', 'held', 'follow_up_due',
    'resolved', 'resolve_conflict', 'resolution_updated', 'ack_would_suppress',
    'ack_suppressed', 'missing_message_flagged', 'escalated', 'duplicate_marked',
    'lead_updated', 'reviewed', 'cutoff_alerted',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const REOPEN_REASONS = ['customer_message', 'unseen_message', 'ack', 'legacy_inbox'] as const;
export type ReopenReason = (typeof REOPEN_REASONS)[number];

// ── Settings ───────────────────────────────────────────────────────────────
export const ACK_SUPPRESS_MODES = ['off', 'shadow', 'on'] as const;
export type AckSuppressMode = (typeof ACK_SUPPRESS_MODES)[number];

export const DESK_SETTING_KEYS = [
    'desk_engine_enabled', 'desk_inline_hooks', 'desk_ui_enabled', 'desk_cutover_redirect',
    'desk_ack_suppress', 'desk_go_live_at', 'desk_stats_from', 'desk_reopen_window_hours',
    'desk_idle_close_hours', 'desk_ack_autoclose_hours', 'desk_reply_alert_mins',
    'desk_number_queues', 'desk_business_hours', 'desk_credit_max_agent',
    'desk_last_tick_at', 'desk_last_tick_stats',
] as const;
export type DeskSettingKey = (typeof DESK_SETTING_KEYS)[number];
/** Written by the tick only. PUT /api/desk/settings rejects them. */
export const TICK_ONLY_SETTING_KEYS = ['desk_last_tick_at', 'desk_last_tick_stats'] as const;
/** Every key with this prefix is refused by PUT /api/whatsapp/settings. */
export const DESK_SETTING_PREFIX = 'desk_';

export const SETTING_DEFAULTS = {
    desk_ack_suppress: 'shadow' as AckSuppressMode,
    desk_reopen_window_hours: 2,
    desk_idle_close_hours: 24,
    desk_ack_autoclose_hours: 2,
    desk_reply_alert_mins: 15,
    desk_credit_max_agent: 200,
    desk_business_hours: { start: '05:30', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6] },
} as const;

// ── Permissions ────────────────────────────────────────────────────────────
export const PERMISSION_DESK = 'desk';
export const PERMISSION_DESK_MANAGER = 'desk-manager';
export const PERMISSION_WHATSAPP = 'whatsapp';
export const DELIVERY_CAP_WHATSAPP_INBOX = 'whatsapp-inbox';
export const DESK_LEVELS = ['agent', 'manager'] as const;
export type DeskLevel = (typeof DESK_LEVELS)[number];
export const DESK_VIA = ['full_access', 'permission', 'delivery_capability', 'none'] as const;
export type DeskVia = (typeof DESK_VIA)[number];

// ── Actors written by the system ───────────────────────────────────────────
export const SYSTEM_ACTOR = { id: 'system', name: 'Desk engine' } as const;
export const LEGACY_INBOX_ACTOR = { id: 'legacy_inbox', name: 'Old inbox' } as const;

// ── Numbers taken from the blueprint ───────────────────────────────────────
export const LIST_MAX_LIMIT = 100;
export const MESSAGES_MAX_LIMIT = 200;
export const QUEUE_SCAN_CAP = 500;
export const STATS_MAX_DAYS = 92;
export const SETTINGS_CACHE_MS = 30_000;
export const WHOAMI_CACHE_MS = 300_000;
export const WHOAMI_CACHE_MAX_ENTRIES = 500;
export const TICK_STALE_SECS = 300;
export const RECONTACT_WINDOW_HOURS = 72;
export const REPEAT_COMPLAINER_DAYS = 30;
export const REPEAT_COMPLAINER_MIN = 2;
export const REFUND_REPEAT_DAYS = 30;
export const APP_LINK_FOLLOW_UP_DAYS = 2;
export const NEXT_MORNING_FOLLOW_UP_HHMM = '08:30';
export const REVIEW_SAMPLE_SIZE = 5;
export const IST_OFFSET = '+05:30';
