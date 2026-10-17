// AD/src/lib/desk/types.ts — shapes of rows and of derived values. Field names are the
// database column names. The only runtime export is TICKET_LIST_COLUMNS.
import type {
    ActionType, AckSuppressMode, Channel, ClassificationSource, CustomerMatch,
    DayOrderPaymentStep, DaytimePaymentStatus, DeadlineRule, DeliveryStatusCode, DeskSettingKey, DeskVia,
    EscalationReason, EventType, FirstResponseSource, HoldReason, LinkStatus, LostReason,
    MarkPaidMode, Origin, Queue, RefType, ReopenReason, ReportGroup, ResolutionCode,
    ResolvedVia, RootCause, TicketStatus, TicketType,
} from './constants';

/** ISO 8601 with offset, exactly as PostgREST returns a timestamptz. Never re-serialise through Date. */
export type IsoDateTime = string;
/** IST calendar date, 'YYYY-MM-DD'. */
export type IstDate = string;
/** String(app_db users.id). Same form as conversations.assigned_to. */
export type StaffId = string;

// ── desk_categories ────────────────────────────────────────────────────────
export interface Category {
    slug: string;
    type: TicketType;
    label: string;
    queue: Queue;
    report_group: ReportGroup;
    category_group: string | null;
    priority: number;
    default_resolution_code: ResolutionCode | null;
    refund_reason_label: string | null;
    requires_delivery_link: boolean;
    deadline_rule: DeadlineRule | null;
    keywords: string[];
    playbook_md: string | null;
    active: boolean;
    sort_order: number;
}

// ── desk_tickets ───────────────────────────────────────────────────────────
export interface PriorResolution {
    resolved_at: IsoDateTime;
    resolved_by: StaffId | null;
    resolved_by_name: string | null;
    resolution_code: ResolutionCode;
    resolution_note: string | null;
    resolved_via: ResolvedVia;
    lost_reason: LostReason | null;
}

export interface Ticket {
    // identity
    id: string;
    ticket_no: number;
    channel: Channel;
    conversation_id: string | null;
    contact_id: string | null;
    integrated_number: string | null;
    origin: Origin;
    previous_ticket_id: string | null;
    duplicate_of_ticket_id: string | null;
    lead_id: string | null;
    // customer
    customer_phone: string | null;
    customer_name: string | null;
    backend_user_id: number | null;
    customer_match: CustomerMatch | null;
    // classification
    queue: Queue;
    type: TicketType | null;
    category_slug: string | null;
    priority: number;
    suggested_type: TicketType | null;
    suggested_category: string | null;
    classification_source: ClassificationSource | null;
    classified_at: IsoDateTime | null;
    classified_by: StaffId | null;
    // workflow
    status: TicketStatus;
    assigned_to: StaffId | null;
    assigned_name: string | null;
    assigned_at: IsoDateTime | null;
    opened_at: IsoDateTime;
    last_inbound_at: IsoDateTime | null;
    last_outbound_at: IsoDateTime | null;
    awaiting_reply_since: IsoDateTime | null;
    first_response_at: IsoDateTime | null;
    first_response_message_id: string | null;
    first_response_by: StaffId | null;
    first_response_source: FirstResponseSource | null;
    follow_up_at: IsoDateTime | null;
    hold_reason: HoldReason | null;
    reopen_count: number;
    last_reopened_at: IsoDateTime | null;
    is_ack_only: boolean;
    escalated_at: IsoDateTime | null;
    escalation_reason: EscalationReason | null;
    // resolution
    resolved_at: IsoDateTime | null;
    resolved_by: StaffId | null;
    resolved_by_name: string | null;
    resolution_code: ResolutionCode | null;
    resolution_note: string | null;
    resolved_via: ResolvedVia | null;
    lost_reason: LostReason | null;
    prior_resolution: PriorResolution | null;
    first_resolved_at: IsoDateTime | null;
    first_resolved_by: StaffId | null;
    first_resolved_code: ResolutionCode | null;
    root_cause: RootCause | null;
    preventive_action: string | null;
    // snapshot at customer match
    address_id: number | null;
    apartment_name: string | null;
    flat_no: string | null;
    area: string | null;
    pincode: string | null;
    driver_user_id: number | null;
    driver_name: string | null;
    drop_point_id: number | null;
    drop_point_name: string | null;
    // snapshot at delivery link
    order_id: number | null;
    daytime_order_id: number | null;
    product_id: number | null;
    product_name: string | null;
    delivery_date: IstDate | null;
    delivery_status: DeliveryStatusCode | null;
    delivered_at: IsoDateTime | null;
    link_status: LinkStatus | null;
    // snapshot at action
    order_value: number | null;
    payment_status: DaytimePaymentStatus | null;
    // review
    reviewed_at: IsoDateTime | null;
    reviewed_by: StaffId | null;
    review_note: string | null;
}

