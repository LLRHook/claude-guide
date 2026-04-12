/**
 * Journal module tests — date formatting, preview building, grouping, rendering.
 *
 * All functions tested here are pure (take data in, return strings/arrays out)
 * except appendEntry/readEntries which are tested via the hook subprocess tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatTime,
  buildPreview,
  groupBySessions,
  renderJournal,
  renderStats,
} from "../lib/journal.mjs";

// ─── Date / Time Formatting ────────────────────────────────────────────────

describe("formatDate()", () => {
  it("formats a date as 'Month Day, Year'", () => {
    const result = formatDate("2026-04-12T14:30:00.000Z");
    // Note: exact output depends on timezone, but we can check the structure
    assert.match(result, /\w+ \d{1,2}, 2026/);
  });

  it("handles January correctly", () => {
    const result = formatDate("2026-01-01T00:00:00.000Z");
    // In UTC this is Jan 1, but in local timezone could be Dec 31
    assert.match(result, /\w+ \d{1,2}, 202[56]/);
  });
});

describe("formatTime()", () => {
  it("returns time in 12-hour format with AM/PM", () => {
    const result = formatTime("2026-04-12T14:30:00.000Z");
    // Exact time depends on timezone
    assert.match(result, /\d{1,2}:\d{2} (AM|PM)/);
  });

  it("formats midnight correctly", () => {
    const result = formatTime("2026-04-12T00:00:00.000Z");
    assert.match(result, /\d{1,2}:\d{2} (AM|PM)/);
  });

  it("uses 12 instead of 0 for noon/midnight hour", () => {
    // At noon UTC
    const result = formatTime("2026-04-12T12:00:00.000Z");
    assert.match(result, /\d{1,2}:00 (AM|PM)/);
    // Should not contain "0:00"
    assert.ok(!result.startsWith("0:"), "Should not start with 0:");
  });
});

// ─── Preview Builder ────────────────────────────────────────────────────────

describe("buildPreview()", () => {
  it("extracts command for Bash tool", () => {
    assert.equal(buildPreview("Bash", { command: "git status" }), "git status");
  });

  it("truncates long commands to 200 chars", () => {
    const longCmd = "a".repeat(300);
    assert.equal(buildPreview("Bash", { command: longCmd }).length, 200);
  });

  it("extracts file_path for Read", () => {
    assert.equal(buildPreview("Read", { file_path: "/home/user/file.js" }), "/home/user/file.js");
  });

  it("extracts file_path for Edit", () => {
    assert.equal(buildPreview("Edit", { file_path: "/project/src/app.js" }), "/project/src/app.js");
  });

  it("extracts file_path for Write", () => {
    assert.equal(buildPreview("Write", { file_path: "/project/out.txt" }), "/project/out.txt");
  });

  it("returns '(search)' for Grep", () => {
    assert.equal(buildPreview("Grep", { pattern: "TODO" }), "(search)");
  });

  it("returns '(file search)' for Glob", () => {
    assert.equal(buildPreview("Glob", { pattern: "**/*.js" }), "(file search)");
  });

  it("returns '(agent task)' for Agent", () => {
    assert.equal(buildPreview("Agent", { prompt: "do something" }), "(agent task)");
  });

  it("returns empty string for unknown tools", () => {
    assert.equal(buildPreview("UnknownTool", { data: "stuff" }), "");
  });

  it("handles missing command field", () => {
    assert.equal(buildPreview("Bash", {}), "");
  });
});

// ─── Session Grouping ───────────────────────────────────────────────────────

describe("groupBySessions()", () => {
  const entries = [
    { ts: "2026-04-12T14:30:00Z", session: "s1", tool: "Bash", preview: "git status" },
    { ts: "2026-04-12T14:31:00Z", session: "s1", tool: "Read", preview: "/file.js" },
    { ts: "2026-04-11T10:00:00Z", session: "s2", tool: "Bash", preview: "npm test" },
    { ts: "2026-04-12T14:32:00Z", session: "s1", tool: "Edit", preview: "/file.js" },
  ];

  it("groups entries by session ID", () => {
    const sessions = groupBySessions(entries);
    assert.equal(sessions.length, 2);
  });

  it("sorts sessions newest first", () => {
    const sessions = groupBySessions(entries);
    assert.equal(sessions[0].sessionId, "s1");
    assert.equal(sessions[1].sessionId, "s2");
  });

  it("sorts entries within a session by timestamp", () => {
    const sessions = groupBySessions(entries);
    const s1 = sessions.find(s => s.sessionId === "s1");
    assert.equal(s1.entries.length, 3);
    assert.equal(s1.entries[0].tool, "Bash");
    assert.equal(s1.entries[1].tool, "Read");
    assert.equal(s1.entries[2].tool, "Edit");
  });

  it("returns empty array for empty input", () => {
    const sessions = groupBySessions([]);
    assert.equal(sessions.length, 0);
  });
});

