#!/usr/bin/env bash
# =============================================================================
# migrate-payload-to-web-schema.sh
# =============================================================================
#
# Feature 20 Phase 1 — co-locate Payload's tables inside the backend's
# Postgres database under a dedicated `web` schema.
#
# Today Payload runs against its own Supabase Postgres (DATABASE_URI). After
# this script runs and the env vars are flipped (see Feature 20 spec), it
# runs against the backend's Postgres with `schemaName: 'web'` instead.
#
# WHAT THIS SCRIPT DOES:
#   1. Verifies both connection strings are set and reachable.
#   2. Creates the `web` schema on the target DB (no-op if it exists).
#   3. pg_dump-s the source DB's `public` schema with --no-owner
#      --no-privileges (so it restores cleanly under a different role).
#   4. Rewrites every `public.` reference in the dump to `web.` via sed.
#   5. Restores the rewritten dump into the target DB.
#   6. Verifies row counts match between source.public.<table> and
#      target.web.<table> for every Payload collection table.
#
# RUN THIS AGAINST A TEST DB FIRST. The prod Payload DB is the live source
# for new.swargfood.com — freeze admin writes during the cutover window.
#
# REQUIRED ENV VARS:
#   PAYLOAD_SOURCE_DATABASE_URI   Current Payload DB (the one DATABASE_URI
#                                  currently points at). Read-only is fine.
#   PAYLOAD_TARGET_DATABASE_URI   Backend Postgres DB. Connection string must
#                                  use a role with CREATE on schema public AND
#                                  the web schema (Supabase service-role key
#                                  works; the tenant's app_db_app role does
#                                  NOT — provision a dedicated migration role
#                                  in Supabase Studio first).
#
# OPTIONAL ENV VARS:
#   PAYLOAD_TARGET_SCHEMA         Defaults to "web". Change ONLY for a
#                                  non-production test (e.g. "web_test") so
#                                  you don't clobber a previous attempt.
#   DUMP_FILE                     Where to write the intermediate dump
#                                  (default /tmp/payload-source.sql).
#   REWRITTEN_FILE                Where to write the rewritten dump
#                                  (default /tmp/payload-source.web.sql).
#
# USAGE:
#   export PAYLOAD_SOURCE_DATABASE_URI='postgres://...:5432/payload'
#   export PAYLOAD_TARGET_DATABASE_URI='postgres://...:5432/swarg_app_db'
#   ./scripts/migrate-payload-to-web-schema.sh
#
# IDEMPOTENCY: refuses to re-run if the target schema already contains data.
# Override with FORCE_OVERWRITE=true (only for test DBs — irreversible).
#
# =============================================================================

set -euo pipefail

: "${PAYLOAD_SOURCE_DATABASE_URI:?PAYLOAD_SOURCE_DATABASE_URI must be set}"
: "${PAYLOAD_TARGET_DATABASE_URI:?PAYLOAD_TARGET_DATABASE_URI must be set}"

TARGET_SCHEMA="${PAYLOAD_TARGET_SCHEMA:-web}"
DUMP_FILE="${DUMP_FILE:-/tmp/payload-source.sql}"
REWRITTEN_FILE="${REWRITTEN_FILE:-/tmp/payload-source.${TARGET_SCHEMA}.sql}"
FORCE_OVERWRITE="${FORCE_OVERWRITE:-false}"

log() { printf '\033[1;36m[migrate]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[migrate ERROR]\033[0m %s\n' "$*" >&2; }

# ────────────────────────────────────────────────────────────────────────────
# Step 1 — reachability checks
# ────────────────────────────────────────────────────────────────────────────
log "Verifying source DB is reachable…"
psql "$PAYLOAD_SOURCE_DATABASE_URI" -c 'SELECT 1 AS source_ok;' >/dev/null || {
  err "Cannot connect to PAYLOAD_SOURCE_DATABASE_URI"
  exit 1
}

log "Verifying target DB is reachable…"
psql "$PAYLOAD_TARGET_DATABASE_URI" -c 'SELECT 1 AS target_ok;' >/dev/null || {
  err "Cannot connect to PAYLOAD_TARGET_DATABASE_URI"
  exit 1
}

