/**
 * Unified-customer service — single chokepoint for app_lms.lms_unified_customers.
 *
 * This table is the application-enforced bridge between the WhatsApp/LMS
 * Supabase store and the backend `users` Postgres store. The two databases
 * never join; instead we cache (phone ↔ backend_user_id ↔ contact_id) here so
 * the LMS can answer "is this phone already a customer?" without a per-request
 * cross-DB hop. Phone is the only join key (`919876543210`).
 *
 * Populated by:
 *   • the real-time first-order convert signal (POST /api/agent-tools/lms/leads/convert)
 *   • the nightly reconcile (POST /api/agent-tools/lms/reconcile)
 *
 * Single-org: org_id carries a DB DEFAULT (migration 008) so inserts omit it.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import { supabaseAdmin } from "@/lib/whatsapp/supabase";

export interface UnifiedCustomer {
    customerId: string;
    contactId: string | null;
    backendUserId: number | null;
    phone: string;
    name: string | null;
    email: string | null;
}

function normalisePhone(input: string): string {
    return input.replace(/^\+/, "").replace(/\s+/g, "").trim();
}

/**
 * Resolve the WhatsApp contact id for a phone (public.contacts, not app_lms).
 * Returns null if the phone has never messaged on WhatsApp.
 */
export async function resolveContactIdByPhone(
    phone: string,
): Promise<string | null> {
    const clean = normalisePhone(phone);
    if (!clean) return null;
    const { data, error } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("phone", clean)
        .limit(1)
        .maybeSingle();
    if (error) {
        console.warn("[unified] contact lookup failed:", error.message);
        return null;
    }
    return (data?.id as string | undefined) ?? null;
}

/**
 * Is this phone already a known backend customer? True only when a unified
 * row exists AND carries a backend_user_id (i.e. they've been provisioned in
 * the backend `users` DB). Supabase-only — safe to call on the webhook hot
 * path. New-but-not-yet-reconciled customers return null here; the nightly
 * reconcile backfills them.
 */
export async function lookupKnownCustomer(
    phone: string,
): Promise<UnifiedCustomer | null> {
    const clean = normalisePhone(phone);
    if (!clean) return null;
    const { data, error } = await lmsAdmin
        .from("lms_unified_customers")
        .select("customer_id, contact_id, backend_user_id, phone, name, email")
        .eq("phone", clean)
        .not("backend_user_id", "is", null)
        .limit(1)
        .maybeSingle();
    if (error) {
        console.warn("[unified] known-customer lookup failed:", error.message);
        return null;
    }
    return data ? mapRow(data) : null;
}

/**
 * Insert-or-update the unified row for a phone. Keyed by phone (single org).
 * Done as select-then-write rather than PostgREST upsert so the customer_id
 * primary key is never rewritten on conflict (it has no DB default and is
 * referenced as the canonical LMS customer id).
 */
export async function upsertUnifiedCustomer(args: {
    phone: string;
    backendUserId?: number | null;
    contactId?: string | null;
    name?: string | null;
    email?: string | null;
}): Promise<UnifiedCustomer> {
    const clean = normalisePhone(args.phone);
    if (!clean) throw new Error("[unified] upsert requires a phone");

    const { data: existing, error: lookupErr } = await lmsAdmin
        .from("lms_unified_customers")
        .select("customer_id, contact_id, backend_user_id, phone, name, email")
        .eq("phone", clean)
        .limit(1)
        .maybeSingle();
    if (lookupErr) {
        throw new Error(`[unified] lookup failed: ${lookupErr.message}`);
    }

    const now = new Date().toISOString();

    if (existing) {
        const patch: Record<string, unknown> = { refreshed_at: now };
        // Only fill/upgrade fields; never clobber an existing value with null.
        if (args.backendUserId != null) patch.backend_user_id = args.backendUserId;
        if (args.contactId != null && existing.contact_id == null) {
            patch.contact_id = args.contactId;
        }
        if (args.name != null && existing.name == null) patch.name = args.name;
        if (args.email != null && existing.email == null) patch.email = args.email;

        const { data: updated, error: updErr } = await lmsAdmin
            .from("lms_unified_customers")
            .update(patch)
            .eq("customer_id", existing.customer_id)
            .select("customer_id, contact_id, backend_user_id, phone, name, email")
            .single();
        if (updErr) throw new Error(`[unified] update failed: ${updErr.message}`);
        return mapRow(updated);
    }

    const { data: inserted, error: insErr } = await lmsAdmin
        .from("lms_unified_customers")
        .insert({
            customer_id: crypto.randomUUID(),
            phone: clean,
            backend_user_id: args.backendUserId ?? null,
            contact_id: args.contactId ?? null,
            name: args.name ?? null,
            email: args.email ?? null,
            refreshed_at: now,
        })
        .select("customer_id, contact_id, backend_user_id, phone, name, email")
        .single();
    if (insErr) throw new Error(`[unified] insert failed: ${insErr.message}`);
    return mapRow(inserted);
}

function mapRow(row: Record<string, unknown>): UnifiedCustomer {
    return {
        customerId: row.customer_id as string,
        contactId: (row.contact_id as string | null) ?? null,
        backendUserId:
            row.backend_user_id != null ? Number(row.backend_user_id) : null,
        phone: row.phone as string,
        name: (row.name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
    };
}
