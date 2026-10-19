// Pure builder of GET /api/desk/review: the seven blocks of the morning review, in the fixed order
// of blueprint section 8. Ticket rows arrive already shaped as list items (computed clock fields,
// preview) by the reader. No I/O, no clock (`now` is an argument), no mutation of the input.

import { addIstDays, istDayStartUtc } from './business-hours';
import { HUMAN_RESOLVED_VIA, LIST_MAX_LIMIT, REVIEW_SAMPLE_SIZE, TICK_STALE_SECS } from './constants';
import type { EventType } from './constants';
import { buildClusters } from './review-report-clusters';
import { per1000 } from './stats';
import { epochOf, isAtOrAfter, isNotDuplicateOrSpam, isStatsExcluded, round2 } from './stats-helpers';
import type { ComplaintRow } from './stats-report';
import type {
    ActionItem, Category, DeliveryCounts, DeskReview, DeskSettings, IsoDateTime, IstDate, Ticket, TicketAction, TicketListItem,
} from './types';

export const REVIEW_EXTRA_COLUMNS = [
    'root_cause', 'preventive_action', 'reviewed_at', 'review_note',
    'product_id', 'driver_user_id', 'drop_point_id', 'drop_point_name',
] as const satisfies readonly (keyof Ticket)[];
export type ReviewTicketItem = TicketListItem & Pick<Ticket, (typeof REVIEW_EXTRA_COLUMNS)[number]>;
export interface ReviewEventRow { id: number; ticket_id: string; type: EventType; data: Record<string, unknown>; created_at: IsoDateTime }

export interface ReviewInput {
    now: Date;
    date: IstDate;
    settings: Pick<DeskSettings, 'stats_from' | 'go_live_at' | 'last_tick_at'>;
    categories: Array<Pick<Category, 'slug' | 'label' | 'report_group' | 'category_group'>>;
    windowTickets: ReviewTicketItem[];   // V2
    openTickets: ReviewTicketItem[];     // V3
    resolvedTickets: ReviewTicketItem[]; // V4
    lookupTickets: ReviewTicketItem[];   // V9
    complaintsWindow: ComplaintRow[];    // V5
    events: ReviewEventRow[];            // V6
    moneyActions: TicketAction[];        // V7
    actionItemsDue: ActionItem[];        // V8
    deliveryCounts: DeliveryCounts | null;
    truncated: boolean;
}
/** Ticket arrays hold ReviewTicketItem at run time; the type stays assignable to DeskReview. */
export type DeskReviewData = DeskReview;

const MS_PER_HOUR = 3_600_000;
const OPEN_TOO_LONG_MS = 24 * MS_PER_HOUR;
const ORPHAN_LAG_SECS = 180;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UNPAID: readonly string[] = ['unpaid', 'link_sent'];

// ── Window and sample order ────────────────────────────────────────────────

/** Yesterday 00:00 IST up to now (or the end of `date` for a past date). */
export function reviewWindow(date: IstDate, now: Date): { from: IsoDateTime; to: IsoDateTime; empty: boolean } {
    const fromMs = istDayStartUtc(addIstDays(date, -1)).getTime();
    const toMs = Math.min(now.getTime(), istDayStartUtc(addIstDays(date, 1)).getTime());
    return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), empty: toMs <= fromMs };
}

/** 32-bit FNV-1a over the UTF-16 code units of the text. */
export function fnv1a32(text: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let index = 0; index < text.length; index += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME);
    }
    return hash >>> 0;
}

export function sampleRank(ticketNo: number, date: IstDate): number {
    return fnv1a32(`${date}:${ticketNo}:${date}`);
}

// ── Shared state of one build ──────────────────────────────────────────────

interface ReviewState {
    input: ReviewInput;
    epoch: string;
    nowMs: number;
    cut: boolean;
    categories: Map<string, ReviewInput['categories'][number]>;
    ticketsById: Map<string, ReviewTicketItem>;
    moneyByTicket: Map<string, number>;
    cap: <T>(rows: T[]) => T[];
}

