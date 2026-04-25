#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TMP_DATA_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DATA_DIR"
}
trap cleanup EXIT

export FT_DATA_DIR="$TMP_DATA_DIR"

echo "==> Installing/building assumptions"
node --version
pnpm --version

echo "==> Typecheck"
pnpm run typecheck

echo "==> Build"
pnpm run build

echo "==> CLI help"
node bin/ft.mjs --help >/tmp/bookmark-cli-help.txt
if ! grep -q "Self-custody" /tmp/bookmark-cli-help.txt; then
  echo "Expected help output to contain CLI description" >&2
  exit 1
fi

echo "==> Data path"
PATH_OUTPUT="$(node bin/ft.mjs path)"
if [ "$PATH_OUTPUT" != "$TMP_DATA_DIR" ]; then
  echo "Expected ft path to print FT_DATA_DIR" >&2
  echo "expected: $TMP_DATA_DIR" >&2
  echo "actual:   $PATH_OUTPUT" >&2
  exit 1
fi

echo "==> Empty-state status should fail gracefully"
set +e
STATUS_OUTPUT="$(node bin/ft.mjs status 2>&1)"
STATUS_CODE=$?
set -e
if [ "$STATUS_CODE" -eq 0 ]; then
  echo "Expected status to return non-zero with no synced data" >&2
  exit 1
fi
if ! printf '%s' "$STATUS_OUTPUT" | grep -q "No bookmarks synced yet"; then
  echo "Expected status empty-state guidance" >&2
  echo "$STATUS_OUTPUT" >&2
  exit 1
fi

echo "==> Empty-state search should fail gracefully"
set +e
SEARCH_OUTPUT="$(node bin/ft.mjs search ai 2>&1)"
SEARCH_CODE=$?
set -e
if [ "$SEARCH_CODE" -eq 0 ]; then
  echo "Expected search to return non-zero with no synced data" >&2
  exit 1
fi
if ! printf '%s' "$SEARCH_OUTPUT" | grep -q "No bookmarks synced yet"; then
  echo "Expected search empty-state guidance" >&2
  echo "$SEARCH_OUTPUT" >&2
  exit 1
fi

echo "==> Tests"
pnpm test

echo "==> Lint"
pnpm run lint

echo "Smoke test passed."
