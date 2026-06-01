/**
 * Lead service — single chokepoint for app_lms.lms_leads writes.
 *
 * Idempotency rule: createLead is keyed by (org_id, phone) when phone is
 * provided. If an open lead with the same phone already exists, we update
 * its last_activity_at + merge metadata instead of inserting a duplicate.
 * This matters because the WhatsApp webhook + the public intake endpoint
 * + manual entry all flow through the same code path and the same person
 * may show up multiple times before being qualified.
 *
 * "Open" = status NOT IN ('converted', 'lost', 'duplicate'). Once closed,
 * a fresh inbound creates a new lead (the customer can re-engage and we
 * want a clean record).
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import {
    type Lead,
    type LeadFilters,
    type LeadListResponse,
    type LeadSource,
    type LeadStatus,
} from "@/lib/lms/leads/types";

// ─── Read ─────────────────────────────────────────────────────────────────

export async function listLeads(
    filters: LeadFilters = {},
): Promise<LeadListResponse> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    let q = lmsAdmin
        .from("lms_leads")
        .select("*", { count: "exact" })
        .order("first_touch_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters.source && filters.source !== "all") q = q.eq("source", filters.source);
    if (filters.ownerUserId && filters.ownerUserId !== "any") {
        q = q.eq("owner_user_id", filters.ownerUserId);
    }
    if (filters.fromDate) q = q.gte("first_touch_at", filters.fromDate);
    if (filters.toDate) q = q.lte("first_touch_at", filters.toDate);
    if (filters.search && filters.search.trim().length > 0) {
        // Case-insensitive LIKE across name / phone / email. Supabase PostgREST
        // accepts `or=` with a comma-list of conditions.
        const term = filters.search.trim();
        const like = `%${term}%`;
        q = q.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
    }

    const { data, error, count } = await q;
    if (error) throw new Error(`[leads] list failed: ${error.message}`);
    return {
        count: data?.length ?? 0,
        total: count ?? 0,
        leads: (data ?? []).map(mapRow),
    };
}

export async function getLead(args: {
    leadId: string;
}): Promise<Lead | null> {
    const { data, error } = await lmsAdmin
        .from("lms_leads")
        .select("*")
        .eq("id", args.leadId)
        .maybeSingle();
    if (error) throw new Error(`[leads] get failed: ${error.message}`);
    return data ? mapRow(data) : null;
}

// ─── Write ────────────────────────────────────────────────────────────────

export async function createLead(args: {
    source: LeadSource;
    sourceDetails?: Record<string, unknown>;
    name?: string;
    phone?: string;
    email?: string;
    pincode?: string;
    language?: string;
    ownerUserId?: string;
    tags?: string[];
    notes?: string;
    metadata?: Record<string, unknown>;
    /** Accepted but ignored — single internal org (see ORG_ID). Kept so the
     *  out-of-scope /api/agent-tools callers compile unchanged. */
    orgId?: string;
}): Promise<{ lead: Lead; deduped: boolean }> {
    const cleanPhone = args.phone ? normalisePhone(args.phone) : null;

    // Idempotency check: if there's an OPEN lead for this phone,
    // touch it instead of inserting a new row.
    if (cleanPhone) {
        const { data: existing, error: lookupErr } = await lmsAdmin
            .from("lms_leads")
            .select("*")
            .eq("phone", cleanPhone)
            .not("status", "in", "(converted,lost,duplicate)")
            .order("first_touch_at", { ascending: false })
            .limit(1);
        if (lookupErr) {
            throw new Error(`[leads] dedupe lookup failed: ${lookupErr.message}`);
        }
        if (existing && existing.length > 0) {
            const found = existing[0];
            const mergedMeta = {
                ...((found.metadata as Record<string, unknown>) ?? {}),
                ...(args.metadata ?? {}),
                last_seen_source: args.source,
            };
            const { data: updated, error: updErr } = await lmsAdmin
                .from("lms_leads")
                .update({
                    last_activity_at: new Date().toISOString(),
                    metadata: mergedMeta,
                    // Update missing fields opportunistically.
                    name: found.name ?? args.name ?? null,
                    email: found.email ?? args.email ?? null,
                    pincode: found.pincode ?? args.pincode ?? null,
                })
                .eq("id", found.id)
                .select("*")
                .single();
            if (updErr) {
                throw new Error(`[leads] dedupe update failed: ${updErr.message}`);
            }
            return { lead: mapRow(updated), deduped: true };
        }
    }

    const { data, error } = await lmsAdmin
        .from("lms_leads")
        .insert({
            source: args.source,
            source_details: args.sourceDetails ?? null,
            name: args.name ?? null,
            phone: cleanPhone,
            email: args.email ?? null,
            pincode: args.pincode ?? null,
            language: args.language ?? "en",
            status: "new" satisfies LeadStatus,
            owner_user_id: args.ownerUserId ?? null,
            tags: args.tags ?? null,
            notes: args.notes ?? null,
            metadata: args.metadata ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(`[leads] insert failed: ${error.message}`);
    return { lead: mapRow(data), deduped: false };
}

export async function updateLead(args: {
    leadId: string;
    patch: Partial<
        Pick<
            Lead,
            "name" | "phone" | "email" | "pincode" | "language" |
            "status" | "ownerUserId" | "score" | "tags" | "notes"
        > & {
            metadata?: Record<string, unknown>;
        }
    >;
}): Promise<Lead> {
    const update: Record<string, unknown> = {
        last_activity_at: new Date().toISOString(),
    };
    if (args.patch.name !== undefined) update.name = args.patch.name;
    if (args.patch.phone !== undefined) {
        update.phone = args.patch.phone ? normalisePhone(args.patch.phone) : null;
    }
    if (args.patch.email !== undefined) update.email = args.patch.email;
    if (args.patch.pincode !== undefined) update.pincode = args.patch.pincode;
    if (args.patch.language !== undefined) update.language = args.patch.language;
    if (args.patch.status !== undefined) update.status = args.patch.status;
    if (args.patch.ownerUserId !== undefined) update.owner_user_id = args.patch.ownerUserId;
    if (args.patch.score !== undefined) update.score = args.patch.score;
    if (args.patch.tags !== undefined) update.tags = args.patch.tags;
    if (args.patch.notes !== undefined) update.notes = args.patch.notes;
    if (args.patch.metadata !== undefined) update.metadata = args.patch.metadata;

    const { data, error } = await lmsAdmin
        .from("lms_leads")
        .update(update)
        .eq("id", args.leadId)
        .select("*")
        .single();
    if (error) throw new Error(`[leads] update failed: ${error.message}`);
    return mapRow(data);
}

export async function convertLead(args: {
    leadId: string;
    convertedCustomerId: string;
}): Promise<Lead> {
    const now = new Date().toISOString();
    const { data, error } = await lmsAdmin
        .from("lms_leads")
        .update({
            status: "converted",
            converted_customer_id: args.convertedCustomerId,
            converted_at: now,
            last_activity_at: now,
        })
        .eq("id", args.leadId)
        .select("*")
        .single();
    if (error) throw new Error(`[leads] convert failed: ${error.message}`);
    return mapRow(data);
}

export async function deleteLead(args: {
    leadId: string;
}): Promise<void> {
    const { error } = await lmsAdmin
        .from("lms_leads")
        .delete()
        .eq("id", args.leadId);
    if (error) throw new Error(`[leads] delete failed: ${error.message}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalisePhone(input: string): string {
    return input.replace(/^\+/, "").replace(/\s+/g, "").trim();
}

function mapRow(row: Record<string, unknown>): Lead {
    return {
        id: row.id as string,
        orgId: row.org_id as string,
        source: row.source as LeadSource,
        sourceDetails:
            (row.source_details as Record<string, unknown> | null) ?? null,
        name: (row.name as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        pincode: (row.pincode as string | null) ?? null,
        language: (row.language as string) ?? "en",
        status: row.status as LeadStatus,
        ownerUserId: (row.owner_user_id as string | null) ?? null,
        score: (row.score as number | null) ?? null,
        tags: (row.tags as string[] | null) ?? null,
        firstTouchAt: row.first_touch_at as string,
        lastActivityAt: (row.last_activity_at as string | null) ?? null,
        convertedCustomerId:
            (row.converted_customer_id as string | null) ?? null,
        convertedAt: (row.converted_at as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    };
}
