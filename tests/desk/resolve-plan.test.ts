/** P3b resolve and wrap-up rules (spec tables 8.4 to 8.7). */

import { describe, it, expect } from 'vitest';
import {
    buildResolveBody, buildWrapUpBody, classificationSourceFor, initialResolveDraft, presetDraft,
    presetStart, resolveMissing, wrapUpDraft, wrapUpMissing, type ResolveDraft,
} from '@/lib/desk/resolve-plan';
import type { Category, Ticket, TicketEvent } from '@/lib/desk/types';

const S = '2026-10-12T02:30:00.123456+00:00';

type PlanCategory = Pick<Category, 'slug' | 'default_resolution_code' | 'requires_delivery_link'>;
type PlanTicket = Pick<Ticket, 'ticket_no' | 'category_slug' | 'suggested_category' | 'link_status'>;

const CATEGORIES: Record<string, PlanCategory> = {
    general_enquiry: { slug: 'general_enquiry', default_resolution_code: 'answered', requires_delivery_link: false },
    change_subscription: { slug: 'change_subscription', default_resolution_code: 'done', requires_delivery_link: false },
    billing_dispute: { slug: 'billing_dispute', default_resolution_code: 'explained', requires_delivery_link: false },
    milk_spoilage: { slug: 'milk_spoilage', default_resolution_code: 'explained', requires_delivery_link: true },
    late_delivery: { slug: 'late_delivery', default_resolution_code: 'explained', requires_delivery_link: true },
    new_day_order: { slug: 'new_day_order', default_resolution_code: null, requires_delivery_link: false },
    spam: { slug: 'spam', default_resolution_code: 'spam', requires_delivery_link: false },
};

const ticketOf = (patch: Partial<PlanTicket> = {}): PlanTicket => ({
    ticket_no: 41, category_slug: null, suggested_category: null, link_status: null, ...patch,
});
const categoryOf = (slug: string | null): PlanCategory | null => (slug === null ? null : CATEGORIES[slug] ?? null);

function suggestedEvent(id: number, source: 'rules' | 'ai'): TicketEvent {
    return {
        id, ticket_id: 't', from_status: null, to_status: null, assignee_id: null, actor_id: null,
        actor_name: null, created_at: `2026-10-12T02:3${id}:00+00:00`, type: 'suggested',
        data: { source, suggested_type: null, suggested_category: 'not_delivered', order_id: null, matched_keyword: null },
    };
}

describe('classificationSourceFor', () => {
    const suggestedTicket = { suggested_category: 'not_delivered' };
    it('uses the source of the newest suggestion', () => {
        expect(classificationSourceFor('not_delivered', suggestedTicket, [suggestedEvent(1, 'rules')])).toBe('rules');
        expect(classificationSourceFor('not_delivered', suggestedTicket, [suggestedEvent(1, 'rules'), suggestedEvent(2, 'ai')])).toBe('ai');
    });
    it('defaults to rules when the suggestion has no event', () => {
        expect(classificationSourceFor('not_delivered', suggestedTicket, [])).toBe('rules');
    });
    it('is human for any other slug', () => {
        expect(classificationSourceFor('late_delivery', suggestedTicket, [suggestedEvent(1, 'rules')])).toBe('human');
        expect(classificationSourceFor('spam', { suggested_category: null }, [])).toBe('human');
    });
});

