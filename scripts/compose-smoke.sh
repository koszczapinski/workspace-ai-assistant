#!/usr/bin/env bash
# Compose smoke test (CI job `compose-smoke`; runnable locally with Docker and an env file).
# Builds and starts Compose (including the profile-gated bootstrap image, which `up --build` skips) with AI_PROVIDER=fake (AI config is only checked on the first chat request),
# runs `bootstrap`, accepts the printed Owner Invitation, signs in, creates and joins a second Workspace, uploads an Avatar (which proves `sharp` works in the
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
JAR2="$(mktemp)"
trap '"${COMPOSE[@]}" logs --no-color || true; "${COMPOSE[@]}" down -v --remove-orphans || true; rm -f "$JAR" "$JAR2"' EXIT

"${COMPOSE[@]}" up -d --build
# `up --build` skips the `tools` profile, so build the bootstrap image too: otherwise `run` reuses a stale local image.
"${COMPOSE[@]}" --profile tools build bootstrap

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
# One instance, many Workspaces: a second Workspace by name, whose Owner Invitation makes a new account Owner of it only.
OUT2="$("${COMPOSE[@]}" run --rm -T bootstrap --workspace "Second Smoke")"
echo "$OUT2" | sed -E 's#(/invite/)[^[:space:]]+#\1<token>#'
grep -q 'Created Workspace "Second Smoke"' <<< "$OUT2"
LINK2="$(echo "$OUT2" | grep -Eo "https?://[^[:space:]]+/invite/[^[:space:]]+" | tail -1)"
[ -n "$LINK2" ] || { echo "No Owner Invitation link for the second Workspace" >&2; exit 1; }
PAGE2="$(curl -fsS "$LINK2")"
grep -q "Second Smoke" <<< "$PAGE2"
RESP2="$(curl -fsS -X POST "$BASE/api/invitations/accept" -H 'Content-Type: application/json' \
  --data "$(printf '{"token":"%s","name":"Second Owner","email":"owner2@example.test","password":"%s"}' "${LINK2##*/invite/}" "$OWNER_PASSWORD")")"
grep -q '"signedIn":true' <<< "$RESP2"
WS2_ID="$(echo "$RESP2" | sed -E 's/.*"workspaceId":"([^"]+)".*/\1/')"
[ "$WS2_ID" != "$WS_ID" ] || { echo "Second Workspace has the first one's id" >&2; exit 1; }
curl -fsS -c "$JAR2" -X POST "$BASE/api/auth/sign-in/email" -H 'Content-Type: application/json' -H "Origin: $BASE" \
  --data "$(printf '{"email":"owner2@example.test","password":"%s"}' "$OWNER_PASSWORD")" >/dev/null
grep -q "Second Smoke" <<< "$(curl -fsS -b "$JAR2" "$BASE/w/$WS2_ID")"
# The second Owner is not a Member of the first Workspace.
CODE="$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR2" "$BASE/w/$WS_ID")"
case "$CODE" in 307|308|403|404) ;; *) echo "First Workspace answered $CODE for the second Owner, expected a redirect, 403 or 404" >&2; exit 1 ;; esac
echo "Compose smoke test passed."
