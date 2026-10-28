// Pure helpers for the P4b actions (contract §2.1–2.3). No React, no window, no clock: "now" is an argument.

import type { ClassificationSource, MarkPaidMode, TicketType } from './constants';
import type { TicketActionBody } from './contracts';
import { isIstDate } from './business-hours';
import { DeskClientError } from './desk-query';
import { classificationSourceFor } from './resolve-plan';
import { istIsoAfter } from './ticket-format';
import { deskErrorText } from './ticket-labels';
import type {
    ActionDataMap, Category, CustomerSnapshot, SnapshotCandidate, SnapshotDayOrder, SnapshotDelivery,
    SnapshotRecentAction, Ticket, TicketAction, TicketEvent,
} from './types';

export type ActionBodyOf<K extends TicketActionBody['action_type']> = Extract<TicketActionBody, { action_type: K }>;
export interface OpsCommon { client_action_id: string; seen_inbound_at: string | null }
export interface ResolveFragment { resolve: boolean; category_slug?: string; classification_source?: ClassificationSource }
export type DayOrderStep = Pick<ActionDataMap['day_order_created'], 'payment_step' | 'payment_status' | 'payment_mode' | 'payment_link_id'>;
export type PaymentChoice =
    | { kind: 'link_sent'; paymentLinkId: string }
    | { kind: 'marked_paid'; mode: MarkPaidMode }
    | { kind: 'collect_on_delivery' };
/** Structurally equal to CustomerValue of CustomerPicker.tsx (kept local: this file imports no component). */
export interface PresetCustomer { userId: number | null; name: string; phone: string; isNew: boolean }

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function paymentStepFor(choice: PaymentChoice): DayOrderStep {
    if (choice.kind === 'link_sent') {
        return { payment_step: 'link_sent', payment_status: 'link_sent', payment_mode: 'link', payment_link_id: choice.paymentLinkId };
    }
    if (choice.kind === 'marked_paid') {
        const status = choice.mode === 'cash' ? 'cash' : choice.mode === 'upi' ? 'paid' : 'wallet_deducted';
        return { payment_step: 'marked_paid', payment_status: status, payment_mode: choice.mode, payment_link_id: null };
    }
    return { payment_step: 'collect_on_delivery', payment_status: 'unpaid', payment_mode: null, payment_link_id: null };
}

export function buildDayOrderBody(common: OpsCommon, fragment: ResolveFragment, input: {
    orderId: number; total: number; deliveryDate: string; step: DayOrderStep; newCustomer: boolean;
}): ActionBodyOf<'day_order_created'> {
    return {
        ...common, ...fragment,
        action_type: 'day_order_created', ref_type: 'daytime_order', ref_id: String(input.orderId),
        amount: round2(input.total),
        data: {
            daytime_order_id: input.orderId, delivery_date: input.deliveryDate,
            payment_step: input.step.payment_step, payment_status: input.step.payment_status,
            payment_mode: input.step.payment_mode, payment_link_id: input.step.payment_link_id,
            new_customer: input.newCustomer,
        },
    };
}

export function buildHolidayBody(common: OpsCommon, fragment: ResolveFragment, input: {
    userId: number; from: string; to: string;
}): ActionBodyOf<'holiday_added'> {
    return {
        ...common, ...fragment,
        action_type: 'holiday_added', ref_type: 'holiday', ref_id: `user:${input.userId}:${input.from}..${input.to}`,
        amount: null,
        data: { user_id: input.userId, from: input.from, to: input.to },
    };
}

export function buildNotDeliveredBody(common: OpsCommon, input: {
    delivery: Pick<SnapshotDelivery, 'delivery_id' | 'order_id' | 'delivery_date'>; reasonCategory: 1 | 2 | 3 | 4; reason: string;
}): ActionBodyOf<'delivery_marked_not_delivered'> {
    const reason = input.reason.trim().slice(0, 250);
    return {
        ...common, resolve: false,
        action_type: 'delivery_marked_not_delivered', ref_type: 'delivery', ref_id: String(input.delivery.delivery_id),
        amount: null,
        data: {
            delivery_id: input.delivery.delivery_id, order_id: input.delivery.order_id,
            delivery_date: input.delivery.delivery_date, reason_category: input.reasonCategory,
            reason: reason === '' ? null : reason,
        },
    };
}

export function buildCustomerLinkedBody(common: OpsCommon, input: {
    userId: number; phone: string; alternatePhoneId: number | null; alreadyLinked: boolean;
}): ActionBodyOf<'customer_linked'> {
    return {
        ...common, resolve: false,
        action_type: 'customer_linked', ref_type: 'alternate_phone', ref_id: `user:${input.userId}:${input.phone}`,
        amount: null,
        data: { user_id: input.userId, phone: input.phone, alternate_phone_id: input.alternatePhoneId, already_linked: input.alreadyLinked },
    };
}

