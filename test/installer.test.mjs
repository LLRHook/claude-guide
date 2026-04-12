/**
 * Installer & Uninstaller direct tests.
 *
 * These were previously untested. We run `claude-guide init` in a sandbox
 * HOME and verify every artifact it creates, then run the uninstaller's
 * non-interactive pieces and verify cleanup.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  createTempHome,
  cleanupTempHome,
  runCLI,
} from "./helpers.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// claude-guide init
// ═══════════════════════════════════════════════════════════════════════════

describe("Installer (claude-guide init)", () => {
  let tempHome, claudeDir, guideDir;

  before(() => {
    ({ tempHome, claudeDir, guideDir } = createTempHome());
    // createTempHome already makes .claude/guide/ — init checks for .claude/
  });

  after(() => cleanupTempHome(tempHome));

  it("exits 0 and prints welcome message", () => {
    const r = runCLI(["init"], tempHome);
    assert.equal(r.exitCode, 0, `init failed: ${r.stderr}`);
    assert.ok(r.stdout.includes("claude-guide is installed"), "Should print welcome");
  });

  it("creates profile.json", () => {
    const profilePath = join(guideDir, "profile.json");
    assert.ok(existsSync(profilePath), "profile.json should exist");
    const profile = JSON.parse(readFileSync(profilePath, "utf8"));
    assert.equal(profile.version, 1);
    assert.equal(profile.level, "beginner");
    assert.equal(profile.total_tool_calls, 0);
    assert.ok(profile.tools.Bash, "Should have Bash tool");
    assert.ok(profile.tools.Read, "Should have Read tool");
  });

  it("creates empty journal.jsonl", () => {
    const journalPath = join(guideDir, "journal.jsonl");
    assert.ok(existsSync(journalPath), "journal.jsonl should exist");
    const content = readFileSync(journalPath, "utf8");
    assert.equal(content, "", "Journal should be empty initially");
  });

  it("writes hooks into settings.json", () => {
    const settingsPath = join(claudeDir, "settings.json");
    assert.ok(existsSync(settingsPath), "settings.json should exist");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.ok(settings.hooks, "Should have hooks key");
    assert.ok(Array.isArray(settings.hooks.PreToolUse), "PreToolUse should be an array");
    assert.ok(Array.isArray(settings.hooks.PostToolUse), "PostToolUse should be an array");

    const preHook = settings.hooks.PreToolUse.find(e => e._source === "claude-guide");
    assert.ok(preHook, "Should have a claude-guide PreToolUse entry");
    assert.equal(preHook.matcher, "", "Matcher should be empty string (match all)");
    assert.ok(preHook.hooks[0].command.includes("pre-tool.mjs"), "Should reference pre-tool.mjs");

    const postHook = settings.hooks.PostToolUse.find(e => e._source === "claude-guide");
    assert.ok(postHook, "Should have a claude-guide PostToolUse entry");
    assert.ok(postHook.hooks[0].command.includes("post-tool.mjs"), "Should reference post-tool.mjs");
  });

  it("appends CLAUDE.md overlay with markers", () => {
    const claudeMdPath = join(claudeDir, "CLAUDE.md");
    assert.ok(existsSync(claudeMdPath), "CLAUDE.md should exist");
    const content = readFileSync(claudeMdPath, "utf8");
    assert.ok(content.includes("<!-- CLAUDE-GUIDE:START -->"), "Should have start marker");
    assert.ok(content.includes("<!-- CLAUDE-GUIDE:END -->"), "Should have end marker");
    assert.ok(content.includes("Educational Mode"), "Should contain overlay content");
  });

  it("is idempotent — running init twice doesn't duplicate hooks", () => {
    // Run init again
    const r = runCLI(["init"], tempHome);
    assert.equal(r.exitCode, 0);

    const settingsPath = join(claudeDir, "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const preGuide = settings.hooks.PreToolUse.filter(e => e._source === "claude-guide");
    const postGuide = settings.hooks.PostToolUse.filter(e => e._source === "claude-guide");
    assert.equal(preGuide.length, 1, "Should have exactly 1 PreToolUse entry");
    assert.equal(postGuide.length, 1, "Should have exactly 1 PostToolUse entry");
  });

  it("is idempotent — running init twice doesn't duplicate CLAUDE.md overlay", () => {
    const claudeMdPath = join(claudeDir, "CLAUDE.md");
    const content = readFileSync(claudeMdPath, "utf8");
    const startCount = (content.match(/<!-- CLAUDE-GUIDE:START -->/g) || []).length;
    assert.equal(startCount, 1, "Should have exactly 1 start marker");
  });

  it("preserves existing settings when merging", () => {
    // Create a fresh sandbox with pre-existing settings
    const { tempHome: t2, claudeDir: c2, guideDir: g2 } = createTempHome();
    const settingsPath = join(c2, "settings.json");
    writeFileSync(settingsPath, JSON.stringify({
      customSetting: true,
      hooks: {
        PreToolUse: [
          { matcher: "Bash", _source: "other-tool", hooks: [{ type: "command", command: "echo hi" }] }
        ]
      }
    }, null, 2));

    runCLI(["init"], t2);

    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.equal(settings.customSetting, true, "Should preserve custom settings");
    assert.equal(settings.hooks.PreToolUse.length, 2, "Should have 2 PreToolUse entries (existing + ours)");
    assert.ok(settings.hooks.PreToolUse.some(e => e._source === "other-tool"), "Should preserve other hooks");
    assert.ok(settings.hooks.PreToolUse.some(e => e._source === "claude-guide"), "Should add our hook");
    cleanupTempHome(t2);
  });

  it("backs up existing CLAUDE.md", () => {
    // Create fresh sandbox with pre-existing CLAUDE.md
    const { tempHome: t3, claudeDir: c3, guideDir: g3 } = createTempHome();
    const claudeMdPath = join(c3, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# My existing instructions\n");

    runCLI(["init"], t3);

    const backupPath = join(g3, "backup.CLAUDE.md");
    assert.ok(existsSync(backupPath), "Should create backup");
    assert.equal(readFileSync(backupPath, "utf8"), "# My existing instructions\n");

    // Original should now have both old content and overlay
    const content = readFileSync(claudeMdPath, "utf8");
    assert.ok(content.includes("My existing instructions"), "Should preserve original content");
    assert.ok(content.includes("CLAUDE-GUIDE:START"), "Should append overlay");
    cleanupTempHome(t3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Uninstaller — non-interactive parts
// (We can't test interactive prompts with spawnSync unless we pipe stdin)
// ═══════════════════════════════════════════════════════════════════════════

describe("Uninstaller (settings + overlay removal)", () => {

  it("removes claude-guide hooks from settings.json", () => {
    // Set up: init first
    const { tempHome, claudeDir, guideDir } = createTempHome();
    runCLI(["init"], tempHome);

    // Verify hooks exist
    const settingsPath = join(claudeDir, "settings.json");
    let settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.ok(settings.hooks.PreToolUse.some(e => e._source === "claude-guide"));

    // Uninstall (pipe "n\nn\n" to skip interactive prompts — keep nothing)
    const r = runCLI(["uninstall"], tempHome, "n\nn\n");
    assert.equal(r.exitCode, 0, `uninstall failed: ${r.stderr}`);

    // Verify hooks removed
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const hasGuide = settings.hooks?.PreToolUse?.some(e => e._source === "claude-guide");
    assert.ok(!hasGuide, "claude-guide hooks should be removed");
    cleanupTempHome(tempHome);
  });

  it("removes CLAUDE.md overlay while preserving other content", () => {
    const { tempHome, claudeDir } = createTempHome();
    const claudeMdPath = join(claudeDir, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# My stuff\n");

    runCLI(["init"], tempHome);
    // Verify overlay was added
    let content = readFileSync(claudeMdPath, "utf8");
    assert.ok(content.includes("CLAUDE-GUIDE:START"));

    // Uninstall
    runCLI(["uninstall"], tempHome, "n\nn\n");

    // Verify overlay removed, original content preserved
    content = readFileSync(claudeMdPath, "utf8");
    assert.ok(!content.includes("CLAUDE-GUIDE:START"), "Overlay should be removed");
    assert.ok(content.includes("My stuff"), "Original content should remain");
    cleanupTempHome(tempHome);
  });

  it("prints goodbye message", () => {
    const { tempHome } = createTempHome();
    runCLI(["init"], tempHome);
    const r = runCLI(["uninstall"], tempHome, "n\nn\n");
    assert.ok(r.stdout.includes("removed") || r.stdout.includes("back to normal"),
      "Should print goodbye");
    cleanupTempHome(tempHome);
  });
});
