# Recording Guide — claude-guide Demo Clips

Record 5 short clips of **real Claude Code sessions**. Each clip captures one
product moment. You will stitch them together with `make-demo.sh` afterward.

---

## Terminal setup (do this once before recording)

1. **Terminal app**: Use your normal terminal (Terminal.app, iTerm2, Ghostty, Warp).
2. **Font**: Menlo, 18pt. Avoid artificial character spacing/tracking.
3. **Theme**: Use a dark theme. Claude Code's own dark theme works well.
4. **Window size**: Resize to roughly **1320 x 860 px** (or 120 columns x 35 rows).
   You can verify with: `printf '%sx%s\n' "$(tput cols)" "$(tput lines)"`
5. **Clean the prompt**: Remove clutter. A simple `$` or short prompt is best.
6. **Reduce flicker**: `export CLAUDE_CODE_NO_FLICKER=1`
7. **Hide desktop clutter**: Close other apps, hide the Dock, hide the menu bar.
8. **Notifications off**: Turn on Do Not Disturb / Focus mode.

### How to record

**Simplest** (macOS built-in):
  Press `Cmd+Shift+5` → "Record Selected Portion" → draw over terminal → Record.
  Stop with the menu bar stop button. File saves to Desktop.

**Better** (OBS Studio — free):
  Add a Window Capture source → pick your terminal window.
  Output settings: MP4, CRF 18-22, 30fps.
  Start/stop with hotkey.

**Best** (Screen Studio):
  Record your terminal window. It auto-adds cursor smoothing, zoom, and background.
  Export the raw clip. The pipeline will handle the social compositing.

Name each clip exactly as listed below, and drop it in `demo/pipeline/clips/`.

---

## Clip 1: `01-init.mov` — Install (target: 5-6 seconds)

**What to capture**: Running `claude-guide init` and seeing the success output.

```
Steps:
1. Start recording
2. Type: claude-guide init
3. Press Enter
4. Wait for the success output to fully render (~2 seconds)
5. Pause 2 seconds so the viewer can read it
6. Stop recording
```

**What the viewer should see**: The install command runs, hooks and overlay are
installed, profile is created. It just works.

---

## Clip 2: `02-explain.mov` — Plain English explanations (target: 8-10 seconds)

**What to capture**: Claude Code explaining an action in plain English before
doing it. This is the core value proposition.

```
Steps:
1. Make sure claude-guide is initialized (run init first if needed)
2. Open a Claude Code session in a real project:  claude
3. Ask Claude something that triggers a Read or Bash tool call.
   Good prompts:
     "What does this project do?"
     "Show me the test results"
     "What files are in this project?"
4. Wait for Claude to produce the explanation block:
     > What I'm about to do: ...
     > In everyday terms: ...
     > What you'll see next: ...
5. Start recording BEFORE you send the prompt, or trim afterward
6. Capture the explanation block fully rendered
7. Pause 3 seconds so the viewer can read the explanation
8. Stop recording
```

**What the viewer should see**: Claude talks differently. It explains in plain
English what it is about to do, using an analogy a non-programmer would
understand. This is the single most important clip.

**Tip**: If the session is slow, you can speed this clip up to 1.5x in the
manifest (`"speed": 1.5`) — the pipeline handles it automatically.

---

## Clip 3: `03-block.mov` — Dangerous command blocked (target: 6-7 seconds)

**What to capture**: Claude trying to run a dangerous command and getting
blocked by the guardrail.

```
Steps:
1. In a Claude Code session, ask Claude to do something that triggers
   a dangerous command. Good prompts:
     "Delete everything in this directory recursively"
     "Force push to main"
     "Hard reset this repo"
2. Wait for Claude to attempt the command
3. The PreToolUse hook will block it and show the HOLD ON message
4. Capture the block message fully rendered
5. Pause 3 seconds
6. Stop recording
```

**What the viewer should see**: Claude tries something dangerous, and the
guard rail catches it with a clear explanation of what was about to happen,
an analogy, and a suggestion for what to do instead.

