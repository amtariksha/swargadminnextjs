// AD/src/lib/desk/contracts.ts — one zod schema per request, and the envelope.
import { z } from 'zod';
import {
    ACK_SUPPRESS_MODES, CLASSIFICATION_SOURCES, CONTACT_FLAG_KINDS, CUSTOMER_MATCHES, DAY_ORDER_PAYMENT_STEPS,
    DAYTIME_PAYMENT_STATUSES, DEADLINE_RULES, DESK_VIA, ESCALATION_REASONS,
    EXEC_HOLD_REASONS, HUMAN_RESOLUTION_CODES, LINK_STATUSES, LIST_MAX_LIMIT, LOST_REASONS,
    MARK_PAID_MODES, MESSAGES_MAX_LIMIT, QUEUES, REPORT_GROUPS, ROOT_CAUSES,
    TICKET_STATUSES, TICKET_TYPES,
} from './constants';

// ── Envelope ───────────────────────────────────────────────────────────────
export const DESK_ERRORS = {
    validation_failed: 400,
    unauthorized: 401,
    forbidden: 403,
    ui_disabled: 403,
    money_not_allowed: 403,
    not_found: 404,
    new_customer_message: 409,
    ticket_resolved: 409,
    ticket_not_resolved: 409,
    duplicate_reference: 409,
    category_required: 422,
    resolution_code_required: 422,
    note_required: 422,
    lost_reason_required: 422,
    duplicate_target_required: 422,
    delivery_link_required: 422,
    follow_up_required: 422,
    action_cannot_resolve: 422,
    reference_mismatch: 422,
    assignee_invalid: 422,
    setting_locked: 422,
    category_type_locked: 422,
    range_too_large: 422,
    internal_error: 500,
    not_installed: 503,
    authz_unavailable: 503,
} as const;
export type DeskErrorCode = keyof typeof DESK_ERRORS;

export interface DeskOk<T> { ok: true; data: T }
/** `data` is present on a failure only for 409 new_customer_message. */
export interface DeskFail<C = undefined> { ok: false; error: { code: DeskErrorCode; message: string }; data?: C }
export type DeskEnvelope<T, C = undefined> = DeskOk<T> | DeskFail<C>;

// ── Primitives ─────────────────────────────────────────────────────────────
/** A timestamptz string. Stored and compared verbatim; never passed through Date. */
export const isoDateTime = z.iso.datetime({ offset: true });
export const istDate = z.iso.date();
export const slugSchema = z.string().regex(/^[a-z0-9_]{2,40}$/);
export const ticketIdSchema = z.uuid();
export const staffIdSchema = z.string().regex(/^[0-9]{1,12}$/);
/** A WhatsApp business number or a phone: digits only. */
export const numberSchema = z.string().regex(/^[0-9]{8,15}$/);
export const moneySchema = z.number().min(0).max(1_000_000);
export const noteSchema = z.string().trim().min(1).max(1000);
const limitSchema = z.coerce.number().int().min(1).max(LIST_MAX_LIMIT);
const cursorSchema = z.string().min(1).max(300);
const flag01 = z.enum(['0', '1']);
const positiveInt = z.number().int().positive();

/** The concurrency token of section 5: the ticket's last_inbound_at as the client rendered it. */
export const seenInboundAt = isoDateTime.nullable();

// ── GET /api/desk/tickets ──────────────────────────────────────────────────
export const TICKET_VIEWS = ['mine', 'unassigned', 'all', 'acks', 'wrap_up', 'list'] as const;
export type TicketListView = (typeof TICKET_VIEWS)[number];
export const ticketListQuery = z.strictObject({
    view: z.enum(TICKET_VIEWS),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    queue: z.enum(QUEUES).optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    type: z.enum(TICKET_TYPES).optional(),
    category_slug: slugSchema.optional(),
    assigned_to: staffIdSchema.optional(),
    backend_user_id: z.coerce.number().int().positive().optional(),
    conversation_id: z.uuid().optional(),
    ticket_no: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(2).max(60).optional(),
    from: istDate.optional(),
    to: istDate.optional(),
    with_counts: flag01.optional(),
});

// ── GET /api/desk/tickets/:id and /messages ────────────────────────────────
export const ticketParams = z.strictObject({ id: ticketIdSchema });
export const ticketMessagesQuery = z.strictObject({
    limit: z.coerce.number().int().min(1).max(MESSAGES_MAX_LIMIT),
    before: isoDateTime.optional(),
});

// ── POST /api/desk/tickets ─────────────────────────────────────────────────
export const ticketCreateBody = z.strictObject({
    channel: z.literal('whatsapp'),
    conversation_id: z.uuid(),
    category_slug: slugSchema.optional(),
});

