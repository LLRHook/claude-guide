#!/usr/bin/env bash
# capture-fixture.sh — Runs claude and captures the explanation block for the demo fixture
# Regen: bash demo/pipeline/fixtures/capture-fixture.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUTPUT="$SCRIPT_DIR/explain-session.txt"
CAPTURED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_SHA="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
RAW_OUTPUT="$(mktemp /tmp/capture-raw-XXXXXX.json)"
PY_SCRIPT="$(mktemp /tmp/write-fixture-XXXXXX.py)"

echo "Capturing explanation fixture..."
echo "  Root: $ROOT"
echo "  Output: $OUTPUT"

cleanup() {
  rm -f "$RAW_OUTPUT" "$PY_SCRIPT"
}
trap cleanup EXIT

# Run claude with real HOME, stream-json output
HOME="$HOME" \
  claude \
    --allowedTools Read \
    --append-system-prompt "$(cat "$ROOT/data/claude-md-overlay.md")" \
    --model sonnet \
    --output-format stream-json \
    --verbose \
    -p "Read README.md and explain this project in one sentence." \
  > "$RAW_OUTPUT" 2>&1 || true

# Write the python processor to a temp file (avoids heredoc interpolation)
cat > "$PY_SCRIPT" <<'PYEOF'
import json, re, sys, os

RAW = sys.argv[1]
OUTPUT = sys.argv[2]
CAPTURED_AT = sys.argv[3]
GIT_SHA = sys.argv[4]

# Parse stream-json
assistant_text = ""
with open(RAW) as f:
    for raw_line in f:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            obj = json.loads(raw_line)
        except json.JSONDecodeError:
            continue
        msg_type = obj.get("type", "")
        if msg_type == "assistant":
            for block in obj.get("message", {}).get("content", []):
                if isinstance(block, dict) and block.get("type") == "text":
                    assistant_text += block.get("text", "")
        elif msg_type == "content_block_delta":
            delta = obj.get("delta", {})
            if delta.get("type") == "text_delta":
                assistant_text += delta.get("text", "")
        elif msg_type == "result":
            r = obj.get("result", "")
            if isinstance(r, str):
                assistant_text += r

if not assistant_text:
    print("ERROR: no assistant text found in stream output", file=sys.stderr)
    sys.exit(1)

# Extract the 3 canonical overlay lines
found = {}
for line in assistant_text.split("\n"):
    s = line.strip()
    if not s:
        continue
    s_clean = re.sub(r'\*\*(.*?)\*\*', r'\1', s).lstrip('> ').strip()
    if re.search(r"about to do", s, re.IGNORECASE) and "a" not in found:
        # Extract only the value after "What I'm about to do:"
        colon_pos = s_clean.find(":")
        if colon_pos >= 0:
            found["a"] = "What I'm about to do: " + s_clean[colon_pos+1:].strip()
        else:
            found["a"] = s_clean
    elif re.search(r"In everyday terms", s, re.IGNORECASE) and "b" not in found:
        found["b"] = s_clean
    elif re.search(r"What you.ll see", s, re.IGNORECASE) and "c" not in found:
        # Extract only the "What you'll see next" field value.
        # The value ends after the first sentence (period). Strip appended summary.
        # Match: "What you'll see next: <value>." then stop
        import re as _re
        # Find the colon-delimited value portion
        colon_pos = s_clean.find(":")
        if colon_pos >= 0:
            value = s_clean[colon_pos+1:].strip()
            # Truncate at first sentence-ending period
            dot_pos = value.find(".")
            if dot_pos >= 0:
                value = value[:dot_pos+1].strip()
            found["c"] = "What you'll see next: " + value
        else:
            found["c"] = s_clean

if len(found) < 2:
    non_empty = [l.strip() for l in assistant_text.split("\n") if l.strip()][:3]
    lines_out = non_empty
    print("WARNING: overlay pattern not found, using fallback", file=sys.stderr)
else:
    lines_out = [found.get("a",""), found.get("b",""), found.get("c","")]
    lines_out = [l for l in lines_out if l]

print(f"Captured {len(lines_out)} lines:", file=sys.stderr)
for l in lines_out:
    print(f"  {l[:90]}", file=sys.stderr)

# Write fixture as executable shell script
# Use variable-based approach to avoid any quoting issues
with open(OUTPUT, "w") as out:
    out.write("#!/usr/bin/env bash\n")
    out.write(f"# Captured: {CAPTURED_AT}\n")
    out.write(f"# Git SHA: {GIT_SHA}\n")
    out.write("# Regen: bash demo/pipeline/fixtures/capture-fixture.sh\n")
    out.write("# Stale if: data/claude-md-overlay.md or lib/installer.mjs changes\n")
    out.write("\n")
    # ANSI color vars - use literal escape char (not \\033)
    ESC = "\033"
    out.write(f'DIM="{ESC}[2m"\n')
    out.write(f'BOLD="{ESC}[1m"\n')
    out.write(f'RESET="{ESC}[0m"\n')
    out.write(f'ORANGE="{ESC}[38;2;215;119;87m"\n')
    out.write(f'WHITE="{ESC}[38;2;245;237;227m"\n')
    out.write(f'GRAY="{ESC}[38;2;122;110;104m"\n')
    out.write("\n")
    out.write('printf "${GRAY}  Claude is about to use the ${WHITE}Read${GRAY} tool${RESET}\\n"\n')
    out.write('printf "\\n"\n')
    for line in lines_out:
        # Escape for embedding in double-quoted printf string
        safe = line.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$')
        out.write(f'printf "  ${{DIM}}>${{RESET}} ${{ORANGE}}{safe}${{RESET}}\\n"\n')
    out.write('printf "\\n"\n')

os.chmod(OUTPUT, 0o755)
print("Fixture written successfully.", file=sys.stderr)
PYEOF

# Run the python processor with all args
python3 "$PY_SCRIPT" "$RAW_OUTPUT" "$OUTPUT" "$CAPTURED_AT" "$GIT_SHA"

echo ""
echo "Done. Fixture written to: $OUTPUT"
echo ""
echo "Test run:"
bash "$OUTPUT"
