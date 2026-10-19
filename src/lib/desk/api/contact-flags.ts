// Routes 21 to 24 (unit P1e): manual internal / customer flags on a phone number, and the
// conversations of internal contacts for the Internal lane. Phones are stored in the 10-digit form.

import { supabaseAdmin } from '@/lib/whatsapp/supabase';
import type { z } from 'zod';
import { INTERNAL_LANE_DAYS } from '../constants';
import type {
    contactFlagCreateBody, contactFlagPatchBody, contactFlagsQuery, internalConversationsQuery,
} from '../contracts';
import { DeskApiError, dbGuard } from '../api-error';
import { addIstDays, istDayStartUtc, istToday } from '../business-hours';
import { buildInternalMatcher, internalPhoneList } from '../internal-contacts';
import { phoneVariants, toBackendPhone } from '../phone';
import type {
    ContactFlag, ContactFlagResponse, ContactFlagsResponse, DeskContext, InternalConversationItem,
    InternalConversationsResponse,
} from '../types';

const TABLE = 'desk_contact_flags';
const IN_CHUNK = 100;
const ACTIVE_FLAGS_MAX = 5000;

function chunked<T>(items: readonly T[]): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += IN_CHUNK) chunks.push(items.slice(index, index + IN_CHUNK));
    return chunks;
}

export async function listContactFlags(
    query: z.infer<typeof contactFlagsQuery>, ctx: DeskContext,
): Promise<ContactFlagsResponse> {
    if (query.include_removed === '1' && !ctx.rights.manager) {
        throw new DeskApiError('forbidden', 'Only a Desk manager can see removed flags.');
    }
    let builder = supabaseAdmin.from(TABLE).select('*');
    if (query.kind) builder = builder.eq('kind', query.kind);
    if (query.include_removed !== '1') builder = builder.is('removed_at', null);
    const { data, error } = await builder.order('id', { ascending: false }).limit(query.limit);
    dbGuard(error, TABLE);
    return { items: (data ?? []) as ContactFlag[] };
}

async function activeFlagFor(phone: string): Promise<ContactFlag | null> {
    const { data, error } = await supabaseAdmin.from(TABLE).select('*').eq('phone', phone).is('removed_at', null).limit(1);
    dbGuard(error, TABLE);
    return ((data ?? [])[0] as ContactFlag | undefined) ?? null;
}

/** 201 with the new row, or 200 with the active row of the same kind that already exists. */
export async function createContactFlag(
    body: z.infer<typeof contactFlagCreateBody>, ctx: DeskContext,
): Promise<{ response: ContactFlagResponse; created: boolean }> {
    const phone = toBackendPhone(body.phone);
    if (phone === null) throw new DeskApiError('validation_failed', 'phone: not a 10-digit Indian mobile number');
    const existing = await activeFlagFor(phone);
    if (existing !== null) return sameKindOrRefuse(existing, body.kind);
    const { data, error } = await supabaseAdmin.from(TABLE).insert({
        phone, kind: body.kind, label: body.label ?? null, added_by: ctx.actor.id, added_by_name: ctx.actor.name,
    }).select('*');
    if (dbGuard(error, TABLE) === 'conflict') {
        // Two managers at once: the unique index on active rows let the other insert win.
        const winner = await activeFlagFor(phone);
        if (winner === null) throw new DeskApiError('internal_error', 'Could not save the flag.');
        return sameKindOrRefuse(winner, body.kind);
    }
    const row = (data ?? [])[0] as ContactFlag | undefined;
    if (!row) throw new DeskApiError('internal_error', 'Could not save the flag.');
    return { response: { item: row }, created: true };
}

function sameKindOrRefuse(existing: ContactFlag, kind: ContactFlag['kind']): { response: ContactFlagResponse; created: boolean } {
    if (existing.kind === kind) return { response: { item: existing }, created: false };
    throw new DeskApiError('validation_failed', `phone: already marked as ${existing.kind}; remove that flag first`);
}