// ── PATCH /api/desk/tickets/:id ────────────────────────────────────────────
const customerSnapshotFields = {
    backend_user_id: positiveInt.nullable(),
    customer_match: z.enum(CUSTOMER_MATCHES),
    customer_name: z.string().trim().max(250).nullable(),
    address_id: positiveInt.nullable(),
    apartment_name: z.string().trim().max(250).nullable(),
    flat_no: z.string().trim().max(250).nullable(),
    area: z.string().trim().max(250).nullable(),
    pincode: z.string().trim().max(20).nullable(),
    driver_user_id: positiveInt.nullable(),
    driver_name: z.string().trim().max(250).nullable(),
    drop_point_id: positiveInt.nullable(),
    drop_point_name: z.string().trim().max(250).nullable(),
};
const oneToThree = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const deliveryLinkFields = {
    link_status: z.enum(LINK_STATUSES),
    order_id: positiveInt.nullable(),
    daytime_order_id: positiveInt.nullable(),
    product_id: positiveInt.nullable(),
    product_name: z.string().trim().max(250).nullable(),
    delivery_date: istDate.nullable(),
    /** app_db delivery.status: 1 pending, 2 not delivered, 3 delivered. */
    delivery_status: oneToThree.nullable(),
    delivered_at: isoDateTime.nullable(),
    driver_user_id: positiveInt.nullable(),
    driver_name: z.string().trim().max(250).nullable(),
};
export const ticketPatchBody = z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('assign'), assigned_to: staffIdSchema.nullable() }),
    z.strictObject({
        op: z.literal('classify'),
        category_slug: slugSchema,
        classification_source: z.enum(CLASSIFICATION_SOURCES),
    }),
    z.strictObject({
        op: z.literal('hold'),
        hold_reason: z.enum(EXEC_HOLD_REASONS),
        follow_up_at: isoDateTime,
        note: noteSchema.optional(),
    }),
    z.strictObject({ op: z.literal('release_hold') }),
    z.strictObject({ op: z.literal('customer_snapshot'), ...customerSnapshotFields }),
    z.strictObject({ op: z.literal('link_delivery'), ...deliveryLinkFields }),
    z.strictObject({
        op: z.literal('escalate'),
        escalation_reason: z.enum(ESCALATION_REASONS),
        note: noteSchema.optional(),
    }),
    z.strictObject({
        op: z.literal('wrap_up'),
        category_slug: slugSchema,
        resolution_code: z.enum(HUMAN_RESOLUTION_CODES),
        resolution_note: noteSchema.optional(),
        lost_reason: z.enum(LOST_REASONS).optional(),
    }),
    z.strictObject({
        op: z.literal('review'),
        root_cause: z.enum(ROOT_CAUSES).nullable().optional(),
        preventive_action: z.string().trim().max(1000).nullable().optional(),
        review_note: z.string().trim().max(1000).nullable().optional(),
        reviewed: z.boolean(),
    }),
]);
export type TicketPatchBody = z.infer<typeof ticketPatchBody>;

// ── POST /api/desk/tickets/:id/resolve ─────────────────────────────────────
export const ticketResolveBody = z.strictObject({
    seen_inbound_at: seenInboundAt,
    category_slug: slugSchema.optional(),
    classification_source: z.enum(CLASSIFICATION_SOURCES).optional(),
    resolution_code: z.enum(HUMAN_RESOLUTION_CODES).optional(),
    resolution_note: noteSchema.optional(),
    lost_reason: z.enum(LOST_REASONS).optional(),
    duplicate_of_ticket_no: positiveInt.optional(),
    /** Lets one call satisfy requires_delivery_link when no delivery matches. */
    link_status: z.enum(['none_found', 'not_a_customer']).optional(),
});
export type TicketResolveBody = z.infer<typeof ticketResolveBody>;

