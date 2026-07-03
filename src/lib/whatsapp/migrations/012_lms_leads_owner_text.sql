-- ============================================================================
-- Swarg LMS — Migration 012 · lead owner as admin-panel identity (TEXT + name)
--
-- lms_leads.owner_user_id was declared UUID, but admin-panel users (the people a
-- sales lead is actually assigned to) carry the backend's integer id, stringified
-- — the SAME identity conversations.assigned_to already stores (see migration
-- 007). Assigning a lead therefore failed: the PATCH validator required a UUID and
-- the column rejected the integer id. Realign to the proven conversation-assignee
-- model: owner_user_id becomes TEXT, plus a denormalized owner_name (mirrors
-- conversations.assigned_name) so the leads list can show the owner without a
-- cross-store join to MySQL admin_users.
--
-- Run-once steps (operator):
--   1. Open Supabase Studio -> SQL Editor for the WACRM project.
--   2. Paste this entire file.  3. Run.  Idempotent (guarded type change).
-- ============================================================================

-- Convert owner_user_id UUID -> TEXT (idempotent: only when still UUID).
-- Postgres rebuilds the dependent partial index automatically on the type change.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app_lms' AND table_name = 'lms_leads'
          AND column_name = 'owner_user_id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE app_lms.lms_leads
            ALTER COLUMN owner_user_id TYPE TEXT USING owner_user_id::TEXT;
    END IF;
END $$;

-- Denormalized owner display name (like conversations.assigned_name).
ALTER TABLE app_lms.lms_leads
    ADD COLUMN IF NOT EXISTS owner_name TEXT;
