/**
 * Shared LMS TypeScript types.
 *
 * Mirror of the SQL constraints in migrations/001_lms_schema.sql. Keep these
 * in sync when extending the schema. Used by both API routes (server) and
 * page components (client) so a single change cascades both ways.
 *
 * Schema reference: src/lib/whatsapp/migrations/001_lms_schema.sql
 * Spec reference:   /home/pradeep/Downloads/swarg-requirements.md
 */

// ─── Consent (spec §2.1) ─────────────────────────────────────────────────

/** Every purpose for which we record consent. CHECK-constrained in SQL. */
export type ConsentPurpose =
    | "transactional_orders"
    | "marketing_in_app"
    | "marketing_whatsapp"
    | "marketing_email"
    | "marketing_sms"
    | "analytics_cookies"
    | "personalisation";

/** Which marketing purposes get withdrawn by the bulk withdraw helper. */
export const MARKETING_PURPOSES: readonly ConsentPurpose[] = [
    "marketing_in_app",
    "marketing_whatsapp",
    "marketing_email",
    "marketing_sms",
] as const;

/** Where this consent capture happened. CHECK-constrained in SQL. */
export type ConsentSource =
    | "signup"
    | "preference_center"
    | "whatsapp_keyword"
    | "in_app_toggle"
    | "checkout"
    | "phone_call"
    | "stall"
    | "import"
    | "legitimate_interest_backfill";

/** Append-only row in app_lms.lms_consent_records. */
export interface ConsentRecord {
    id: string;
    orgId: string;
    customerId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    source: ConsentSource;
    noticeVersion: string;
    language: string;
    ipHash?: string | null;
    userAgent?: string | null;
    grantedAt?: string | null;
    withdrawnAt?: string | null;
    evidenceBlob?: Record<string, unknown> | null;
    createdAt: string;
}

/** Effective consent state for one customer × purpose. */
export interface EffectiveConsent {
    customerId: string;
    purpose: ConsentPurpose;
    granted: boolean;
    source: ConsentSource;
    noticeVersion: string;
    language: string;
    asOf: string;
}

/** Full effective state across all purposes for a single customer. */
export type CustomerConsentMap = Record<ConsentPurpose, EffectiveConsent | null>;

// ─── Privacy notice ──────────────────────────────────────────────────────

export interface PrivacyNotice {
    version: string;
    language: "en" | "kn" | "hi";
    publishedAt: string;
    bodyMarkdown: string;
}

// ─── DSAR (Data Subject Access Request — spec §10.3) ─────────────────────

export type DsarRequestType = "access" | "correction" | "erasure" | "portability";

export type DsarStatus =
    | "submitted"
    | "verifying_identity"
    | "in_progress"
    | "fulfilled"
    | "rejected"
    | "expired";

export interface DsarRequest {
    id: string;
    orgId: string;
    customerId?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    requestType: DsarRequestType;
    status: DsarStatus;
    details?: string | null;
    slaDeadline: string;
    fulfilledAt?: string | null;
    rejectionReason?: string | null;
    handledByUserId?: string | null;
    createdAt: string;
}
