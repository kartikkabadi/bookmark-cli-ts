#!/usr/bin/env bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo "${BLUE}║   Bookmark CLI — TypeScript Edition      ║${NC}"
echo "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# Detect OS
OS="$(uname -s 2>/dev/null || echo unknown)"
case "$OS" in
  Darwin) echo "${GREEN}✓ macOS detected${NC}" ;;
  Linux)  echo "${GREEN}✓ Linux detected${NC}" ;;
  *)
    echo "${YELLOW}⚠ Unsupported OS: $OS${NC}"
    echo "This script is designed for macOS and Linux."
    echo "On other platforms, install manually: npm install -g bookmark-cli-ts"
    ;;
esac

# Check Node.js
if ! command -v node &> /dev/null; then
    echo ""
    echo "${RED}✗ Node.js is required but not installed.${NC}"
    echo ""
    echo "Install Node.js 20+ from https://nodejs.org"
    echo ""
    echo "  macOS (Homebrew):   brew install node"
    echo "  Linux (nvm):        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && nvm install 20"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo ""
    echo "${RED}✗ Node.js 20+ is required. Current: $(node -v)${NC}"
    echo "Upgrade at https://nodejs.org"
    exit 1
fi

echo "${GREEN}✓ Node.js $(node -v) detected${NC}"

# Detect package manager (prefer pnpm > bun > npm)
if command -v pnpm &> /dev/null; then
    PKG_MGR="pnpm"
elif command -v bun &> /dev/null; then
    PKG_MGR="bun"
else
    PKG_MGR="npm"
fi

echo "${GREEN}✓ Using ${PKG_MGR} to install${NC}"
echo ""

# Install
if [ "$PKG_MGR" = "npm" ]; then
    npm install -g bookmark-cli-ts
elif [ "$PKG_MGR" = "pnpm" ]; then
    pnpm install -g bookmark-cli-ts
else
    bun install -g bookmark-cli-ts
fi

echo ""
echo "${GREEN}✓ bookmark-cli-ts installed!${NC}"
echo ""
echo "Get started:"
echo "  ${BLUE}ft --help${NC}           Show all commands"
echo "  ${BLUE}ft sync${NC}             Sync your X/Twitter bookmarks"
echo "  ${BLUE}ft sync --browser helium${NC}  Sync with Helium browser"
echo ""
