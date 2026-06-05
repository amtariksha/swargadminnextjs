-- 011_integrated_number_primary.sql
--
-- The WhatsApp Templates module synced templates from the WRONG msg91 number.
-- All three template routes picked the OLDEST active msg91 number
-- (`order created_at asc` + first msg91), which is 917090166111 (…66111) — NOT
-- 917996196111 ("Customer Care"), the number the Node backend actually SENDS
-- from. So the templates shown/synced did not match the sending line.
--
-- Add an explicit `is_primary` flag so the operator picks which number drives
-- template sync + sends (per-org → multi-tenant). `getPrimaryIntegratedNumber()`
-- prefers is_primary, then the WA_PRIMARY_NUMBER env, then the legacy fallback.
--
-- Idempotent; apply via Supabase Studio (same as the other module migrations).

ALTER TABLE public.integrated_numbers
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.integrated_numbers.is_primary IS
  'The number used for WhatsApp template sync + outbound sends. One per org.';

-- Mark swarg''s main Customer Care line primary (the sending number).
UPDATE public.integrated_numbers
   SET is_primary = true
 WHERE number = '917996196111';

-- Defensive: if no row was flagged (e.g. that number isn''t registered yet),
-- fall back to flagging the oldest active msg91 number so the routes still
-- resolve a primary.
UPDATE public.integrated_numbers t
   SET is_primary = true
 WHERE t.id = (
   SELECT id FROM public.integrated_numbers
    WHERE active = true AND (provider IS NULL OR provider = 'msg91')
    ORDER BY created_at ASC
    LIMIT 1
 )
 AND NOT EXISTS (SELECT 1 FROM public.integrated_numbers WHERE is_primary = true);
