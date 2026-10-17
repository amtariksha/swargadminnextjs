// First-response and resolution blocks of DeskStats. Pure.

import { businessSecondsBetween } from './business-hours';
import { RESOLUTION_CODES, RESOLVED_VIA } from './constants';
import { countBy, median, timingOf } from './stats';
import { compareKeys, isInboundOrigin, isNotDuplicateOrSpam, isResolutionCandidate, netResolutionSecs } from './stats-helpers';
import type { StatsContext } from './stats-report-context';
import type { StatsTicketRow } from './stats-report';
import type { DeskStats, StatsExec, StatsTiming } from './types';

/** Whole seconds between two instants, never below zero; null when either cannot be read. */
function secondsAtLeastZero(from: string, to: string): number | null {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
    return Math.max(0, Math.floor((toMs - fromMs) / 1000));
}

function execTimings(
    ctx: StatsContext,
    tickets: StatsTicketRow[],
    actorOf: (ticket: StatsTicketRow) => string | null,
    secsOf: (ticket: StatsTicketRow) => number | null,
): Array<StatsExec & StatsTiming> {
    const groups = new Map<string | null, number[]>();
    for (const ticket of tickets) {
        const secs = secsOf(ticket);
        if (secs === null) continue;
        const actor = actorOf(ticket);
        groups.set(actor, [...(groups.get(actor) ?? []), secs]);
    }
    return [...groups.entries()]
        .map(([actorId, secs]) => ({
            actor_id: actorId,
            actor_name: actorId === null ? null : (ctx.names.get(actorId) ?? null),
            ...timingOf(secs),
        }))
        .sort((a, b) => b.n - a.n || compareKeys(a.actor_id, b.actor_id));
}

export function buildFirstResponse(ctx: StatsContext): DeskStats['first_response'] {
    const answered = ctx.volume.filter((ticket) =>
        isInboundOrigin(ticket.origin) && !ticket.is_ack_only && ticket.first_response_at !== null
        && isNotDuplicateOrSpam(ticket.resolution_code));
    const secsOf = (ticket: StatsTicketRow): number | null =>
        secondsAtLeastZero(ticket.opened_at, ticket.first_response_at ?? '');
    const businessSecs = answered.map((ticket) =>
        businessSecondsBetween(ticket.opened_at, ticket.first_response_at ?? '', ctx.settings.business_hours));
    return {
        ...timingOf(answered.map(secsOf)),
        business_median_secs: median(businessSecs),
        unattributed: answered.filter((ticket) => ticket.first_response_source === 'phone').length,
        by_exec: execTimings(ctx, answered, (ticket) => ticket.first_response_by, secsOf),
    };
}

export function buildResolution(ctx: StatsContext): DeskStats['resolution'] {
    const population = ctx.volume.filter(isResolutionCandidate);
    const secsOf = (ticket: StatsTicketRow): number | null => secondsAtLeastZero(ticket.opened_at, ticket.resolved_at ?? '');
    const netSecs = ctx.input.statusEvents === null
        ? null
        : population.map((ticket) => netResolutionSecs(ticket, ctx.eventsByTicket.get(ticket.id) ?? []));
    return {
        ...timingOf(population.map(secsOf)),
        net_median_secs: netSecs === null ? null : median(netSecs),
        by_via: countBy(ctx.resolved.map((ticket) => ticket.resolved_via), RESOLVED_VIA),
        by_code: countBy(ctx.resolved.map((ticket) => ticket.resolution_code), RESOLUTION_CODES),
        by_exec: execTimings(ctx, population, (ticket) => ticket.resolved_by, secsOf),
    };
}
