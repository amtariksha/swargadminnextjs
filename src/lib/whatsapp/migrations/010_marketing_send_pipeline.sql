-- ============================================================================
-- Swarg LMS — Migration 010 · Marketing send pipeline support
--
-- Enables real (non-stub) marketing sends from journeys AND campaigns through
-- one shared pipeline (src/lib/lms/send/dispatch.ts).
--
-- 1. lms_campaign_messages becomes the shared "sends ledger" used by BOTH
--    journeys (no campaign) and campaigns. It also backs the marketing
--    frequency cap (count of mkt_* rows with sent_at in the last 7 days) and
--    the `received_campaign_within_days` segment filter — one ledger, three uses.
--      • campaign_id: drop NOT NULL so journey sends (which have no campaign)
--        can write rows. The FK stays (NULL is allowed under the FK).
--      • journey_run_id: trace a row back to the journey run that produced it.
--      • template_name: which template was actually sent.
--
-- 2. integrated_numbers.routing_role resolves the 2-number routing rule
--    (router.ts returns abstract "1"/"2"; dispatch maps slot -> real number):
--      • transactional  -> Number 1 (orders, OTP, delivery, support)  txn_*
--      • marketing      -> Number 2 (broadcasts, replenishment, win-backs) mkt_*
--    IMPORTANT: confirm which physical number you actually use for marketing
--    before going live. Defaults below assume Sales(917090166111)=transactional
--    and Customer Care(917996196111)=marketing — ADJUST if that's wrong, because
--    sending marketing from the transactional number can damage its Meta quality
--    rating. dispatch falls back to the first active number if roles are unset.
--
-- No migration runner — paste into the Supabase SQL editor (same as 001–009).
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Shared sends ledger ------------------------------------------------------
ALTER TABLE app_lms.lms_campaign_messages
  ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE app_lms.lms_campaign_messages
  ADD COLUMN IF NOT EXISTS journey_run_id UUID;

ALTER TABLE app_lms.lms_campaign_messages
  ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Frequency-cap lookups hit (customer_id, purpose, sent_at) — the existing
-- idx_lms_campmsg_customer (customer_id, sent_at DESC) already covers it.

-- 2. Routing role on the business numbers ------------------------------------
ALTER TABLE public.integrated_numbers
  ADD COLUMN IF NOT EXISTS routing_role TEXT
    CHECK (routing_role IN ('transactional', 'marketing'));

UPDATE public.integrated_numbers
   SET routing_role = 'transactional'
 WHERE number = '917090166111'
   AND routing_role IS NULL;

UPDATE public.integrated_numbers
   SET routing_role = 'marketing'
 WHERE number = '917996196111'
   AND routing_role IS NULL;
