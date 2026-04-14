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
echo "${BLUE}║   Bookmark CLI TS                         ║${NC}"
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
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m 2>/dev/null || echo unknown)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "${YELLOW}⚠ Unsupported architecture: $ARCH${NC}"
    exit 1
    ;;
esac

echo "${GREEN}✓ Architecture: $ARCH${NC}"

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
echo ""

# Get latest release from GitHub
REPO="kartikkabadi/bookmark-cli-ts"
echo "${BLUE}Fetching latest release from GitHub...${NC}"
LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_RELEASE" ]; then
    echo "${RED}✗ Failed to fetch latest release${NC}"
    exit 1
fi

echo "${GREEN}✓ Latest release: $LATEST_RELEASE${NC}"
echo ""

# Download release
PLATFORM=""
if [ "$OS" = "Darwin" ]; then
    PLATFORM="macos"
elif [ "$OS" = "Linux" ]; then
    PLATFORM="linux"
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_RELEASE}/bookmark-cli-ts-${PLATFORM}-${ARCH}.tar.gz"
INSTALL_DIR="/usr/local/bin"

echo "${BLUE}Downloading from: $DOWNLOAD_URL${NC}"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Download
if ! curl -fsSL "$DOWNLOAD_URL" -o bookmark-cli-ts.tar.gz; then
    echo "${RED}✗ Download failed${NC}"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Extract
echo "${BLUE}Extracting...${NC}"
tar -xzf bookmark-cli-ts.tar.gz

# Install
echo "${BLUE}Installing to $INSTALL_DIR${NC}"
if [ ! -d "$INSTALL_DIR" ]; then
    sudo mkdir -p "$INSTALL_DIR"
fi

sudo mv bookmark-cli-ts "$INSTALL_DIR/ft"
sudo chmod +x "$INSTALL_DIR/ft"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

echo ""
echo "${GREEN}✓ bookmark-cli-ts installed successfully!${NC}"
echo ""
echo "Get started:"
echo "  ${BLUE}ft --help${NC}           Show all commands"
echo "  ${BLUE}ft sync${NC}             Sync your X/Twitter bookmarks"
echo "  ${BLUE}ft sync --browser helium${NC}  Sync with Helium browser"
echo ""
