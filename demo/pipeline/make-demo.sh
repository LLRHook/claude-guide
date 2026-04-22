#!/bin/bash
set -euo pipefail

# ─── claude-guide demo pipeline: master orchestration ────────────────────────
#
# Full pipeline: generate overlays → stitch clips → export the demo video.
#
# Usage:
#   bash demo/pipeline/make-demo.sh            # 16:9 video
#   bash demo/pipeline/make-demo.sh wide       # Same as default
#   bash demo/pipeline/make-demo.sh twitter    # Same as default
#   bash demo/pipeline/make-demo.sh all        # Same as default
#
# Prerequisites:
#   1. Run setup.sh once to install fonts and verify dependencies
#   2. Record 5 clips per record-guide.md and place in clips/
#
# What this script does:
#   1. Generates overlay assets (title card, end card, captions, badges)
#   2. Composites clips with overlays into a 16:9 video
#   3. Writes the canonical 16:9 file to demo/pipeline/output/claude-guide-demo.mp4

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAYOUT="${1:-wide}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║       claude-guide demo pipeline                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Step 1: Generate overlay assets
echo "Step 1: Generating overlays..."
python3 "$SCRIPT_DIR/generate-overlays.py"

# Step 2: Stitch clips into final videos
echo ""
echo "Step 2: Stitching clips..."
bash "$SCRIPT_DIR/stitch.sh" "$LAYOUT"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Done! Videos are in demo/pipeline/output/           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "To re-record a single clip:"
echo "  1. Re-record just that clip"
echo "  2. Drop it in clips/"
echo "  3. Re-run this script"
echo ""