const byOpened = (a: ReviewTicketItem, b: ReviewTicketItem): number =>
    Date.parse(a.opened_at) - Date.parse(b.opened_at) || a.ticket_no - b.ticket_no;
const byResolved = (a: ReviewTicketItem, b: ReviewTicketItem): number =>
    Date.parse(a.resolved_at ?? '') - Date.parse(b.resolved_at ?? '') || a.ticket_no - b.ticket_no;
const byTicketNo = (a: ReviewTicketItem, b: ReviewTicketItem): number => a.ticket_no - b.ticket_no;

function makeState(input: ReviewInput, epoch: string): ReviewState {
    const state: ReviewState = {
        input,
        epoch,
        nowMs: input.now.getTime(),
        cut: false,
        categories: new Map(input.categories.map((category) => [category.slug, category])),
        ticketsById: new Map(),
        moneyByTicket: new Map(),
        cap: <T,>(rows: T[]): T[] => {
            if (rows.length > LIST_MAX_LIMIT) state.cut = true;
            return rows.slice(0, LIST_MAX_LIMIT);
        },
    };
    for (const list of [input.windowTickets, input.openTickets, input.resolvedTickets, input.lookupTickets]) {
        for (const ticket of list) {
            if (isAtOrAfter(ticket.opened_at, epoch)) state.ticketsById.set(ticket.id, ticket);
        }
    }
    for (const action of input.moneyActions) {
        state.moneyByTicket.set(action.ticket_id, (state.moneyByTicket.get(action.ticket_id) ?? 0) + Number(action.amount ?? 0));
    }
    return state;
}

const isSalesTicket = (state: ReviewState, ticket: ReviewTicketItem): boolean =>
    ticket.category_slug !== null && state.categories.get(ticket.category_slug)?.report_group === 'sales';

// ── Blocks ─────────────────────────────────────────────────────────────────

function carryOver(state: ReviewState): DeskReview['carry_over'] {
    const open = state.input.openTickets.filter((ticket) => isAtOrAfter(ticket.opened_at, state.epoch));
    const followUpMs = (ticket: ReviewTicketItem): number =>
        ticket.follow_up_at === null ? Number.POSITIVE_INFINITY : Date.parse(ticket.follow_up_at);
    return {
        open_over_24h: state.cap(open
            .filter((ticket) => ticket.status !== 'on_hold' && state.nowMs - Date.parse(ticket.opened_at) > OPEN_TOO_LONG_MS)
            .sort(byOpened)),
        on_hold: state.cap(open
            .filter((ticket) => ticket.status === 'on_hold')
            .sort((a, b) => (followUpMs(a) === followUpMs(b) ? a.ticket_no - b.ticket_no : followUpMs(a) < followUpMs(b) ? -1 : 1))),
        action_items_due: state.input.actionItemsDue,
    };
}

function complaintTickets(state: ReviewState): ReviewTicketItem[] {
    return state.input.windowTickets
        .filter((ticket) => isAtOrAfter(ticket.opened_at, state.epoch))
        .filter((ticket) => ticket.type === 'complaint' && isNotDuplicateOrSpam(ticket.resolution_code))
        .sort(byOpened);
}

function complaintsByCategory(state: ReviewState, complaints: ReviewTicketItem[]): DeskReview['complaints'] {
    const groups = new Map<string, ReviewTicketItem[]>();
    for (const ticket of complaints) {
        const slug = ticket.category_slug ?? '';
        groups.set(slug, [...(groups.get(slug) ?? []), ticket]);
    }
    const stops = state.input.deliveryCounts?.total.stops ?? null;
    return [...groups.entries()]
        .map(([slug, tickets]) => ({
            category_slug: slug,
            label: state.categories.get(slug)?.label ?? slug,
            n: tickets.length,
            per_1000: per1000(tickets.length, stops),
            refund_total: round2(tickets.reduce((sum, ticket) => sum + (state.moneyByTicket.get(ticket.id) ?? 0), 0)),
            tickets: state.cap(tickets),
        }))
        .sort((a, b) => b.n - a.n || (a.category_slug < b.category_slug ? -1 : 1));
}

