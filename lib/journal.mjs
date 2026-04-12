import { appendFileSync, readFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { JOURNAL_PATH } from "./paths.mjs";

// ─── Date / Time Helpers ────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function formatDate(isoString) {
  const d = new Date(isoString);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatTime(isoString) {
  const d = new Date(isoString);
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const mm = String(minutes).padStart(2, "0");
  return `${hours}:${mm} ${ampm}`;
}

// ─── Core I/O ───────────────────────────────────────────────────────────────

export function appendEntry(entry) {
  mkdirSync(dirname(JOURNAL_PATH), { recursive: true });
  appendFileSync(JOURNAL_PATH, JSON.stringify(entry) + "\n");
}

export function readEntries() {
  try {
    const raw = readFileSync(JOURNAL_PATH, "utf8");
    return raw
      .split("\n")
      .filter(line => line.trim() !== "")
      .reduce((acc, line) => {
        try {
          acc.push(JSON.parse(line));
        } catch {
          // skip corrupted lines
        }
        return acc;
      }, []);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    return [];
  }
}

// ─── Preview Builder ────────────────────────────────────────────────────────

export function buildPreview(toolName, toolInput) {
  switch (toolName) {
    case "Bash":
      return (toolInput.command || "").slice(0, 200);
    case "Read":
    case "Edit":
    case "Write":
      return (toolInput.file_path || "").slice(0, 200);
    case "Grep":
      return "(search)";
    case "Glob":
      return "(file search)";
    case "Agent":
      return "(agent task)";
    default:
      return "";
  }
}

// ─── Grouping ────────────────────────────────────────────────────────────────

export function groupBySessions(entries) {
  const map = new Map();

  for (const entry of entries) {
    const sid = entry.session;
    if (!map.has(sid)) {
      map.set(sid, []);
    }
    map.get(sid).push(entry);
  }

  const sessions = [];
  for (const [sessionId, sessionEntries] of map.entries()) {
    const sorted = [...sessionEntries].sort((a, b) =>
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0
    );
    sessions.push({
      sessionId,
      date: sorted[0].ts,
      entries: sorted
    });
  }

  // Sort sessions newest first
  sessions.sort((a, b) =>
    a.date > b.date ? -1 : a.date < b.date ? 1 : 0
  );

  return sessions;
}

// ─── Renderers ───────────────────────────────────────────────────────────────

export function renderJournal(sessions, options = {}) {
  const { limit = 3, today = false, tool = null } = options;

  let filtered = sessions;

  if (today) {
    const todayStr = new Date().toISOString().slice(0, 10);
    filtered = filtered.filter(s => s.date.slice(0, 10) === todayStr);
  }

  if (tool) {
    filtered = filtered
      .map(s => ({
        ...s,
        entries: s.entries.filter(e => e.tool === tool)
      }))
      .filter(s => s.entries.length > 0);
  }

  filtered = filtered.slice(0, limit);

  if (filtered.length === 0) {
    return "No activity recorded yet. Start using Claude Code and your activity will appear here.";
  }

  const lines = ["Your Claude Code Activity Journal", ""];

  for (const session of filtered) {
    const dateLabel = formatDate(session.date);
    const count = session.entries.length;
    lines.push(`Session: ${dateLabel} (${count} tool call${count !== 1 ? "s" : ""})`);
    lines.push("─".repeat(38));

    for (const entry of session.entries) {
      const time = formatTime(entry.ts);
      const toolPadded = (entry.tool || "").padEnd(6);
      const preview = entry.preview ? ` → ${entry.preview}` : "";
      lines.push(`  ${time}  ${toolPadded}${preview}`);
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderStats(entries) {
  if (entries.length === 0) {
    return "No activity recorded yet.";
  }

  // Count per tool
  const toolCounts = {};
  for (const entry of entries) {
    toolCounts[entry.tool] = (toolCounts[entry.tool] || 0) + 1;
  }

  const total = entries.length;

  // Unique sessions
  const sessionSet = new Set(entries.map(e => e.session));
  const sessionCount = sessionSet.size;

  // Date range
  const timestamps = entries.map(e => e.ts).sort();
  const firstDate = formatDate(timestamps[0]);
  const lastDate = formatDate(timestamps[timestamps.length - 1]);

  // Most common Bash commands (from preview field)
  const bashCounts = {};
  for (const entry of entries) {
    if (entry.tool === "Bash" && entry.preview) {
      const cmd = entry.preview.trim();
      if (cmd) {
        bashCounts[cmd] = (bashCounts[cmd] || 0) + 1;
      }
    }
  }
  const topBash = Object.entries(bashCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Sort tools by count descending
  const sortedTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sortedTools[0][1];
  const BAR_WIDTH = 20;

  const lines = [
    "Your Claude Code Stats",
    "",
    `Total tool calls:  ${total} across ${sessionCount} session${sessionCount !== 1 ? "s" : ""}`,
    `First session:     ${firstDate}`,
    `Last session:      ${lastDate}`,
    "",
    "Tool usage breakdown:"
  ];

  for (const [toolName, count] of sortedTools) {
    const filled = Math.round((count / maxCount) * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;
    const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
    const pct = Math.round((count / total) * 100);
    const namePadded = toolName.padEnd(6);
    lines.push(`  ${namePadded} ${bar} ${count}  (${pct}%)`);
  }

  if (topBash.length > 0) {
    lines.push("");
    lines.push("Most common commands:");
    for (const [cmd, count] of topBash) {
      lines.push(`  ${cmd.padEnd(20)} \u00d7 ${count}`);
    }
  }

  return lines.join("\n");
}
