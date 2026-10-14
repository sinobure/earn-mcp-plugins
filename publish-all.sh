#!/usr/bin/env bash
# One-shot publisher for all MCP plugins under products/mcp-plugins/.
# Prerequisite: run `npm login` once (interactive OTP) before this script.
#
# Usage:
#   cd products/mcp-plugins && bash publish-all.sh
#
# Safety:
#   - Uses --dry-run first to show what will be published, with a 5s
#     interrupt window.
#   - Only runs `npm publish --access public` on packages that build clean.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

PLUGINS=(
  "exchange-rate-mcp"     # directory name. npm package name is fx-rate-mcp
  "notion-lite-mcp"
  "time-mcp"              # directory name. npm package name is kw-time-mcp
  "rss-mcp"               # directory name. npm package name is kw-rss-mcp
  "markdown-to-pdf-mcp"   # directory name. npm package name is kw-md2pdf-mcp
)

# Directory name -> npm package name (for clearer log output).
# Some plugins ship under a different npm name than their source directory.
declare -A NPM_NAME
NPM_NAME["exchange-rate-mcp"]="fx-rate-mcp"
NPM_NAME["notion-lite-mcp"]="notion-lite-mcp"
NPM_NAME["time-mcp"]="kw-time-mcp"
NPM_NAME["rss-mcp"]="kw-rss-mcp"
NPM_NAME["markdown-to-pdf-mcp"]="kw-md2pdf-mcp"

echo "== MCP Plugin Publisher =="
echo

# Check login first
if ! npm whoami >/dev/null 2>&1; then
  echo "[!] Not logged in to npm. Run:"
  echo "    npm adduser"
  echo "    (answer username / email / password / OTP prompts)"
  exit 1
fi

USER=$(npm whoami)
echo "Logged in as: $USER"
echo

# Build & dry-run each
for plugin in "${PLUGINS[@]}"; do
  pkg="${NPM_NAME[$plugin]:-$plugin}"
  echo "=== $pkg (source dir: $plugin) ==="
  cd "$SCRIPT_DIR/$plugin"

  if [ ! -d node_modules ]; then
    echo "  installing dependencies..."
    npm install --silent
  fi

  echo "  building..."
  npm run build >/dev/null 2>&1

  echo "  dry-run preview:"
  npm publish --access public --dry-run 2>&1 | sed -n '/npm notice Tarball Details/,/npm notice total files/p'

  cd "$SCRIPT_DIR"
  echo
done

echo "=============================="
echo "Above is what will be published."
echo "Press Ctrl+C in the next 5 seconds to abort."
echo "=============================="
sleep 5

# Actual publish
for plugin in "${PLUGINS[@]}"; do
  pkg="${NPM_NAME[$plugin]:-$plugin}"
  echo "=== Publishing $pkg (source dir: $plugin) ==="
  cd "$SCRIPT_DIR/$plugin"
  npm publish --access public
  cd "$SCRIPT_DIR"
  echo
done

echo "All plugins published. Verify on https://www.npmjs.com/~$USER"
