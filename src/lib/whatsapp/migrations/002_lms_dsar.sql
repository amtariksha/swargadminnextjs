-- ============================================================================
-- Swarg LMS — Phase 1 · Migration 002
-- DSAR (Data Subject Access Request) queue
-- ============================================================================
--
-- Spec reference: /home/pradeep/Downloads/swarg-requirements.md §10.3
-- DPDP Rules require fulfilment within 7 days — sla_deadline column carries
-- the deadline timestamp; admin UI surfaces it as a countdown.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

SET search_path = app_lms, public;

CREATE TABLE IF NOT EXISTS app_lms.lms_dsar_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL,
    customer_id         UUID,                -- known? bind to a unified customer
    contact_phone       TEXT,                -- one of these is required for OTP verify
    contact_email       TEXT,
    request_type        TEXT NOT NULL CHECK (request_type IN (
                            'access','correction','erasure','portability'
                        )),
    status              TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
                            'submitted','verifying_identity','in_progress',
                            'fulfilled','rejected','expired'
                        )),
    details             TEXT,                -- free-text the data principal wrote
    identity_verified_at TIMESTAMPTZ,
    otp_attempts        SMALLINT NOT NULL DEFAULT 0,
    sla_deadline        TIMESTAMPTZ NOT NULL,  -- created_at + 7 days, set at insert
    fulfilled_at        TIMESTAMPTZ,
    rejection_reason    TEXT,
    handled_by_user_id  UUID,                -- admin_users.id (MySQL)
    fulfilment_blob     JSONB,                -- e.g. signed URL to export ZIP
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_dsar_org_status
    ON app_lms.lms_dsar_requests (org_id, status, sla_deadline);

CREATE INDEX IF NOT EXISTS idx_lms_dsar_phone
    ON app_lms.lms_dsar_requests (contact_phone)
    WHERE contact_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lms_dsar_email
    ON app_lms.lms_dsar_requests (contact_email)
    WHERE contact_email IS NOT NULL;

-- ============================================================================
-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'app_lms' AND table_name = 'lms_dsar_requests'
--    ORDER BY ordinal_position;
-- ============================================================================
