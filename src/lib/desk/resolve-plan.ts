// Pure rules for the resolve and wrap-up dialogs. They mirror the server's resolution rules
// (contract section 1.3) so the dialog can say what is missing before a request is sent; the server
// stays the authority and a 422 is still handled by the caller.

import {
    HUMAN_RESOLUTION_CODES, NOTE_REQUIRED_CODES,
    type ClassificationSource, type HumanResolutionCode, type LostReason,
} from './constants';
import type { TicketPatchBody, TicketResolveBody } from './contracts';
import type { Category, Ticket, TicketEvent, TicketEventOf } from './types';

export const RESOLVE_PRESETS = ['spam', 'wrong_number', 'internal', 'no_action', 'duplicate'] as const;
export type ResolvePreset = (typeof RESOLVE_PRESETS)[number];

export interface ResolveDraft {
    category_slug: string | null;
    classification_source: ClassificationSource;
    resolution_code: HumanResolutionCode | null;
    resolution_note: string;
    lost_reason: LostReason | null;
    duplicate_of_ticket_no: number | null;
    link_status: 'none_found' | 'not_a_customer' | null;
}

export type ResolveMissing =
    | 'category' | 'resolution_code' | 'note' | 'lost_reason' | 'duplicate_target' | 'delivery_link';

type PlanTicket = Pick<Ticket, 'ticket_no' | 'category_slug' | 'suggested_category' | 'link_status'>;
type PlanCategory = Pick<Category, 'slug' | 'default_resolution_code' | 'requires_delivery_link'>;

export function isHumanCode(code: string | null): code is HumanResolutionCode {
    return code !== null && (HUMAN_RESOLUTION_CODES as readonly string[]).includes(code);
}

const emptyDraft = (): ResolveDraft => ({
    category_slug: null,
    classification_source: 'human',
    resolution_code: null,
    resolution_note: '',
    lost_reason: null,
    duplicate_of_ticket_no: null,
    link_status: null,
});

/** 'human' unless the exec picked the engine's suggestion; then the source of its newest 'suggested' event. */
export function classificationSourceFor(
    slug: string,
    ticket: Pick<Ticket, 'suggested_category'>,
    events: readonly TicketEvent[],
): ClassificationSource {
    if (slug !== ticket.suggested_category) return 'human';
    const suggested = events.filter((event): event is TicketEventOf<'suggested'> => event.type === 'suggested');
    const newest = suggested[suggested.length - 1];
    return newest?.data.source ?? 'rules';
}

export function initialResolveDraft(ticket: PlanTicket, category: PlanCategory | null): ResolveDraft {
    const defaultCode = category?.default_resolution_code ?? null;
    return {
        ...emptyDraft(),
        category_slug: ticket.category_slug,
        resolution_code: isHumanCode(defaultCode) ? defaultCode : null,
    };
}

export function presetDraft(preset: ResolvePreset, ticket: PlanTicket): ResolveDraft {
    const base = emptyDraft();
    switch (preset) {
        case 'spam':
            return { ...base, category_slug: 'spam', resolution_code: 'spam' };
        case 'wrong_number':
            return { ...base, category_slug: 'wrong_number', resolution_code: 'no_action' };
        case 'internal':
            return { ...base, category_slug: 'internal', resolution_code: 'no_action' };
        case 'no_action':
            return {
                ...base,
                category_slug: ticket.category_slug ?? ticket.suggested_category ?? null,
                resolution_code: 'no_action',
            };
        case 'duplicate':
            return { ...base, category_slug: ticket.category_slug, resolution_code: 'duplicate' };
    }
}

function noteIsRequired(draft: ResolveDraft): boolean {
    const code = draft.resolution_code;
    if (code === null) return false;
    if ((NOTE_REQUIRED_CODES as readonly string[]).includes(code)) return true;
    return code === 'lost' && draft.lost_reason === 'other';
}

/** Rules 1-4 of the resolution table: the ones a wrap-up shares with a resolve. */
function sharedMissing(draft: ResolveDraft): ResolveMissing[] {
    const missing: ResolveMissing[] = [];
    if (draft.category_slug === null) missing.push('category');
    if (draft.resolution_code === null) missing.push('resolution_code');
    if (noteIsRequired(draft) && draft.resolution_note.trim() === '') missing.push('note');
    if (draft.resolution_code === 'lost' && draft.lost_reason === null) missing.push('lost_reason');
    return missing;
}

export function resolveMissing(
    ticket: PlanTicket,
    category: PlanCategory | null,
    draft: ResolveDraft,
): ResolveMissing[] {
    const missing = sharedMissing(draft);
    const target = draft.duplicate_of_ticket_no;
    if (draft.resolution_code === 'duplicate' && (target === null || target === ticket.ticket_no)) {
        missing.push('duplicate_target');
    }
    if (category?.requires_delivery_link === true && ticket.link_status === null && draft.link_status === null) {
        missing.push('delivery_link');
    }
    return missing;
}

/** Call only when resolveMissing is empty. The result holds exactly the keys the server needs. */
export function buildResolveBody(
    seenInboundAt: string | null,
    ticket: PlanTicket,
    category: PlanCategory,
    draft: ResolveDraft,
): TicketResolveBody {
    if (draft.resolution_code === null) throw new Error('buildResolveBody called without a resolution code');
    const note = draft.resolution_note.trim();
    const changedSlug = draft.category_slug !== ticket.category_slug ? draft.category_slug : null;
    return {
        seen_inbound_at: seenInboundAt,
        ...(changedSlug !== null
            ? { category_slug: changedSlug, classification_source: draft.classification_source }
            : {}),
        resolution_code: draft.resolution_code,
        ...(note !== '' ? { resolution_note: note } : {}),
        ...(draft.resolution_code === 'lost' && draft.lost_reason !== null ? { lost_reason: draft.lost_reason } : {}),
        ...(draft.resolution_code === 'duplicate' && draft.duplicate_of_ticket_no !== null
            ? { duplicate_of_ticket_no: draft.duplicate_of_ticket_no }
            : {}),
        ...(category.requires_delivery_link && ticket.link_status === null && draft.link_status !== null
            ? { link_status: draft.link_status }
            : {}),
    };
}

export function wrapUpMissing(_category: PlanCategory | null, draft: ResolveDraft): ResolveMissing[] {
    return sharedMissing(draft);
}

export function buildWrapUpBody(draft: ResolveDraft): Extract<TicketPatchBody, { op: 'wrap_up' }> {
    if (draft.category_slug === null || draft.resolution_code === null) {
        throw new Error('buildWrapUpBody called without a category and a resolution code');
    }
    const note = draft.resolution_note.trim();
    return {
        op: 'wrap_up',
        category_slug: draft.category_slug,
        resolution_code: draft.resolution_code,
        ...(note !== '' ? { resolution_note: note } : {}),
        ...(draft.resolution_code === 'lost' && draft.lost_reason !== null ? { lost_reason: draft.lost_reason } : {}),
    };
}
