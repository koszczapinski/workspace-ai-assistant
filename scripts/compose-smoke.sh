#!/usr/bin/env bash
# Compose smoke test (CI job `compose-smoke`; runnable locally with Docker and an env file).
# Builds and starts Compose with AI_PROVIDER=fake (AI config is only checked on the first chat request),
# runs `bootstrap`, accepts the printed Owner Invitation, signs in, uploads an Avatar (which proves `sharp` works in the
# image), and never chats.
# Usage: scripts/compose-smoke.sh <env-file>   (the file must set BETTER_AUTH_URL to http://localhost:<APP_PORT>)
set -euo pipefail

ENV_FILE="${1:?Usage: scripts/compose-smoke.sh <env-file>}"
read -ra COMPOSE_BIN <<< "${COMPOSE_BIN:-docker compose}"  # COMPOSE_BIN=docker-compose when the plugin is missing
COMPOSE=("${COMPOSE_BIN[@]}" --env-file "$ENV_FILE")
set -a; . "$ENV_FILE"; set +a
BASE="${BETTER_AUTH_URL%/}"
OWNER_EMAIL="owner@example.test"
OWNER_PASSWORD="smoke-test-password-1"
JAR="$(mktemp)"
trap '"${COMPOSE[@]}" logs --no-color || true; "${COMPOSE[@]}" down -v --remove-orphans || true; rm -f "$JAR"' EXIT

"${COMPOSE[@]}" up -d --build

echo "Waiting for the app..."
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "$BASE/login" && break
  sleep 2
done
curl -fsS -o /dev/null "$BASE/login"

OUT="$("${COMPOSE[@]}" run --rm -T bootstrap --workspace "Smoke Test")"
echo "$OUT" | sed -E 's#(/invite/)[^[:space:]]+#\1<token>#'
LINK="$(echo "$OUT" | grep -Eo "https?://[^[:space:]]+/invite/[^[:space:]]+" | tail -1)"
[ -n "$LINK" ] || { echo "No Owner Invitation link in bootstrap output" >&2; exit 1; }
TOKEN="${LINK##*/invite/}"

# The Invitation page names the Workspace.
PAGE="$(curl -fsS "$LINK")"
grep -q "Smoke Test" <<< "$PAGE"

BODY="$(printf '{"token":"%s","name":"Smoke Owner","email":"%s","password":"%s"}' "$TOKEN" "$OWNER_EMAIL" "$OWNER_PASSWORD")"
RESP="$(curl -fsS -X POST "$BASE/api/invitations/accept" -H 'Content-Type: application/json' --data "$BODY")"
grep -q '"signedIn":true' <<< "$RESP"

# The link is single-use.
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/invitations/accept" -H 'Content-Type: application/json' --data "$BODY")"
[ "$CODE" = "404" ] || { echo "Reused Invitation answered $CODE, expected 404" >&2; exit 1; }

# Sign in with the new Owner account and load the signed-in home page.
curl -fsS -c "$JAR" -X POST "$BASE/api/auth/sign-in/email" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  --data "$(printf '{"email":"%s","password":"%s"}' "$OWNER_EMAIL" "$OWNER_PASSWORD")" >/dev/null
WS_ID="$(echo "$RESP" | sed -E 's/.*"workspaceId":"([^"]+)".*/\1/')"
PAGE="$(curl -fsS -b "$JAR" "$BASE/w/$WS_ID")"
grep -q "Smoke Test" <<< "$PAGE"

# Upload an Avatar: `sharp`'s native binaries must load in the image to re-encode it as a 256x256 WebP.
PNG="$(mktemp)"
echo 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAMElEQVRIiWM4YSNHU8QwaoHNaBDJjaaiE6MZTW60qDgxWprajFY4J0arTJvB3aoAALcCZi4/K2k4AAAAAElFTkSuQmCC' | base64 -d > "$PNG"
curl -fsS -b "$JAR" -X PUT "$BASE/api/account/avatar" -H "Origin: $BASE" -F "file=@$PNG;type=image/png" >/dev/null
USER_ID="$(curl -fsS -b "$JAR" "$BASE/api/auth/get-session" | sed -E 's/.*"user":\{[^}]*"id":"([^"]+)".*/\1/')"
TYPE="$(curl -fsS -b "$JAR" -o /dev/null -w '%{content_type}' "$BASE/api/users/$USER_ID/avatar")"
[ "$TYPE" = "image/webp" ] || { echo "Avatar answered $TYPE, expected image/webp" >&2; exit 1; }
rm -f "$PNG"
echo "Compose smoke test passed."
