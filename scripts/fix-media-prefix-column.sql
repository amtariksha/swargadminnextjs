-- =============================================================================
-- fix-media-prefix-column.sql
-- =============================================================================
--
-- ROOT CAUSE: the R2 storage swap (commit b0596ae) enabled the
-- @payloadcms/storage-s3 plugin, which adds a `prefix` text field to the
-- media collection. The `media` table was created earlier (Vercel Blob era)
-- and never got that column. So with R2 enabled, EVERY media read runs:
--     select ... "prefix" ... from media
-- → "column \"prefix\" does not exist" → 500.
--
-- That single 500 cascades everywhere media is touched:
--   - /api/media (admin Media collection list/edit) → 500
--   - /api/products?depth=1 (resolves featuredImage → media) → 500
--     → new.swargfood.com storefront SSR fetch → 500
--   - admin product pages that render the featured image → render error
--   - saving a product (validates featuredImage → media) → 400
--
-- FIX: add the missing `prefix` column. Additive, nullable, instant.
-- Backfill existing rows to the collection's configured prefix
-- ('admin-media' — see src/plugins/index.ts R2_MEDIA_PREFIX) so that once the
-- media files are copied into R2 under admin-media/<filename>, Payload's
-- static handler fetches them from the right key. New uploads set
-- prefix='admin-media' automatically.
--
-- Run on the backend Supabase project (holds the live `web` Payload schema).
-- The `public` rollback copy may already be gone — handled conditionally.
-- =============================================================================

-- Live Payload schema (the one that matters).
ALTER TABLE "web"."media" ADD COLUMN IF NOT EXISTS "prefix" varchar;
UPDATE "web"."media" SET "prefix" = 'admin-media' WHERE "prefix" IS NULL;

-- Rollback-parachute copy — only if it still exists (won't error if dropped).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'media'
  ) THEN
    EXECUTE 'ALTER TABLE "public"."media" ADD COLUMN IF NOT EXISTS "prefix" varchar';
    EXECUTE 'UPDATE "public"."media" SET "prefix" = ''admin-media'' WHERE "prefix" IS NULL';
  END IF;
END $$;

-- Verify: web.media should now report 1.
SELECT 'web.media' AS tbl, COUNT(*) AS has_prefix
  FROM information_schema.columns
  WHERE table_schema='web' AND table_name='media' AND column_name='prefix';