// ─── Journal Renderer ───────────────────────────────────────────────────────

describe("renderJournal()", () => {
  const sessions = [
    {
      sessionId: "s1",
      date: "2026-04-12T14:30:00Z",
      entries: [
        { ts: "2026-04-12T14:30:00Z", session: "s1", tool: "Bash", preview: "git status" },
        { ts: "2026-04-12T14:31:00Z", session: "s1", tool: "Read", preview: "/file.js" },
      ],
    },
    {
      sessionId: "s2",
      date: "2026-04-11T10:00:00Z",
      entries: [
        { ts: "2026-04-11T10:00:00Z", session: "s2", tool: "Bash", preview: "npm test" },
      ],
    },
    {
      sessionId: "s3",
      date: "2026-04-10T09:00:00Z",
      entries: [
        { ts: "2026-04-10T09:00:00Z", session: "s3", tool: "Grep", preview: "(search)" },
      ],
    },
    {
      sessionId: "s4",
      date: "2026-04-09T08:00:00Z",
      entries: [
        { ts: "2026-04-09T08:00:00Z", session: "s4", tool: "Write", preview: "/new.js" },
      ],
    },
  ];

  it("renders with default limit of 3 sessions", () => {
    const output = renderJournal(sessions);
    assert.ok(output.includes("Activity Journal"));
    // Should include first 3 sessions but not 4th
    assert.ok(output.includes("s1") || output.includes("2 tool call"));
    // Count "Session:" occurrences
    const sessionCount = (output.match(/Session:/g) || []).length;
    assert.equal(sessionCount, 3);
  });

  it("respects custom limit", () => {
    const output = renderJournal(sessions, { limit: 1 });
    const sessionCount = (output.match(/Session:/g) || []).length;
    assert.equal(sessionCount, 1);
  });

  it("filters by tool name", () => {
    const output = renderJournal(sessions, { limit: Infinity, tool: "Grep" });
    const sessionCount = (output.match(/Session:/g) || []).length;
    assert.equal(sessionCount, 1);
    assert.ok(output.includes("(search)"));
  });

  it("returns 'no activity' message for empty sessions", () => {
    const output = renderJournal([]);
    assert.ok(output.includes("No activity"));
  });

  it("correctly pluralizes tool calls", () => {
    const output = renderJournal(sessions, { limit: Infinity });
    assert.ok(output.includes("2 tool calls")); // s1 has 2
    assert.ok(output.includes("1 tool call"));  // s2 has 1 (no "s")
  });
});

// ─── Stats Renderer ─────────────────────────────────────────────────────────

describe("renderStats()", () => {
  const entries = [
    { ts: "2026-04-12T14:30:00Z", session: "s1", tool: "Bash", preview: "git status" },
    { ts: "2026-04-12T14:31:00Z", session: "s1", tool: "Bash", preview: "npm test" },
    { ts: "2026-04-12T14:32:00Z", session: "s1", tool: "Read", preview: "/file.js" },
    { ts: "2026-04-12T14:33:00Z", session: "s1", tool: "Bash", preview: "git status" },
    { ts: "2026-04-11T10:00:00Z", session: "s2", tool: "Edit", preview: "/app.js" },
  ];

  it("shows total tool calls", () => {
    const output = renderStats(entries);
    assert.ok(output.includes("5"), "Should show total of 5");
  });

  it("shows session count", () => {
    const output = renderStats(entries);
    assert.ok(output.includes("2 session"), "Should show 2 sessions");
  });

  it("shows tool usage breakdown", () => {
    const output = renderStats(entries);
    assert.ok(output.includes("Bash"), "Should show Bash");
    assert.ok(output.includes("Read"), "Should show Read");
    assert.ok(output.includes("Edit"), "Should show Edit");
  });

  it("shows most common Bash commands", () => {
    const output = renderStats(entries);
    assert.ok(output.includes("git status"), "Should show git status as common command");
  });

  it("returns 'no activity' for empty entries", () => {
    const output = renderStats([]);
    assert.ok(output.includes("No activity"));
  });

  it("uses bar chart with block characters", () => {
    const output = renderStats(entries);
    assert.ok(output.includes("\u2588"), "Should contain filled bar chars");
  });
});