// ── POST /api/desk/tickets/:id/actions ─────────────────────────────────────
const refId = z.string().min(1).max(160);
const actionBase = {
    client_action_id: z.uuid(),
    seen_inbound_at: seenInboundAt,
    /** The exec's intent. Must be false for action types that never resolve. */
    resolve: z.boolean(),
    category_slug: slugSchema.optional(),
    classification_source: z.enum(CLASSIFICATION_SOURCES).optional(),
    resolution_code: z.enum(HUMAN_RESOLUTION_CODES).optional(),
    resolution_note: noteSchema.optional(),
};
const followUp = z.strictObject({ follow_up_at: isoDateTime });
const oneToFour = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const ticketActionBody = z.discriminatedUnion('action_type', [
    z.strictObject({
        ...actionBase,
        action_type: z.literal('refund'),
        ref_type: z.literal('transaction'),
        ref_id: refId,
        amount: moneySchema,
        data: z.strictObject({
            debit_txn_id: positiveInt,
            order_id: positiveInt.nullable(),
            delivery_date: istDate.nullable(),
            refund_reason: z.string().trim().min(1).max(250),
            billed_to_driver: z.boolean(),
            billed_driver_id: positiveInt.nullable(),
            driver_deduction_amount: moneySchema.nullable(),
            new_wallet_balance: z.number().nullable(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('wallet_credit'),
        ref_type: z.literal('transaction'),
        ref_id: refId,
        amount: moneySchema,
        data: z.strictObject({
            user_id: positiveInt,
            description: z.string().trim().min(1).max(250),
            payment_id: z.string().regex(/^desk-[0-9a-f-]{36}$/),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('holiday_added'),
        ref_type: z.literal('holiday'),
        ref_id: refId,
        amount: z.null(),
        data: z.strictObject({ user_id: positiveInt, from: istDate, to: istDate }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('day_order_created'),
        ref_type: z.literal('daytime_order'),
        ref_id: refId,
        amount: moneySchema,
        data: z.strictObject({
            daytime_order_id: positiveInt,
            delivery_date: istDate,
            payment_step: z.enum(DAY_ORDER_PAYMENT_STEPS),
            payment_status: z.enum(DAYTIME_PAYMENT_STATUSES),
            payment_mode: z.enum([...MARK_PAID_MODES, 'link']).nullable(),
            payment_link_id: z.string().max(80).nullable(),
            new_customer: z.boolean(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('app_order_created'),
        ref_type: z.literal('order'),
        ref_id: refId,
        amount: moneySchema,
        data: z.strictObject({
            order_id: positiveInt,
            product_id: positiveInt,
            subscription_type: oneToFour.nullable(),
            start_date: istDate.nullable(),
            affects_tomorrow: z.boolean(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('subscription_updated'),
        ref_type: z.literal('order_update'),
        ref_id: refId,
        amount: z.null(),
        data: z.strictObject({
            order_id: positiveInt,
            changes: z.array(z.string().max(40)).min(1).max(20),
            affects_tomorrow: z.boolean(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('replacement_promised'),
        ref_type: z.literal('promise'),
        ref_id: refId,
        amount: z.null(),
        hold: followUp,
        data: z.strictObject({
            promised_date: istDate,
            note: noteSchema,
            product_name: z.string().trim().max(250).nullable(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('delivery_marked_not_delivered'),
        ref_type: z.literal('delivery'),
        ref_id: refId,
        amount: z.null(),
        data: z.strictObject({
            delivery_id: positiveInt,
            order_id: positiveInt.nullable(),
            delivery_date: istDate,
            reason_category: oneToFour,
            reason: z.string().trim().max(250).nullable(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('customer_linked'),
        ref_type: z.literal('alternate_phone'),
        ref_id: refId,
        amount: z.null(),
        data: z.strictObject({
            user_id: positiveInt,
            phone: numberSchema,
            alternate_phone_id: positiveInt.nullable(),
            already_linked: z.boolean(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('payment_link_sent'),
        ref_type: z.literal('payment_link'),
        ref_id: refId,
        amount: moneySchema.nullable(),
        data: z.strictObject({
            daytime_order_id: positiveInt,
            short_url: z.url().max(300),
            whatsapp_sent: z.boolean(),
        }),
    }),
    z.strictObject({
        ...actionBase,
        action_type: z.literal('app_link_sent'),
        ref_type: z.literal('message'),
        ref_id: refId,
        amount: z.null(),
        hold: followUp.optional(),
        data: z.strictObject({ message_id: z.uuid() }),
    }),
]);
export type TicketActionBody = z.infer<typeof ticketActionBody>;

// ── Categories ─────────────────────────────────────────────────────────────
export const categoriesQuery = z.strictObject({ all: flag01.optional() });
export const categoryInput = z.strictObject({
    slug: slugSchema,
    type: z.enum(TICKET_TYPES),
    label: z.string().trim().min(1).max(80),
    queue: z.enum(QUEUES),
    report_group: z.enum(REPORT_GROUPS),
    category_group: slugSchema.nullable(),
    priority: z.number().int().min(1).max(4),
    default_resolution_code: z.enum(HUMAN_RESOLUTION_CODES).nullable(),
    refund_reason_label: z.string().trim().max(120).nullable(),
    requires_delivery_link: z.boolean(),
    deadline_rule: z.enum(DEADLINE_RULES).nullable(),
    keywords: z.array(z.string().trim().min(2).max(40)).max(40),
    playbook_md: z.string().max(8000).nullable(),
    active: z.boolean(),
    sort_order: z.number().int().min(0).max(9999),
});
export const categoriesPutBody = z.strictObject({ categories: z.array(categoryInput).min(1).max(100) });

// ── Stats and review ───────────────────────────────────────────────────────
export const statsQuery = z.strictObject({ from: istDate, to: istDate, queue: z.enum(QUEUES).optional() });
export const reviewQuery = z.strictObject({ date: istDate.optional() });

// ── Action items ───────────────────────────────────────────────────────────
export const ACTION_ITEM_STATUSES = ['open', 'done', 'dropped'] as const;
export const actionItemsQuery = z.strictObject({
    limit: limitSchema,
    cursor: cursorSchema.optional(),
    status: z.enum(ACTION_ITEM_STATUSES).optional(),
    ticket_id: ticketIdSchema.optional(),
});
export const actionItemCreateBody = z.strictObject({
    title: z.string().trim().min(3).max(200),
    detail: z.string().trim().max(2000).nullable().optional(),
    ticket_id: ticketIdSchema.nullable().optional(),
    owner_id: staffIdSchema.nullable().optional(),
    due_date: istDate.nullable().optional(),
    review_date: istDate.optional(),
    data: z.record(z.string(), z.unknown()).optional(),
});
export const actionItemPatchBody = z.strictObject({
    id: positiveInt,
    title: z.string().trim().min(3).max(200).optional(),
    detail: z.string().trim().max(2000).nullable().optional(),
    owner_id: staffIdSchema.nullable().optional(),
    due_date: istDate.nullable().optional(),
    status: z.enum(ACTION_ITEM_STATUSES).optional(),
    done_note: z.string().trim().max(1000).nullable().optional(),
});

// ── Settings ───────────────────────────────────────────────────────────────
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
export const businessHoursSchema = z.strictObject({
    start: hhmm,
    end: hhmm,
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});
export const numberQueuesSchema = z.record(numberSchema, z.enum(QUEUES));
export const settingsPutBody = z.strictObject({
    desk_engine_enabled: z.boolean(),
    desk_inline_hooks: z.boolean(),
    desk_ui_enabled: z.boolean(),
    desk_cutover_redirect: z.boolean(),
    desk_ack_suppress: z.enum(ACK_SUPPRESS_MODES),
    desk_go_live_at: isoDateTime,
    desk_stats_from: isoDateTime,
    desk_reopen_window_hours: z.number().int().min(1).max(72),
    desk_idle_close_hours: z.number().int().min(1).max(168),
    desk_ack_autoclose_hours: z.number().int().min(1).max(48),
    desk_reply_alert_mins: z.number().int().min(1).max(240),
    desk_number_queues: numberQueuesSchema,
    desk_business_hours: businessHoursSchema,
    desk_credit_max_agent: z.number().int().min(0).max(5000),
}).partial().refine((o) => Object.keys(o).length > 0, { message: 'send at least one key' });
export type SettingsPutBody = z.infer<typeof settingsPutBody>;

// ── Backend responses that AD parses on the server ─────────────────────────
/** data of GET /api/support/whoami. */
export const whoamiData = z.object({
    user: z.object({
        id: z.union([z.string(), z.number()]).transform((v) => String(v)),
        name: z.string().nullable(),
    }),
    agent: z.boolean(),
    manager: z.boolean(),
    money: z.boolean(),
    inbox: z.boolean(),
    via: z.enum(DESK_VIA),
});
/** The backend envelope, as far as AD needs it. */
export const backendEnvelope = <T extends z.ZodType>(data: T) =>
    z.object({ response: z.number(), status: z.boolean().optional(), message: z.string().optional(), data });

// ── Slice 2 · P1e: tick body and internal contacts ─────────────────────────
/** Body of POST /api/agent-tools/desk/tick. Not strict: unknown keys are ignored. */
export const tickBody = z.object({
    staff_phones: z.array(z.string().regex(/^[0-9]{10}$/)).max(5000).optional(),
});
const flagLabel = z.string().trim().min(1).max(80);
export const contactFlagsQuery = z.strictObject({
    kind: z.enum(CONTACT_FLAG_KINDS).optional(),
    /** Manager only. */
    include_removed: z.literal('1').optional(),
    limit: limitSchema,
});
export const contactFlagCreateBody = z.strictObject({
    phone: numberSchema,
    kind: z.enum(CONTACT_FLAG_KINDS),
    label: flagLabel.optional(),
});
export const contactFlagPatchBody = z.strictObject({
    id: positiveInt,
    removed: z.literal(true),
    label: flagLabel.optional(),
});
export const internalConversationsQuery = z.strictObject({ limit: limitSchema });
// Slice 2 · P1e
