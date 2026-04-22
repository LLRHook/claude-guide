#!/usr/bin/env bash
# ─── claude-guide demo pipeline: record clips via VHS ────────────────────────
#
# Renders 5 short terminal clips of the real claude-guide CLI running,
# using a warm dark theme that matches Claude Code's aesthetic.
#
# Usage:   bash demo/pipeline/record-clips.sh [claude|scripted]
# Outputs: demo/pipeline/clips/01-init.mp4 … 05-graduate.mp4
# Requires: vhs (brew install charmbracelet/tap/vhs)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLIPS_DIR="$SCRIPT_DIR/clips"
WORK_DIR="$(mktemp -d)"
MODE="${1:-claude}"
CLAUDE_MODE="scripted"
REAL_CLAUDE_HOME="${HOME}"
DEMO_GUIDE_ACTIVE=0
DEMO_GUIDE_BACKUP="$WORK_DIR/guide.backup"

echo "claude-guide demo pipeline — record clips"
echo "  Root  : $ROOT"
echo "  Clips : $CLIPS_DIR"
echo ""

if ! command -v vhs &>/dev/null; then
  echo "ERROR: vhs not installed. Run: brew install charmbracelet/tap/vhs"
  exit 1
fi

REAL_CLAUDE_BIN="$(command -v claude || true)"

mkdir -p "$CLIPS_DIR"

auth_available() {
  claude auth status 2>/dev/null | grep -q '"loggedIn": true'
}

prepare_real_home_demo_guide() {
  mkdir -p "$REAL_CLAUDE_HOME/.claude"

  if [ -e "$REAL_CLAUDE_HOME/.claude/guide" ]; then
    mv "$REAL_CLAUDE_HOME/.claude/guide" "$DEMO_GUIDE_BACKUP"
  fi

  mkdir -p "$REAL_CLAUDE_HOME/.claude/guide"
  cat > "$REAL_CLAUDE_HOME/.claude/guide/profile.json" <<'JSON'
{
  "version": 1,
  "installed_at": "2026-04-15T00:00:00.000Z",
  "level": "beginner",
  "tools": {
    "Bash":  { "seen": 0, "graduated": false, "threshold": 15 },
    "Read":  { "seen": 0, "graduated": false, "threshold": 5  },
    "Edit":  { "seen": 0, "graduated": false, "threshold": 10 },
    "Write": { "seen": 0, "graduated": false, "threshold": 8  },
    "Grep":  { "seen": 0, "graduated": false, "threshold": 8  },
    "Glob":  { "seen": 0, "graduated": false, "threshold": 5  },
    "Agent": { "seen": 0, "graduated": false, "threshold": 12 }
  },
  "guardrails": {},
  "sessions": 0,
  "total_tool_calls": 0,
  "last_session": null
}
JSON
  : > "$REAL_CLAUDE_HOME/.claude/guide/journal.jsonl"
  rm -f "$REAL_CLAUDE_HOME/.claude/guide/ready-to-graduate.txt"
  DEMO_GUIDE_ACTIVE=1
}

restore_real_home_demo_guide() {
  if [ "$DEMO_GUIDE_ACTIVE" -ne 1 ]; then
    return
  fi

  rm -rf "$REAL_CLAUDE_HOME/.claude/guide"
  if [ -e "$DEMO_GUIDE_BACKUP" ]; then
    mv "$DEMO_GUIDE_BACKUP" "$REAL_CLAUDE_HOME/.claude/guide"
  fi
}