/** Computed when a ticket is read. Never stored. */
export interface TicketComputed {
    /** Earliest of awaiting_reply_since and a follow_up_at that is already due; null when neither. */
    attention_since: IsoDateTime | null;
    /** attention_since is older than desk_reply_alert_mins of business time, or a follow-up is due. */
    overdue: boolean;
    /** Wall-clock seconds since attention_since; null when attention_since is null. */
    waiting_secs: number | null;
}
export type TicketView = Ticket & TicketComputed;

/** The columns list endpoints select. */
export const TICKET_LIST_COLUMNS = [
    'id', 'ticket_no', 'channel', 'conversation_id', 'integrated_number', 'origin',
    'customer_phone', 'customer_name', 'backend_user_id', 'customer_match',
    'queue', 'type', 'category_slug', 'priority', 'suggested_type', 'suggested_category',
    'status', 'assigned_to', 'assigned_name', 'opened_at', 'last_inbound_at', 'last_outbound_at',
    'awaiting_reply_since', 'first_response_at', 'follow_up_at', 'hold_reason', 'reopen_count',
    'is_ack_only', 'escalated_at', 'escalation_reason', 'resolved_at', 'resolved_by_name',
    'resolution_code', 'resolved_via', 'apartment_name', 'area', 'pincode', 'driver_name',
    'product_name', 'delivery_date', 'link_status', 'order_value', 'payment_status',
] as const satisfies readonly (keyof Ticket)[];
export type TicketListItem = Pick<Ticket, (typeof TICKET_LIST_COLUMNS)[number]> & TicketComputed & {
    /** conversations.last_message, cut to 140 characters; null when the ticket has no conversation. */
    preview: string | null;
    /** conversations.unread_count; 0 when the ticket has no conversation. */
    unread_count: number;
};

export type TicketSummary = Pick<Ticket,
    'id' | 'ticket_no' | 'status' | 'queue' | 'type' | 'category_slug' | 'integrated_number'
    | 'opened_at' | 'resolved_at' | 'resolution_code' | 'assigned_name'>;

// ── desk_ticket_events ─────────────────────────────────────────────────────
export interface EventDataMap {
    created: {
        origin: Origin;
        via: 'tick' | 'inline' | 'api';
        message_id: string | null;
        queue: Queue;
        /** Seconds between the first message and the insert of the ticket row. */
        lag_secs: number | null;
        previous_ticket_id: string | null;
    };
    reopened: {
        reason: ReopenReason;
        message_id: string | null;
        prior_resolution: PriorResolution;
    };
    /** from_status and to_status are in the typed columns of the event row. */
    status_changed: {
        cause: 'inbound' | 'human_reply' | 'reply_failed' | 'hold' | 'hold_released' | 'derive';
    };
    assigned: { from: StaffId | null; to: StaffId | null; to_name: string | null; auto: boolean };
    suggested: {
        source: 'rules' | 'ai';
        suggested_type: TicketType | null;
        suggested_category: string | null;
        order_id: number | null;
        matched_keyword: string | null;
    };
    classified: {
        category_slug: string;
        type: TicketType;
        queue: Queue;
        previous_category: string | null;
        source: ClassificationSource;
        after_resolution: boolean;
    };
    customer_matched: { backend_user_id: number | null; customer_match: CustomerMatch };
    delivery_linked: {
        link_status: LinkStatus;
        order_id: number | null;
        daytime_order_id: number | null;
        delivery_date: IstDate | null;
        product_name: string | null;
        driver_user_id: number | null;
    };
    first_response: {
        message_id: string;
        source: FirstResponseSource;
        by: StaffId | null;
        secs_since_open: number;
    };
    held: { hold_reason: HoldReason; follow_up_at: IsoDateTime; note: string | null };
    follow_up_due: { follow_up_at: IsoDateTime; hold_reason: HoldReason | null };
    resolved: {
        resolution_code: ResolutionCode;
        resolved_via: ResolvedVia;
        note: string | null;
        lost_reason: LostReason | null;
        action_id: number | null;
        duplicate_of_ticket_no: number | null;
        /** Set by the old-inbox mirror: the ticket was closed while a customer was still waiting. */
        over_unanswered?: boolean;
    };
    resolve_conflict: {
        attempted_via: 'manual' | 'action';
        action_id: number | null;
        seen_inbound_at: IsoDateTime | null;
        last_inbound_at: IsoDateTime | null;
    };
    resolution_updated: {
        resolution_code: ResolutionCode;
        previous_code: ResolutionCode | null;
        note: string | null;
    };
    ack_would_suppress: { message_id: string; text: string };
    ack_suppressed: { message_id: string; text: string };
    missing_message_flagged: {
        last_incoming_timestamp: IsoDateTime;
        newest_stored_inbound_at: IsoDateTime | null;
    };
    escalated: { escalation_reason: EscalationReason; note: string | null; action_id: number | null };
    duplicate_marked: { duplicate_of_ticket_id: string; duplicate_of_ticket_no: number };
    lead_updated: { lead_id: string; lead_status: 'lost'; lost_reason: LostReason | null };
    reviewed: { root_cause: RootCause | null; preventive_action: string | null; review_note: string | null };
    cutoff_alerted: { cutoff: string; reason: 'awaiting_reply' | 'unclassified' | 'before_cutoff' };
}

