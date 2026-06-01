/**
 * Consent service — the only module that writes to lms_consent_records.
 *
 * Strict append-only semantics: every grant or withdrawal is a NEW row.
 * Effective consent for a (customer, purpose) tuple is the most recent
 * row by created_at. This matches DPDP Act requirements for a verifiable
 * consent ledger (spec §2.1 + §10).
 *
 * Anyone with a Supabase admin handle COULD bypass this and write the
 * raw table directly — please don't. Route everything through here so
 * that future audit hooks, evidence packing, and notice-version pinning
 * happen consistently.
 */

import { lmsAdmin } from "@/lib/lms/supabase";
import {
    type ConsentPurpose,
    type ConsentRecord,
    type ConsentSource,
    type CustomerConsentMap,
    type EffectiveConsent,
    MARKETING_PURPOSES,
} from "@/lib/lms/types";

/** Read the latest record per purpose for one customer. */
export async function getEffectiveConsents(args: {
    customerId: string;
    /** Accepted but ignored — single internal org (see ORG_ID). Kept so the
     *  out-of-scope /api/agent-tools callers compile unchanged. */
    orgId?: string;
}): Promise<CustomerConsentMap> {
    const { customerId } = args;

    // Pull every consent row for this customer, ordered newest-first.
    // We compute "effective" client-side by taking first occurrence per purpose
    // — cleaner than a per-purpose subquery and the result set is small
    // (rarely more than a few dozen rows per customer over time).
    const { data, error } = await lmsAdmin
        .from("lms_consent_records")
        .select(
            "id, org_id, customer_id, purpose, granted, source, notice_version, language, granted_at, withdrawn_at, created_at",
        )
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`[consent] failed to read effective consents: ${error.message}`);
    }

    const seen = new Set<ConsentPurpose>();
    const map: CustomerConsentMap = {
        transactional_orders: null,
        marketing_in_app: null,
        marketing_whatsapp: null,
        marketing_email: null,
        marketing_sms: null,
        analytics_cookies: null,
        personalisation: null,
    };

    for (const row of data ?? []) {
        const purpose = row.purpose as ConsentPurpose;
        if (seen.has(purpose)) continue;
        seen.add(purpose);
        map[purpose] = {
            customerId: row.customer_id as string,
            purpose,
            granted: row.granted as boolean,
            source: row.source as ConsentSource,
            noticeVersion: row.notice_version as string,
            language: row.language as string,
            asOf: row.created_at as string,
        };
    }

    return map;
}

/** Convenience: just check if a specific purpose is currently granted. */
export async function hasConsent(args: {
    customerId: string;
    purpose: ConsentPurpose;
}): Promise<boolean> {
    const map = await getEffectiveConsents(args);
    return map[args.purpose]?.granted === true;
}

/** Full history for DSAR fulfilment + audit. Returns newest-first. */
export async function getConsentHistory(args: {
    customerId: string;
}): Promise<ConsentRecord[]> {
    const { data, error } = await lmsAdmin
        .from("lms_consent_records")
        .select("*")
        .eq("customer_id", args.customerId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`[consent] failed to read history: ${error.message}`);
    }

    return (data ?? []).map(mapRow);
}

/**
 * Record a consent decision (grant or withdraw).
 *
 * Append-only — this always INSERTs a new row, never UPDATEs.
 */
export async function recordConsent(args: {
    customerId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    source: ConsentSource;
    noticeVersion: string;
    language?: string;
    ipHash?: string;
    userAgent?: string;
    evidenceBlob?: Record<string, unknown>;
    /** Accepted but ignored — single internal org (see ORG_ID). Kept so the
     *  out-of-scope /api/agent-tools callers compile unchanged. */
    orgId?: string;
}): Promise<ConsentRecord> {
    const now = new Date().toISOString();
    const row = {
        customer_id: args.customerId,
        purpose: args.purpose,
        granted: args.granted,
        source: args.source,
        notice_version: args.noticeVersion,
        language: args.language ?? "en",
        ip_hash: args.ipHash ?? null,
        user_agent: args.userAgent ?? null,
        granted_at: args.granted ? now : null,
        withdrawn_at: args.granted ? null : now,
        evidence_blob: args.evidenceBlob ?? null,
    };

    const { data, error } = await lmsAdmin
        .from("lms_consent_records")
        .insert(row)
        .select("*")
        .single();

    if (error) {
        throw new Error(`[consent] failed to insert record: ${error.message}`);
    }

    return mapRow(data);
}

/**
 * Withdraw all marketing purposes in a single call. Writes one row per
 * marketing purpose (4 rows total). Useful for the WhatsApp STOP keyword
 * and the "Withdraw all marketing consent" button in the Preference Center.
 */
export async function withdrawAllMarketing(args: {
    customerId: string;
    source: ConsentSource;
    noticeVersion: string;
    language?: string;
    ipHash?: string;
    userAgent?: string;
    evidenceBlob?: Record<string, unknown>;
    /** Accepted but ignored — single internal org (see ORG_ID). Kept so the
     *  out-of-scope /api/agent-tools callers compile unchanged. */
    orgId?: string;
}): Promise<ConsentRecord[]> {
    const written: ConsentRecord[] = [];
    for (const purpose of MARKETING_PURPOSES) {
        const rec = await recordConsent({
            ...args,
            purpose,
            granted: false,
        });
        written.push(rec);
    }
    return written;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ConsentRecord {
    return {
        id: row.id as string,
        orgId: row.org_id as string,
        customerId: row.customer_id as string,
        purpose: row.purpose as ConsentPurpose,
        granted: row.granted as boolean,
        source: row.source as ConsentSource,
        noticeVersion: row.notice_version as string,
        language: row.language as string,
        ipHash: (row.ip_hash as string | null) ?? null,
        userAgent: (row.user_agent as string | null) ?? null,
        grantedAt: (row.granted_at as string | null) ?? null,
        withdrawnAt: (row.withdrawn_at as string | null) ?? null,
        evidenceBlob:
            (row.evidence_blob as Record<string, unknown> | null) ?? null,
        createdAt: row.created_at as string,
    };
}

/** Hash an IP address before storing — DPDP minimisation requires pseudonymisation. */
export async function hashIp(ip: string): Promise<string> {
    const enc = new TextEncoder().encode(ip + (process.env.CONSENT_IP_SALT ?? "swarg-lms"));
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