export function buildPaymentLinkBody(common: OpsCommon, input: {
    order: Pick<SnapshotDayOrder, 'id' | 'total_amount'>; paymentLinkId: string; shortUrl: string; whatsappSent: boolean;
}): ActionBodyOf<'payment_link_sent'> {
    return {
        ...common, resolve: false,
        action_type: 'payment_link_sent', ref_type: 'payment_link', ref_id: input.paymentLinkId,
        amount: round2(input.order.total_amount),
        data: { daytime_order_id: input.order.id, short_url: input.shortUrl, whatsapp_sent: input.whatsappSent },
    };
}

// ── Response readers. `res` is the whole backend body the POST helper resolved to. ──
export interface PaymentLinkResult { paymentLinkId: string; shortUrl: string; whatsappSent: boolean; whatsappNote: string | null }

type Rec = Record<string, unknown>;
const asRecord = (value: unknown): Rec | null =>
    (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : null);
const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

export function readPaymentLinkResult(res: unknown): PaymentLinkResult | null {
    const data = asRecord(asRecord(res)?.data);
    if (data === null) return null;
    const id = nonEmpty(data.payment_link_id);
    const url = typeof data.short_url === 'string' ? data.short_url : '';
    if (id === null || id.length > 80 || url.length > 300 || !/^https?:\/\//.test(url)) return null;
    const whatsapp = asRecord(data.whatsapp);
    return {
        paymentLinkId: id, shortUrl: url, whatsappSent: whatsapp?.sent === true,
        whatsappNote: nonEmpty(whatsapp?.skipped) ?? nonEmpty(whatsapp?.error),
    };
}

export function readAlternatePhoneResult(res: unknown): { alternatePhoneId: number | null; alreadyLinked: boolean } | null {
    const data = asRecord(asRecord(res)?.data);
    if (data === null) return null;
    const alreadyLinked = data.already_linked === true;
    const id = typeof data.id === 'number' && Number.isInteger(data.id) && data.id > 0 ? data.id : null;
    if (!alreadyLinked && id === null) return null;
    return { alternatePhoneId: id, alreadyLinked };
}

// ── Customer ──
export type PresetResult =
    | { kind: 'ready'; customer: PresetCustomer }
    | { kind: 'needs_name'; phone: string; suggestedName: string }
    | { kind: 'blocked'; reason: 'pick_customer' | 'staff' };

export function presetCustomerFor(
    snapshot: Pick<CustomerSnapshot, 'canonical_phone' | 'match' | 'profile'>, ticketName: string | null,
): PresetResult {
    if (snapshot.match.kind === 'staff') return { kind: 'blocked', reason: 'staff' };
    const typed = (ticketName ?? '').trim();
    if (snapshot.profile !== null) {
        return {
            kind: 'ready',
            customer: {
                userId: snapshot.profile.user_id, name: snapshot.profile.name ?? (typed !== '' ? typed : 'Customer'),
                phone: snapshot.canonical_phone, isNew: false,
            },
        };
    }
    if (snapshot.match.kind === 'none') return { kind: 'needs_name', phone: snapshot.canonical_phone, suggestedName: typed };
    return { kind: 'blocked', reason: 'pick_customer' };
}

export function newCustomerPreset(phone: string, name: string): PresetCustomer | null {
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= 80 ? { userId: null, name: trimmed, phone, isNew: true } : null;
}

/** A staff number is never offered an order or money action; each trigger checks this so an open drawer is never unmounted by it. */
export const isStaffMatch = (snapshot: Pick<CustomerSnapshot, 'match'>): boolean => snapshot.match.kind === 'staff';

export type HolidayAvailability = 'ok' | 'staff' | 'no_customer' | 'no_subscriptions';
export function holidayAvailability(snapshot: Pick<CustomerSnapshot, 'match' | 'profile' | 'subscriptions'>): HolidayAvailability {
    if (snapshot.match.kind === 'staff') return 'staff';
    if (snapshot.profile === null) return 'no_customer';
    return snapshot.subscriptions.length === 0 ? 'no_subscriptions' : 'ok';
}

export function linkableCandidates(snapshot: Pick<CustomerSnapshot, 'match'>): SnapshotCandidate[] {
    if (snapshot.match.kind !== 'candidates') return [];
    return snapshot.match.candidates.filter((candidate) => candidate.matched_on === 'address_phone' && !candidate.is_staff);
}

// ── Dates (IST; the process time zone never matters) ──
export const HOLIDAY_MAX_DAYS = 90;
const MS_PER_DAY = 86_400_000;
const CUTOFF_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export function istDateAfter(nowMs: number, days: number): string {
    return istIsoAfter(nowMs, days * 1440).slice(0, 10);
}

export function holidayEarliestDate(
    nowMs: number, tomorrow: Pick<CustomerSnapshot['tomorrow'], 'date' | 'cutoff' | 'list_generated'>,
): string {
    const nowHhmm = istIsoAfter(nowMs, 0).slice(11, 16);
    const cutoffPassed = !CUTOFF_FORMAT.test(tomorrow.cutoff) || nowHhmm >= tomorrow.cutoff;
    const listDone = tomorrow.list_generated && tomorrow.date === istDateAfter(nowMs, 1);
    return istDateAfter(nowMs, cutoffPassed || listDone ? 2 : 1);
}

export type HolidayRangeCheck = 'ok' | 'invalid' | 'to_before_from' | 'before_earliest' | 'too_long' | 'all_existing';

export function checkHolidayRange(from: string, to: string, earliest: string, existing: readonly string[]): HolidayRangeCheck {
    if (!isIstDate(from) || !isIstDate(to)) return 'invalid';
    if (to < from) return 'to_before_from';
    if (from < earliest) return 'before_earliest';
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - fromMs) / MS_PER_DAY) + 1;
    if (days > HOLIDAY_MAX_DAYS) return 'too_long';
    const known = new Set(existing);
    for (let offset = 0; offset < days; offset += 1) {
        if (!known.has(new Date(fromMs + offset * MS_PER_DAY).toISOString().slice(0, 10))) return 'ok';
    }
    return 'all_existing';
}

