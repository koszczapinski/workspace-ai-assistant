#!/usr/bin/env bash
# SessionStart hook: warn when mattpocock/skills has moved since the last recorded update.
# Read-only: never modifies skills. Usage: skills-freshness.sh [--record]
set -u
cd "$(dirname "$0")/../.." || exit 0
MARKER=".agents/skills-upstream-head"
REPO="https://github.com/mattpocock/skills"

upstream=$(timeout 5 git ls-remote "$REPO" HEAD 2>/dev/null | cut -f1 || true)
# `timeout` is missing on stock macOS; retry without it
[ -z "$upstream" ] && upstream=$(git ls-remote "$REPO" HEAD 2>/dev/null | cut -f1 || true)

if [ "${1:-}" = "--record" ]; then
  [ -n "$upstream" ] && echo "$upstream" > "$MARKER" && echo "Recorded $upstream"
  exit 0
fi

[ -z "$upstream" ] && exit 0   # offline: stay silent
recorded=$(cat "$MARKER" 2>/dev/null || true)
if [ "$upstream" != "$recorded" ]; then
  echo "mattpocock/skills has new commits (${upstream:0:7}, recorded ${recorded:0:7}). Run: npx skills update -p -y && .claude/hooks/skills-freshness.sh --record"
fi