**Alternative (faster, no Claude needed)**:
You can trigger the block directly from your terminal:
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | \
  node hooks/pre-tool.mjs 2>&1
```
Record this if you want a faster capture, but the real Claude session is
more authentic.

---

## Clip 4: `04-status.mov` — Progress tracking (target: 5-6 seconds)

**What to capture**: Running `claude-guide status` and seeing progress bars.

```
Steps:
1. IMPORTANT: Use Claude Code for a few tool calls first, so the bars
   are not all empty. Run a real session or simulate some calls:
     echo '{"tool_name":"Read","tool_input":{"file_path":"README.md"},"session_id":"demo"}' | node hooks/post-tool.mjs
     echo '{"tool_name":"Bash","tool_input":{"command":"ls"},"session_id":"demo"}' | node hooks/post-tool.mjs
     echo '{"tool_name":"Read","tool_input":{"file_path":"index.js"},"session_id":"demo"}' | node hooks/post-tool.mjs
     echo '{"tool_name":"Bash","tool_input":{"command":"npm test"},"session_id":"demo"}' | node hooks/post-tool.mjs
     echo '{"tool_name":"Edit","tool_input":{"file_path":"app.js"},"session_id":"demo"}' | node hooks/post-tool.mjs
   (Run these from the project root.)
2. Start recording
3. Type: claude-guide status
4. Press Enter
5. Partially filled progress bars appear — this looks real and interesting
6. Pause 3 seconds
7. Stop recording
```

**What the viewer should see**: Progress bars showing partial completion.
"Read 3/5", "Bash 2/15", etc. This communicates that the product tracks
learning over time.

---

## Clip 5: `05-graduate.mov` — Graduation (target: 6-7 seconds)

**What to capture**: Running `claude-guide graduate` and seeing the result.

```
Steps:
1. Start recording
2. Type: claude-guide graduate
3. Press Enter
4. The graduation message appears — all tools graduated, level set
   to intermediate, explanations off, safety checks remain
5. Pause 3 seconds
6. Stop recording
```

**What the viewer should see**: The user has learned enough. The training
wheels come off. But the permanent safety checks stay active.

---

## After recording

1. Name the files exactly: `01-init.mov`, `02-explain.mov`, `03-block.mov`,
   `04-status.mov`, `05-graduate.mov`
2. Drop them in `demo/pipeline/clips/`
3. Run:
   ```bash
   cd "path/to/claude-guide"
   bash demo/pipeline/make-demo.sh
   ```
4. The canonical Twitter-ready video is:
   `demo/pipeline/output/claude-guide-demo.mp4`

For a more polished Screen Studio pass, see `demo/SCREEN_STUDIO.md`.

## Automated recording mode

If you are already logged into Claude Code on this machine, you can let the
repo generate the clips for you:

```bash
bash demo/pipeline/record-clips.sh claude
```

What this does:
- Uses the real `claude` CLI for the `explain` and `block` clips
- Injects `claude-guide` hooks and teaching instructions for that session only
- Temporarily creates a demo `~/.claude/guide/` profile during capture, then restores your original state
- Falls back to scripted helper clips if Claude auth is unavailable
- Shows literal `claude ...` commands on screen so the demo looks like a real CLI workflow, not a hidden helper script

The automated block clip uses `npm install -g pnpm` instead of `rm -rf`.
That is intentional: Claude reliably attempts the global install, which lets
the beginner guard rail block it on-screen. `rm -rf` is often refused by
Claude before it reaches the hook, which makes for a worse demo.

The current automated prompts are intentionally short:
- `claude Read README.md and explain this project in one sentence.`
- `claude Run npm install -g pnpm`

Short prompts keep the terminal readable while still triggering the right
Claude behavior for the demo.

## File format notes

- `.mov` or `.mp4` both work — ffmpeg handles either
- Record at native resolution (Retina is fine, the pipeline scales down)
- 30fps preferred, 60fps works too
- No need to add backgrounds, captions, or music — the pipeline does all of that

## Re-recording a single clip

If one clip came out bad, just re-record that one clip and re-run
`make-demo.sh`. The pipeline re-stitches everything.