function moneyList(state: ReviewState): DeskReview['money'] {
    const rows = state.input.moneyActions
        .flatMap((action) => {
            const ticket = state.ticketsById.get(action.ticket_id);
            return ticket === undefined ? [] : [{
                action, ticket_no: ticket.ticket_no, customer_name: ticket.customer_name, category_slug: ticket.category_slug,
            }];
        })
        .sort((a, b) => Date.parse(a.action.created_at) - Date.parse(b.action.created_at) || a.action.id - b.action.id);
    return state.cap(rows);
}

function salesBlock(state: ReviewState): DeskReview['sales'] {
    const resolved = state.input.resolvedTickets
        .filter((ticket) => isAtOrAfter(ticket.opened_at, state.epoch) && isSalesTicket(state, ticket))
        .sort(byResolved);
    const unpaid = (ticket: ReviewTicketItem): boolean => UNPAID.includes(ticket.payment_status ?? '');
    return {
        opened: state.cap(state.input.windowTickets
            .filter((ticket) => isAtOrAfter(ticket.opened_at, state.epoch) && isSalesTicket(state, ticket))
            .sort(byOpened)),
        won: state.cap(resolved.filter((ticket) => ticket.resolution_code === 'won' && !unpaid(ticket))),
        lost: state.cap(resolved.filter((ticket) => ticket.resolution_code === 'lost')),
        awaiting_payment: state.cap(resolved.filter((ticket) => ticket.resolution_code === 'won' && unpaid(ticket))),
    };
}

function sampleBlock(state: ReviewState): ReviewTicketItem[] {
    return state.input.resolvedTickets
        .filter((ticket) => isAtOrAfter(ticket.opened_at, state.epoch))
        .filter((ticket) => (ticket.resolution_code === 'explained' || ticket.resolution_code === 'no_action')
            && (HUMAN_RESOLVED_VIA as readonly string[]).includes(ticket.resolved_via ?? '') && !ticket.is_ack_only)
        .sort((a, b) => sampleRank(a.ticket_no, state.input.date) - sampleRank(b.ticket_no, state.input.date) || a.ticket_no - b.ticket_no)
        .slice(0, REVIEW_SAMPLE_SIZE);
}

type AckRow = DeskReview['health']['acks_suppressed'][number];

