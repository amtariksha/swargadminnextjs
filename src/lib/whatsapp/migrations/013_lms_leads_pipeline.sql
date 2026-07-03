-- ============================================================================
-- Swarg LMS — Migration 013 · B2C / B2B pipeline on leads
--
-- The sales team works two distinct funnels: B2C (household milk + nationwide
-- shippable products — sweets, gelato, ghee, snacks) and B2B (cafes, offices,
-- institutions). Add a `pipeline` discriminator so the leads list can split into
-- two tabs. Default 'b2c' — the bulk of inbound; a lead is moved to 'b2b'
-- explicitly on the detail page.
--
-- Run-once steps (operator):
--   1. Open Supabase Studio -> SQL Editor for the WACRM project.
--   2. Paste this entire file.  3. Run.  Idempotent (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE app_lms.lms_leads
    ADD COLUMN IF NOT EXISTS pipeline TEXT NOT NULL DEFAULT 'b2c'
        CHECK (pipeline IN ('b2b', 'b2c'));

CREATE INDEX IF NOT EXISTS idx_lms_leads_pipeline
    ON app_lms.lms_leads (pipeline, status, last_activity_at DESC NULLS LAST);