export function holidayRangeText(check: Exclude<HolidayRangeCheck, 'ok'>, earliest: string): string {
    switch (check) {
        case 'invalid': return 'Pick a start and an end date.';
        case 'to_before_from': return 'The end date is before the start date.';
        case 'before_earliest': return `The first date that can still be paused is ${earliest}.`;
        case 'too_long': return `At most ${HOLIDAY_MAX_DAYS} days at a time.`;
        case 'all_existing': return 'Every date in this range is already a holiday.';
    }
}

// ── Row eligibility ──
export function canMarkNotDelivered(delivery: Pick<SnapshotDelivery, 'status' | 'delivery_date'>, todayIst: string): boolean {
    return delivery.status !== 2 && delivery.delivery_date <= todayIst;
}

export function canSendPaymentLink(
    order: Pick<SnapshotDayOrder, 'order_status' | 'payment_status' | 'total_amount' | 'entry_type'>,
): boolean {
    return order.order_status !== 'cancelled' && (order.payment_status === 'unpaid' || order.payment_status === 'link_sent')
        && order.total_amount > 0 && order.entry_type !== 'morning_backup';
}

/** An IST wall-clock "YYYY-MM-DD HH:mm:ss" (the backend's naive form) as epoch ms; NaN when unreadable. */
const istNaiveMs = (value: string): number => Date.parse(`${value.trim().replace(' ', 'T').slice(0, 19)}+05:30`);

/**
 * `actions` is only this ticket's and `recent` is customer-wide, so an order another ticket already recorded (a COD order
 * stays `unpaid`) would look unrecorded here. Offer the step only for the ticket's own order or one created while this
 * ticket existed; an unreadable date fails closed, because the step moves money.
 */
export function needsDayOrderRecord(
    order: Pick<SnapshotDayOrder, 'id' | 'order_status' | 'payment_status' | 'entry_type' | 'created_at'>,
    recent: readonly Pick<SnapshotRecentAction, 'kind' | 'ref_id'>[],
    actions: readonly Pick<TicketAction, 'action_type' | 'ref_id'>[],
    ticket: Pick<Ticket, 'daytime_order_id' | 'opened_at'>,
): boolean {
    if (order.payment_status !== 'unpaid' || order.order_status === 'cancelled' || order.entry_type === 'morning_backup') return false;
    if (ticket.daytime_order_id !== null && ticket.daytime_order_id !== order.id) return false;
    if (ticket.daytime_order_id !== order.id && !(istNaiveMs(order.created_at) >= Date.parse(ticket.opened_at))) return false;
    const ref = String(order.id);
    return recent.some((item) => item.kind === 'day_order' && item.ref_id === ref)
        && !actions.some((item) => item.action_type === 'day_order_created' && item.ref_id === ref);
}