interface TicketEventBase {
    id: number;
    ticket_id: string;
    from_status: TicketStatus | null;
    to_status: TicketStatus | null;
    assignee_id: StaffId | null;
    actor_id: string | null;
    actor_name: string | null;
    created_at: IsoDateTime;
}
export type TicketEventOf<K extends EventType> = TicketEventBase & { type: K; data: EventDataMap[K] };
export type TicketEvent = { [K in EventType]: TicketEventOf<K> }[EventType];

// ── desk_ticket_actions ────────────────────────────────────────────────────
export interface ActionDataMap {
    refund: {
        debit_txn_id: number;
        order_id: number | null;
        delivery_date: IstDate | null;
        refund_reason: string;
        billed_to_driver: boolean;
        billed_driver_id: number | null;
        driver_deduction_amount: number | null;
        new_wallet_balance: number | null;
    };
    wallet_credit: { user_id: number; description: string; payment_id: string };
    holiday_added: { user_id: number; from: IstDate; to: IstDate };
    day_order_created: {
        daytime_order_id: number;
        delivery_date: IstDate;
        payment_step: DayOrderPaymentStep;
        payment_status: DaytimePaymentStatus;
        payment_mode: MarkPaidMode | 'link' | null;
        payment_link_id: string | null;
        new_customer: boolean;
    };
    app_order_created: {
        order_id: number;
        product_id: number;
        subscription_type: 1 | 2 | 3 | 4 | null;
        start_date: IstDate | null;
        affects_tomorrow: boolean;
    };
    subscription_updated: { order_id: number; changes: string[]; affects_tomorrow: boolean };
    replacement_promised: { promised_date: IstDate; note: string; product_name: string | null };
    delivery_marked_not_delivered: {
        delivery_id: number;
        order_id: number | null;
        delivery_date: IstDate;
        reason_category: 1 | 2 | 3 | 4;
        reason: string | null;
    };
    customer_linked: {
        user_id: number;
        phone: string;
        alternate_phone_id: number | null;
        already_linked: boolean;
    };
    payment_link_sent: { daytime_order_id: number; short_url: string; whatsapp_sent: boolean };
    app_link_sent: { message_id: string };
}

interface TicketActionBase {
    id: number;
    client_action_id: string;
    ticket_id: string;
    ref_type: RefType;
    ref_id: string;
    /** Rupees. null when the action has no amount. */
    amount: number | null;
    /** true only when every backend check of section 2.2 passed. */
    verified: boolean;
    resolved_ticket: boolean;
    actor_id: StaffId;
    actor_name: string | null;
    created_at: IsoDateTime;
}
export type TicketActionOf<K extends ActionType> = TicketActionBase & { action_type: K; data: ActionDataMap[K] };
export type TicketAction = { [K in ActionType]: TicketActionOf<K> }[ActionType];

