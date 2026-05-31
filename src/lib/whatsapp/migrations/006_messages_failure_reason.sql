-- ============================================================================
-- Swarg WhatsApp — Migration 006 · messages failure observability
--
-- When an outbound send is rejected by MSG91/Meta, the send route previously
-- set status='failed' and only console.error'd the provider response — the
-- reason was lost as soon as the log rolled off. These two columns persist the
-- provider's error so every failure is self-documenting in the DB and the
-- Inbox, with no need to grep Vercel logs.
--
--   failure_reason — provider error text (HTTP body / MSG91 `errors` /
--                    network error message), truncated to ~1000 chars by the
--                    route. NULL for successful or pending sends.
--   failed_at      — timestamp the send was marked failed. NULL otherwise.
--
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
