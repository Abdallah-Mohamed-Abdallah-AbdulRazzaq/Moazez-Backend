#!/usr/bin/env bash
# =============================================================================
# scripts/demo.sh — Sprint 1A smoke test
#
# Exercises the full auth flow against a running server.
# Usage:
#   npm run start:dev &       # start the server (or docker compose up)
#   bash scripts/demo.sh
#
# Requires: curl, jq
# Defaults: BASE_URL=http://localhost:3000/api/v1
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
EMAIL="${DEMO_EMAIL:-admin@academy.moazez.dev}"
PASSWORD="${DEMO_PASSWORD:-School123!}"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✓${RESET} $*"; }
fail() { echo -e "${RED}✗${RESET} $*"; exit 1; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

# ---------------------------------------------------------------------------
header "1. Health check (public route, no auth)"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/health")
[[ "$STATUS" == "200" ]] && pass "GET /health → $STATUS" || fail "GET /health → $STATUS"

# ---------------------------------------------------------------------------
header "2. Reject unauthenticated request to /auth/me"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/auth/me" || true)
[[ "$STATUS" == "401" ]] && pass "GET /auth/me (no token) → $STATUS" || fail "GET /auth/me (no token) → $STATUS"

# ---------------------------------------------------------------------------
header "3. Reject invalid credentials"
BODY=$(curl -sf -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@moazez.test","password":"wrong"}' || true)
CODE=$(echo "$BODY" | jq -r '.error.code // empty')
[[ "$CODE" == "auth.credentials.invalid" ]] \
  && pass "POST /auth/login (bad creds) → auth.credentials.invalid" \
  || fail "expected auth.credentials.invalid, got: $BODY"

# ---------------------------------------------------------------------------
header "4. Login with valid credentials"
LOGIN=$(curl -sf -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_TOKEN=$(echo "$LOGIN" | jq -r '.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN" | jq -r '.refreshToken')
[[ -n "$ACCESS_TOKEN" && "$ACCESS_TOKEN" != "null" ]] \
  && pass "POST /auth/login → accessToken issued" \
  || fail "Login failed: $LOGIN"

# ---------------------------------------------------------------------------
header "5. /auth/me returns actor + active membership"
ME=$(curl -sf -s "$BASE_URL/auth/me" -H "Authorization: Bearer $ACCESS_TOKEN")
SCHOOL_ID=$(echo "$ME" | jq -r '.activeMembership.schoolId // empty')
PERM_COUNT=$(echo "$ME" | jq '.activeMembership.permissions | length')
[[ -n "$SCHOOL_ID" ]] \
  && pass "/auth/me → schoolId=$SCHOOL_ID  permissions=$PERM_COUNT" \
  || fail "/auth/me missing activeMembership: $ME"

# ---------------------------------------------------------------------------
header "6. Refresh token rotation"
REFRESH_RESP=$(curl -sf -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
NEW_ACCESS=$(echo "$REFRESH_RESP" | jq -r '.accessToken')
NEW_REFRESH=$(echo "$REFRESH_RESP" | jq -r '.refreshToken')
[[ -n "$NEW_ACCESS" && "$NEW_ACCESS" != "null" ]] \
  && pass "POST /auth/refresh → new token pair issued" \
  || fail "Refresh failed: $REFRESH_RESP"

# ---------------------------------------------------------------------------
header "7. Reuse of old refresh token is rejected (rotation guard)"
OLD_REUSE=$(curl -sf -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" || true)
ROTATED_CODE=$(echo "$OLD_REUSE" | jq -r '.error.code // empty')
[[ "$ROTATED_CODE" == "auth.refresh.rotated" ]] \
  && pass "POST /auth/refresh (old token) → auth.refresh.rotated" \
  || fail "expected auth.refresh.rotated, got: $OLD_REUSE"

# ---------------------------------------------------------------------------
header "8. Logout revokes session"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $NEW_ACCESS")
[[ "$STATUS" == "204" ]] \
  && pass "POST /auth/logout → $STATUS" \
  || fail "Logout failed: $STATUS"

# ---------------------------------------------------------------------------
header "9. /auth/me after logout returns auth.session.revoked"
AFTER_LOGOUT=$(curl -sf -s "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $NEW_ACCESS" || true)
REVOKED_CODE=$(echo "$AFTER_LOGOUT" | jq -r '.error.code // empty')
[[ "$REVOKED_CODE" == "auth.session.revoked" ]] \
  && pass "GET /auth/me (after logout) → auth.session.revoked" \
  || fail "expected auth.session.revoked, got: $AFTER_LOGOUT"

# ---------------------------------------------------------------------------
echo ""
pass "All Sprint 1A demo checks passed."