describe('resolveMissing', () => {
    const initialFor = (slug: string | null, patch: Partial<PlanTicket> = {}) => {
        const ticket = ticketOf({ category_slug: slug, ...patch });
        return { ticket, category: categoryOf(slug), draft: initialResolveDraft(ticket, categoryOf(slug)) };
    };
    const missingFor = (slug: string | null, change: Partial<ResolveDraft> = {}, patch: Partial<PlanTicket> = {}) => {
        const { ticket, category, draft } = initialFor(slug, patch);
        return resolveMissing(ticket, category, { ...draft, ...change });
    };

    it('needs nothing for a category with a default code and no note rule', () => {
        expect(missingFor('general_enquiry')).toEqual([]);
        expect(missingFor('change_subscription')).toEqual([]);
    });
    it('needs a note for explained', () => {
        expect(missingFor('billing_dispute')).toEqual(['note']);
        expect(missingFor('billing_dispute', { resolution_note: '  ' })).toEqual(['note']);
        expect(missingFor('billing_dispute', { resolution_note: 'explained the charge' })).toEqual([]);
    });
    it('needs a delivery link for delivery categories', () => {
        expect(missingFor('milk_spoilage')).toEqual(['note', 'delivery_link']);
        expect(missingFor('milk_spoilage', {}, { link_status: 'linked' })).toEqual(['note']);
        expect(missingFor('milk_spoilage', { resolution_note: 'x', link_status: 'none_found' })).toEqual([]);
    });
    it('needs a code when the category has no default', () => {
        expect(missingFor('new_day_order')).toEqual(['resolution_code']);
    });
    it('applies the lost rules', () => {
        expect(missingFor('new_day_order', { resolution_code: 'lost' })).toEqual(['lost_reason']);
        expect(missingFor('new_day_order', { resolution_code: 'lost', lost_reason: 'other' })).toEqual(['note']);
        expect(missingFor('new_day_order', { resolution_code: 'lost', lost_reason: 'price' })).toEqual([]);
    });
    it('needs a category on an unclassified ticket', () => {
        expect(missingFor(null)).toEqual(['category', 'resolution_code']);
    });
    it('accepts the spam preset on an unclassified ticket', () => {
        const ticket = ticketOf();
        expect(resolveMissing(ticket, categoryOf('spam'), presetDraft('spam', ticket))).toEqual([]);
    });
    it('needs a duplicate target that is another ticket', () => {
        expect(missingFor('general_enquiry', { resolution_code: 'duplicate' })).toEqual(['duplicate_target']);
        expect(missingFor('general_enquiry', { resolution_code: 'duplicate', duplicate_of_ticket_no: 41 })).toEqual(['duplicate_target']);
        expect(missingFor('general_enquiry', { resolution_code: 'duplicate', duplicate_of_ticket_no: 17 })).toEqual([]);
    });
});

describe('presetDraft', () => {
    it('no_action takes the suggestion when the ticket has no category', () => {
        const draft = presetDraft('no_action', ticketOf({ suggested_category: 'late_delivery' }));
        expect(draft.category_slug).toBe('late_delivery');
        expect(draft.resolution_code).toBe('no_action');
        expect(presetDraft('no_action', ticketOf()).category_slug).toBeNull();
    });
    it('sets the fixed categories and codes', () => {
        const ticket = ticketOf();
        expect(presetDraft('wrong_number', ticket)).toMatchObject({ category_slug: 'wrong_number', resolution_code: 'no_action' });
        expect(presetDraft('internal', ticket)).toMatchObject({ category_slug: 'internal', resolution_code: 'no_action' });
        expect(presetDraft('duplicate', ticketOf({ category_slug: 'spam' }))).toMatchObject({ category_slug: 'spam', resolution_code: 'duplicate' });
    });
});

describe('buildResolveBody', () => {
    it('sends only the token and the code for a classified ticket', () => {
        const ticket = ticketOf({ category_slug: 'general_enquiry' });
        const category = CATEGORIES.general_enquiry;
        const body = buildResolveBody(S, ticket, category, initialResolveDraft(ticket, category));
        expect(body).toEqual({ seen_inbound_at: S, resolution_code: 'answered' });
        expect(body.seen_inbound_at).toBe('2026-10-12T02:30:00.123456+00:00');
    });
    it('classifies in the same request for a preset on an unclassified ticket', () => {
        const ticket = ticketOf();
        expect(buildResolveBody(null, ticket, CATEGORIES.spam, presetDraft('spam', ticket))).toEqual({
            seen_inbound_at: null, category_slug: 'spam', classification_source: 'human', resolution_code: 'spam',
        });
    });
    it('trims the note and sends the delivery choice when no delivery is linked', () => {
        const ticket = ticketOf({ category_slug: 'milk_spoilage' });
        const category = CATEGORIES.milk_spoilage;
        const draft = { ...initialResolveDraft(ticket, category), resolution_note: '  curd sent back  ', link_status: 'none_found' as const };
        expect(buildResolveBody(S, ticket, category, draft)).toEqual({
            seen_inbound_at: S, resolution_code: 'explained', resolution_note: 'curd sent back', link_status: 'none_found',
        });
    });
    it('leaves the delivery choice out when the ticket is already linked', () => {
        const ticket = ticketOf({ category_slug: 'milk_spoilage', link_status: 'linked' });
        const category = CATEGORIES.milk_spoilage;
        const draft = { ...initialResolveDraft(ticket, category), resolution_note: 'x', link_status: 'none_found' as const };
        expect(buildResolveBody(S, ticket, category, draft)).toEqual({
            seen_inbound_at: S, resolution_code: 'explained', resolution_note: 'x',
        });
    });
    it('sends the lost reason only for lost', () => {
        const ticket = ticketOf({ category_slug: 'new_day_order' });
        const category = CATEGORIES.new_day_order;
        const draft = { ...initialResolveDraft(ticket, category), resolution_code: 'lost' as const, lost_reason: 'price' as const };
        expect(buildResolveBody(S, ticket, category, draft)).toEqual({
            seen_inbound_at: S, resolution_code: 'lost', lost_reason: 'price',
        });
    });
    it('sends the duplicate target, the new category and the delivery choice together', () => {
        const ticket = ticketOf();
        const draft: ResolveDraft = {
            ...presetDraft('duplicate', ticket), category_slug: 'late_delivery', duplicate_of_ticket_no: 17, link_status: 'none_found',
        };
        expect(buildResolveBody(S, ticket, CATEGORIES.late_delivery, draft)).toEqual({
            seen_inbound_at: S, category_slug: 'late_delivery', classification_source: 'human',
            resolution_code: 'duplicate', duplicate_of_ticket_no: 17, link_status: 'none_found',
        });
    });
});

