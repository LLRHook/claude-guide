#!/bin/bash
set -euo pipefail

# ─── claude-guide demo pipeline: one-time setup ─────────────────────────────
#
# Installs fonts (JetBrains Mono for terminal, Inter for overlays),
# verifies ffmpeg, and creates working directories.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIPS_DIR="$SCRIPT_DIR/clips"
OVERLAYS_DIR="$SCRIPT_DIR/overlays"

echo "claude-guide demo pipeline — setup"
echo ""

# ─── 1. Check dependencies ──────────────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "  MISSING: $1"
    echo "  Install with: $2"
    return 1
  else
    echo "  OK: $1"
    return 0
  fi
}

echo "Checking dependencies..."
MISSING=0
check_cmd ffmpeg "brew install ffmpeg" || MISSING=1
check_cmd python3 "brew install python3" || MISSING=1

# Check Pillow
if python3 -c "from PIL import Image" 2>/dev/null; then
  echo "  OK: Pillow (Python)"
else
  echo "  MISSING: Pillow — install with: pip3 install Pillow"
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "Install missing dependencies above, then re-run this script."
  exit 1
fi

echo ""

# ─── 2. Install JetBrains Mono (terminal font) ──────────────────────────────

if fc-list 2>/dev/null | grep -qi "JetBrains Mono"; then
  echo "JetBrains Mono: already installed"
else
  echo "Installing JetBrains Mono..."
  if command -v brew &>/dev/null; then
    brew install --cask font-jetbrains-mono 2>/dev/null || true
    echo "  Installed via Homebrew"
  else
    echo "  Download manually: https://www.jetbrains.com/lp/mono/"
    echo "  Or: brew install --cask font-jetbrains-mono"
  fi
fi

# ─── 3. Install Inter (overlay font) ────────────────────────────────────────

if fc-list 2>/dev/null | grep -qi "\\bInter\\b"; then
  echo "Inter: already installed"
else
  echo "Installing Inter..."
  if command -v brew &>/dev/null; then
    brew install --cask font-inter 2>/dev/null || true
    echo "  Installed via Homebrew"
  else
    echo "  Download manually: https://rsms.me/inter/"
    echo "  Or: brew install --cask font-inter"
  fi
fi

echo ""

# ─── 4. Create directories ──────────────────────────────────────────────────

mkdir -p "$CLIPS_DIR" "$OVERLAYS_DIR"
echo "Directories ready:"
echo "  clips/     — drop your screen recordings here"
echo "  overlays/  — generated title cards and captions"

echo ""
echo "Setup complete."
echo ""
echo "Next steps:"
echo "  1. Read demo/pipeline/record-guide.md"
echo "  2. Record 5 short clips of real Claude Code sessions"
echo "  3. Drop them in demo/pipeline/clips/"
echo "  4. Run: bash demo/pipeline/make-demo.sh"
