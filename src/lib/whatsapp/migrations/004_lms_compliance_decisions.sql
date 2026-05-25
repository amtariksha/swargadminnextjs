-- ============================================================================
-- Swarg LMS — Phase 1 · Migration 004
-- Compliance Guard decisions audit log
-- ============================================================================
--
-- Every Compliance Guard verdict (pass / warn / block) gets a row here so
-- we have a paper trail for DPDP audits ("show me every campaign you
-- blocked in Q1 and why"). The Agent Force tool
-- lms.write_compliance_decision writes here.
--
-- Idempotent; safe to re-run.
-- ============================================================================

SET search_path = app_lms, public;

CREATE TABLE IF NOT EXISTS app_lms.lms_compliance_decisions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                      UUID NOT NULL,
    campaign_id                 UUID,                -- nullable: journey sends aren't always campaigns
    journey_run_id              UUID,                -- alternative grouping for journey-driven sends
    verdict                     TEXT NOT NULL CHECK (verdict IN ('pass','warn','block')),
    reasons                     TEXT[] NOT NULL DEFAULT '{}',
    removed_recipient_ids       UUID[] NOT NULL DEFAULT '{}',
    removed_recipient_count     INTEGER NOT NULL DEFAULT 0,
    agent_session_id            TEXT,                -- from chatagent for tracing back to the run
    request_id                  TEXT,                -- X-Agent-Force-Request-Id for dedupe
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_compliance_org_created
    ON app_lms.lms_compliance_decisions (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lms_compliance_campaign
    ON app_lms.lms_compliance_decisions (campaign_id)
    WHERE campaign_id IS NOT NULL;

-- Idempotency: don't double-write the same request_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lms_compliance_request
    ON app_lms.lms_compliance_decisions (request_id)
    WHERE request_id IS NOT NULL;
