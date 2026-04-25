#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO="kartikkabadi/bookmark-cli-ts"
APP_NAME="bookmark-cli-ts"
BIN_NAME="ft"
APP_DIR="${BOOKMARK_CLI_APP_DIR:-$HOME/.local/share/bookmark-cli-ts}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%b\n' "$1"; }
fail() { say "${RED}✗ $1${NC}"; exit 1; }

say ""
say "${BLUE}╔══════════════════════════════════════════╗${NC}"
say "${BLUE}║   Bookmark CLI TS                       ║${NC}"
say "${BLUE}╚══════════════════════════════════════════╝${NC}"
say ""

OS="$(uname -s 2>/dev/null || echo unknown)"
case "$OS" in
  Darwin) PLATFORM="macos"; say "${GREEN}✓ macOS detected${NC}" ;;
  Linux) PLATFORM="linux"; say "${GREEN}✓ Linux detected${NC}" ;;
  *) fail "Unsupported OS: $OS. This installer supports macOS and Linux." ;;
esac

ARCH="$(uname -m 2>/dev/null || echo unknown)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) fail "Unsupported architecture: $ARCH" ;;
esac
say "${GREEN}✓ Architecture: $ARCH${NC}"

if ! command -v node >/dev/null 2>&1; then
  say ""
  fail "Node.js 20+ is required. Install from https://nodejs.org or use Homebrew/nvm."
fi

NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  fail "Node.js 20+ is required. Current: $(node -v)"
fi
say "${GREEN}✓ Node.js $(node -v) detected${NC}"

mkdir -p "$INSTALL_DIR" "$APP_DIR"

if ! printf '%s' "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  say "${YELLOW}⚠ $INSTALL_DIR is not on PATH.${NC}"
  say "  Add this to your shell profile: export PATH=\"$INSTALL_DIR:\$PATH\""
  say ""
fi

install_wrapper() {
  local target="$1"
  cat > "$INSTALL_DIR/$BIN_NAME" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$target" "\$@"
EOF
  chmod +x "$INSTALL_DIR/$BIN_NAME"
}

install_from_release() {
  say "${BLUE}Fetching latest release from GitHub...${NC}"
  local latest_release
  latest_release="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/' || true)"

  if [ -z "$latest_release" ]; then
    return 1
  fi

  say "${GREEN}✓ Latest release: $latest_release${NC}"
  local download_url="https://github.com/${REPO}/releases/download/${latest_release}/${APP_NAME}-${PLATFORM}-${ARCH}.tar.gz"
  local temp_dir
  temp_dir="$(mktemp -d)"

  say "${BLUE}Downloading: $download_url${NC}"
  if ! curl -fsSL "$download_url" -o "$temp_dir/${APP_NAME}.tar.gz"; then
    rm -rf "$temp_dir"
    return 1
  fi

  rm -rf "$APP_DIR/release"
  mkdir -p "$APP_DIR/release"
  tar -xzf "$temp_dir/${APP_NAME}.tar.gz" -C "$APP_DIR/release"
  rm -rf "$temp_dir"

  if [ -x "$APP_DIR/release/bookmark-cli-ts" ]; then
    install_wrapper "$APP_DIR/release/bookmark-cli-ts"
  elif [ -f "$APP_DIR/release/bin/ft.mjs" ]; then
    install_wrapper "node $APP_DIR/release/bin/ft.mjs"
  else
    return 1
  fi
}

install_from_source() {
  say "${YELLOW}Release asset unavailable. Falling back to source install.${NC}"

  if ! command -v pnpm >/dev/null 2>&1; then
    if command -v corepack >/dev/null 2>&1; then
      corepack enable pnpm >/dev/null 2>&1 || true
    fi
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    fail "pnpm is required for source install. Install it with: corepack enable pnpm"
  fi

  local temp_dir
  temp_dir="$(mktemp -d)"
  say "${BLUE}Downloading source archive...${NC}"
  curl -fsSL "https://github.com/${REPO}/archive/refs/heads/main.tar.gz" -o "$temp_dir/source.tar.gz"
  tar -xzf "$temp_dir/source.tar.gz" -C "$temp_dir"

  rm -rf "$APP_DIR/source"
  mv "$temp_dir/bookmark-cli-ts-main" "$APP_DIR/source"
  rm -rf "$temp_dir"

  say "${BLUE}Installing dependencies and building...${NC}"
  (cd "$APP_DIR/source" && pnpm install --frozen-lockfile && pnpm run build)

  cat > "$INSTALL_DIR/$BIN_NAME" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec node "$APP_DIR/source/bin/ft.mjs" "\$@"
EOF
  chmod +x "$INSTALL_DIR/$BIN_NAME"
}

if ! install_from_release; then
  install_from_source
fi

say ""
say "${GREEN}✓ bookmark-cli-ts installed successfully!${NC}"
say ""
say "Binary: ${BLUE}$INSTALL_DIR/$BIN_NAME${NC}"
say "Data:   ${BLUE}~/.ft-bookmarks${NC}"
say ""
say "Get started:"
say "  ${BLUE}ft --help${NC}"
say "  ${BLUE}ft sync --browser helium${NC}"
say "  ${BLUE}ft search \"query\"${NC}"
say ""
