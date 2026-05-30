-- =============================================================================
-- drop-old-payload-public-schema.sql  (Feature 20 Phase 1 — FINAL step)
-- =============================================================================
--
-- ⚠️  DESTRUCTIVE & IRREVERSIBLE. Run this ONLY after ALL of these are true:
--
--   [ ] migrate-payload-to-web-schema.sh has copied public → web and the
--       parity check passed (127 tables / 2796 rows / 76 seqs / 198 FKs /
--       598 indexes / 63 enums — all equal on both sides).
--   [ ] PAYLOAD_SCHEMA_NAME=web is set on the swarg-admin-nextjs Vercel
--       project and it has been REDEPLOYED.
--   [ ] You have smoke-tested the DEPLOYED admin:
--         - https://admin.desicowmilk.com/admin/collections/products  → lists products
--         - edit a product, save                                       → persists
--         - https://new.swargfood.com (home / shop / a product page)   → renders
--           (the marketing site reads Payload via the admin's REST API,
--            so it follows the admin's schema automatically)
--   [ ] Ideally wait a few days as a rollback parachute — `public` is the
--       only way back if `web` turns out wrong.
--
-- Until every box is ticked, the live /admin is still reading `public`;
-- dropping it now would break it instantly.
--
-- Run on the backend Supabase project (same one that holds app_db + web).
-- =============================================================================

-- Safety re-check: web must still match public before we drop public.
-- (Eyeball that both numbers are equal before running the DROP below.)
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_tables,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'web' AND table_type = 'BASE TABLE')    AS web_tables;

-- ── The drop ────────────────────────────────────────────────────────────────
-- This removes ONLY the old Payload schema. app_db (backend ops) and web
-- (the new Payload home) are untouched.
DROP SCHEMA "public" CASCADE;

-- Payload / PostgREST expect a `public` schema to exist (Supabase wires
-- several roles to it). Recreate it empty so nothing that introspects the
-- database trips over a missing `public`.
CREATE SCHEMA "public";
GRANT USAGE ON SCHEMA "public" TO postgres, anon, authenticated, service_role;
GRANT ALL   ON SCHEMA "public" TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

-- Verify: public is now empty, web still holds the 127 Payload tables.
SELECT 'public' AS schema, COUNT(*) AS tables
  FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
UNION ALL
SELECT 'web', COUNT(*)
  FROM information_schema.tables WHERE table_schema='web' AND table_type='BASE TABLE';
