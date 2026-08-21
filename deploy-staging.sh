#!/usr/bin/env bash
#
# deploy-staging.sh — one-shot deploy of swarg-admin-nextjs to a Vercel
# preview project that points at nodenew.desicowmilk.com instead of prod.
#
# What it does:
#   1. Links (or creates) a Vercel project named "swarg-admin-staging" under
#      the active Vercel team scope.
#   2. Reads DATABASE_URI + PAYLOAD_SECRET from .env.local (piped via stdin
#      to vercel env add — values never echo to shell or process list).
#   3. Reads JWT_SECRET from /tmp/.swarg-jwt-secret (staged separately from
#      prod's swargfood-user .env earlier in this session).
#   4. Sets the four staging-specific env vars:
#        NEXT_PUBLIC_API_BASE_URL = https://nodenew.desicowmilk.com
#        SWARG_BACKEND_URL        = https://nodenew.desicowmilk.com
#        NEXT_PUBLIC_TENANT_CODE  = swarg
#        SWARG_TENANT             = swarg
#   5. Triggers a preview deploy.
#   6. Prints the resulting preview URL.
#
# Idempotent: re-running adds env vars with --force (overwrites) and
# re-deploys. Existing project, if any, is reused.
#
# Pre-requisites:
#   - vercel CLI logged in
#   - active scope is the team that should own the project (vercel switch <team>)
#   - /tmp/.swarg-jwt-secret exists (mode 600)
#   - .env.local has DATABASE_URI + PAYLOAD_SECRET
#
# Cleanup: at the end the JWT temp file is deleted automatically.

set -euo pipefail

PROJECT_NAME="swarg-admin-staging"
JWT_FILE="/tmp/.swarg-jwt-secret"

# Colors
if [[ -t 1 ]]; then
    BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    RED=$'\033[0;31m'; BOLD=$'\033[1m'; NC=$'\033[0m'
else
    BLUE=""; GREEN=""; YELLOW=""; RED=""; BOLD=""; NC=""
fi
step() { echo ""; echo "${BOLD}${BLUE}━━━ $* ━━━${NC}"; }
ok()   { echo "${GREEN}✓${NC} $*"; }
err()  { echo "${RED}✗${NC} $*" >&2; }

# Pre-flight
[[ -f .env.local ]] || { err ".env.local not found in $(pwd)"; exit 1; }
[[ -f "$JWT_FILE" ]] || { err "$JWT_FILE missing — stage JWT first"; exit 1; }
grep -q "^DATABASE_URI=" .env.local || { err "DATABASE_URI not in .env.local"; exit 1; }
grep -q "^PAYLOAD_SECRET=" .env.local || { err "PAYLOAD_SECRET not in .env.local"; exit 1; }

# Helper — extract a value from .env.local without echoing
get_env_value() {
    local key="$1"
    grep "^${key}=" .env.local | sed -E "s/^${key}=//; s/^\"(.*)\"\$/\\1/" | head -1
}

step "1/5  Link / create Vercel project: $PROJECT_NAME"
# `vercel link --yes` accepts defaults; --project pre-names it.
# If the project exists in this scope, vercel reuses it.
vercel link --yes --project "$PROJECT_NAME" 2>&1 | tail -5

step "2/5  Set staging-only env vars (NEXT_PUBLIC_API_BASE_URL etc.)"
# These are the only values that DIFFER from prod admin. The values are
# safe to echo (not secrets).
for env_target in development preview production; do
    for kv in \
        "NEXT_PUBLIC_API_BASE_URL=https://nodenew.desicowmilk.com" \
        "SWARG_BACKEND_URL=https://nodenew.desicowmilk.com" \
        "NEXT_PUBLIC_TENANT_CODE=swarg" \
        "NEXT_PUBLIC_TENANT_NAME=Swarg Desi Cow Milk" \
        "SWARG_TENANT=swarg" \
        "NEXT_PUBLIC_FEATURE_DELIVERY_APP=true" \
        "NEXT_PUBLIC_FEATURE_SUBSCRIPTIONS=true" \
        "NEXT_PUBLIC_FEATURE_WALLET=true"; do
        K="${kv%%=*}"
        V="${kv#*=}"
        echo "$V" | vercel env add "$K" "$env_target" --force >/dev/null 2>&1 || true
    done
done
ok "8 plain env vars set across dev/preview/production"

step "3/5  Set secret env vars (DB URI, Payload secret, JWT — piped via stdin, no shell exposure)"
DB_URI=$(get_env_value "DATABASE_URI")
PAYLOAD_SEC=$(get_env_value "PAYLOAD_SECRET")
JWT_SEC=$(cat "$JWT_FILE")

for env_target in development preview production; do
    echo "$DB_URI"      | vercel env add DATABASE_URI    "$env_target" --force >/dev/null 2>&1 || true
    echo "$PAYLOAD_SEC" | vercel env add PAYLOAD_SECRET  "$env_target" --force >/dev/null 2>&1 || true
    echo "$JWT_SEC"     | vercel env add JWT_SECRET      "$env_target" --force >/dev/null 2>&1 || true
done
ok "3 secrets set"

# Clear sensitive variables from memory
DB_URI=""
PAYLOAD_SEC=""
JWT_SEC=""

step "4/5  Trigger preview deploy"
# `vercel deploy` from an unlinked working dir would prompt; we're linked so
# it just deploys. Without --prod it's a preview.
DEPLOY_URL=$(vercel deploy --yes 2>&1 | tee /tmp/.vercel-deploy.log | grep -oE "https://[a-z0-9-]+\\.vercel\\.app" | tail -1)

if [[ -z "$DEPLOY_URL" ]]; then
    err "Deploy did not produce a URL — see /tmp/.vercel-deploy.log for full output"
    tail -30 /tmp/.vercel-deploy.log
    exit 1
fi
ok "Deployed: $DEPLOY_URL"

step "5/5  Cleanup + summary"
shred -u "$JWT_FILE" 2>/dev/null || rm -f "$JWT_FILE"
ok "Removed $JWT_FILE"

cat <<DONE

${BOLD}━━━ Staging admin deployed ━━━${NC}

  Preview URL:  ${BOLD}${DEPLOY_URL}${NC}
  Backend API:  https://nodenew.desicowmilk.com
  Payload DB:   same Supabase project as prod admin (Payload public schema)
  JWT secret:   matches prod (admin tokens cross-valid)

What to test:
  - Login at ${DEPLOY_URL}/login (uses staging Node backend's admin auth)
  - Delivery list → Generate Order List (writes to app_db_staging)
  - Orders / Drivers / Users CRUD (all via staging Node backend)
  - WhatsApp pages will be broken without Supabase env vars (optional —
    add NEXT_PUBLIC_SUPABASE_* if you need to test WhatsApp flows)

To redeploy (after code changes):
  vercel deploy --yes  # from this directory

To promote to a custom domain (adminnew.desicowmilk.com):
  vercel domains add adminnew.desicowmilk.com swarg-admin-staging
  (then point Cloudflare CNAME to cname.vercel-dns.com)

DONE