describe('wrap-up', () => {
    const draftOf = (change: Partial<ResolveDraft>): ResolveDraft => ({ ...presetDraft('spam', ticketOf()), ...change });

    it('lists what is missing', () => {
        expect(wrapUpMissing(null, draftOf({ category_slug: null, resolution_code: null }))).toEqual(['category', 'resolution_code']);
        expect(wrapUpMissing(CATEGORIES.billing_dispute, draftOf({ category_slug: 'billing_dispute', resolution_code: 'explained' }))).toEqual(['note']);
    });
    it('builds the body', () => {
        const general = draftOf({ category_slug: 'general_enquiry', resolution_code: 'answered' });
        expect(wrapUpMissing(CATEGORIES.general_enquiry, general)).toEqual([]);
        expect(buildWrapUpBody(general)).toEqual({ op: 'wrap_up', category_slug: 'general_enquiry', resolution_code: 'answered' });

        const lost = draftOf({ category_slug: 'new_day_order', resolution_code: 'lost', lost_reason: 'other', resolution_note: 'moved city' });
        expect(wrapUpMissing(CATEGORIES.new_day_order, lost)).toEqual([]);
        expect(buildWrapUpBody(lost)).toEqual({
            op: 'wrap_up', category_slug: 'new_day_order', resolution_code: 'lost', resolution_note: 'moved city', lost_reason: 'other',
        });
    });
    it('does not require the delivery link', () => {
        const spoiled = draftOf({ category_slug: 'milk_spoilage', resolution_code: 'explained', resolution_note: 'x' });
        expect(wrapUpMissing(CATEGORIES.milk_spoilage, spoiled)).toEqual([]);
        expect(buildWrapUpBody(spoiled)).toEqual({
            op: 'wrap_up', category_slug: 'milk_spoilage', resolution_code: 'explained', resolution_note: 'x',
        });
    });
});

describe('presetStart', () => {
    it('posts at once for the fixed-category presets', () => {
        for (const preset of ['spam', 'wrong_number', 'internal'] as const) {
            expect(presetStart(preset, ticketOf(), []).forceDialog).toBe(false);
        }
    });
    it('always opens the dialog for a duplicate', () => {
        expect(presetStart('duplicate', ticketOf({ category_slug: 'general_enquiry' }), []).forceDialog).toBe(true);
    });
    it('posts "no action" at once only when the category is already on the ticket', () => {
        expect(presetStart('no_action', ticketOf({ category_slug: 'general_enquiry' }), []).forceDialog).toBe(false);
        expect(presetStart('no_action', ticketOf({ suggested_category: 'late_delivery' }), []).forceDialog).toBe(true);
    });
    it('takes the source of the suggestion when "no action" uses it', () => {
        const ticket = ticketOf({ suggested_category: 'not_delivered' });
        const { draft } = presetStart('no_action', ticket, [suggestedEvent(1, 'ai')]);
        expect(draft).toMatchObject({ category_slug: 'not_delivered', classification_source: 'ai' });
    });
});

describe('wrapUpDraft', () => {
    const resolvedTicket = (code: Ticket['resolution_code']) => ({ ...ticketOf({ category_slug: 'general_enquiry' }), resolution_code: code });
    it('starts from the ticket resolution when it is a human code', () => {
        expect(wrapUpDraft(resolvedTicket('no_response'), CATEGORIES.general_enquiry).resolution_code).toBe('no_response');
    });
    it('falls back to the category default for duplicate and system-only codes', () => {
        expect(wrapUpDraft(resolvedTicket('duplicate'), CATEGORIES.general_enquiry).resolution_code).toBe('answered');
        expect(wrapUpDraft(resolvedTicket('closed_unclassified'), CATEGORIES.general_enquiry).resolution_code).toBe('answered');
        expect(wrapUpDraft(resolvedTicket(null), null).resolution_code).toBeNull();
    });
});
