#!/usr/bin/env bash
# Desk P3a smoke test. Prints status codes and error codes only: never a token, never a body.
# Usage:
#   BASE=https://<host> AGENT_TOKEN=… MANAGER_TOKEN=… ROLELESS_TOKEN=… ./scripts/desk-smoke-p3a.sh
#   READ_ONLY=1 …   stop before the block that switches desk_ui_enabled on (use this on production)
# AGENT_TOKEN     admin login of a user whose role has 'desk' but not 'desk-manager'
# MANAGER_TOKEN   admin login of a full-access user, or of a role with 'desk-manager'
# ROLELESS_TOKEN  a customer-app login (a user with no role)
set -u
: "${BASE:?}" "${AGENT_TOKEN:?}" "${MANAGER_TOKEN:?}" "${ROLELESS_TOKEN:?}"
tmp=$(mktemp)
fail=0
ui_on=0

request() { # method path token body -> prints the HTTP status, writes the body to $tmp
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$1" "$BASE$2")
  if [ -n "$3" ]; then args+=(-H "Authorization: Bearer $3"); fi
  if [ -n "$4" ]; then args+=(-H 'Content-Type: application/json' -d "$4"); fi
  curl "${args[@]}"
}
code_of() { # prints 'ok', the Desk error code, the legacy error text, or '-'
  node -e 'try{const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.ok===true?"ok":(b.error&&b.error.code)||(typeof b.error==="string"?b.error:"-"))}catch{console.log("-")}' "$tmp"
}
check() { # name want-status want-code method path token [body]
  local status code
  status=$(request "$4" "$5" "$6" "${7:-}")
  code=$(code_of)
  if [ "$status" = "$2" ] && { [ "$3" = "*" ] || [ "$code" = "$3" ]; }; then
    echo "PASS $1 ($status $code)"
  else
    echo "FAIL $1: got $status $code, want $2 $3"; fail=1
  fi
}
cleanup() {
  if [ "$ui_on" = 1 ]; then
    echo "--- switching desk_ui_enabled OFF again"
    check u02-ui-off 200 ok PUT /api/desk/settings "$MANAGER_TOKEN" '{"desk_ui_enabled":false}'
  fi
  rm -f "$tmp"
}
trap cleanup EXIT

check n01-no-token             401 Unauthorized               GET /api/desk/me ""
check n02-bad-token            401 "Invalid or expired token" GET /api/desk/me "not.a.token"
check n03-roleless-me          403 forbidden                  GET /api/desk/me "$ROLELESS_TOKEN"
check n04-roleless-tickets     403 forbidden                  GET "/api/desk/tickets?view=all&limit=5" "$ROLELESS_TOKEN"
check n05-roleless-settings    403 forbidden                  PUT /api/desk/settings "$ROLELESS_TOKEN" '{"desk_ui_enabled":true}'
check n06-agent-settings       403 forbidden                  GET /api/desk/settings "$AGENT_TOKEN"
check n07-agent-put-category   403 forbidden                  PUT /api/desk/categories "$AGENT_TOKEN" '{"categories":[]}'
check p01-agent-me             200 ok                         GET /api/desk/me "$AGENT_TOKEN"
check p02-agent-health         200 ok                         GET /api/desk/health "$AGENT_TOKEN"
check p03-agent-categories     200 ok                         GET /api/desk/categories "$AGENT_TOKEN"
check p04-manager-settings     200 ok                         GET /api/desk/settings "$MANAGER_TOKEN"
check f01-ui-off-tickets       403 ui_disabled                GET "/api/desk/tickets?view=all&limit=5" "$AGENT_TOKEN"
check s01-tick-key-refused     400 validation_failed          PUT /api/desk/settings "$MANAGER_TOKEN" '{"desk_last_tick_at":"2026-01-01T00:00:00+00:00"}'
check s02-redirect-needs-ui    422 setting_locked             PUT /api/desk/settings "$MANAGER_TOKEN" '{"desk_cutover_redirect":true}'
check l01-legacy-desk-key      400 "desk_* settings are changed in Desk settings" PUT /api/whatsapp/settings "$MANAGER_TOKEN" '{"desk_ui_enabled":"1"}'
# Report-only proof: a role-less token is still served by the old inbox (the filter matches nothing).
check r01-report-only-roleless 200 "*"                        GET "/api/whatsapp/conversations?status=resolved&search=zzzzzzzzzz" "$ROLELESS_TOKEN"

if [ "${READ_ONLY:-0}" = 1 ]; then exit "$fail"; fi

echo "--- switching desk_ui_enabled ON for the ticket checks (needs Part 2)"
check u01-ui-on                200 ok                         PUT /api/desk/settings "$MANAGER_TOKEN" '{"desk_ui_enabled":true}'
ui_on=1
sleep "${FLAG_WAIT_SECS:-31}"   # other server instances read the flag from a 30-second cache
NIL=00000000-0000-4000-8000-000000000000
check t01-list-needs-limit     400 validation_failed          GET "/api/desk/tickets?view=all" "$AGENT_TOKEN"
check t02-list                 200 ok                         GET "/api/desk/tickets?view=all&limit=5&with_counts=1" "$AGENT_TOKEN"
check t03-list-needs-range     422 range_too_large            GET "/api/desk/tickets?view=list&limit=5" "$AGENT_TOKEN"
check t04-unknown-ticket       404 not_found                  GET "/api/desk/tickets/$NIL" "$AGENT_TOKEN"
check t05-bad-id               400 validation_failed          GET /api/desk/tickets/abc "$AGENT_TOKEN"
check t06-resolve-needs-token  400 validation_failed          POST "/api/desk/tickets/$NIL/resolve" "$AGENT_TOKEN" '{"resolution_code":"done"}'
check t07-review-needs-manager 403 forbidden                  PATCH "/api/desk/tickets/$NIL" "$AGENT_TOKEN" '{"op":"review","reviewed":true}'
check t08-agent-action-items   403 forbidden                  GET "/api/desk/action-items?limit=5" "$AGENT_TOKEN"
check t09-manager-action-items 200 ok                         GET "/api/desk/action-items?limit=5" "$MANAGER_TOKEN"
exit "$fail"
