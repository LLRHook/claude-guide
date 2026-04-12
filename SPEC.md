# claude-guide — Full Technical Specification

> Training wheels for Claude Code. Always-on explanations and guard rails for non-developer users. Bolted on by default — the user earns their way out.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [Target User](#target-user)
3. [Distribution](#distribution)
4. [Package Structure](#package-structure)
5. [Installation Flow](#installation-flow)
6. [Cross-Platform Path Resolution](#cross-platform-path-resolution)
7. [Settings.json Merge Strategy](#settingsjson-merge-strategy)
8. [The Learning Profile](#the-learning-profile)
9. [The Journal System](#the-journal-system)
10. [PreToolUse Hook — Guard Rails](#pretooluse-hook--guard-rails)
11. [PostToolUse Hook — Telemetry & Graduation](#posttooluse-hook--telemetry--graduation)
12. [Guard Rail Definitions](#guard-rail-definitions)
13. [CLAUDE.md Educational Overlay](#claudemd-educational-overlay)
14. [Graduation System](#graduation-system)
15. [CLI Commands](#cli-commands)
16. [Uninstallation](#uninstallation)
17. [Constraints & Non-Goals](#constraints--non-goals)
18. [Future Considerations](#future-considerations)

---

## Philosophy

Three pillars:

1. **Always-on explanations** — Claude explains every action in plain English. No opt-in required. The user doesn't need to know what a "skill" or "hook" is.
2. **Active guard rails** — Dangerous operations are blocked with plain-English reasons, not just warned about.
3. **Earned graduation** — Explanations turn off per-tool only when exposure thresholds are met AND the user explicitly says they understand. The act of learning to turn off explanations IS the test.

This is individual use only. No team features. No mentor mode. One person, one profile, one learning journey.

---

## Target User

People who:
- Have Claude Code installed (or are about to)
- Have never used a CLI-based AI coding tool
- Don't know what "grep" or "bash" means
- Want to learn by watching, not by reading docs
- Need protection from destructive operations they can't evaluate

This is NOT for:
- Developers learning Claude Code's advanced features
- Teams standardizing workflows
- People who already know what a terminal is

Scope: **Claude Code only.** We teach what Claude Code is doing, not what computers are.

---

## Distribution

### Install

```bash
# macOS
npm install -g claude-guide
claude-guide init

# Windows (PowerShell or cmd)
npm install -g claude-guide
claude-guide init
```

### Platform Support

| Platform | Support Level |
|----------|--------------|
| macOS    | Primary — fully tested |
| Windows  | Primary — fully tested (native, not WSL) |
| Linux    | Incidental — works if it works, not a priority |

### Why npm

- Claude Code requires Node.js, so `node` and `npm` are guaranteed to exist
- npm auto-generates `.cmd` wrappers on Windows — no platform-specific binary needed
- `require.resolve()` gives us the absolute path to hook scripts regardless of OS
- Single `package.json` handles both platforms

---

## Package Structure

```
claude-guide/
├── package.json                         # name: "claude-guide", bin: "claude-guide"
├── bin/
│   └── cli.mjs                          # CLI entry point: init, status, journal, graduate, reset, uninstall
├── hooks/
│   ├── pre-tool.mjs                     # PreToolUse — guard rails + dangerous pattern blocking
│   └── post-tool.mjs                    # PostToolUse — journal logging + graduation tracking
├── lib/
│   ├── paths.mjs                        # Cross-platform path resolution (os.homedir())
│   ├── profile.mjs                      # Read/write/update learning profile
│   ├── journal.mjs                      # Journal read/write/query/render
│   ├── guardrails.mjs                   # Dangerous pattern definitions + matching
│   ├── installer.mjs                    # Backup, merge settings, append CLAUDE.md, create profile
│   └── uninstaller.mjs                  # Remove hooks, overlay, restore backups
├── data/
│   ├── claude-md-overlay.md             # Educational instructions appended to CLAUDE.md
│   └── dangerous-patterns.json          # Blocked command patterns (always + beginner-only)
└── README.md                            # User-facing docs (plain English)
```

**Zero bash scripts. Zero PowerShell scripts.** Every executable file is Node.js (`.mjs`). Every hook is invoked as `node <absolute-path>`.

---

## Installation Flow

`claude-guide init` performs these steps in order:

```
1. Verify Claude Code is installed
   → Check for ~/.claude/ directory existence
   → If missing: print "Install Claude Code first: https://claude.ai/download" and exit

2. Create ~/.claude/guide/ namespace
   → mkdir -p ~/.claude/guide/
   → This is OUR directory. We own everything inside it.

3. Back up existing config
   → Copy ~/.claude/settings.json → ~/.claude/guide/backup.settings.json
   → Copy ~/.claude/CLAUDE.md → ~/.claude/guide/backup.CLAUDE.md
   → If either doesn't exist, skip (first-time Claude Code user)

4. Write fresh learning profile
   → Write ~/.claude/guide/profile.json (see Learning Profile section)

5. Initialize empty journal
   → Create ~/.claude/guide/journal.jsonl (empty file)

6. Resolve hook paths
   → Use require.resolve("claude-guide/hooks/pre-tool.mjs")
   → Use require.resolve("claude-guide/hooks/post-tool.mjs")
   → These return absolute OS-native paths

7. Merge hooks into settings.json
   → Read existing settings.json (or create empty {})
   → Add PreToolUse and PostToolUse entries (see Merge Strategy)
   → Write back with JSON formatting preserved

8. Append educational overlay to CLAUDE.md
   → Read existing CLAUDE.md (or create empty)
   → Append contents of data/claude-md-overlay.md
   → Delimited with markers so we can find and remove it later

9. Print welcome message
   → Plain English, no jargon
   → Tell them to just start using Claude Code normally
   → No further action required from the user
```

### Welcome Message

```
✅ claude-guide is installed!

From now on, Claude will explain everything it does in plain
English before it does it. You don't need to change anything —
just use Claude Code like normal.

As you get comfortable with different actions, Claude will
offer to stop explaining them. You're in control.

To see your progress:  claude-guide status
To see your history:   claude-guide journal
To remove everything:  claude-guide uninstall
```

---

## Cross-Platform Path Resolution

`lib/paths.mjs`:

```js
import { homedir } from "os";
import { join } from "path";

// Mac:     /Users/jane/.claude/guide/
// Windows: C:\Users\jane\.claude\guide\

export const CLAUDE_DIR       = join(homedir(), ".claude");
export const GUIDE_DIR        = join(CLAUDE_DIR, "guide");
export const PROFILE_PATH     = join(GUIDE_DIR, "profile.json");
export const JOURNAL_PATH     = join(GUIDE_DIR, "journal.jsonl");
export const GRADUATION_PATH  = join(GUIDE_DIR, "ready-to-graduate.txt");
export const SETTINGS_PATH    = join(CLAUDE_DIR, "settings.json");
export const CLAUDE_MD_PATH   = join(CLAUDE_DIR, "CLAUDE.md");
export const BACKUP_SETTINGS  = join(GUIDE_DIR, "backup.settings.json");
export const BACKUP_CLAUDE_MD = join(GUIDE_DIR, "backup.CLAUDE.md");
```

Rules:
- NEVER use `$HOME` or `%USERPROFILE%` — always `os.homedir()`
- NEVER hardcode `/` or `\` — always `path.join()`
- NEVER use `process.env.HOME` — undefined on Windows

---

## Settings.json Merge Strategy

### What Gets Added

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node <RESOLVED_ABSOLUTE_PATH>/hooks/pre-tool.mjs"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node <RESOLVED_ABSOLUTE_PATH>/hooks/post-tool.mjs"
          }
        ]
      }
    ]
  }
}
```

### Merge Rules

- Empty string matcher `""` = matches ALL tools. Our hooks handle per-tool logic internally.
- If `hooks.PreToolUse` already exists as an array, APPEND our entry. Never replace.
- If `hooks.PostToolUse` already exists as an array, APPEND our entry. Never replace.
- If no `hooks` key exists, create the full structure.
- Preserve all other keys in settings.json untouched.
- Tag our entries with a comment-like field for identification during uninstall:

```json
{
  "matcher": "",
  "_source": "claude-guide",
  "hooks": [{ "type": "command", "command": "node ..." }]
}
```

---

## The Learning Profile

`~/.claude/guide/profile.json`:

```json
{
  "version": 1,
  "installed_at": "2026-04-12T00:00:00.000Z",
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
  "guardrails": {
    "block_destructive_bash": true,
    "block_force_push": true,
    "block_system_file_writes": true,
    "warn_on_large_edits": true,
    "explain_errors": true,
    "explain_permissions": true
  },
  "sessions": 0,
  "total_tool_calls": 0,
  "last_session": null
}
```

### Threshold Rationale

| Tool  | Threshold | Why |
|-------|-----------|-----|
| Read  | 5  | Simple concept — "looking at a file." Grasped quickly. |
| Glob  | 5  | Simple concept — "finding files by name." |
| Write | 8  | Slightly more complex — "creating/overwriting a file." |
| Grep  | 8  | Search is intuitive but the variety of patterns takes time. |
| Edit  | 10 | Find-and-replace in files. Needs more exposure to variations. |
| Agent | 12 | Delegation is abstract. Needs time to see it in action. |
| Bash  | 15 | Highest variety — commands range from `ls` to `docker compose`. |

### Level Progression

| Level | Meaning |
|-------|---------|
| `beginner` | All explanations active, all guard rails active |
| `intermediate` | All tools graduated, beginner-only guard rails removed, permanent guard rails remain |

---

## The Journal System

### Storage

`~/.claude/guide/journal.jsonl` — one JSON object per line, append-only.

### Entry Format

```json
{
  "ts": "2026-04-12T14:30:22.000Z",
  "session": "abc-123",
  "tool": "Bash",
  "preview": "git status"
}
```

| Field | Description |
|-------|-------------|
| `ts` | ISO 8601 timestamp of the tool call |
| `session` | Claude Code session ID (groups tool calls by conversation) |
| `tool` | Tool name: Bash, Read, Edit, Write, Grep, Glob, Agent |
| `preview` | First 200 chars of context — command for Bash, file path for Read/Edit/Write, empty for others |

### What Gets Logged

Every tool call that passes through PostToolUse. This includes both allowed and graduated tools. The journal is a complete record.

### What Doesn't Get Logged

- Blocked tool calls (they never reach PostToolUse)
- The full tool output/result (hooks don't receive it)
- Any user input or conversation content

### Journal Viewer (`claude-guide journal`)

```
📖 Your Claude Code Activity Journal

Session: April 12, 2026 (14 tool calls)
──────────────────────────────────────
 2:30 PM  Bash   → git status
 2:30 PM  Read   → /Users/jane/project/package.json
 2:31 PM  Grep   → (search)
 2:31 PM  Read   → /Users/jane/project/src/index.js
 2:32 PM  Edit   → /Users/jane/project/src/index.js
 2:32 PM  Bash   → npm test
 2:33 PM  Bash   → npm test
 2:33 PM  Edit   → /Users/jane/project/src/index.js
 2:34 PM  Bash   → npm test
 2:34 PM  Bash   → git add src/index.js
 2:35 PM  Bash   → git commit -m "fix: resolve login bug"
 2:35 PM  Read   → /Users/jane/project/README.md
 2:36 PM  Write  → /Users/jane/project/docs/setup.md
 2:36 PM  Bash   → git status

Session: April 11, 2026 (8 tool calls)
──────────────────────────────────────
 ...
```

### CLI Options

```
claude-guide journal              # Show last 3 sessions
claude-guide journal --all        # Show everything
claude-guide journal --today      # Show today only
claude-guide journal --tool Bash  # Filter to one tool type
claude-guide journal --stats      # Summary statistics
```

### Journal Stats Output

```
📊 Your Claude Code Stats

Total tool calls:  142 across 12 sessions
First session:     April 1, 2026
Last session:      April 12, 2026

Tool usage breakdown:
  Bash   ████████████████████ 58  (41%)
  Read   ██████████████░░░░░░ 34  (24%)
  Edit   ████████░░░░░░░░░░░░ 22  (15%)
  Grep   ████░░░░░░░░░░░░░░░░ 12  (8%)
  Write  ███░░░░░░░░░░░░░░░░░ 8   (6%)
  Glob   ██░░░░░░░░░░░░░░░░░░ 5   (4%)
  Agent  █░░░░░░░░░░░░░░░░░░░ 3   (2%)

Most common commands:
  git status          × 14
  npm test            × 9
  git add             × 7
  git commit          × 6
  npm install         × 4
```

---

## PreToolUse Hook — Guard Rails

`hooks/pre-tool.mjs`

### Input

Receives JSON on stdin:
```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /" },
  "cwd": "/Users/jane/project",
  "session_id": "abc-123"
}
```

### Logic Flow

```
1. Read stdin as JSON
2. Load profile from ~/.claude/guide/profile.json
   → If profile missing: exit 0 (allow everything — graceful degradation)
3. Check tool_name against guard rail rules:
   a. PERMANENT rules (always block, regardless of level)
   b. BEGINNER rules (block only when level === "beginner")
   c. FILE PATH rules (block writes to system directories)
4. If any rule matches:
   → Write plain-English block message to stderr
   → Exit 2 (blocks the tool call)
5. If no rules match:
   → Exit 0 (allow the tool call)
```

### Block Message Format

Every block message follows this structure:
```
🛑 HOLD ON — [one sentence summary]

What was about to happen:
  [2-3 sentences explaining what the command does, using analogies]

What you should do:
  [1-2 sentences suggesting a safe alternative or question to ask Claude]
```

No jargon. No error codes. No technical terms without explanation.

---

## PostToolUse Hook — Telemetry & Graduation

`hooks/post-tool.mjs`

### Input

Same JSON format as PreToolUse (tool_name, tool_input, cwd, session_id).

### Logic Flow

```
1. Read stdin as JSON
2. Load profile from ~/.claude/guide/profile.json
   → If profile missing: exit 0 (no-op)
3. Append entry to journal.jsonl
4. If tool is tracked AND not graduated:
   a. Increment seen counter
   b. Increment total_tool_calls
   c. Write updated profile
   d. If seen >= threshold: append tool name to ready-to-graduate.txt
5. Exit 0 (always — PostToolUse hooks must never block)
```

### Graduation File

`~/.claude/guide/ready-to-graduate.txt` is a simple newline-delimited list of tool names that have hit their threshold. Claude reads this file at session start (instructed by the CLAUDE.md overlay) and uses it to prompt the user about graduation.

This file may contain duplicates (tool name appended each time threshold is exceeded). Claude handles deduplication.

---

## Guard Rail Definitions

### Permanent Blocks (Never Removed)

| Pattern | Block Message Summary |
|---------|----------------------|
| `rm -rf` / `rm --force` with paths | "This would permanently delete files — like emptying the trash with no undo." |
| `git push --force` / `git push -f` | "This would overwrite other people's work on the server." |
| `git reset --hard` | "This would throw away all your unsaved changes — like closing every document without saving." |
| `dd if=... of=/dev/` | "This would overwrite your hard drive." |
| `mkfs.` | "This would erase and reformat a drive." |
| `> /dev/sda` or `> /dev/hd` | "This would overwrite your hard drive." |
| Fork bombs | "This command would crash your computer." |
| Writes to `/etc`, `/usr`, `/sys`, `/boot`, `/proc` (Mac) | "Claude is trying to change a system file." |
| Writes to `C:\Windows\`, `C:\Program Files` (Windows) | "Claude is trying to change a system file." |

### Beginner-Only Blocks (Removed at Intermediate)

| Pattern | Block Message Summary |
|---------|----------------------|
| `curl ... \| sh` / `curl ... \| bash` | "Claude is downloading and running code from the internet — like opening an email attachment from a stranger." |
| `chmod 777` / `chmod +x /` | "Claude is making files accessible to everyone on your computer." |
| `eval $(...)` | "Claude is building a command dynamically — ask what it's constructing." |
| `npm install -g` (global installs) | "Claude is installing something system-wide — ask if a local install works instead." |

### File Content Blocks (All Levels)

| Pattern | Behavior |
|---------|----------|
| File path contains `password`, `secret`, `token`, `credential`, `.env` | Warn via stderr (don't block) — "This file might contain passwords or secrets. Make sure Claude isn't about to share them." |

---

## CLAUDE.md Educational Overlay

Appended to `~/.claude/CLAUDE.md` between markers:

```
<!-- CLAUDE-GUIDE:START -->
... overlay content ...
<!-- CLAUDE-GUIDE:END -->
```

### Full Overlay Content

```markdown
# Claude Guide — Educational Mode (ACTIVE)

You are working with someone who is new to Claude Code.
Follow these rules EXACTLY. They override your default behavior.

## At Session Start

1. Read ~/.claude/guide/profile.json to load the user's learning state.
2. Read ~/.claude/guide/ready-to-graduate.txt if it exists.
3. Cache both in memory for the session.

## Before EVERY Tool Call

For any tool where the profile shows "graduated": false,
you MUST prefix your action with this block:

> **What I'm about to do**: [1 sentence — the action and why]
> **In everyday terms**: [1-2 sentences — analogy a non-programmer would understand]
> **What you'll see next**: [1 sentence — what the output looks like]

### Explanation Examples Per Tool

**Bash** (running a command):
> **What I'm about to do**: Run a command to check which files have changed.
> **In everyday terms**: I'm asking your computer to show me a list of
> everything that's been modified — like checking which documents you've
> edited since your last save point.
> **What you'll see next**: A list of file names with labels like
> "modified" or "new file."

**Read** (looking at a file):
> **What I'm about to do**: Open and read a file to understand its contents.
> **In everyday terms**: I'm opening a document to read what's inside it —
> just like double-clicking a file to view it.
> **What you'll see next**: The contents of the file with line numbers.

**Edit** (changing part of a file):
> **What I'm about to do**: Change a specific section of code in this file.
> **In everyday terms**: I found the exact paragraph that needs updating and
> I'm swapping out the old version for a new one — like using find-and-replace
> in a Word document.
> **What you'll see next**: The old text and the new text, so you can see
> exactly what changed.

**Write** (creating or overwriting a file):
> **What I'm about to do**: Create a new file (or completely replace an existing one).
> **In everyday terms**: I'm writing a brand new document from scratch.
> If a file with this name already exists, the old version will be replaced.
> **What you'll see next**: The full contents of the new file.

**Grep** (searching file contents):
> **What I'm about to do**: Search through your files for specific text.
> **In everyday terms**: I'm using a powerful search — like pressing Ctrl+F,
> but across every file in your project at once.
> **What you'll see next**: A list of files (and sometimes the matching lines)
> where I found what I was looking for.

**Glob** (finding files by name):
> **What I'm about to do**: Look for files that match a certain name pattern.
> **In everyday terms**: I'm browsing through your project's folders looking
> for files with a specific type or name — like searching for "all spreadsheets"
> in a folder.
> **What you'll see next**: A list of file paths that match.

**Agent** (delegating to a helper):
> **What I'm about to do**: Ask a specialized helper to handle part of this task.
> **In everyday terms**: I'm passing a subtask to an assistant — like asking
> a colleague to go research something while I keep working on the main task.
> They'll report back with what they found.
> **What you'll see next**: The helper's results when it finishes.

For tools where "graduated": true, SKIP the explanation entirely.
Do NOT say "I'm skipping the explanation" — just proceed normally,
as if the explanation block never existed.

## Graduation Prompts

If a tool appears in ready-to-graduate.txt AND is not already
graduated in the profile, then ONCE per session — after using
that tool — say:

> You've seen me use **[Tool Name]** quite a few times now.
> Want me to stop explaining it each time? Just say
> "I understand [Tool Name]" and I'll keep things moving faster.

Do not ask more than once per tool per session.
Do not ask about tools that are already graduated.

## When a User Graduates a Tool

When someone says any of the following (or similar intent):
- "I understand [tool]"
- "Stop explaining [tool]"
- "I get [tool]"
- "Turn off explanations for [tool]"
- "I know what [tool] does"

Then:
1. Read ~/.claude/guide/profile.json
2. Set that tool's "graduated" to true
3. Write the updated profile back
4. Confirm:

> Got it — no more explanations for **[Tool Name]**.
> Say "explain [Tool Name] again" anytime to bring them back.

## When a User Wants Explanations Back

When someone says "explain [tool] again" or "turn on [tool] explanations":
1. Read profile, set graduated to false, write back
2. Confirm: "Explanations for **[Tool Name]** are back on."

## When ALL Tools Are Graduated

When you notice all tools in the profile have graduated: true, say:

> Congratulations! You've graduated from all the training wheels.
> You're using Claude Code like a pro now.
>
> The safety checks for dangerous operations are still active —
> that's just smart practice for everyone, even experts.
>
> If you ever want explanations back, just say "explain everything again."

Then update the profile "level" to "intermediate".

## Error Handling

When ANY tool call fails or returns an error, ALWAYS explain:
1. What went wrong — in plain English, no error codes
2. Why it probably happened — likely cause
3. What you're going to try next — the recovery plan

NEVER say:
- "exit code 1" → say "That didn't work"
- "ENOENT" → say "The file doesn't exist yet"
- "EACCES" → say "You don't have permission to access that"
- "returned non-zero" → say "The command ran into a problem"
- "stack trace" → say "Here's what went wrong"
- "ETIMEDOUT" → say "It took too long and gave up"
- "ECONNREFUSED" → say "Couldn't connect to the server"

Always follow a failed command with what you'll try next.

## Permission Prompt Explanations

When Claude Code shows the user a permission/approval prompt, explain:

> I need your OK before I [specific action]. This is a safety
> feature — Claude Code always checks with you before [category
> of action]. Press Y to allow it, or N to skip it.

## Language Rules — STRICT

### Banned Words (Never Use Without Translation)

stdin, stdout, stderr, exit code, regex, regexp, glob pattern, pipe,
flag, argument, parameter, parse, compile, runtime, dependency,
binary, executable, daemon, process, socket, port, env var,
environment variable, boolean, integer, float, string (data type),
array, object (data type), null, undefined, NaN, async, sync,
callback, promise, middleware, endpoint, payload, serialization,
deserialization, marshalling, stack trace, heap, garbage collection,
mutex, semaphore, thread, fork, spawn, child process

### Required Translations

When you must reference a technical concept, ALWAYS pair it
with a plain-English equivalent. Examples:
- "a settings file (sometimes called a config file)"
- "the project's list of required packages (package.json)"
- "a search pattern that matches file names"
- "the project's home page file (index.html)"
- "a version control snapshot (a git commit)"

### File Type Explanations

When first mentioning a file type in a session, explain it:
- .js / .ts → "a code file (JavaScript/TypeScript)"
- .json → "a data file that stores settings or information"
- .md → "a text document with simple formatting"
- .env → "a file that stores private settings like passwords"
- .yml / .yaml → "a settings file written in a specific format"
- package.json → "your project's ID card — its name, version, and what it needs to run"
```

---

## Graduation System

### How It Works (End to End)

```
                                    PostToolUse Hook
                                    ┌─────────────┐
 User uses Claude Code normally ──► │ Logs to      │
                                    │ journal.jsonl│
                                    │              │
                                    │ Increments   │
                                    │ profile.json │
                                    │ tool counter │
                                    │              │
                                    │ If count >=  │
                                    │ threshold:   │
                                    │ append to    │
                                    │ ready-to-    │
                                    │ graduate.txt │
                                    └──────┬───────┘
                                           │
                              Next Session │
                                           ▼
                                    Claude reads
                                    ready-to-graduate.txt
                                    and profile.json
                                           │
                                           ▼
                                    After using that tool,
                                    Claude asks:
                                    "Want me to stop
                                     explaining [Tool]?"
                                           │
                              User says    │
                              "I understand │ [Tool]"
                                           ▼
                                    Claude updates
                                    profile.json:
                                    graduated = true
                                           │
                                           ▼
                                    Explanations for
                                    that tool stop.
```

### Timeline Example

```
Sessions 1-3:   Everything explained. User is learning.
                Claude says "I'm reading a file" before every Read.

Session 4:      Read hits threshold (5). ready-to-graduate.txt updated.
                Next session, Claude asks about Read.
                User: "yeah I get it" → Read explanations stop.

Sessions 5-8:   Glob graduates. Then Grep. User is getting faster.
                They start saying "stop explaining Edit" unprompted.

Sessions 9-15:  Bash and Agent graduate last (highest thresholds).
                User may explicitly ask to skip before threshold.

Session 15+:    All graduated. Claude announces full graduation.
                Profile level → "intermediate".
                Beginner-only guard rails removed.
                Permanent guard rails stay forever.
```

### Manual Override

Users can say "stop explaining everything" at any time.
Claude sets all tools to graduated and the level to intermediate.
This is the power-user escape hatch — but it requires the user
to know enough to ask for it, which is itself proof of readiness.

---

## CLI Commands

### `claude-guide init`

Installs everything. See Installation Flow section.

### `claude-guide status`

Shows learning progress.

```
Claude Guide — Your Progress

Level: Beginner

  Read   ████████████████████ 5/5   Graduated
  Glob   ████████░░░░░░░░░░░░ 4/5
  Grep   ██████░░░░░░░░░░░░░░ 3/8
  Write  ████░░░░░░░░░░░░░░░░ 2/8
  Edit   ██░░░░░░░░░░░░░░░░░░ 1/10
  Bash   ██████████░░░░░░░░░░ 7/15
  Agent  ░░░░░░░░░░░░░░░░░░░░ 0/12

  Total: 22 tool calls across 4 sessions
  Started: April 1, 2026
```

### `claude-guide journal`

Shows recent activity. See Journal System section for full options:
```
claude-guide journal              # Last 3 sessions
claude-guide journal --all        # Everything
claude-guide journal --today      # Today only
claude-guide journal --tool Bash  # Filter by tool
claude-guide journal --stats      # Summary statistics
```

### `claude-guide graduate`

Immediately graduates all tools and sets level to intermediate.
Prints confirmation and what changes (beginner guard rails removed,
explanations stop, permanent guard rails remain).

### `claude-guide reset`

Resets profile to beginner state. All counters to 0, all graduated
to false, level to beginner. Journal is preserved (it's your history).
Prints confirmation.

### `claude-guide uninstall`

Full removal. See Uninstallation section.

---

## Uninstallation

`claude-guide uninstall` performs:

```
1. Remove our hooks from settings.json
   → Find entries with "_source": "claude-guide" and remove them
   → If PreToolUse/PostToolUse arrays are now empty, remove the keys
   → Write back

2. Remove educational overlay from CLAUDE.md
   → Find content between <!-- CLAUDE-GUIDE:START --> and <!-- CLAUDE-GUIDE:END -->
   → Remove that section
   → Write back

3. Offer to restore backups
   → "Would you like to restore your original settings? (y/n)"
   → If yes: copy backup files back
   → If no: leave current (minus our additions)

4. Preserve or delete guide data
   → "Would you like to keep your learning journal? (y/n)"
   → If yes: leave ~/.claude/guide/ with just journal.jsonl
   → If no: rm -r ~/.claude/guide/

5. Print goodbye
   → "claude-guide has been removed. Claude Code is back to normal."
```

---

## Constraints & Non-Goals

### In Scope (v1)

- Cross-platform hooks (Node.js only, Windows + Mac)
- Per-tool explanation toggling via graduation system
- Plain-English guard rails for dangerous operations
- Activity journal with CLI viewer
- Progress tracking with visual status
- Clean install and uninstall
- Individual use only

### Out of Scope (v1)

- Team/mentor mode
- Web dashboard
- Custom threshold configuration (hardcoded for v1)
- Multi-language support (English only)
- Integration with other AI coding tools (Claude Code only)
- Custom explanation templates
- Explanation of Claude's internal thinking/reasoning blocks
- Analytics or usage reporting to any external service

### Hard Constraints

- Zero data leaves the machine — everything is local files
- Zero network calls from hooks — they are purely local
- Zero bash or PowerShell in hook scripts — Node.js only
- Zero additional dependencies beyond Node.js built-ins (fs, os, path)
- Hooks must execute fast (< 100ms) — no async operations, no network
- PostToolUse hooks must ALWAYS exit 0 — never block
- Guard rail block messages must be understandable by someone who has never programmed

---

## Future Considerations (Not v1)

These are ideas that surfaced during design but are deferred:

1. **Custom thresholds**: Let users adjust graduation thresholds via CLI
2. **Explanation verbosity levels**: "beginner" vs "intermediate" explanation depth
3. **Interactive tutorial mode**: A guided first-session walkthrough
4. **Cheat sheet generation**: Auto-generate a personalized reference card from the journal
5. **Session replay**: Re-read a past session's journal with explanations
6. **VS Code extension**: Visual overlay instead of text-based explanations
7. **Localization**: Explanations in languages other than English
8. **Community explanation packs**: User-contributed explanation templates
9. **Graduation certificates**: Fun printable certificates when fully graduated
