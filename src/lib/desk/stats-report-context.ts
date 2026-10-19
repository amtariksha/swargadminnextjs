// The indexes shared by every block of buildDeskStats, built once so that no block scans a full
// list inside a loop over tickets. Pure: no I/O, no clock beyond `input.now`.

import { istRangeUtc } from './business-hours';
import { isAtOrAfter, isNotDuplicateOrSpam, isStatsExcluded, round2 } from './stats-helpers';
import type { MoneyActionRow, StatsInput, StatsTicketRow, StatusEventRow } from './stats-report';
import type { DeliveryCounts } from './types';

type TicketInfo = { id: string; queue: string; category_slug: string | null; opened_at: string };

export interface StatsContext {
    input: StatsInput;
    epoch: string;
    now: Date;
    nowMs: number;
    range: StatsInput['range'];
    settings: StatsInput['settings'];
    deliveryCounts: DeliveryCounts | null;
    categories: Map<string, StatsInput['categories'][number]>;
    /** Every loaded ticket on or after the epoch, any queue, except STATS_EXCLUDED_CATEGORIES. */
    keptTickets: StatsTicketRow[];
    /** Tickets opened in the range and in the queue whose category is excluded. */
    excludedCount: number;
    /** Set V: opened in the range and in the queue, oldest first. */
    volume: StatsTicketRow[];
    /** Members of V with status resolved. */
    resolved: StatsTicketRow[];
    /** Set C: complaints of V that are not duplicates or spam. */
    complaints: StatsTicketRow[];
    /** Unresolved, non-ack tickets on or after the epoch, in the queue. */
    openTickets: StatsTicketRow[];
    /** Set M with the amount as a number. */
    money: Array<MoneyActionRow & { amount: number }>;
    /** Money total per ticket id. */
    moneyByTicket: Map<string, number>;
    ticketInfo: Map<string, TicketInfo>;
    names: Map<string, string>;
    eventsByTicket: Map<string, StatusEventRow[]>;
    inRange: (instant: string) => boolean;
}

const inQueue = (queue: StatsInput['range']['queue'], ticketQueue: string): boolean => queue === null || ticketQueue === queue;

function nameMap(tickets: StatsTicketRow[], actions: MoneyActionRow[]): Map<string, string> {
    const names = new Map<string, string>();
    const remember = (id: string | null, name: string | null): void => {
        if (id !== null && name !== null && !names.has(id)) names.set(id, name);
    };
    for (const ticket of tickets) {
        remember(ticket.assigned_to, ticket.assigned_name);
        remember(ticket.resolved_by, ticket.resolved_by_name);
    }
    for (const action of actions) remember(action.actor_id, action.actor_name);
    return names;
}

function groupEvents(events: StatusEventRow[] | null): Map<string, StatusEventRow[]> {
    const byTicket = new Map<string, StatusEventRow[]>();
    for (const event of events ?? []) byTicket.set(event.ticket_id, [...(byTicket.get(event.ticket_id) ?? []), event]);
    return byTicket;
}

const byOpened = (a: StatsTicketRow, b: StatsTicketRow): number =>
    Date.parse(a.opened_at) - Date.parse(b.opened_at) || a.ticket_no - b.ticket_no;

export function buildContext(input: StatsInput, epoch: string): StatsContext {
    const bounds = istRangeUtc(input.range.from, input.range.to);
    const gteMs = Date.parse(bounds.gte);
    const ltMs = Date.parse(bounds.lt);
    const inRange = (instant: string): boolean => Date.parse(instant) >= gteMs && Date.parse(instant) < ltMs;
    const afterEpoch = input.tickets.filter((ticket) => isAtOrAfter(ticket.opened_at, epoch));
    const keptTickets = afterEpoch.filter((ticket) => !isStatsExcluded(ticket.category_slug));
    const inScope = (ticket: StatsTicketRow): boolean => inRange(ticket.opened_at) && inQueue(input.range.queue, ticket.queue);
    const volume = keptTickets.filter(inScope).sort(byOpened);
    const ticketInfo = new Map<string, TicketInfo>();
    // Money actions keep their ticket even when it is excluded: refunds are counted as issued.
    for (const ticket of [...afterEpoch, ...input.actionTickets.filter((row) => isAtOrAfter(row.opened_at, epoch))]) {
        ticketInfo.set(ticket.id, ticket);
    }
    const money = input.moneyActions
        .filter((action) => inRange(action.created_at))
        .filter((action) => {
            const info = ticketInfo.get(action.ticket_id);
            return info !== undefined && inQueue(input.range.queue, info.queue);
        })
        .map((action) => ({ ...action, amount: round2(Number(action.amount ?? 0)) }));
    const moneyByTicket = new Map<string, number>();
    for (const action of money) moneyByTicket.set(action.ticket_id, (moneyByTicket.get(action.ticket_id) ?? 0) + action.amount);
    return {
        input,
        epoch,
        now: input.now,
        nowMs: input.now.getTime(),
        range: input.range,
        settings: input.settings,
        deliveryCounts: input.deliveryCounts,
        categories: new Map(input.categories.map((category) => [category.slug, category])),
        keptTickets,
        excludedCount: afterEpoch.filter((ticket) => inScope(ticket) && isStatsExcluded(ticket.category_slug)).length,
        volume,
        resolved: volume.filter((ticket) => ticket.status === 'resolved'),
        complaints: volume.filter((ticket) => ticket.type === 'complaint' && isNotDuplicateOrSpam(ticket.resolution_code)),
        openTickets: input.openTickets.filter((ticket) =>
            isAtOrAfter(ticket.opened_at, epoch) && inQueue(input.range.queue, ticket.queue)
            && ticket.status !== 'resolved' && !ticket.is_ack_only && !isStatsExcluded(ticket.category_slug)),
        money,
        moneyByTicket,
        ticketInfo,
        names: nameMap([...keptTickets, ...input.openTickets], input.moneyActions),
        eventsByTicket: groupEvents(input.statusEvents),
        inRange,
    };
}