cleanup() {
  restore_real_home_demo_guide
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

if [ "$MODE" = "claude" ] && auth_available; then
  CLAUDE_MODE="real"
  prepare_real_home_demo_guide
elif [ "$MODE" = "claude" ]; then
  echo "NOTE: Claude auth unavailable for scripted capture. Falling back to helper-mode clips."
fi

# ─── Demo home (isolated from real config) ───────────────────────────────────

DEMO_HOME="$WORK_DIR/home"
mkdir -p "$DEMO_HOME/.claude"

# ─── VHS theme + settings ────────────────────────────────────────────────────

THEME='{ "name": "claude-warm", "black": "#100e0c", "red": "#e85555", "green": "#4caf72", "yellow": "#d77757", "blue": "#7c94ff", "magenta": "#b59cff", "cyan": "#65d1b5", "white": "#f5ede3", "brightBlack": "#7a6e68", "brightRed": "#ff7b7b", "brightGreen": "#6dd98e", "brightYellow": "#e8956e", "brightBlue": "#9eb0ff", "brightMagenta": "#d4c4ff", "brightCyan": "#8be8d0", "brightWhite": "#ffffff", "background": "#100e0c", "foreground": "#f5ede3", "selection": "#3d2a1e", "cursor": "#d77757" }'

SETTINGS="Set Theme $THEME
Set FontFamily \"Menlo\"
Set LetterSpacing 0
Set LineHeight 1.2
Set FontSize 18
Set Width 1320
Set Height 860
Set Padding 22
Set WindowBar \"Colorful\"
Set BorderRadius 12
Set Framerate 30
Set TypingSpeed 28ms"

# ─── Strategy ────────────────────────────────────────────────────────────────
# Path has spaces ("personal projects"), so aliases with raw paths break.
# Solution: each tape's Hide block cd's into the project root, creates a
# cg() shell function using relative paths, and sets a clean PS1.
# The Show block types "claude-guide <cmd>" which the cg alias handles.

# ─── Helper scripts (called from wrapper functions) ──────────────────────────

# Block display — uses the real pre-tool hook
cat > "$WORK_DIR/show-block.sh" <<HEREDOC
#!/usr/bin/env bash
export HOME="$DEMO_HOME"
ORANGE="\033[38;2;215;119;87m"
WHITE="\033[38;2;245;237;227m"
RED="\033[38;2;232;85;85m"
DIM="\033[2m"
BOLD="\033[1m"
RESET="\033[0m"

cd "$ROOT"
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | node hooks/pre-tool.mjs 2>&1
echo ""
exit 0
HEREDOC
chmod +x "$WORK_DIR/show-block.sh"

if [ "$CLAUDE_MODE" = "real" ]; then
  PRE_HOOK_PATH=$(python3 - <<'PY'
from pathlib import Path
print((Path("hooks/pre-tool.mjs").resolve()).as_posix())
PY
)
  POST_HOOK_PATH=$(python3 - <<'PY'
from pathlib import Path
print((Path("hooks/post-tool.mjs").resolve()).as_posix())
PY
)

  cat > "$WORK_DIR/claude-demo-settings.json" <<JSON
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"$PRE_HOOK_PATH\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "node \"$POST_HOOK_PATH\"" }]
      }
    ]
  }
}
JSON

  mkdir -p "$WORK_DIR/claude-explain" "$WORK_DIR/claude-block"

  cat > "$WORK_DIR/claude-explain/claude" <<HEREDOC
#!/usr/bin/env bash
set -euo pipefail
export HOME="$REAL_CLAUDE_HOME"
cd "$ROOT"
export CLAUDE_CODE_NO_FLICKER=1
"$REAL_CLAUDE_BIN" \
  --allowedTools Read \
  --settings "$WORK_DIR/claude-demo-settings.json" \
  --append-system-prompt "\$(cat '$ROOT/data/claude-md-overlay.md')" \
  --model sonnet \
  "\$*" &
pid=\$!
sleep 15
kill "\$pid" 2>/dev/null || true
wait "\$pid" 2>/dev/null || true
HEREDOC
  chmod +x "$WORK_DIR/claude-explain/claude"

  cat > "$WORK_DIR/claude-block/claude" <<HEREDOC
#!/usr/bin/env bash
set -euo pipefail
export HOME="$REAL_CLAUDE_HOME"
cd "$ROOT"
export CLAUDE_CODE_NO_FLICKER=1
"$REAL_CLAUDE_BIN" \
  --allowedTools Bash \
  --settings "$WORK_DIR/claude-demo-settings.json" \
  --append-system-prompt "\$(cat '$ROOT/data/claude-md-overlay.md')" \
  --model sonnet \
  "\$*" &
pid=\$!
sleep 20
kill "\$pid" 2>/dev/null || true
wait "\$pid" 2>/dev/null || true
HEREDOC
  chmod +x "$WORK_DIR/claude-block/claude"
fi

# Seed tool calls + show status
cat > "$WORK_DIR/seed-status.sh" <<HEREDOC
#!/usr/bin/env bash
export HOME="$DEMO_HOME"
cd "$ROOT"

# Seed realistic tool usage
_post() {
  printf '{"tool_name":"%s","tool_input":{"file_path":"app.js"},"session_id":"demo"}' "\$1" | node hooks/post-tool.mjs 2>/dev/null
}

for i in 1 2 3 4 5;         do _post Read;  done
for i in 1 2 3 4 5 6 7 8 9; do _post Bash;  done
for i in 1 2 3;             do _post Edit;  done
_post Grep
_post Write
HEREDOC
chmod +x "$WORK_DIR/seed-status.sh"

# ─── Tape: Clip 1 — init ────────────────────────────────────────────────────

cat > "$WORK_DIR/01-init.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/01-init.mp4"

