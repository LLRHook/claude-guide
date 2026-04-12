# claude-guide

**Training wheels for [Claude Code](https://claude.ai/download).** Always-on explanations and guard rails for people who are new to AI-powered coding in the terminal.

claude-guide sits quietly between you and Claude Code. It makes Claude explain every action in plain English before doing it, blocks dangerous operations with clear reasons, and tracks your progress as you learn. Once you've seen a tool enough times, it offers to stop explaining — you graduate at your own pace.

```
npm install -g claude-guide
claude-guide init
```

That's it. Just use Claude Code normally after that.

---

## What it looks like

When claude-guide is active, Claude prefixes every action with a plain-English explanation:

> **What I'm about to do**: Run a command to check which files have changed.
> **In everyday terms**: I'm asking your computer to show me a list of everything that's been modified — like checking which documents you've edited since your last save point.
> **What you'll see next**: A list of file names with labels like "modified" or "new file."

When something dangerous is attempted, it gets blocked:

```
HOLD ON — this would permanently delete files

What was about to happen:
  The rm -rf command permanently deletes files and folders from
  your computer. Unlike moving files to the trash, there is no
  undo — they are gone immediately with no way to recover them.

What you should do:
  Ask Claude specifically which files need to be removed and why,
  then decide together.
```

---

## Who this is for

People who:

- Have Claude Code installed (or are about to)
- Have never used a CLI-based AI coding tool
- Don't know what "grep" or "bash" means
- Want to learn by watching, not by reading docs
- Need protection from destructive operations they can't evaluate

This is **not** for developers learning Claude Code's advanced features. If you already know what a terminal is, you probably don't need this.

---

## How it works

claude-guide installs two [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) into Claude Code:

- **PreToolUse** — checks every action against guard rail patterns before it runs. Dangerous operations are blocked with a plain-English explanation.
- **PostToolUse** — logs every action to a local journal and tracks how many times you've seen each tool. When a tool hits its threshold, it becomes eligible for graduation.

It also appends an educational overlay to your `~/.claude/CLAUDE.md` that instructs Claude to explain actions, translate jargon, and guide you through the graduation process.

Everything is local. Zero network calls. Zero external dependencies. Just Node.js built-ins.

---

## Graduation

Each tool has a threshold — the number of times you need to see it before claude-guide considers it learned:

| Tool | Threshold | What it does |
|------|-----------|-------------|
| Read | 5 | Looking at a file |
| Glob | 5 | Finding files by name |
| Write | 8 | Creating or overwriting a file |
| Grep | 8 | Searching through file contents |
| Edit | 10 | Changing part of a file |
| Agent | 12 | Delegating a subtask to a helper |
| Bash | 15 | Running a terminal command |

Once a threshold is met, Claude asks:

> You've seen me use **Bash** quite a few times now. Want me to stop explaining it each time? Just say "I understand Bash" and I'll keep things moving faster.

You confirm, and explanations for that tool stop. All other tools keep explaining until they hit their own thresholds.

When all tools are graduated, your level moves from **beginner** to **intermediate**. Beginner-only guard rails are removed. Permanent safety checks stay forever.

---

## Commands

```
claude-guide init          Install hooks, overlay, and profile
claude-guide status        Show your learning progress
claude-guide journal       Browse activity history (last 3 sessions)
claude-guide graduate      Graduate all tools immediately
claude-guide reset         Reset progress to beginner (keeps journal)
claude-guide uninstall     Remove everything cleanly
```

### Status

```
Claude Guide — Your Progress

Level: Beginner

  Read   ████████████████████  5/5   Graduated
  Glob   ████████░░░░░░░░░░░░  4/5
  Grep   ██████░░░░░░░░░░░░░░  3/8
  Write  ████░░░░░░░░░░░░░░░░  2/8
  Edit   ██░░░░░░░░░░░░░░░░░░  1/10
  Bash   ██████████░░░░░░░░░░  7/15
  Agent  ░░░░░░░░░░░░░░░░░░░░  0/12

  Total: 22 tool calls across 4 sessions
  Started: April 1, 2026
```

### Journal

```
claude-guide journal              # Last 3 sessions
claude-guide journal --all        # Everything
claude-guide journal --today      # Today only
claude-guide journal --tool Bash  # Filter to one tool
claude-guide journal --stats      # Summary statistics
```

---

## Guard rails

### Always active (even after graduation)

| Blocked command | Why |
|----------------|-----|
| `rm -rf` | Permanently deletes files with no undo |
| `git push --force` | Overwrites shared version history |
| `git reset --hard` | Throws away all unsaved changes |
| `dd of=/dev/...` | Overwrites a hard drive |
| `mkfs.*` | Erases and reformats a drive |
| Writes to `/etc`, `/usr`, `/sys`, `C:\Windows\` | Modifies core system files |

### Beginner only (removed at intermediate)

| Blocked command | Why |
|----------------|-----|
| `curl ... \| bash` | Downloads and runs unknown code |
| `chmod 777` | Makes files accessible to everyone |
| `eval $(...)` | Dynamically constructs commands |
| `npm install -g` | Installs packages system-wide |

Sensitive file paths (containing `password`, `secret`, `token`, `.env`) trigger a warning but are not blocked.

---

## Privacy

Everything stays on your computer. claude-guide writes to `~/.claude/guide/` and nowhere else:

- `profile.json` — your learning state and tool counters
- `journal.jsonl` — append-only log of tool calls (tool name, timestamp, brief preview)
- `ready-to-graduate.txt` — tools that have hit their threshold

No data is sent to any server. No analytics. No telemetry. No network calls of any kind. Your journal and profile are plain text files you can read, edit, or delete at any time.

---

## Requirements

- **Node.js 18+** (Claude Code requires Node.js, so you already have it)
- **Claude Code** installed at `~/.claude/`
- **macOS** or **Windows** (Linux works but isn't the primary target)

Zero npm dependencies. The package uses only Node.js built-ins (`fs`, `os`, `path`, `readline`, `url`).

---

## Uninstall

```
claude-guide uninstall
```

This removes hooks from `settings.json`, strips the educational overlay from `CLAUDE.md`, and offers to restore your original config from the backup taken during installation. You can choose to keep your journal or delete everything.

---

## How it's built

```
claude-guide/
├── bin/cli.mjs              CLI entry point
├── hooks/
│   ├── pre-tool.mjs         Guard rails (blocks dangerous ops)
│   └── post-tool.mjs        Journal logging + graduation tracking
├── lib/
│   ├── paths.mjs            Cross-platform path constants
│   ├── profile.mjs          Learning profile read/write
│   ├── journal.mjs          Activity log + rendering
│   ├── guardrails.mjs       Pattern matching engine
│   ├── installer.mjs        Init flow
│   └── uninstaller.mjs      Clean removal
└── data/
    ├── claude-md-overlay.md  Educational instructions for Claude
    └── dangerous-patterns.json  Guard rail definitions
```

All files are ESM (`.mjs`). No bash scripts, no PowerShell scripts. Hooks execute synchronously in under 100ms. The PostToolUse hook never blocks — it always exits 0, even on errors.

---

## License

MIT