export async function patchContactFlag(
    body: z.infer<typeof contactFlagPatchBody>, ctx: DeskContext,
): Promise<ContactFlagResponse> {
    const patch: Record<string, unknown> = {
        removed_at: new Date().toISOString(), removed_by: ctx.actor.id, removed_by_name: ctx.actor.name,
    };
    if (body.label !== undefined) patch.label = body.label;
    const { data, error } = await supabaseAdmin.from(TABLE).update(patch).eq('id', body.id).is('removed_at', null).select('*');
    dbGuard(error, TABLE);
    const row = (data ?? [])[0] as ContactFlag | undefined;
    if (row) return { item: row };
    // Already removed (a second click) answers the row unchanged; an unknown id is 404.
    const { data: found, error: readError } = await supabaseAdmin.from(TABLE).select('*').eq('id', body.id).limit(1);
    dbGuard(readError, TABLE);
    const current = (found ?? [])[0] as ContactFlag | undefined;
    if (!current) throw new DeskApiError('not_found', 'Flag not found.');
    return { item: current };
}

interface ContactRow { id: string; name: string | null; phone: string | null }
interface LaneConversationRow { id: string; contact_id: string; integrated_number: string | null; last_incoming_timestamp: string | null }

async function readContacts(phones: readonly string[]): Promise<ContactRow[]> {
    const variants = [...new Set(phones.flatMap((phone) => phoneVariants(phone)))];
    const rows: ContactRow[] = [];
    for (const part of chunked(variants)) {
        const { data, error } = await supabaseAdmin.from('contacts').select('id, name, phone').in('phone', part).limit(1000);
        dbGuard(error, 'contacts');
        rows.push(...((data ?? []) as ContactRow[]));
    }
    return rows;
}

async function readLaneConversations(contactIds: readonly string[], sinceIso: string, limit: number): Promise<LaneConversationRow[]> {
    const rows: LaneConversationRow[] = [];
    for (const part of chunked(contactIds)) {
        const { data, error } = await supabaseAdmin.from('conversations')
            .select('id, contact_id, integrated_number, last_incoming_timestamp')
            .in('contact_id', part).gte('last_incoming_timestamp', sinceIso)
            .order('last_incoming_timestamp', { ascending: false }).limit(limit);
        dbGuard(error, 'conversations');
        rows.push(...((data ?? []) as LaneConversationRow[]));
    }
    return rows.sort((a, b) => Date.parse(b.last_incoming_timestamp ?? '') - Date.parse(a.last_incoming_timestamp ?? '')).slice(0, limit);
}

/** Conversations of internal contacts with a customer message in the last INTERNAL_LANE_DAYS IST days. */
export async function listInternalConversations(
    query: z.infer<typeof internalConversationsQuery>, ctx: DeskContext,
): Promise<InternalConversationsResponse> {
    const { data, error } = await supabaseAdmin.from(TABLE).select('phone, kind, label').is('removed_at', null).limit(ACTIVE_FLAGS_MAX);
    dbGuard(error, TABLE);
    const flags = (data ?? []) as Array<Pick<ContactFlag, 'phone' | 'kind' | 'label'>>;
    const input = { staffPhones: ctx.settings.staff_phones, flags };
    const phones = internalPhoneList(input);
    if (phones.length === 0) return { items: [] };
    const matcher = buildInternalMatcher(input);
    const contacts = await readContacts(phones);
    const byId = new Map(contacts.map((contact) => [contact.id, contact]));
    const now = new Date();
    const sinceIso = istDayStartUtc(addIstDays(istToday(now), -(INTERNAL_LANE_DAYS - 1))).toISOString();
    const conversations = await readLaneConversations([...byId.keys()], sinceIso, query.limit);
    const labels = new Map(flags.map((flag) => [toBackendPhone(flag.phone), flag.label]));
    const items: InternalConversationItem[] = [];
    for (const row of conversations) {
        const contact = byId.get(row.contact_id);
        const source = matcher.sourceOf(contact?.phone);
        const ten = toBackendPhone(contact?.phone ?? null);
        if (!contact || source === null || ten === null) continue;
        items.push({
            conversation_id: row.id,
            integrated_number: row.integrated_number,
            contact_name: contact.name,
            phone_tail: ten.slice(-4),
            source,
            last_inbound_at: row.last_incoming_timestamp,
            label: source === 'flag' ? (labels.get(ten) ?? null) : null,
        });
    }
    return { items };
}