// ── Resolve choice (D-3) ──
export type OpsResolvingAction = 'day_order_created' | 'holiday_added';
export const OPS_ALLOWED_TYPES: Record<OpsResolvingAction, readonly TicketType[]> = {
    day_order_created: ['sales', 'request'],
    holiday_added: ['request'],
};
export const OPS_FALLBACK_CATEGORY: Record<OpsResolvingAction, string> = {
    day_order_created: 'new_day_order',
    holiday_added: 'pause_resume',
};
export interface OpsResolveChoice { resolve: boolean; category_slug: string | null; locked: null | 'resolved' | 'no_category' }

export function planOpsResolution(
    action: OpsResolvingAction,
    ticket: Pick<Ticket, 'status' | 'category_slug' | 'suggested_category'>,
    categories: readonly Category[],
): { initial: OpsResolveChoice; options: Category[] } {
    const allowed = OPS_ALLOWED_TYPES[action];
    const options = categories.filter((item) => item.active && allowed.includes(item.type))
        .sort((a, b) => a.sort_order - b.sort_order);
    const slugs = options.map((item) => item.slug);
    const suggestion = ticket.suggested_category;
    const pick = suggestion !== null && slugs.includes(suggestion) ? suggestion
        : slugs.includes(OPS_FALLBACK_CATEGORY[action]) ? OPS_FALLBACK_CATEGORY[action]
            : (slugs[0] ?? null);
    if (ticket.status === 'resolved') return { initial: { resolve: false, category_slug: null, locked: 'resolved' }, options };
    if (options.length === 0) return { initial: { resolve: false, category_slug: null, locked: 'no_category' }, options };
    if (ticket.category_slug !== null && slugs.includes(ticket.category_slug)) {
        return { initial: { resolve: true, category_slug: ticket.category_slug, locked: null }, options };
    }
    return { initial: { resolve: ticket.category_slug === null, category_slug: pick, locked: null }, options };
}

export function resolveFragment(
    choice: OpsResolveChoice,
    ticket: Pick<Ticket, 'category_slug' | 'suggested_category'>,
    events: readonly TicketEvent[],
): ResolveFragment {
    if (!choice.resolve) return { resolve: false };
    if (choice.category_slug === null || choice.category_slug === ticket.category_slug) return { resolve: true };
    return {
        resolve: true, category_slug: choice.category_slug,
        classification_source: classificationSourceFor(choice.category_slug, ticket, events),
    };
}

// ── Errors ──
export const HOLIDAY_REFUSED_TEXT =
    'The backend refused these dates: one is today or earlier, every date is already a holiday, or the range is invalid.';

export function opsBackendErrorText(error: unknown, fallback: string): string {
    const source = asRecord(error);
    const message = nonEmpty(source?.userMessage)?.trim() ?? nonEmpty(source?.message)?.trim();
    return message ?? fallback;
}

export function holidayErrorText(error: unknown): string {
    if (asRecord(error)?.status === 201) return HOLIDAY_REFUSED_TEXT;
    return opsBackendErrorText(error, 'Could not add the holiday.');
}

export const RESOLVE_PRECONDITION_CODES = [
    'category_required', 'resolution_code_required', 'note_required', 'lost_reason_required', 'delivery_link_required',
] as const;
export interface RecordFailure { kind: 'precondition' | 'retry' | 'final'; text: string }

const FINAL_TEXT: Record<string, string> = {
    reference_mismatch: 'The backend shows a different customer or amount for this reference, so it was not recorded.',
    duplicate_reference: 'This reference is already recorded on another ticket.',
    validation_failed: 'The action could not be recorded (invalid data). Report this.',
};

export function recordFailure(error: unknown): RecordFailure {
    if (!(error instanceof DeskClientError)) return { kind: 'retry', text: 'Network error. Try again.' };
    const { code, message } = error;
    if ((RESOLVE_PRECONDITION_CODES as readonly string[]).includes(code)) return { kind: 'precondition', text: deskErrorText(code, message) };
    if (code === 'internal_error' || code === 'authz_unavailable') return { kind: 'retry', text: deskErrorText(code, message) };
    return { kind: 'final', text: FINAL_TEXT[code] ?? deskErrorText(code, message) };
}

/** After `customer_linked` the route changes the ticket's customer only inside the snapshot set (P4a): true = warn the exec. */
export function customerLinkNotApplied(ticket: Pick<Ticket, 'backend_user_id'>, linkedUserId: number): boolean {
    return ticket.backend_user_id !== linkedUserId;
}

/** The same body re-posted without resolving: used after a 422 resolve precondition (nothing was written, P4a D-8). */
export function recordOnlyBody<T extends TicketActionBody>(body: T): T {
    const copy: Record<string, unknown> = { ...body, resolve: false };
    delete copy.category_slug;
    delete copy.classification_source;
    return copy as unknown as T;
}
