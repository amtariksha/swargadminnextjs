// Find-or-create for the two rows every stored WhatsApp message needs: the contact (one per phone)
// and the conversation (one per contact and business number). Used by both webhooks and by
// POST /api/whatsapp/conversations.
//
// Oldest row wins: duplicate (contact, number) conversations existed before migration 017b, and a
// .single() lookup fails on two rows. An insert that loses a race to a concurrent request fails
// with 23505 (contacts (org_id, phone); conversations (contact_id, integrated_number) once 017b
// created uq_conversations_contact_number) and the winner's row is read again.
//
// Never throws: every failure is logged without a phone number and returned as null, so the caller
// keeps its existing failure path.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase";

export interface ContactRow { id: string; name: string | null }
export interface ConversationRow { id: string; [column: string]: unknown }
export interface Found<T> { row: T; created: boolean }
/** The one method these helpers use; tests pass a fake. */
export type LookupDb = Pick<SupabaseClient, "from">;

export interface FindOrCreateConversationInput {
    contactId: string;
    /** null only for the manual POST when no active number exists (matched with IS NULL). */
    integratedNumber: string | null;
    /** Insert payload when no row exists; null = find only, never create. Passed through unchanged. */
    insert: Record<string, unknown> | null;
    /** Columns returned by both the lookup and the insert; default "id". */
    select?: string;
}

const LOG = "[conversation-lookup]";
const UNIQUE_VIOLATION = "23505";
const CONTACT_COLUMNS = "id, name";

const codeOf = (error: unknown): string => {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === "string" && code !== "" ? code : "unknown";
};

/** The oldest conversation of the pair, or null when there is none or the read failed. */
async function selectConversation(
    db: LookupDb, contactId: string, integratedNumber: string | null, select: string,
): Promise<ConversationRow | null> {
    try {
        const byContact = db.from("conversations").select(select).eq("contact_id", contactId);
        const byNumber = integratedNumber === null
            ? byContact.is("integrated_number", null)
            : byContact.eq("integrated_number", integratedNumber);
        const { data, error } = await byNumber.order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (error) {
            console.error(`${LOG} conversation select failed code=${codeOf(error)}`);
            return null;
        }
        return (data as unknown as ConversationRow | null) ?? null;
    } catch (err) {
        console.error(`${LOG} conversation select failed code=${codeOf(err)}`);
        return null;
    }
}

export async function findOrCreateConversation(
    input: FindOrCreateConversationInput, db: LookupDb = supabaseAdmin,
): Promise<Found<ConversationRow> | null> {
    const select = input.select ?? "id";
    const existing = await selectConversation(db, input.contactId, input.integratedNumber, select);
    if (existing) return { row: existing, created: false };
    if (input.insert === null) return null;

    try {
        const { data, error } = await db.from("conversations").insert(input.insert).select(select).single();
        if (!error && data) return { row: data as unknown as ConversationRow, created: true };
        if (codeOf(error) !== UNIQUE_VIOLATION) {
            console.error(`${LOG} conversation insert failed code=${codeOf(error)}`);
            return null;
        }
    } catch (err) {
        console.error(`${LOG} conversation insert failed code=${codeOf(err)}`);
        return null;
    }

    const winner = await selectConversation(db, input.contactId, input.integratedNumber, select);
    if (winner) {
        console.log(`${LOG} insert lost a race; using the existing conversation`);
        return { row: winner, created: false };
    }
    console.error(`${LOG} insert lost a race but the existing conversation could not be read`);
    return null;
}

export async function findContactByPhone(phone: string, db: LookupDb = supabaseAdmin): Promise<ContactRow | null> {
    try {
        const { data, error } = await db.from("contacts").select(CONTACT_COLUMNS).eq("phone", phone).limit(1).maybeSingle();
        if (error) {
            console.error(`${LOG} contact select failed code=${codeOf(error)}`);
            return null;
        }
        return (data as unknown as ContactRow | null) ?? null;
    } catch (err) {
        console.error(`${LOG} contact select failed code=${codeOf(err)}`);
        return null;
    }
}

export async function createContactOrReselect(
    insert: { name: string; phone: string }, db: LookupDb = supabaseAdmin,
): Promise<Found<ContactRow> | null> {
    try {
        const { data, error } = await db.from("contacts")
            .insert({ name: insert.name, phone: insert.phone })
            .select(CONTACT_COLUMNS)
            .single();
        if (!error && data) return { row: data as unknown as ContactRow, created: true };
        if (codeOf(error) !== UNIQUE_VIOLATION) {
            console.error(`${LOG} contact insert failed code=${codeOf(error)}`);
            return null;
        }
    } catch (err) {
        console.error(`${LOG} contact insert failed code=${codeOf(err)}`);
        return null;
    }

    const winner = await findContactByPhone(insert.phone, db);
    if (winner) {
        console.log(`${LOG} contact insert lost a race; using the existing contact`);
        return { row: winner, created: false };
    }
    console.error(`${LOG} contact insert lost a race but the existing contact could not be read`);
    return null;
}
