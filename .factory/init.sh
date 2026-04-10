#!/bin/bash
# Field Theory CLI — Environment Setup
# Idempotent: safe to run multiple times

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Verify build works
echo "Verifying build..."
npm run build

# Verify tests pass
echo "Running tests..."
npm test

echo "Environment setup complete."
