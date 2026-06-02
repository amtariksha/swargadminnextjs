/**
 * Lead types — schema mirror of app_lms.lms_leads.
 *
 * Schema: src/lib/whatsapp/migrations/001_lms_schema.sql §2.5.
 * Spec:   /home/pradeep/Downloads/swarg-requirements.md §2.5.
 */

export type LeadSource =
    | "whatsapp"
    | "phone"
    | "website_form"
    | "app_install"
    | "stall"
    | "referral"
    | "social"
    | "geo_ai"
    | "organic_search"
    | "csv_import"
    | "manual"
    | "other";

export type LeadStatus =
    | "new"
    | "contacted"
    | "qualified"
    | "converted"
    | "lost"
    | "duplicate";

export interface Lead {
    id: string;
    orgId: string;
    source: LeadSource;
    sourceDetails?: Record<string, unknown> | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    pincode?: string | null;
    /** public.contacts.id (Supabase) — set when the lead came from WhatsApp. */
    contactId?: string | null;
    language: string;
    status: LeadStatus;
    ownerUserId?: string | null;
    score?: number | null;
    tags?: string[] | null;
    firstTouchAt: string;
    lastActivityAt?: string | null;
    convertedCustomerId?: string | null;
    convertedAt?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface LeadFilters {
    status?: LeadStatus | "all";
    source?: LeadSource | "all";
    ownerUserId?: string | "any";
    fromDate?: string;
    toDate?: string;
    search?: string;       // phone / email / name LIKE
    limit?: number;
    offset?: number;
}

export interface LeadListResponse {
    count: number;
    total: number;
    leads: Lead[];
}

/**
 * Lead-history / activity timeline entry. Phase-1 surface uses an
 * in-memory derivation from conversations + messages + notes, since
 * lms_lead_activities was scoped out of migration 001 to keep the
 * critical path tight. Will materialise in a follow-up.
 */
export interface LeadActivity {
    id: string;
    leadId: string;
    activityType:
        | "lead_created"
        | "status_changed"
        | "assignment_changed"
        | "note_added"
        | "message_received"
        | "message_sent"
        | "converted";
    body?: string;
    actorUserId?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
}
