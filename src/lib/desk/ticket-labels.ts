// Display texts for the Desk vocabularies. Each map is a Record over its union: a missing label fails tsc.

import type {
    ActionType, EventType, HoldReason, HumanResolutionCode, LostReason, ResolutionCode,
    TicketStatus, TicketType,
} from './constants';
import type { DeskErrorCode } from './contracts';
import type { ResolveMissing } from './resolve-plan';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
    new: 'New',
    open: 'Open',
    waiting_customer: 'Waiting for customer',
    on_hold: 'On hold',
    resolved: 'Resolved',
};

export const RESOLUTION_CODE_LABEL: Record<ResolutionCode, string> = {
    refunded: 'Refunded',
    credit_given: 'Credit given',
    replacement_promised: 'Replacement promised',
    explained: 'Explained',
    not_valid: 'Not valid',
    won: 'Won',
    lost: 'Lost',
    done: 'Done',
    not_possible: 'Not possible',
    answered: 'Answered',
    no_action: 'No action needed',
    duplicate: 'Duplicate',
    no_response: 'No response',
    spam: 'Spam',
    closed_unclassified: 'Closed (unclassified)',
};

export const HOLD_REASON_LABEL: Record<HoldReason, string> = {
    replacement_promised: 'Replacement promised',
    verify_delivery: 'Verify delivery',
    app_link_sent: 'App link sent',
    needs_approval: 'Needs approval',
    checking_internally: 'Checking internally',
    callback_scheduled: 'Callback scheduled',
    customer_to_confirm: 'Customer to confirm',
    other: 'Other',
};

export const LOST_REASON_LABEL: Record<LostReason, string> = {
    price: 'Price',
    area_not_served: 'Area not served',
    product_unavailable: 'Product unavailable',
    timing_not_suitable: 'Timing not suitable',
    chose_competitor: 'Chose a competitor',
    not_interested: 'Not interested',
    no_response: 'No response',
    other: 'Other',
};

export const EVENT_TITLE: Record<EventType, string> = {
    created: 'Ticket created',
    reopened: 'Reopened',
    status_changed: 'Status changed',
    assigned: 'Assigned',
    suggested: 'Category suggested',
    classified: 'Classified',
    customer_matched: 'Customer matched',
    delivery_linked: 'Delivery linked',
    first_response: 'First reply',
    held: 'Put on hold',
    follow_up_due: 'Follow-up due',
    resolved: 'Resolved',
    resolve_conflict: 'Resolve refused',
    resolution_updated: 'Resolution updated',
    ack_would_suppress: 'Ack would be suppressed (shadow)',
    ack_suppressed: 'Ack suppressed',
    missing_message_flagged: 'Message may be missing',
    escalated: 'Escalated',
    duplicate_marked: 'Marked as duplicate',
    lead_updated: 'Lead updated',
    reviewed: 'Reviewed',
    cutoff_alerted: 'Cutoff alert',
    auto_internal: 'Closed: internal contact',
};

export const ACTION_TITLE: Record<ActionType, string> = {
    refund: 'Refund',
    wallet_credit: 'Wallet credit',
    holiday_added: 'Holiday added',
    day_order_created: 'Day order created',
    app_order_created: 'App order created',
    subscription_updated: 'Subscription updated',
    replacement_promised: 'Replacement promised',
    delivery_marked_not_delivered: 'Marked not delivered',
    customer_linked: 'Customer linked',
    payment_link_sent: 'Payment link sent',
    app_link_sent: 'App link sent',
};

/** Presentation only: listed first in the resolution select; every human code stays selectable. */
export const USUAL_CODES_BY_TYPE: Record<TicketType, readonly HumanResolutionCode[]> = {
    complaint: ['explained', 'not_valid', 'no_action', 'no_response'],
    sales: ['won', 'lost', 'no_response'],
    request: ['done', 'not_possible', 'no_response'],
    enquiry: ['answered', 'no_response'],
    other: ['no_action', 'spam'],
};

const ERROR_TEXT: Partial<Record<DeskErrorCode, string>> = {
    category_required: 'Pick a category first.',
    resolution_code_required: 'Choose a resolution.',
    note_required: 'This needs a note.',
    lost_reason_required: 'Choose why the sale was lost.',
    duplicate_target_required: 'Enter the number of the ticket this one duplicates.',
    delivery_link_required: 'Say whether a delivery matches.',
    follow_up_required: 'The follow-up time must be in the future.',
    ticket_resolved: 'This ticket is already resolved.',
    ticket_not_resolved: 'This ticket was reopened. Resolve it instead.',
    assignee_invalid: 'That person cannot be assigned tickets.',
    range_too_large: 'Choose a range of at most 92 days.',
    not_found: 'Not found.',
    unauthorized: 'Your session has expired. Sign in again.',
    forbidden: 'You do not have access to Desk.',
    ui_disabled: 'Desk is switched off.',
    not_installed: 'Desk is not installed on this database yet.',
    authz_unavailable: 'Cannot check your access right now. Retrying.',
};

export function deskErrorText(code: DeskErrorCode, fallback: string): string {
    return ERROR_TEXT[code] ?? fallback;
}

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
    complaint: 'Complaint',
    sales: 'Sales',
    request: 'Request',
    enquiry: 'Enquiry',
    other: 'Other',
};

const MISSING_ERROR_CODE: Record<ResolveMissing, DeskErrorCode> = {
    category: 'category_required',
    resolution_code: 'resolution_code_required',
    note: 'note_required',
    lost_reason: 'lost_reason_required',
    duplicate_target: 'duplicate_target_required',
    delivery_link: 'delivery_link_required',
};

/** The sentence for the first unmet resolve rule: the same text the server's 422 would give. */
export function resolveMissingText(missing: ResolveMissing): string {
    return deskErrorText(MISSING_ERROR_CODE[missing], 'Complete the form.');
}
