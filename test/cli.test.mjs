/**
 * CLI integration tests — run bin/cli.mjs as a subprocess and verify output.
 *
 * Tests: status, journal, graduate, reset, help.
 * Skips: init (would touch real settings.json), uninstall (interactive prompts).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  createTempHome,
  writeTempProfile,
  writeTempJournal,
  readTempProfile,
  cleanupTempHome,
  makeTestProfile,
  runCLI,
} from "./helpers.mjs";

// ─── Help ───────────────────────────────────────────────────────────────────

describe("CLI: help", () => {
  it("prints help with no arguments", () => {
    const { tempHome } = createTempHome();
    const r = runCLI([], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("Training wheels"), "Should mention training wheels");
    assert.ok(r.stdout.includes("init"), "Should list init command");
    assert.ok(r.stdout.includes("status"), "Should list status command");
    assert.ok(r.stdout.includes("journal"), "Should list journal command");
    assert.ok(r.stdout.includes("uninstall"), "Should list uninstall command");
    cleanupTempHome(tempHome);
  });

  it("prints help for unknown commands", () => {
    const { tempHome } = createTempHome();
    const r = runCLI(["foobar"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("Usage:"));
    cleanupTempHome(tempHome);
  });
});

// ─── Status ─────────────────────────────────────────────────────────────────

describe("CLI: status", () => {
  it("shows 'not installed' when profile is missing", () => {
    const { tempHome } = createTempHome();
    const r = runCLI(["status"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("not installed"));
    cleanupTempHome(tempHome);
  });

  it("shows progress bars for each tool", () => {
    const { tempHome, guideDir } = createTempHome();
    const profile = makeTestProfile();
    profile.tools.Read.seen = 3;
    profile.tools.Bash.seen = 7;
    writeTempProfile(guideDir, profile);
    // Empty journal
    writeFileSync(join(guideDir, "journal.jsonl"), "");

    const r = runCLI(["status"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("Beginner"), "Should show level");
    assert.ok(r.stdout.includes("Read"), "Should list Read tool");
    assert.ok(r.stdout.includes("Bash"), "Should list Bash tool");
    assert.ok(r.stdout.includes("3/5"), "Should show Read progress");
    assert.ok(r.stdout.includes("7/15"), "Should show Bash progress");
    cleanupTempHome(tempHome);
  });

  it("shows 'Graduated' for graduated tools", () => {
    const { tempHome, guideDir } = createTempHome();
    const profile = makeTestProfile();
    profile.tools.Read.seen = 5;
    profile.tools.Read.graduated = true;
    writeTempProfile(guideDir, profile);
    writeFileSync(join(guideDir, "journal.jsonl"), "");

    const r = runCLI(["status"], tempHome);
    assert.ok(r.stdout.includes("Graduated"), "Should show Graduated label");
    cleanupTempHome(tempHome);
  });
});

// ─── Journal ────────────────────────────────────────────────────────────────

describe("CLI: journal", () => {
  it("shows 'No activity' when journal is empty", () => {
    const { tempHome, guideDir } = createTempHome();
    writeTempProfile(guideDir, makeTestProfile());
    writeFileSync(join(guideDir, "journal.jsonl"), "");

    const r = runCLI(["journal"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("No activity"));
    cleanupTempHome(tempHome);
  });

  it("displays journal entries", () => {
    const { tempHome, guideDir } = createTempHome();
    writeTempProfile(guideDir, makeTestProfile());
    writeTempJournal(guideDir, [
      { ts: "2026-04-12T14:30:00Z", session: "s1", tool: "Bash", preview: "git status" },
      { ts: "2026-04-12T14:31:00Z", session: "s1", tool: "Read", preview: "/file.js" },
    ]);

    const r = runCLI(["journal"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("git status"));
    assert.ok(r.stdout.includes("/file.js"));
    cleanupTempHome(tempHome);
  });

  it("supports --stats flag", () => {
    const { tempHome, guideDir } = createTempHome();
    writeTempProfile(guideDir, makeTestProfile());
    writeTempJournal(guideDir, [
      { ts: "2026-04-12T14:30:00Z", session: "s1", tool: "Bash", preview: "git status" },
      { ts: "2026-04-12T14:31:00Z", session: "s1", tool: "Bash", preview: "npm test" },
      { ts: "2026-04-12T14:32:00Z", session: "s1", tool: "Read", preview: "/file.js" },
    ]);

    const r = runCLI(["journal", "--stats"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("Stats"), "Should show stats header");
    assert.ok(r.stdout.includes("Bash"), "Should show Bash in breakdown");
    cleanupTempHome(tempHome);
  });

  it("supports --tool filter", () => {
    const { tempHome, guideDir } = createTempHome();
    writeTempProfile(guideDir, makeTestProfile());
    writeTempJournal(guideDir, [
      { ts: "2026-04-12T14:30:00Z", session: "s1", tool: "Bash", preview: "git status" },
      { ts: "2026-04-12T14:31:00Z", session: "s1", tool: "Read", preview: "/file.js" },
    ]);

    const r = runCLI(["journal", "--tool", "Read"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("/file.js"), "Should show Read entries");
    // Should not show Bash entries
    assert.ok(!r.stdout.includes("git status"), "Should not show Bash entries");
    cleanupTempHome(tempHome);
  });
});

// ─── Graduate ───────────────────────────────────────────────────────────────

describe("CLI: graduate", () => {
  it("shows 'not installed' when profile is missing", () => {
    const { tempHome } = createTempHome();
    const r = runCLI(["graduate"], tempHome);
    assert.ok(r.stdout.includes("not installed"));
    cleanupTempHome(tempHome);
  });

  it("graduates all tools and sets level to intermediate", () => {
    const { tempHome, guideDir } = createTempHome();
    writeTempProfile(guideDir, makeTestProfile());

    const r = runCLI(["graduate"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("graduated"), "Should confirm graduation");
    assert.ok(r.stdout.includes("intermediate"), "Should mention intermediate");

    const profile = readTempProfile(guideDir);
    assert.equal(profile.level, "intermediate");
    for (const tool of Object.values(profile.tools)) {
      assert.equal(tool.graduated, true, "All tools should be graduated");
    }
    cleanupTempHome(tempHome);
  });
});

// ─── Reset ──────────────────────────────────────────────────────────────────

describe("CLI: reset", () => {
  it("shows 'not installed' when profile is missing", () => {
    const { tempHome } = createTempHome();
    const r = runCLI(["reset"], tempHome);
    assert.ok(r.stdout.includes("not installed"));
    cleanupTempHome(tempHome);
  });

  it("resets all counters to 0 and level to beginner", () => {
    const { tempHome, guideDir } = createTempHome();
    const profile = makeTestProfile({ level: "intermediate" });
    profile.tools.Read.seen = 10;
    profile.tools.Read.graduated = true;
    profile.tools.Bash.seen = 20;
    profile.tools.Bash.graduated = true;
    profile.total_tool_calls = 30;
    writeTempProfile(guideDir, profile);

    const r = runCLI(["reset"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("reset"), "Should confirm reset");
    assert.ok(r.stdout.includes("beginner"), "Should mention beginner");

    const updated = readTempProfile(guideDir);
    assert.equal(updated.level, "beginner");
    assert.equal(updated.total_tool_calls, 0);
    for (const tool of Object.values(updated.tools)) {
      assert.equal(tool.seen, 0, "Seen count should be 0");
      assert.equal(tool.graduated, false, "Should not be graduated");
    }
    cleanupTempHome(tempHome);
  });

  it("preserves installed_at timestamp", () => {
    const { tempHome, guideDir } = createTempHome();
    const profile = makeTestProfile();
    profile.installed_at = "2026-01-01T00:00:00.000Z";
    writeTempProfile(guideDir, profile);

    runCLI(["reset"], tempHome);

    const updated = readTempProfile(guideDir);
    assert.equal(updated.installed_at, "2026-01-01T00:00:00.000Z",
      "installed_at should be preserved");
    cleanupTempHome(tempHome);
  });
});

// ─── Graduate → Reset round trip ────────────────────────────────────────────

describe("CLI: graduate then reset round trip", () => {
  it("graduates then resets cleanly", () => {
    const { tempHome, guideDir } = createTempHome();
    writeTempProfile(guideDir, makeTestProfile());

    // Graduate
    runCLI(["graduate"], tempHome);
    let profile = readTempProfile(guideDir);
    assert.equal(profile.level, "intermediate");

    // Reset
    runCLI(["reset"], tempHome);
    profile = readTempProfile(guideDir);
    assert.equal(profile.level, "beginner");
    assert.equal(profile.tools.Bash.graduated, false);
    assert.equal(profile.tools.Bash.seen, 0);

    cleanupTempHome(tempHome);
  });
});
