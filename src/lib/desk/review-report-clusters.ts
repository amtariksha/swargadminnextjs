// Block 3 of the morning review: complaints that share a product on a delivery date, a driver, a
// drop point or a customer. Pure. Split from review-report.ts.

import { compareKeys, findRepeatComplainers, isAtOrAfter, isNotDuplicateOrSpam } from './stats-helpers';
import type { ReviewInput, ReviewTicketItem } from './review-report';
import type { DeskReview, IsoDateTime } from './types';

const MIN_CLUSTER_SIZE = 2;

interface Draft {
    key: string | null;
    label: string | null;
    category_group: string | null;
    delivery_date: string | null;
    ticketNos: number[];
}

function toClusters(drafts: Map<string, Draft>): Draft[] {
    return [...drafts.values()]
        .filter((draft) => draft.ticketNos.length >= MIN_CLUSTER_SIZE)
        .sort((a, b) => b.ticketNos.length - a.ticketNos.length
            || compareKeys(a.key, b.key)
            || compareKeys(a.delivery_date, b.delivery_date)
            || compareKeys(a.category_group, b.category_group));
}

function groupBy(
    tickets: ReviewTicketItem[],
    identity: (ticket: ReviewTicketItem) => { id: string; draft: Omit<Draft, 'ticketNos'> } | null,
): Draft[] {
    const drafts = new Map<string, Draft>();
    for (const ticket of tickets) {
        const found = identity(ticket);
        if (found === null) continue;
        const existing = drafts.get(found.id);
        drafts.set(found.id, existing === undefined
            ? { ...found.draft, ticketNos: [ticket.ticket_no] }
            : { ...existing, label: existing.label ?? found.draft.label, ticketNos: [...existing.ticketNos, ticket.ticket_no] });
    }
    return toClusters(drafts);
}

const withNos = (draft: Draft) => ({
    key: draft.key,
    label: draft.label,
    n: draft.ticketNos.length,
    ticket_nos: [...draft.ticketNos].sort((a, b) => a - b),
});

export function buildClusters(
    input: ReviewInput,
    epoch: string,
    complaints: ReviewTicketItem[],
    window: { from: IsoDateTime; to: IsoDateTime },
): DeskReview['clusters'] {
    const categories = new Map(input.categories.map((category) => [category.slug, category]));
    const groupOf = (ticket: ReviewTicketItem): string | null =>
        ticket.category_slug === null ? null : (categories.get(ticket.category_slug)?.category_group ?? null);
    const fromMs = Date.parse(window.from);
    const toMs = Date.parse(window.to);
    const repeatRows = input.complaintsWindow.filter((row) =>
        isAtOrAfter(row.opened_at, epoch) && isNotDuplicateOrSpam(row.resolution_code));
    return {
        product_date: groupBy(complaints, (ticket) => {
            const group = groupOf(ticket);
            const id = `${group ?? ''}|${ticket.product_id ?? ''}|${ticket.delivery_date ?? ''}`;
            return {
                id,
                draft: {
                    key: ticket.product_id === null ? null : String(ticket.product_id),
                    label: ticket.product_name,
                    category_group: group,
                    delivery_date: ticket.delivery_date,
                },
            };
        }).map((draft) => ({
            ...withNos(draft), category_group: draft.category_group, delivery_date: draft.delivery_date,
        })),
        driver: groupBy(complaints, (ticket) => ticket.driver_user_id === null ? null : {
            id: String(ticket.driver_user_id),
            draft: { key: String(ticket.driver_user_id), label: ticket.driver_name, category_group: null, delivery_date: null },
        }).map(withNos),
        drop_point: groupBy(complaints, (ticket) => ticket.drop_point_id === null ? null : {
            id: String(ticket.drop_point_id),
            draft: { key: String(ticket.drop_point_id), label: ticket.drop_point_name, category_group: null, delivery_date: null },
        }).map(withNos),
        repeat_complainers: findRepeatComplainers(repeatRows, (row) => {
            const openedMs = Date.parse(row.opened_at);
            return openedMs >= fromMs && openedMs < toMs;
        }),
    };
}
