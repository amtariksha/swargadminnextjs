-- ============================================================================
-- Swarg WhatsApp + LMS — Migration 008 · single internal org defaults
--
-- WhatsApp + LMS now operate as ONE organization internally (the outer Swarg
-- platform stays multi-tenant). The application code stops threading/filtering
-- by org_id; this migration makes that safe and non-destructive:
--
--   • Sets a DEFAULT of the single org id on every org_id / organization_id
--     column in the public + app_lms schemas, so inserts that omit the column
--     still populate it.
--   • Backfills any NULLs to the single org id, so readers that still filter by
--     org (agent-tools, and anything pending the deferred column-drop) keep
--     seeing all rows.
--
-- Columns + constraints are KEPT. The physical DROP COLUMN + app_lms composite
-- unique-constraint rewrites are a later, separately-coordinated migration.
--
-- Dynamic + idempotent: discovers the columns by introspection (base tables
-- only, no views), so it's correct regardless of which tables carry org_id.
-- Paste into the Supabase SQL editor (same as 001–007).
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    default_org CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
    FOR r IN
        SELECT c.table_schema, c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name   = c.table_name
        WHERE c.column_name IN ('org_id', 'organization_id')
          AND c.table_schema IN ('public', 'app_lms')
          AND t.table_type = 'BASE TABLE'
          -- app_settings is intentionally left alone: it uses org_id IS NULL for
          -- GLOBAL settings and has a (key, org_id) uniqueness model. Backfilling
          -- NULL→org would collide and break the global/org fallback in
          -- getAppSetting. Its org-aware reads work fine under a single org.
          AND NOT (c.table_schema = 'public' AND c.table_name = 'app_settings')
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %L',
            r.table_schema, r.table_name, r.column_name, default_org
        );
        EXECUTE format(
            'UPDATE %I.%I SET %I = %L WHERE %I IS NULL',
            r.table_schema, r.table_name, r.column_name, default_org, r.column_name
        );
        RAISE NOTICE 'single-org default applied: %.% (%)',
            r.table_schema, r.table_name, r.column_name;
    END LOOP;
END $$;