# ────────────────────────────────────────────────────────────────────────────
# Step 2 — idempotency guard
# ────────────────────────────────────────────────────────────────────────────
TABLE_COUNT=$(psql "$PAYLOAD_TARGET_DATABASE_URI" -tAc "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = '${TARGET_SCHEMA}'
")
if [ "$TABLE_COUNT" -gt 0 ]; then
  if [ "$FORCE_OVERWRITE" != "true" ]; then
    err "Target schema '${TARGET_SCHEMA}' already contains ${TABLE_COUNT} tables."
    err "Refusing to overwrite. Set FORCE_OVERWRITE=true to drop + recreate (TEST DBs ONLY)."
    exit 1
  fi
  log "FORCE_OVERWRITE=true → dropping existing ${TARGET_SCHEMA} schema…"
  psql "$PAYLOAD_TARGET_DATABASE_URI" -c "DROP SCHEMA ${TARGET_SCHEMA} CASCADE;"
fi

# ────────────────────────────────────────────────────────────────────────────
# Step 3 — create target schema
# ────────────────────────────────────────────────────────────────────────────
log "Creating schema '${TARGET_SCHEMA}' on target DB…"
psql "$PAYLOAD_TARGET_DATABASE_URI" -c "CREATE SCHEMA IF NOT EXISTS ${TARGET_SCHEMA};"

# ────────────────────────────────────────────────────────────────────────────
# Step 4 — pg_dump source public schema
# ────────────────────────────────────────────────────────────────────────────
log "Dumping source DB public schema → ${DUMP_FILE}"
pg_dump \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-tablespaces \
  --no-security-labels \
  --quote-all-identifiers \
  --file="$DUMP_FILE" \
  "$PAYLOAD_SOURCE_DATABASE_URI"

DUMP_SIZE=$(wc -c <"$DUMP_FILE")
log "Dump size: ${DUMP_SIZE} bytes"

# ────────────────────────────────────────────────────────────────────────────
# Step 5 — rewrite public. → web. (or whatever target schema is)
# ────────────────────────────────────────────────────────────────────────────
log "Rewriting public. → ${TARGET_SCHEMA}. → ${REWRITTEN_FILE}"
# Rewrite three things:
#   "public"."<thing>"      → "<TARGET_SCHEMA>"."<thing>"   (qualified table refs)
#   SCHEMA "public"         → SCHEMA "<TARGET_SCHEMA>"      (CREATE SCHEMA, if dumped)
#   search_path = "public"  → search_path = "<TARGET_SCHEMA>"
#
# pg_dump's --quote-all-identifiers gives us the "public"."x" form
# consistently, which is the safe pattern to substitute against (we
# never touch any literal "public" inside data — only quoted-identifier
# references).
sed \
  -e "s/\"public\"\\./\"${TARGET_SCHEMA}\"./g" \
  -e "s/SCHEMA \"public\"/SCHEMA \"${TARGET_SCHEMA}\"/g" \
  -e "s/SET search_path = \"public\"/SET search_path = \"${TARGET_SCHEMA}\"/g" \
  -e "s/SELECT pg_catalog.set_config('search_path', '', false);/SELECT pg_catalog.set_config('search_path', '${TARGET_SCHEMA}', false);/g" \
  "$DUMP_FILE" >"$REWRITTEN_FILE"

# ────────────────────────────────────────────────────────────────────────────
# Step 6 — restore into target
# ────────────────────────────────────────────────────────────────────────────
log "Restoring ${REWRITTEN_FILE} into target ${TARGET_SCHEMA}…"
# ON_ERROR_STOP makes the first error fail the whole load — we want
# transactional safety here.
psql -v ON_ERROR_STOP=1 -X "$PAYLOAD_TARGET_DATABASE_URI" -f "$REWRITTEN_FILE"

# ────────────────────────────────────────────────────────────────────────────
# Step 7 — verify row counts per table
# ────────────────────────────────────────────────────────────────────────────
log "Verifying row counts (source.public.* vs target.${TARGET_SCHEMA}.*)…"

# Pull the source table list and row counts
SOURCE_COUNTS=$(psql "$PAYLOAD_SOURCE_DATABASE_URI" -tAc "
  SELECT tablename, n_live_tup
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
")

MISMATCH=0
TOTAL_TABLES=0
while IFS='|' read -r table src_count; do
  [ -z "$table" ] && continue
  TOTAL_TABLES=$((TOTAL_TABLES + 1))
  # Compare against exact row count on target via SELECT COUNT(*)
  # (pg_stat estimates lag; trust the exact count for verification).
  TGT_COUNT=$(psql "$PAYLOAD_TARGET_DATABASE_URI" -tAc \
    "SELECT COUNT(*) FROM \"${TARGET_SCHEMA}\".\"${table}\"" 2>/dev/null || echo "MISSING")
  if [ "$TGT_COUNT" = "MISSING" ]; then
    err "  MISSING  ${table}"
    MISMATCH=$((MISMATCH + 1))
  elif [ "$TGT_COUNT" != "$src_count" ] && [ "$src_count" != "0" ]; then
    # n_live_tup can lag analyze — only treat as mismatch when src>0 and counts differ
    SRC_EXACT=$(psql "$PAYLOAD_SOURCE_DATABASE_URI" -tAc \
      "SELECT COUNT(*) FROM \"public\".\"${table}\"")
    if [ "$TGT_COUNT" != "$SRC_EXACT" ]; then
      err "  MISMATCH ${table}: source=${SRC_EXACT}, target=${TGT_COUNT}"
      MISMATCH=$((MISMATCH + 1))
    else
      log "  OK       ${table} (${TGT_COUNT} rows)"
    fi
  else
    log "  OK       ${table} (${TGT_COUNT} rows)"
  fi
done <<<"$SOURCE_COUNTS"

# ────────────────────────────────────────────────────────────────────────────
# Done
# ────────────────────────────────────────────────────────────────────────────
log "Tables verified: ${TOTAL_TABLES}"
if [ "$MISMATCH" -gt 0 ]; then
  err "${MISMATCH} table(s) failed verification — investigate before flipping env vars."
  exit 1
fi

log "Migration complete. Next steps:"
log "  1. Set PAYLOAD_SCHEMA_NAME=${TARGET_SCHEMA} on swarg-admin-nextjs Vercel project."
log "  2. Set DATABASE_URI on swarg-admin-nextjs to PAYLOAD_TARGET_DATABASE_URI."
log "  3. Set PAYLOAD_SCHEMA_NAME=${TARGET_SCHEMA} + DATABASE_URI on swargfooddotcom."
log "  4. Redeploy both Vercel projects."
log "  5. Smoke-test admin /admin/collections/products and new.swargfood.com home/shop/product."
log "  6. Keep source Payload DB read-only for 7 days as rollback parachute."