// ── desk_action_items ──────────────────────────────────────────────────────
export type ActionItemStatus = 'open' | 'done' | 'dropped';
export interface ActionItem {
    id: number;
    ticket_id: string | null;
    title: string;
    detail: string | null;
    owner_id: StaffId | null;
    owner_name: string | null;
    due_date: IstDate | null;
    status: ActionItemStatus;
    /** The IST date of the morning review that raised the item. */
    review_date: IstDate | null;
    /** Cluster key when the item does not come from one ticket, e.g. { kind: 'driver', key: '812' }. */
    data: Record<string, unknown>;
    created_by: StaffId | null;
    created_by_name: string | null;
    created_at: IsoDateTime;
    updated_at: IsoDateTime;
    done_at: IsoDateTime | null;
    done_by: StaffId | null;
    done_by_name: string | null;
    done_note: string | null;
}

// ── settings ───────────────────────────────────────────────────────────────
export interface BusinessHours {
    /** 'HH:MM' IST, 24-hour. */
    start: string;
    end: string;
    /** 0 = Sunday … 6 = Saturday. */
    days: number[];
}

/** Parsed view of the desk_* rows in public.app_settings (org_id IS NULL). */
export interface DeskSettings {
    engine_enabled: boolean;
    inline_hooks: boolean;
    ui_enabled: boolean;
    cutover_redirect: boolean;
    ack_suppress: AckSuppressMode;
    go_live_at: IsoDateTime | null;
    stats_from: IsoDateTime | null;
    reopen_window_hours: number;
    idle_close_hours: number;
    ack_autoclose_hours: number;
    reply_alert_mins: number;
    /** Digits-only business number → queue. A number that is absent maps to 'care'. */
    number_queues: Record<string, Queue>;
    business_hours: BusinessHours;
    credit_max_agent: number;
    last_tick_at: IsoDateTime | null;
    /** false when the settings read failed; every flag is then off and every number is its default. */
    readable: boolean;
}

// ── authorisation ──────────────────────────────────────────────────────────
export interface DeskActor { id: StaffId; name: string | null }
export interface DeskRights {
    agent: boolean;
    manager: boolean;
    money: boolean;
    inbox: boolean;
    via: DeskVia;
}
/** data of GET /api/support/whoami (backend). */
export interface DeskWhoami extends DeskRights { user: DeskActor }

/** data of GET /api/desk/me. */
export interface DeskMe extends DeskRights {
    user: DeskActor;
    ui_enabled: boolean;
    cutover_redirect: boolean;
    ack_suppress: AckSuppressMode;
    reply_alert_mins: number;
    credit_max_agent: number;
    business_hours: BusinessHours;
    last_tick_at: IsoDateTime | null;
    tick_stale: boolean;
}

/** Passed to every /api/desk handler by withDesk. */
export interface DeskContext {
    actor: DeskActor;
    rights: DeskRights;
    /** The caller's bearer token, forwarded to the backend for verification calls. */
    token: string;
    settings: DeskSettings;
}

// ── health and tick ────────────────────────────────────────────────────────
// What each field counts is specified step by step in c-engine-rules.md sections 10 and 11,
// which use exactly these names.
export type DeskTickSkip = 'settings_error' | 'not_installed' | 'engine_off' | 'no_go_live';
export interface DeskTickStepBase { ok: boolean; timed_out: boolean; errors: number; not_installed: boolean }
export interface DeskTickResult {
    /** false when the run stopped in step 1. */
    ran: boolean;
    skipped: DeskTickSkip | null;
    tick_at: IsoDateTime;
    duration_ms: number;
    heartbeat_written: boolean;
    steps: {
        sweep?: DeskTickStepBase & { scanned: number; created: number; reopened: number; appended: number; ack_attached: number; noop: number; gave_up: number; skipped_no_conversation: number };
        derive?: DeskTickStepBase & { candidates: number; updated: number; raced: number; too_large: number };
        mirror?: DeskTickStepBase & { legacy_resolved: number; invariant_reopened: number; reopen_conflicts: number };
        missing?: DeskTickStepBase & { scanned: number; flagged: number };
        lifecycle?: DeskTickStepBase & { followups_due: number; idle_closed: number; ack_closed: number; cutoff_watch: number };
        health?: DeskTickStepBase & { orphans: number; orphans_capped: boolean; oldest_orphan_age_s: number | null; failed_replies_24h: number; stats_written: boolean };
    };
}
/** Parsed value of the setting desk_last_tick_stats. */
export interface DeskTickStats {
    at: IsoDateTime;
    duration_ms: number;
    orphans: number;
    orphans_capped: boolean;
    oldest_orphan_age_s: number | null;
    failed_replies_24h: number;
    steps: DeskTickResult['steps'];
}

