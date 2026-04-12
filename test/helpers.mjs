/**
 * Shared test helpers — temp dir management and subprocess runners.
 *
 * Every test that touches the filesystem creates a temp HOME so we never
 * pollute the real ~/.claude/guide/ directory.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const PROJECT_ROOT = join(import.meta.dirname, "..");

// ─── Temp HOME factory ─────────────────────────────────────────────────────

export function createTempHome() {
  const tempHome = mkdtempSync(join(tmpdir(), "cg-test-"));
  const claudeDir = join(tempHome, ".claude");
  const guideDir = join(claudeDir, "guide");
  mkdirSync(guideDir, { recursive: true });
  return { tempHome, claudeDir, guideDir };
}

export function writeTempProfile(guideDir, profile) {
  writeFileSync(join(guideDir, "profile.json"), JSON.stringify(profile, null, 2));
}

export function readTempProfile(guideDir) {
  return JSON.parse(readFileSync(join(guideDir, "profile.json"), "utf8"));
}

export function writeTempJournal(guideDir, entries) {
  const lines = entries.map(e => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
  writeFileSync(join(guideDir, "journal.jsonl"), lines);
}

export function readTempJournal(guideDir) {
  const raw = readFileSync(join(guideDir, "journal.jsonl"), "utf8");
  return raw.split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
}

export function cleanupTempHome(tempHome) {
  try {
    rmSync(tempHome, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ─── Default test profile ───────────────────────────────────────────────────

export function makeTestProfile(overrides = {}) {
  return {
    version: 1,
    installed_at: "2026-04-01T00:00:00.000Z",
    level: "beginner",
    tools: {
      Bash:  { seen: 0, graduated: false, threshold: 15 },
      Read:  { seen: 0, graduated: false, threshold: 5  },
      Edit:  { seen: 0, graduated: false, threshold: 10 },
      Write: { seen: 0, graduated: false, threshold: 8  },
      Grep:  { seen: 0, graduated: false, threshold: 8  },
      Glob:  { seen: 0, graduated: false, threshold: 5  },
      Agent: { seen: 0, graduated: false, threshold: 12 },
    },
    guardrails: {
      block_destructive_bash: true,
      block_force_push: true,
      block_system_file_writes: true,
      warn_on_large_edits: true,
      explain_errors: true,
      explain_permissions: true,
    },
    sessions: 0,
    total_tool_calls: 0,
    last_session: null,
    ...overrides,
  };
}

// ─── Hook / CLI subprocess runner ───────────────────────────────────────────

/**
 * Run a hook script as a subprocess with optional stdin and a fake HOME.
 * Returns { exitCode, stdout, stderr }.
 */
export function runHook(hookRelativePath, stdinInput, tempHome) {
  const hookPath = join(PROJECT_ROOT, hookRelativePath);
  const result = spawnSync("node", [hookPath], {
    input: typeof stdinInput === "string" ? stdinInput : JSON.stringify(stdinInput),
    env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 10000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Run a CLI command as a subprocess with a fake HOME.
 * Returns { exitCode, stdout, stderr }.
 */
export function runCLI(args, tempHome, stdinInput) {
  const cliPath = join(PROJECT_ROOT, "bin", "cli.mjs");
  const opts = {
    env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome },
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 10000,
  };
  if (stdinInput !== undefined) {
    opts.input = stdinInput;
  }
  const result = spawnSync("node", [cliPath, ...args], opts);
  return {
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}
