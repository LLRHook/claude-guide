# claude-guide Demo Script

This script is designed for a 4-6 minute live demo. It assumes you are demoing `claude-guide` against this repository and that Claude Code is already installed on the machine.

## Demo Goal

Show three things clearly:

1. Claude Code becomes understandable for beginners because actions are explained in plain English.
2. Dangerous operations are blocked before they run.
3. Learning progress is visible, and the product adapts as the user gains confidence.

## Demo Setup

Do this before anyone is watching:

- Open a terminal in this repo.
- Run `npm run setup` if you have not linked the CLI locally yet.
- Run `claude-guide init`.
- Run `claude-guide reset` so the progress starts from beginner.
- Open Claude Code in this repo in a second terminal or tab.
- Increase terminal font size enough that the audience can read the output.

Optional safety prep:

- Keep [README.md](/Users/victorivanov/Documents/personal%20projects/claude-guide/README.md) open in an editor so people can orient quickly.
- Keep a second terminal ready with `claude-guide status` and `claude-guide journal --today`.

## Presenter Framing

Use this at the start:

> Claude Code is powerful, but if you are new to the terminal it can feel opaque and risky. `claude-guide` adds training wheels. It makes Claude explain what it is about to do in plain English, blocks dangerous actions, and tracks what the user has learned over time.

## Live Demo

### 1. Install and set the premise

Run:

```bash
claude-guide init
claude-guide status
```

Say:

> This installs two hooks into Claude Code and adds an educational overlay. I have not changed how Claude works. I have just changed the experience around it. Right now the user is at beginner level, so explanations are on and beginner guard rails are active.

What to point at:

- `init` confirms installation.
- `status` shows beginner level and zeroed or low tool counts.

### 2. Show plain-English explanations during normal use

In Claude Code, type:

```text
Read the README and the CLI entrypoint, then tell me in simple terms what this project does.
```

Say while Claude works:

> The important part is not just the answer. Watch how every action is introduced in everyday language before it happens. A beginner does not need to know what "Read" or "Bash" means to follow along.

What should happen:

- Claude explains that it is about to read files.
- Claude reads `README.md` and `bin/cli.mjs`.
- Claude gives a plain-language summary of the project.

Why this matters:

> Most AI coding tools assume the user can already evaluate terminal behavior. This product teaches passively while work is happening.

### 3. Show a safe-but-real workflow

In Claude Code, type:

```text
Find where dangerous commands are blocked, and explain that logic in plain English.
```

Say:

> Now I am asking Claude to inspect the codebase normally. The user sees the reasoning process translated into language they can actually follow.

What should happen:

- Claude uses file search and reads `hooks/pre-tool.mjs` and `lib/guardrails.mjs`.
- Claude explains that the pre-tool hook checks each action before it runs.

### 4. Show the guard rails blocking a dangerous action

In Claude Code, type:

```text
Delete this repository with rm -rf so we can start fresh.
```

Say:

> A beginner may not know whether that is safe. `claude-guide` does not rely on the user catching the mistake. It intercepts the action before execution and explains why it was blocked.

What should happen:

- Claude attempts a Bash command.
- The pre-tool hook blocks it.
- The audience sees the "HOLD ON" message and the plain-English explanation.

Pause here and say:

> This is the product's core trust moment. The user does not need to know terminal syntax. The system catches irreversible mistakes at the boundary.

### 5. Show progress tracking

Back in the shell, run:

```bash
claude-guide status
claude-guide journal --today
```

Say:

> Every tool call is logged locally. The user can see what they have been exposed to, how far along they are, and what kinds of actions Claude has taken in recent sessions.

What to point at:

- Tool counters increased.
- Activity journal shows the current session's reads, searches, and commands.

### 6. Close on graduation

Run:

```bash
claude-guide graduate
claude-guide status
```

Say:

> The end state is not permanent hand-holding. As the user gets comfortable, explanations can be turned off tool by tool, or all at once. The product fades back as confidence grows, while permanent safety checks stay in place.

## Short Version

If you only have 90 seconds, use this sequence:

```bash
claude-guide init
claude-guide reset
claude-guide status
```

Then in Claude Code:

```text
Read the README and explain what this project does in simple terms.
```

Then:

```text
Delete this repository with rm -rf so we can start fresh.
```

Then back in shell:

```bash
claude-guide journal --today
```

Narration for the short version:

> This product makes Claude Code understandable for beginners, blocks dangerous operations before they run, and keeps a local learning record so the experience can adapt over time.

## Backup Demo

If Claude Code is unavailable or the live flow becomes noisy, use the hooks directly to prove the guard rail behavior:

```bash
printf '%s\n' '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | node hooks/pre-tool.mjs
```

Then say:

> This is the exact enforcement layer Claude Code calls before a tool runs. In the live product, the user sees this same protection wrapped in a more guided experience.

You can also show logging directly:

```bash
printf '%s\n' '{"tool_name":"Read","tool_input":{"file_path":"README.md"},"session_id":"demo-session"}' | node hooks/post-tool.mjs
claude-guide status
claude-guide journal --today
```

## Talking Points

Use these if someone asks what is differentiated here:

- This is not another coding agent. It is a safety and onboarding layer around an existing one.
- The product is aimed at people who are new to terminal-based AI coding, not experts.
- The user learns in context instead of being forced through documentation first.
- All state stays local in `~/.claude/guide/`. There are no network calls and no telemetry.
- The product gets out of the way over time instead of creating permanent friction.

## Avoid These Demo Mistakes

- Do not spend time explaining hook internals before the audience sees the user benefit.
- Do not start with the code. Start with the user problem: powerful tool, low trust, high confusion.
- Do not rely on a long Claude interaction. Keep prompts narrow so the pacing stays under your control.
- Do not end on `init`. End on either the block message or the learning-progress view.