export interface DeskHealth {
    installed: boolean;
    /** e.g. ['desk_tickets', 'messages.ticket_id']. */
    missing: string[];
    canWrite: boolean;
    /** Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY). Never the value. */
    serviceKeyPresent: boolean;
    flags: {
        desk_engine_enabled: boolean;
        desk_inline_hooks: boolean;
        desk_ui_enabled: boolean;
        desk_cutover_redirect: boolean;
        desk_ack_suppress: AckSuppressMode;
        desk_go_live_at: IsoDateTime | null;
        go_live_valid: boolean;
    };
    lastTickAt: IsoDateTime | null;
    lastTickAgeSeconds: number | null;
    lastTickStats: DeskTickStats | null;
    /** An error class name, never a message with data in it. */
    error: string | null;
}

// ── API response shapes — append to AD/src/lib/desk/types.ts ───────────────
export interface TicketListResponse {
    items: TicketListItem[];
    /** Opaque. Send it back unchanged as `cursor` to get the next page; null = no more rows. */
    next_cursor: string | null;
    /** true when a queue view read QUEUE_SCAN_CAP rows and more exist. */
    truncated: boolean;
    /** Present only when with_counts=1. */
    counts: { mine: number; unassigned: number; all: number; acks: number; wrap_up: number } | null;
}

export interface ConversationBrief {
    id: string;
    status: 'open' | 'resolved';
    unread_count: number;
    integrated_number: string;
    contact: { id: string; name: string | null; phone: string };
}

export interface MoneyActionBrief {
    id: number;
    ticket_id: string;
    ticket_no: number;
    action_type: 'refund' | 'wallet_credit';
    amount: number | null;
    actor_name: string | null;
    created_at: IsoDateTime;
}

export interface TicketDetail {
    ticket: TicketView;
    category: Category | null;
    conversation: ConversationBrief | null;
    /** Oldest first, at most 200. */
    events: TicketEvent[];
    actions: TicketAction[];
    /** Same customer_phone or backend_user_id, newest first, at most 10, this ticket excluded. */
    previous_tickets: TicketSummary[];
    /** Unresolved tickets of the same customer on other conversations (banner in the header). */
    other_open_tickets: TicketSummary[];
    /** refund / wallet_credit actions for the same backend_user_id in the last REFUND_REPEAT_DAYS days. */
    prior_money_actions: MoneyActionBrief[];
    lead: { id: string; status: string; owner_name: string | null } | null;
}

/** The Message shape of AD/src/lib/whatsapp/types.ts plus four fields. camelCase on purpose. */
export interface DeskMessage {
    id: string;
    conversationId: string;
    direction: 'inbound' | 'outbound';
    contentType: string;
    body: string;
    mediaUrl?: string;
    fileName?: string;
    status: string;
    isInternalNote: boolean;
    timestamp: IsoDateTime;
    source?: string;
    failureReason?: string;
    ticketId: string | null;
    templateName: string | null;
    sentByUserId: StaffId | null;
    sentByName: string | null;
}
export interface TicketMessagesResponse {
    /** Oldest first. */
    items: DeskMessage[];
    /** Send back as `before` to load older messages; null = nothing older. */
    older_cursor: IsoDateTime | null;
}

export interface TicketMutationResponse { ticket: TicketView }
export interface TicketCreateResponse { ticket: TicketView; created: boolean }
export interface TicketResolveResponse { ticket: TicketView; already_resolved: boolean }
export interface TicketActionResponse {
    ticket: TicketView;
    action: TicketAction;
    outcome: 'resolved' | 'held' | 'recorded';
    replayed: boolean;
    flagged: 'credit_over_limit' | 'repeat_refund' | null;
}
/** `data` of a 409 new_customer_message. `action` is null on POST /resolve. */
export interface TicketConflictData { ticket: TicketView; action: TicketAction | null }

export interface CategoriesResponse { items: Category[] }
export interface ActionItemsResponse { items: ActionItem[]; next_cursor: string | null }
export interface ActionItemResponse { item: ActionItem }
export interface DeskSettingsResponse {
    settings: DeskSettings;
    /** Stored strings of the keys that exist, for the settings form. */
    raw: Partial<Record<DeskSettingKey, string>>;
}

