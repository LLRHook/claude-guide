#!/usr/bin/env node

import { install } from "../lib/installer.mjs";
import { uninstall } from "../lib/uninstaller.mjs";
import { readProfile, writeProfile, defaultProfile, graduateTool, setLevel } from "../lib/profile.mjs";
import { readEntries, groupBySessions, renderJournal, renderStats, formatDate } from "../lib/journal.mjs";
import { PROFILE_PATH, GRADUATION_PATH } from "../lib/paths.mjs";
import { existsSync, rmSync } from "fs";

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case "init":      runInit(); break;
  case "status":    runStatus(); break;
  case "journal":   runJournal(args); break;
  case "graduate":  runGraduate(); break;
  case "reset":     runReset(); break;
  case "uninstall": await runUninstall(); break;
  default:          printHelp(); break;
}

// ─── Commands ────────────────────────────────────────────────────────────────

function runInit() {
  try {
    install();
  } catch (err) {
    console.error(`Failed to install claude-guide: ${err.message}`);
    process.exit(1);
  }
}

function runStatus() {
  const profile = readProfile();
  if (!profile) {
    console.log("claude-guide is not installed. Run `claude-guide init` first.");
    return;
  }

  const entries = readEntries();
  const sessionSet = new Set(entries.map(e => e.session));
  const sessionCount = sessionSet.size;

  // Tools sorted by threshold ascending, then alphabetically for ties
  const TOOL_ORDER = ["Read", "Glob", "Write", "Grep", "Edit", "Agent", "Bash"];

  const BAR_WIDTH = 20;

  const lines = ["Claude Guide — Your Progress", ""];

  lines.push(`Level: ${capitalize(profile.level)}`);
  lines.push("");

  for (const toolName of TOOL_ORDER) {
    const tool = profile.tools?.[toolName];
    if (!tool) continue;

    const { seen, graduated, threshold } = tool;
    const namePadded = toolName.padEnd(6);

    let bar;
    let countLabel;
    let suffix = "";

    if (graduated) {
      bar = "█".repeat(BAR_WIDTH);
      countLabel = `${threshold}/${threshold}`;
      suffix = "  Graduated ✓";
    } else {
      const filled = Math.round((Math.min(seen, threshold) / threshold) * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      bar = "█".repeat(filled) + "░".repeat(empty);
      countLabel = `${seen}/${threshold}`;
    }

    lines.push(`  ${namePadded} ${bar}  ${countLabel}${suffix}`);
  }

  lines.push("");
  lines.push(`  Total: ${profile.total_tool_calls} tool call${profile.total_tool_calls !== 1 ? "s" : ""} across ${sessionCount} session${sessionCount !== 1 ? "s" : ""}`);

  if (profile.installed_at) {
    lines.push(`  Started: ${formatDate(profile.installed_at)}`);
  }

  console.log(lines.join("\n"));
}

function runJournal(args) {
  let limit = 3;
  let today = false;
  let tool = null;
  let stats = false;

  if (args.includes("--all")) limit = Infinity;
  if (args.includes("--today")) today = true;
  if (args.includes("--stats")) stats = true;

  const toolIndex = args.indexOf("--tool");
  if (toolIndex !== -1 && args[toolIndex + 1]) {
    tool = args[toolIndex + 1];
  }

  const entries = readEntries();

  if (entries.length === 0) {
    console.log("No activity recorded yet.");
    return;
  }

  if (stats) {
    console.log(renderStats(entries));
    return;
  }

  const sessions = groupBySessions(entries);
  console.log(renderJournal(sessions, { limit, today, tool }));
}

function runGraduate() {
  const profile = readProfile();
  if (!profile) {
    console.log("claude-guide is not installed. Run `claude-guide init` first.");
    return;
  }

  for (const toolName of Object.keys(profile.tools)) {
    graduateTool(profile, toolName);
  }
  setLevel(profile, "intermediate");
  writeProfile(profile);

  if (existsSync(GRADUATION_PATH)) {
    rmSync(GRADUATION_PATH, { force: true });
  }

  console.log(`All tools graduated. Level set to intermediate.

What changed:
  - Explanations are now off for all tools
  - Beginner-only guard rails have been removed
  - Permanent safety checks remain active

Say "explain everything again" to Claude at any time to restart.`);
}

function runReset() {
  const profile = readProfile();
  if (!profile) {
    console.log("claude-guide is not installed. Run `claude-guide init` first.");
    return;
  }

  for (const toolName of Object.keys(profile.tools)) {
    profile.tools[toolName].seen = 0;
    profile.tools[toolName].graduated = false;
  }

  profile.level = "beginner";
  profile.sessions = 0;
  profile.total_tool_calls = 0;
  profile.last_session = null;

  writeProfile(profile);

  if (existsSync(GRADUATION_PATH)) {
    rmSync(GRADUATION_PATH, { force: true });
  }

  console.log("Profile reset to beginner. Your journal history is preserved.");
}

async function runUninstall() {
  try {
    await uninstall();
  } catch (err) {
    console.error(`Failed to uninstall claude-guide: ${err.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`claude-guide — Training wheels for Claude Code

Usage: claude-guide <command>

Commands:
  init        Install claude-guide (hooks, overlay, profile)
  status      Show your learning progress
  journal     Show your activity history
  graduate    Skip ahead — graduate all tools immediately
  reset       Reset progress to beginner (keeps journal)
  uninstall   Remove claude-guide completely

Journal options:
  --all       Show all sessions
  --today     Show today only
  --tool <n>  Filter to one tool (Bash, Read, Edit, etc.)
  --stats     Show summary statistics`);
}