Hide
Type "cd '$ROOT'"
Enter
Sleep 300ms
Type "export HOME='$DEMO_HOME' && rm -rf \$HOME/.claude/guide"
Enter
Sleep 200ms
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "alias claude-guide='node bin/cli.mjs'"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Show

Type "claude-guide init"
Sleep 500ms
Enter
Sleep 5s
TAPE

# ─── Tape: Clip 2 — explain ─────────────────────────────────────────────────

if [ "$CLAUDE_MODE" = "real" ]; then
cat > "$WORK_DIR/02-explain.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/02-explain.mp4"

Hide
Type "cd '$ROOT'"
Enter
Sleep 200ms
Type "export HOME='$REAL_CLAUDE_HOME'"
Enter
Sleep 200ms
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "export PATH='$WORK_DIR/claude-explain':\$PATH"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Show

Type "claude Read README.md and explain this project in one sentence."
Sleep 500ms
Enter
Sleep 16s
TAPE
else
cat > "$WORK_DIR/02-explain.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/02-explain.mp4"

Hide
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Show

Type "bash demo/pipeline/fixtures/explain-session.txt"
Enter
Sleep 4s
TAPE
fi

# ─── Tape: Clip 3 — block ───────────────────────────────────────────────────

if [ "$CLAUDE_MODE" = "real" ]; then
cat > "$WORK_DIR/03-block.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/03-block.mp4"

Hide
Type "cd '$ROOT'"
Enter
Sleep 200ms
Type "export HOME='$REAL_CLAUDE_HOME'"
Enter
Sleep 200ms
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "export PATH='$WORK_DIR/claude-block':\$PATH"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Show

Type "claude Run npm install -g pnpm"
Sleep 500ms
Enter
Sleep 20s
TAPE
else
cat > "$WORK_DIR/03-block.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/03-block.mp4"

Hide
Type "cd '$ROOT'"
Enter
Sleep 200ms
Type "export HOME='$DEMO_HOME'"
Enter
Sleep 200ms
Type "node bin/cli.mjs init > /dev/null 2>&1"
Enter
Sleep 800ms
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "show-block() { bash '$WORK_DIR/show-block.sh'; }"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Type "show-block"
Sleep 200ms
Show

Enter
Sleep 7s
TAPE
fi

# ─── Tape: Clip 4 — status ──────────────────────────────────────────────────

cat > "$WORK_DIR/04-status.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/04-status.mp4"

Hide
Type "cd '$ROOT'"
Enter
Sleep 200ms
Type "export HOME='$DEMO_HOME'"
Enter
Sleep 200ms
Type "rm -rf \$HOME/.claude/guide"
Enter
Sleep 200ms
Type "node bin/cli.mjs init > /dev/null 2>&1"
Enter
Sleep 800ms
Type "bash '$WORK_DIR/seed-status.sh'"
Enter
Sleep 1500ms
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "alias claude-guide='node bin/cli.mjs'"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Type "claude-guide status"
Sleep 200ms
Show

Enter
Sleep 5s
TAPE

# ─── Tape: Clip 5 — graduate ────────────────────────────────────────────────

cat > "$WORK_DIR/05-graduate.tape" <<TAPE
$SETTINGS
Output "$CLIPS_DIR/05-graduate.mp4"

Hide
Type "cd '$ROOT'"
Enter
Sleep 200ms
Type "export HOME='$DEMO_HOME'"
Enter
Sleep 200ms
Type "export PS1='\$ '"
Enter
Sleep 200ms
Type "alias claude-guide='node bin/cli.mjs'"
Enter
Sleep 200ms
Type "clear"
Enter
Sleep 300ms
Show

Type "claude-guide graduate"
Sleep 400ms
Enter
Sleep 5s
TAPE

# ─── Render ──────────────────────────────────────────────────────────────────

TAPES=("01-init" "02-explain" "03-block" "04-status" "05-graduate")
TOTAL=${#TAPES[@]}
PASSED=0

echo "Rendering $TOTAL clips..."
echo ""

for name in "${TAPES[@]}"; do
  echo "  [$((PASSED + 1))/$TOTAL] $name"
  if [ -f "$CLIPS_DIR/${name}.mp4" ] && [ -z "${FORCE:-}" ]; then
    echo "    SKIP (already exists; set FORCE=1 to re-render)"
    PASSED=$((PASSED + 1))
    echo ""
    continue
  fi
  if vhs "$WORK_DIR/${name}.tape" 2>&1 | tail -3; then
    PASSED=$((PASSED + 1))
    echo "    → clips/${name}.mp4"
  else
    echo "    FAILED"
  fi
  echo ""
done

echo "━━━ Done: $PASSED/$TOTAL clips rendered ━━━"
echo ""
ls -lh "$CLIPS_DIR"/*.mp4 2>/dev/null