function suppressedAcks(state: ReviewState): AckRow[] {
    const rows: AckRow[] = [];
    for (const event of state.input.events) {
        const mode = event.type === 'ack_would_suppress' ? 'shadow' : event.type === 'ack_suppressed' ? 'on' : null;
        const ticket = state.ticketsById.get(event.ticket_id);
        const { text } = event.data;
        if (mode !== null && ticket !== undefined && typeof text === 'string') {
            rows.push({ ticket_no: ticket.ticket_no, text, mode, at: event.created_at });
        }
    }
    return rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function healthBlock(state: ReviewState): DeskReview['health'] {
    const { events, settings, now } = state.input;
    const dataOf = (event: ReviewEventRow): Record<string, unknown> => event.data;
    const orphans = events.filter((event) => {
        const { via, lag_secs: lag } = dataOf(event);
        return event.type === 'created' && via === 'tick' && typeof lag === 'number' && lag > ORPHAN_LAG_SECS;
    });
    const acks = suppressedAcks(state);
    const unseenIds = new Set(events
        .filter((event) => (event.type === 'reopened' && dataOf(event).reason === 'unseen_message')
            || (event.type === 'resolved' && dataOf(event).over_unanswered === true))
        .map((event) => event.ticket_id));
    const lastTickMs = settings.last_tick_at === null ? Number.NaN : Date.parse(settings.last_tick_at);
    return {
        orphans_repaired: orphans.length,
        acks_suppressed: state.cap(acks),
        resolved_over_unseen: state.cap([...unseenIds]
            .flatMap((id) => { const ticket = state.ticketsById.get(id); return ticket === undefined ? [] : [ticket]; })
            .sort(byTicketNo)),
        unverified_actions: state.input.moneyActions.filter((action) => action.verified === false).length,
        last_tick_at: settings.last_tick_at,
        tick_stale: Number.isNaN(lastTickMs) || now.getTime() - lastTickMs > TICK_STALE_SECS * 1000,
    };
}

/** Plan section 8: internal, spam and wrong_number tickets appear in no block of the review. */
function withoutExcluded(input: ReviewInput): ReviewInput {
    const kept = (rows: ReviewTicketItem[]): ReviewTicketItem[] => rows.filter((ticket) => !isStatsExcluded(ticket.category_slug));
    return {
        ...input,
        windowTickets: kept(input.windowTickets),
        openTickets: kept(input.openTickets),
        resolvedTickets: kept(input.resolvedTickets),
        lookupTickets: kept(input.lookupTickets),
    };
}

export function buildDeskReview(fullInput: ReviewInput): DeskReviewData {
    const input = withoutExcluded(fullInput);
    const window = reviewWindow(input.date, input.now);
    const epoch = epochOf(input.settings);
    if (epoch === null) return emptyReview(input, window);
    const state = makeState(input, epoch);
    const complaints = complaintTickets(state);
    const review = {
        carry_over: carryOver(state),
        complaints: complaintsByCategory(state, complaints),
        clusters: buildClusters(state.input, epoch, complaints, window),
        money: moneyList(state),
        sales: salesBlock(state),
        sample: sampleBlock(state),
        health: healthBlock(state),
    };
    return { window: { date: input.date, from: window.from, to: window.to, truncated: input.truncated || state.cut }, ...review };
}

function emptyReview(input: ReviewInput, window: { from: IsoDateTime; to: IsoDateTime }): DeskReviewData {
    const lastTickMs = input.settings.last_tick_at === null ? Number.NaN : Date.parse(input.settings.last_tick_at);
    return {
        window: { date: input.date, from: window.from, to: window.to, truncated: false },
        carry_over: { open_over_24h: [], on_hold: [], action_items_due: [] },
        complaints: [],
        clusters: { product_date: [], driver: [], drop_point: [], repeat_complainers: [] },
        money: [],
        sales: { opened: [], won: [], lost: [], awaiting_payment: [] },
        sample: [],
        health: {
            orphans_repaired: 0, acks_suppressed: [], resolved_over_unseen: [], unverified_actions: 0,
            last_tick_at: input.settings.last_tick_at,
            tick_stale: Number.isNaN(lastTickMs) || input.now.getTime() - lastTickMs > TICK_STALE_SECS * 1000,
        },
    };
}

/** DeskReview as the page receives it: every ticket row carries the eight review fields. */
export interface ReviewView extends Omit<DeskReview, 'carry_over' | 'complaints' | 'sales' | 'sample' | 'health'> {
    carry_over: Omit<DeskReview['carry_over'], 'open_over_24h' | 'on_hold'> & { open_over_24h: ReviewTicketItem[]; on_hold: ReviewTicketItem[] };
    complaints: Array<Omit<DeskReview['complaints'][number], 'tickets'> & { tickets: ReviewTicketItem[] }>;
    sales: Record<keyof DeskReview['sales'], ReviewTicketItem[]>;
    sample: ReviewTicketItem[];
    health: Omit<DeskReview['health'], 'resolved_over_unseen'> & { resolved_over_unseen: ReviewTicketItem[] };
}
