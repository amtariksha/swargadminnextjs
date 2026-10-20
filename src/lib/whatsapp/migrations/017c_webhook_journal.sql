-- ============================================================================
-- Swarg WhatsApp - Migration 017c · webhook_debug becomes the inbound journal
--
-- What: six nullable/defaulted columns on public.webhook_debug (journal_status,
-- outcome, auth_result, processed_at, replay_count, last_replay_at), one
-- partial index for the replay scan, and a lock-down of a table that stores
-- raw customer payloads. Both WhatsApp webhooks write one row per call with
-- the outcome the route itself reported; POST /api/agent-tools/whatsapp/replay
-- replays the rows that failed or never finished.
--
-- Strictly additive: existing rows keep NULL journal_status and are never
-- replayed. The security part is idempotent and changes nothing if the table
-- is already locked down (the 2026-10-05 copy left RLS on and only
-- service_role grants). No policy is created: service_role has BYPASSRLS.
--
-- HOW TO APPLY (operator)
--   Supabase SQL editor, project reyrthufoezeqymzwaer, BEFORE the P1d admin
--   merge. TWO parts, pasted one at a time, in order. No BEGIN/COMMIT (the
--   editor wraps each paste in one transaction). Run outside 05:00-08:00 and
--   22:25-23:25 IST. Idempotent.
--   Afterwards run 017_verify.sql.
--
-- Never edit this file after it has been applied. Fix forward with a new file.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 of 2 - journal columns and the replay index.  Paste on its own.
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 of 2 - journal columns and the replay index. Paste on its own.
SET lock_timeout = '5s';

ALTER TABLE public.webhook_debug
    ADD COLUMN IF NOT EXISTS journal_status TEXT,
    ADD COLUMN IF NOT EXISTS outcome        TEXT,
    ADD COLUMN IF NOT EXISTS auth_result    TEXT,
    ADD COLUMN IF NOT EXISTS processed_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS replay_count   INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_replay_at TIMESTAMPTZ;

COMMENT ON COLUMN public.webhook_debug.journal_status IS
    'Inbound journal (017c): received | processed | skipped | failed | rejected | replaying | abandoned. NULL = row written before 017c or by the debug fallback; never replayed.';
COMMENT ON COLUMN public.webhook_debug.outcome IS
    'What the webhook reported for this call (its skipped/type reply, stored, ok, unhandled_error, auth_missing, ...).';
COMMENT ON COLUMN public.webhook_debug.auth_result IS
    'ok | no_secret | missing | mismatch: MSG91 shared secret or Meta signature check at receipt.';
COMMENT ON COLUMN public.webhook_debug.replay_count IS
    'Replays claimed by POST /api/agent-tools/whatsapp/replay (max 3).';

CREATE INDEX IF NOT EXISTS idx_webhook_debug_journal_pending
    ON public.webhook_debug (created_at)
    WHERE journal_status IN ('received', 'failed', 'replaying');

RESET lock_timeout;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 of 2 - lock the table down (raw customer payloads).  Paste on its own.
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 of 2 - lock the table down (raw customer payloads). Paste on its own.
ALTER TABLE public.webhook_debug ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webhook_debug FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_debug TO service_role;

DO $$
DECLARE
    seq text := pg_get_serial_sequence('public.webhook_debug', 'id');
BEGIN
    IF seq IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', seq);
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', seq);
    END IF;
END $$;
