-- ============================================================================
-- Swarg WhatsApp — Migration 014 · webhook debug capture
--
-- The MSG91 webhook classifies each event as inbound/outbound from a drifting
-- payload shape; when it gets one wrong, the only evidence used to be Vercel
-- logs that roll off. Persist every processed payload together with the
-- direction we classified it as, so misclassifications are diagnosable straight
-- from the DB. Rows are pruned by the route itself (best-effort, 7-day window)
-- and capture is gated by WA_WEBHOOK_DEBUG (default ON).
--
-- Run-once steps (operator):
--   1. Open Supabase Studio -> SQL Editor for the WACRM project.
--   2. Paste this entire file.  3. Run.  Idempotent (IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_debug (
    id                   BIGSERIAL PRIMARY KEY,
    provider             TEXT NOT NULL,
    payload              JSONB NOT NULL,
    classified_direction TEXT,
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- The route prunes by age (created_at < now() - 7 days) before every insert.
CREATE INDEX IF NOT EXISTS idx_webhook_debug_created_at
    ON public.webhook_debug (created_at);
