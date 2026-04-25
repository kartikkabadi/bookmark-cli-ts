#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LIMIT="${BOOKMARK_CLI_LIVE_LIMIT:-5}"
MAX_PAGES="${BOOKMARK_CLI_LIVE_MAX_PAGES:-1}"
LOG_DIR="${BOOKMARK_CLI_LOG_DIR:-$HOME}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/bookmark-cli-live-helium-$(date +%Y%m%d-%H%M%S).log"

redact() {
  sed -E 's/(auth_token|ct0|csrf[_-]?token|cookie|authorization|bearer|x-csrf-token)([=:"][^[:space:]"]+)/\1=[REDACTED]/Ig'
}

{
  echo "log_file=$LOG"
  echo "repo=$ROOT_DIR"
  echo "node=$(node --version)"
  echo "pnpm=$(pnpm --version)"
  echo "max_pages=$MAX_PAGES"
  echo "target_adds=$LIMIT"
  echo

  echo "==> Build"
  pnpm run build

  echo
  echo "==> Live Helium sync"
  node bin/ft.mjs sync --browser helium --max-pages "$MAX_PAGES" --target-adds "$LIMIT"

  echo
  echo "==> Status"
  node bin/ft.mjs status

  echo
  echo "==> Search smoke"
  node bin/ft.mjs search ai --limit 5
} 2>&1 | redact | tee "$LOG"

echo
printf 'Live Helium smoke log: %s\n' "$LOG"
