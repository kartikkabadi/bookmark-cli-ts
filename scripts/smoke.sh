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

echo "==> Legacy CLI help"
node bin/ft.mjs --help >/tmp/bookmark-cli-help.txt
if ! grep -q "ft" /tmp/bookmark-cli-help.txt; then
  echo "Expected help output to contain command name" >&2
  cat /tmp/bookmark-cli-help.txt >&2
  exit 1
fi

echo "==> Memoria X binary help"
node bin/memoria-x.mjs sync --help >/tmp/memoria-x-help.txt
if ! grep -q -- "--cookie-header" /tmp/memoria-x-help.txt; then
  echo "Expected memoria-x sync help to expose browser-session fallback flags" >&2
  cat /tmp/memoria-x-help.txt >&2
  exit 1
fi

echo "==> Direct development entrypoint"
pnpm exec tsx src/memoria-x-cli.ts --help >/tmp/memoria-x-dev-help.txt
if ! grep -q "memoria-x" /tmp/memoria-x-dev-help.txt; then
  echo "Expected TypeScript entrypoint to execute the CLI" >&2
  cat /tmp/memoria-x-dev-help.txt >&2
  exit 1
fi

echo "==> Direct built entrypoint"
node dist/memoria-x-cli.js --help >/tmp/memoria-x-start-help.txt
if ! grep -q "memoria-x" /tmp/memoria-x-start-help.txt; then
  echo "Expected built entrypoint to execute the CLI" >&2
  cat /tmp/memoria-x-start-help.txt >&2
  exit 1
fi

echo "==> Data path"
PATH_OUTPUT="$(node bin/ft.mjs path)"
PATH_LAST_LINE="$(printf '%s\n' "$PATH_OUTPUT" | awk 'NF {line=$0} END {print line}')"
if [ "$PATH_LAST_LINE" != "$TMP_DATA_DIR" ]; then
  echo "Expected final ft path output line to print FT_DATA_DIR" >&2
  echo "expected: $TMP_DATA_DIR" >&2
  echo "actual final line: $PATH_LAST_LINE" >&2
  echo "full output:" >&2
  echo "$PATH_OUTPUT" >&2
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
