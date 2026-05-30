-- =============================================================================
-- web-schema-setup.sql  (Feature 20 Phase 1)
-- =============================================================================
--
-- Run this on the BACKEND Supabase project (the one that hosts the `app_db`
-- schema) — that's where Payload's tables move to. Paste into the Supabase
-- SQL Editor (it runs as the `postgres` superuser, so the grants below
-- succeed).
--
-- After this runs:
--   1. Set these env vars on BOTH the swarg-admin-nextjs and swargfooddotcom
--      Vercel projects:
--        DATABASE_URI         = <backend Supabase connection string>
--        PAYLOAD_SCHEMA_NAME  = web
--        PAYLOAD_PUSH         = true        ← one-shot; Payload/Drizzle creates
--                                              every collection table inside the
--                                              `web` schema on first boot.
--        PAYLOAD_SECRET       = <unchanged — must match across both apps>
--   2. Redeploy swarg-admin-nextjs. Watch the build/runtime log for Payload
--      creating tables under `web.*`.
--   3. Once the tables exist, set PAYLOAD_PUSH=false (or remove it) and
--      redeploy so drizzle-push doesn't run on every boot.
--   4. Repeat the env set + redeploy for swargfooddotcom.
--   5. Smoke-test /admin/collections/products and new.swargfood.com.
--
-- CONTENT NOTE: this path creates the `web` schema EMPTY and lets Payload
-- build fresh tables. Since the marketing site isn't in production yet,
-- that's the simplest route. If you need to PRESERVE the existing
-- WordPress-migrated Payload content (pages / posts / products) from the
-- old Payload Supabase project, DON'T use PAYLOAD_PUSH — instead run
-- scripts/migrate-payload-to-web-schema.sh (pg_dump → rewrite → restore)
-- which copies the data into `web.*`, then deploy with PAYLOAD_PUSH=false.
--
-- =============================================================================

-- 1. Create the schema that will hold every Payload table.
CREATE SCHEMA IF NOT EXISTS web;

-- 2. Grant the role Payload connects as (in DATABASE_URI) full rights on the
--    `web` schema. The Supabase SQL Editor runs as `postgres`; we grant to the
--    common Supabase roles so it works whichever one the connection string
--    uses. If your DATABASE_URI uses a custom role, add it here too.
GRANT USAGE, CREATE ON SCHEMA web TO postgres;
GRANT USAGE, CREATE ON SCHEMA web TO service_role;
GRANT USAGE, CREATE ON SCHEMA web TO authenticated;
GRANT USAGE, CREATE ON SCHEMA web TO anon;

-- 3. Make sure any tables/sequences Payload creates later are usable by those
--    roles too (default privileges apply to objects created AFTER this runs —
--    i.e. when PAYLOAD_PUSH builds the tables).
ALTER DEFAULT PRIVILEGES IN SCHEMA web
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA web
  GRANT USAGE, SELECT ON SEQUENCES TO postgres, service_role;

-- 4. Verify.
SELECT
  nspname AS schema,
  has_schema_privilege('postgres', nspname, 'CREATE') AS postgres_can_create
FROM pg_namespace
WHERE nspname IN ('web', 'app_db', 'public')
ORDER BY nspname;
