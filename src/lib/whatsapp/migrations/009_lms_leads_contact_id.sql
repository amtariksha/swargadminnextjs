-- ============================================================================
-- Swarg LMS — Migration 009 · lms_leads.contact_id
-- ============================================================================
--
-- Adds a first-class link from a lead to its WhatsApp contact
-- (public.contacts.id, Supabase). Before this, the only contact linkage was
-- inside source_details JSONB (backfilled_from_contact_id) — not indexable.
-- The WhatsApp lead lifecycle resolves contacts by phone on every inbound
-- message, so an indexed contact_id keeps that lookup cheap and lets the LMS
-- UI jump straight to the inbox thread for a lead.
--
-- Single-org: no org threading needed; the column is independent of org_id.
--
-- Run-once steps (operator):
--   1. Open Supabase Studio → SQL Editor for the WACRM project.
--   2. Paste this entire file (search_path is set below so the unqualified
--      table name resolves to app_lms, not public).
--   3. Run. Idempotent: ADD COLUMN / CREATE INDEX use IF NOT EXISTS.
-- ============================================================================

SET search_path TO app_lms, public;

ALTER TABLE app_lms.lms_leads
    ADD COLUMN IF NOT EXISTS contact_id UUID;   -- public.contacts.id (Supabase)

CREATE INDEX IF NOT EXISTS idx_lms_leads_contact
    ON app_lms.lms_leads (contact_id)
    WHERE contact_id IS NOT NULL;