// ── GET /api/desk/stats ────────────────────────────────────────────────────
export interface StatsTiming { n: number; median_secs: number | null; p90_secs: number | null }
export interface StatsExec { actor_id: StaffId | null; actor_name: string | null }
/** One row of a breakdown. `key` is the id or slug; null = "not recorded". */
export interface StatsDim {
    key: string | null;
    label: string | null;
    n: number;
    refund_total: number;
    /** Complaints per 1,000 deliveries; null when the backend counts are unavailable for this row. */
    per_1000: number | null;
}
export interface RepeatComplainer {
    backend_user_id: number | null;
    customer_phone: string;
    customer_name: string | null;
    n: number;
    ticket_nos: number[];
}
export interface DeskStats {
    range: {
        from: IstDate;
        to: IstDate;
        queue: Queue | null;
        stats_from: IsoDateTime | null;
        /** true when a paged read stopped at its row cap; the numbers are then incomplete. */
        truncated: boolean;
        generated_at: IsoDateTime;
    };
    now: {
        awaiting: number;
        oldest_wait_secs: number | null;
        over_alert: number;
        open_over_24h: number;
        on_hold: number;
        oldest_hold_secs: number | null;
        unassigned: number;
        wrap_up_backlog: number;
    };
    volume: {
        opened: number;
        resolved: number;
        unclassified: number;
        by_day: Array<{ date: IstDate; opened: number; resolved: number }>;
        by_type: Record<TicketType, number>;
        by_queue: Record<Queue, number>;
        by_report_group: Record<ReportGroup, number>;
    };
    first_response: StatsTiming & {
        business_median_secs: number | null;
        /** Replies typed in the phone app (first_response_source = 'phone'). */
        unattributed: number;
        by_exec: Array<StatsExec & StatsTiming>;
    };
    resolution: StatsTiming & {
        /** Median of resolved_at − opened_at minus time spent in waiting_customer and on_hold. */
        net_median_secs: number | null;
        by_via: Record<ResolvedVia, number>;
        by_code: Record<ResolutionCode, number>;
        by_exec: Array<StatsExec & StatsTiming>;
    };
    quality: {
        reopen_rate: number | null;
        recontact_72h_rate: number | null;
        classified_pct: number | null;
        handled_in_desk_pct: number | null;
    };
    complaints: {
        total: number;
        deliveries: number | null;
        per_1000_deliveries: number | null;
        by_category: StatsDim[];
        by_group: StatsDim[];
        by_driver: StatsDim[];
        by_drop_point: StatsDim[];
        by_pincode: StatsDim[];
        by_product: StatsDim[];
        by_root_cause: StatsDim[];
    };
    refunds: {
        n: number;
        total: number;
        unverified_n: number;
        by_category: Array<{ category_slug: string | null; n: number; total: number }>;
        by_exec: Array<StatsExec & { n: number; total: number }>;
    };
    sales: {
        opened: number;
        won_paid: number;
        won_unpaid: number;
        lost: number;
        order_value_total: number;
        lost_by_reason: Record<LostReason, number>;
    };
    repeat_complainers: RepeatComplainer[];
}

// ── GET /api/desk/review ───────────────────────────────────────────────────
export interface ReviewCluster {
    key: string | null;
    label: string | null;
    n: number;
    ticket_nos: number[];
}
export interface DeskReview {
    window: { date: IstDate; from: IsoDateTime; to: IsoDateTime; truncated: boolean };
    /** 1 */
    carry_over: { open_over_24h: TicketListItem[]; on_hold: TicketListItem[]; action_items_due: ActionItem[] };
    /** 2 */
    complaints: Array<{
        category_slug: string;
        label: string;
        n: number;
        per_1000: number | null;
        refund_total: number;
        tickets: TicketListItem[];
    }>;
    /** 3 */
    clusters: {
        product_date: Array<ReviewCluster & { category_group: string | null; delivery_date: IstDate | null }>;
        driver: ReviewCluster[];
        drop_point: ReviewCluster[];
        repeat_complainers: RepeatComplainer[];
    };
    /** 4 */
    money: Array<{ action: TicketAction; ticket_no: number; customer_name: string | null; category_slug: string | null }>;
    /** 5 */
    sales: { opened: TicketListItem[]; won: TicketListItem[]; lost: TicketListItem[]; awaiting_payment: TicketListItem[] };
    /** 6 */
    sample: TicketListItem[];
    /** 7 */
    health: {
        orphans_repaired: number;
        acks_suppressed: Array<{ ticket_no: number; text: string; mode: 'shadow' | 'on'; at: IsoDateTime }>;
        resolved_over_unseen: TicketListItem[];
        unverified_actions: number;
        last_tick_at: IsoDateTime | null;
        tick_stale: boolean;
    };
}
