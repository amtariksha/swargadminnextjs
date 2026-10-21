// Pure helpers of the customer pane: which ticket write a snapshot implies, which delivery to
// suggest, which backend actions are not yet recorded on the ticket (blueprint D6), and labels.
// No React, no window, no clock: callers pass every input.

import { DAYTIME_DELIVERY_STATUS_CODE, type HumanResolutionCode } from './constants';
import type { TicketPatchBody } from './contracts';
import { addIstDays, istDateOf, naiveIstToIso } from './business-hours';
import { initialResolveDraft, type ResolveDraft } from './resolve-plan';
import { formatIstDateTime } from './ticket-format';
import type {
    Category, CustomerSnapshot, DeskMe, SnapshotDayOrder, SnapshotDelivery, SnapshotRecentAction,
    Ticket, TicketAction, TicketActionResponse,
} from './types';

export const SNAPSHOT_STALE_MS = 60_000;
export const SUGGESTION_WINDOW_DAYS = 3;
export const DELIVERIES_SHOWN = 7;

export type CustomerSnapshotPatch = Extract<TicketPatchBody, { op: 'customer_snapshot' }>;
export type DeliveryLinkPatch = Extract<TicketPatchBody, { op: 'link_delivery' }>;

// ── Request and retry ──────────────────────────────────────────────────────
/** The ticket phone when it can be looked up (8–15 digits after stripping), else null. */
export function snapshotPhone(customerPhone: string | null): string | null {
    const digits = (customerPhone ?? '').replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** One retry for a network failure or a 5xx; none for 4xx (a 429 retried would only burn the limit). */
export function snapshotRetry(failureCount: number, error: unknown): boolean {
    if (failureCount >= 1) return false;
    const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
    return typeof status === 'number' && (status === 0 || status >= 500);
}

const ERROR_TEXT: Record<string, string> = {
    not_deployed: 'Customer details are not available yet: the backend has not been updated.',
    rate_limited: 'Too many customer lookups. Wait a minute, then press Retry.',
    forbidden: 'You do not have access to customer details.',
    unauthorized: 'Your session has expired. Sign in again.',
    network: 'Cannot reach the backend. Press Retry.',
    user_not_in_matches: 'That account does not match this number.',
    validation_failed: 'This number cannot be looked up.',
};
const NO_RETRY = new Set(['forbidden', 'unauthorized', 'not_deployed', 'validation_failed']);

export function snapshotErrorText(code: string): { text: string; retry: boolean } {
    return { text: ERROR_TEXT[code] ?? 'Customer details could not be loaded.', retry: !NO_RETRY.has(code) };
}

// ── Writes the pane makes through PATCH /api/desk/tickets/:id ──────────────
function cut(value: string | null | undefined, max: number): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed.slice(0, max);
}
function positive(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

type MatchTicket = Pick<Ticket, 'status' | 'backend_user_id' | 'customer_match' | 'customer_name'>;

/**
 * op=customer_snapshot when an exact or alternate match differs from the ticket (user or match kind).
 * Never on a resolved ticket (its snapshot is history) and never over a human link (customer_match 'manual').
 */
export function snapshotMatchPatch(ticket: MatchTicket, snapshot: CustomerSnapshot): CustomerSnapshotPatch | null {
    const kind = snapshot.match.kind;
    const profile = snapshot.profile;
    if (ticket.status === 'resolved' || ticket.customer_match === 'manual') return null;
    if (kind !== 'exact' && kind !== 'alternate') return null;
    if (profile === null || profile.user_id !== snapshot.match.user_id || positive(profile.user_id) === null) return null;
    if (ticket.backend_user_id === profile.user_id && ticket.customer_match === kind) return null;
    const { address, driver, drop_point: dropPoint } = snapshot;
    return {
        op: 'customer_snapshot',
        backend_user_id: profile.user_id,
        customer_match: kind,
        customer_name: cut(profile.name, 250) ?? cut(ticket.customer_name, 250),
        address_id: positive(address?.address_id),
        apartment_name: cut(address?.apartment_name, 250),
        flat_no: cut(address?.flat_no, 250),
        area: cut(address?.area, 250),
        pincode: cut(address?.pincode, 20),
        driver_user_id: positive(driver?.user_id),
        driver_name: cut(driver?.name, 250),
        drop_point_id: positive(dropPoint?.id),
        drop_point_name: cut(dropPoint?.title, 250),
    };
}

export function deliveryLinkBody(delivery: SnapshotDelivery): DeliveryLinkPatch {
    return {
        op: 'link_delivery',
        link_status: 'linked',
        order_id: positive(delivery.order_id),
        daytime_order_id: null,
        product_id: positive(delivery.product_id),
        product_name: cut(delivery.product_title, 250),
        delivery_date: delivery.delivery_date,
        delivery_status: delivery.status,
        delivered_at: delivery.tap_time === null ? null : naiveIstToIso(delivery.tap_time),
        driver_user_id: positive(delivery.driver_user_id),
        driver_name: cut(delivery.driver_name, 250),
    };
}

export function dayOrderLinkBody(order: SnapshotDayOrder): DeliveryLinkPatch {
    return {
        op: 'link_delivery',
        link_status: 'linked',
        order_id: null,
        daytime_order_id: positive(order.id),
        product_id: null,
        product_name: cut(order.items_text, 250),
        delivery_date: order.delivery_date,
        delivery_status: order.delivery_status === null ? null : DAYTIME_DELIVERY_STATUS_CODE[order.delivery_status],
        delivered_at: order.delivered_at === null ? null : naiveIstToIso(order.delivered_at),
        driver_user_id: null,
        driver_name: null,
    };
}

type LinkTicket = Pick<Ticket, 'link_status' | 'order_id' | 'daytime_order_id' | 'delivery_date' | 'product_id'>;

export function isLinkedDelivery(ticket: LinkTicket, delivery: SnapshotDelivery): boolean {
    return ticket.link_status === 'linked' && ticket.order_id === delivery.order_id
        && ticket.delivery_date === delivery.delivery_date
        && (ticket.product_id === null || ticket.product_id === delivery.product_id);
}

export function isLinkedDayOrder(ticket: LinkTicket, order: SnapshotDayOrder): boolean {
    return ticket.link_status === 'linked' && ticket.daytime_order_id === order.id;
}

// ── Suggested delivery (blueprint §7: an editable chip the exec confirms) ───
const PREFER_NOT_DELIVERED: readonly string[] = ['not_delivered'];
const PREFER_LATE: readonly string[] = ['late_delivery', 'cancelled_due_to_late'];

function preferred(slug: string, delivery: SnapshotDelivery): boolean {
    if (PREFER_NOT_DELIVERED.includes(slug)) return delivery.status !== 3;
    if (PREFER_LATE.includes(slug)) return delivery.status === 3 && (delivery.late_by_min ?? 0) > 0;
    return delivery.status === 3;
}

function newest(rows: readonly SnapshotDelivery[]): SnapshotDelivery | null {
    let best: SnapshotDelivery | null = null;
    for (const row of rows) {
        if (best === null || row.delivery_date > best.delivery_date
            || (row.delivery_date === best.delivery_date && row.delivery_id > best.delivery_id)) best = row;
    }
    return best;
}

type SuggestTicket = Pick<Ticket, 'opened_at' | 'link_status'>;

/** The delivery a delivery-type complaint most likely refers to; null when nothing fits or a link exists. */
export function suggestDelivery(
    ticket: SuggestTicket,
    category: Pick<Category, 'slug' | 'requires_delivery_link'> | null,
    deliveries: readonly SnapshotDelivery[],
): SnapshotDelivery | null {
    if (ticket.link_status !== null || category === null || !category.requires_delivery_link) return null;
    if (Number.isNaN(Date.parse(ticket.opened_at))) return null;
    const last = istDateOf(ticket.opened_at);
    const first = addIstDays(last, -SUGGESTION_WINDOW_DAYS);
    const inWindow = deliveries.filter((row) => row.delivery_date >= first && row.delivery_date <= last);
    const best = inWindow.filter((row) => preferred(category.slug, row));
    return newest(best.length > 0 ? best : inWindow);
}

// ── D6 backstop: backend actions that no Desk action on this ticket records ─
const HOLIDAY_REF = /^user:(\d+):(\d{4}-\d{2}-\d{2})$/;

export function isRecentActionRecorded(recent: SnapshotRecentAction, actions: readonly TicketAction[]): boolean {
    switch (recent.kind) {
        case 'refund':
        case 'wallet_credit':
            return actions.some((action) => action.ref_type === 'transaction' && action.ref_id === recent.ref_id);
        case 'app_order':
            return actions.some((action) => action.ref_type === 'order' && action.ref_id === recent.ref_id);
        case 'day_order':
            return actions.some((action) => action.ref_type === 'daytime_order' && action.ref_id === recent.ref_id);
        case 'holiday': {
            const match = HOLIDAY_REF.exec(recent.ref_id);
            if (match === null) return false;
            const userId = Number(match[1]);
            const day = match[2];
            return actions.some((action) => action.action_type === 'holiday_added'
                && action.data.user_id === userId && action.data.from <= day && day <= action.data.to);
        }
    }
}

/** Recent backend actions taken at or after the ticket opened that this ticket does not record. */
export function unmatchedRecentActions(
    recent: readonly SnapshotRecentAction[],
    actions: readonly TicketAction[],
    openedAt: string,
): SnapshotRecentAction[] {
    // Backend times have whole seconds; compare at that precision.
    const openedMs = Math.floor(Date.parse(openedAt) / 1000) * 1000;
    return recent.filter((row) => {
        const iso = naiveIstToIso(row.at);
        const atMs = iso === null ? Number.NaN : Date.parse(iso);
        const before = Number.isFinite(atMs) && Number.isFinite(openedMs) && atMs < openedMs;
        return !before && !isRecentActionRecorded(row, actions);
    });
}

const BACKSTOP_CODE: Record<SnapshotRecentAction['kind'], HumanResolutionCode> = {
    refund: 'refunded', wallet_credit: 'credit_given', app_order: 'won', day_order: 'won', holiday: 'done',
};

type DraftTicket = Pick<Ticket, 'ticket_no' | 'category_slug' | 'suggested_category' | 'link_status'>;
type DraftCategory = Pick<Category, 'slug' | 'type' | 'default_resolution_code' | 'requires_delivery_link'>;

/** The resolve dialog's starting point for "resolve with this backend action". */
export function backstopDraft(recent: SnapshotRecentAction, ticket: DraftTicket, category: DraftCategory | null): ResolveDraft {
    const code = recent.kind === 'app_order' && category?.type === 'request' ? 'done' : BACKSTOP_CODE[recent.kind];
    return {
        ...initialResolveDraft(ticket, category),
        resolution_code: code,
        resolution_note: `Done outside Desk: ${recent.summary}`.trim().slice(0, 1000),
    };
}

// ── Candidates and action slots ────────────────────────────────────────────
/** The account to show for a 'candidates' match: the ticket's own user when it is one of them. */
export function autoCandidateId(ticket: Pick<Ticket, 'backend_user_id'>, snapshot: CustomerSnapshot): number | null {
    if (snapshot.match.kind !== 'candidates' || ticket.backend_user_id === null) return null;
    return snapshot.match.candidates.some((c) => c.user_id === ticket.backend_user_id) ? ticket.backend_user_id : null;
}

/** Rule R-4A2: every money and ops action needs money:true; the app slot decides per button. */
export function slotRights(me: Pick<DeskMe, 'money'>): { money: boolean; ops: boolean; app: boolean } {
    return { money: me.money, ops: me.money, app: true };
}

// ── Toast texts after POST /actions ────────────────────────────────────────
export function actionOutcomeText(response: TicketActionResponse): string {
    const no = response.ticket.ticket_no;
    if (response.replayed) return `Already recorded on ticket #${no}.`;
    if (response.outcome === 'resolved') return `Recorded. Ticket #${no} resolved.`;
    if (response.outcome === 'held') {
        return `Recorded. Ticket #${no} is on hold until ${formatIstDateTime(response.ticket.follow_up_at)}.`;
    }
    return `Recorded on ticket #${no}.`;
}

export function flaggedText(flag: TicketActionResponse['flagged']): string | null {
    if (flag === 'credit_over_limit') return 'Above your credit limit: a manager must review this ticket.';
    if (flag === 'repeat_refund') return 'Second refund or credit for this customer within 30 days: a manager must review this ticket.';
    return null;
}

export const ACTION_CONFLICT_TEXT = 'Recorded, but the customer wrote again. Read the new message before you resolve.';

// ── Labels ─────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '17 Oct'. The input is already an IST date. */
export function dayLabel(date: string): string {
    const [, month, day] = date.split('-');
    const name = MONTHS[Number(month) - 1];
    return name === undefined || day === undefined ? date : `${Number(day)} ${name}`;
}

/** IST wall clock 'YYYY-MM-DD HH:mm:ss' → '17 Oct 07:42'; '—' for null or a malformed value. */
export function naiveLabel(naive: string | null): string {
    if (naive === null || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(naive)) return '—';
    return `${dayLabel(naive.slice(0, 10))} ${naive.slice(11, 16)}`;
}

export function rupees(amount: number | null): string {
    if (amount === null) return '—';
    return `₹${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

export function distanceLabel(metres: number | null): string | null {
    if (metres === null) return null;
    return metres < 1000 ? `${Math.round(metres)} m from the address` : `${(metres / 1000).toFixed(1)} km from the address`;
}

export const DELIVERY_STATUS_TEXT: Record<1 | 2 | 3, string> = { 1: 'Pending', 2: 'Not delivered', 3: 'Delivered' };
export const CADENCE_TEXT: Record<1 | 2 | 3 | 4, string> = { 1: 'One time', 2: 'Custom days', 3: 'Daily', 4: 'Alternate days' };
export const REASON_CATEGORY_TEXT: Record<1 | 2 | 3 | 4, string> = {
    1: 'Delivery boy', 2: 'Customer care', 3: 'Packaging', 4: 'Driver',
};
const ORDER_TYPE_TEXT: Record<number, string> = { 1: 'Prepaid', 2: 'Postpaid', 3: 'Pay now', 4: 'Pay later' };

export function orderTypeText(orderType: number | null): string | null {
    return orderType === null ? null : ORDER_TYPE_TEXT[orderType] ?? null;
}

/** 'Tapped 07:42 · usual 07:10 · late by 32 min' from the evidence fields; null when there is none. */
export function tapEvidence(delivery: SnapshotDelivery): string | null {
    const parts: string[] = [];
    if (delivery.tap_time !== null) parts.push(`Tapped ${delivery.tap_time.slice(11, 16)}`);
    if (delivery.usual_time !== null) parts.push(`usual ${delivery.usual_time}`);
    if (delivery.late_by_min !== null && delivery.late_by_min > 0) parts.push(`late by ${Math.round(delivery.late_by_min)} min`);
    if (delivery.marked_by === 'admin') parts.push('marked by admin');
    return parts.length === 0 ? null : parts.join(' · ');
}
