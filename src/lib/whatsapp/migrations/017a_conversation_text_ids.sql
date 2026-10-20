-- ============================================================================
-- Swarg WhatsApp - Migration 017a · conversations.assigned_to and
--                  reminders.user_id: uuid -> text
--
-- Both columns hold an admin-panel user id: String(app_db users.id), digits
-- only (or 'agent-force' for the service context). They were declared uuid, so
-- every inbox assignment and every reminder insert has failed with 22P02.
-- Same fix as 012 (lms_leads.owner_user_id). Values can only be a uuid or NULL
-- today, so the cast is lossless.
--
-- Strictly additive in meaning: no row is deleted, no value changes except its
-- type. The type change rewrites both (small) tables under an ACCESS EXCLUSIVE
-- lock for well under a second; lock_timeout makes it fail fast (55P03) instead
-- of queueing behind a long transaction. On 55P03 nothing changed: paste again.
-- If a view, policy or foreign key depends on either column, the ALTER fails
-- and the editor rolls the whole paste back: stop and ask (pre-flight D1 should
-- have shown it).
--
-- HOW TO APPLY (operator)
--   Supabase SQL editor, project reyrthufoezeqymzwaer. ONE paste. Run outside
--   05:00-08:00 and 22:25-23:25 IST. Idempotent (guarded on the current type).
--   Afterwards run 017_verify.sql.
--
-- Never edit this file after it has been applied. Fix forward with a new file.
-- ============================================================================
SET lock_timeout = '5s';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'conversations'
           AND column_name = 'assigned_to' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE public.conversations
            ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::TEXT;
        RAISE NOTICE '017a: public.conversations.assigned_to uuid -> text';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'reminders'
           AND column_name = 'user_id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE public.reminders
            ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
        RAISE NOTICE '017a: public.reminders.user_id uuid -> text';
    END IF;
END $$;

COMMENT ON COLUMN public.conversations.assigned_to IS
    'String(app_db users.id) of the assignee. TEXT since 017a (was uuid, which rejected every write).';
COMMENT ON COLUMN public.reminders.user_id IS
    'String(app_db users.id) of the reminder owner (x-user-id). TEXT since 017a (was uuid).';

RESET lock_timeout;
