-- ============================================================================
-- Swarg WhatsApp — Migration 007 · second number + per-number backfill +
--                  denormalized assignee name
--
-- 1. Register the second business number (Customer Care, 917996196111) so it
--    shows up in the Numbers list and gets its own inbox route.
-- 2. Backfill legacy conversations that were created before two-number support
--    (integrated_number NULL / 'default' / the '919999999999' placeholder) onto
--    the original Sales number — it was the only live number until now.
-- 3. Add conversations.assigned_name: the assignee dropdown now lists admin-panel
--    users (sourced via the backend REST API, a separate DB), so we denormalize
--    the display name onto the conversation instead of joining a local users
--    table. conversations.assigned_to holds the backend user id (text).
--
-- No migration runner exists — paste into the Supabase SQL editor (same as
-- 001–006). Idempotent: safe to re-run.
-- ============================================================================

-- 1. Second number — Customer Care
INSERT INTO public.integrated_numbers (number, label, provider, active, org_id)
SELECT '917996196111', 'Customer Care', 'msg91', true,
       '00000000-0000-0000-0000-000000000001'
WHERE NOT EXISTS (
  SELECT 1 FROM public.integrated_numbers WHERE number = '917996196111'
);

-- 2. Backfill legacy conversations onto the Sales number
UPDATE public.conversations
   SET integrated_number = '917090166111'
 WHERE org_id = '00000000-0000-0000-0000-000000000001'
   AND (integrated_number IS NULL
        OR integrated_number IN ('default', '919999999999'));

-- 3. Denormalized assignee display name
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_name TEXT;
