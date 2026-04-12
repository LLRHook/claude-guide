#!/usr/bin/env node
import { readFileSync, appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { GRADUATION_PATH } from "../lib/paths.mjs";
import { readProfile, writeProfile, isGraduationReady } from "../lib/profile.mjs";
import { appendEntry, buildPreview } from "../lib/journal.mjs";

try {
  // 1. Read stdin
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw);

  const { tool_name, tool_input, session_id } = input;

  // 2. Load profile — if missing, no-op
  const profile = readProfile();
  if (!profile) process.exit(0);

  // 3. Log to journal
  const preview = buildPreview(tool_name, tool_input || {});
  appendEntry({
    ts: new Date().toISOString(),
    session: session_id || "unknown",
    tool: tool_name,
    preview
  });

  // 4. Track tool calls and graduation progress
  if (profile.tools && profile.tools[tool_name]) {
    // Always count total calls, even for graduated tools
    profile.total_tool_calls = (profile.total_tool_calls || 0) + 1;
    if (session_id) profile.last_session = session_id;

    if (!profile.tools[tool_name].graduated) {
      profile.tools[tool_name].seen += 1;

      // If threshold reached, append to graduation file
      if (isGraduationReady(profile, tool_name)) {
        mkdirSync(dirname(GRADUATION_PATH), { recursive: true });
        appendFileSync(GRADUATION_PATH, tool_name + "\n");
      }
    }

    writeProfile(profile);
  }

  // 5. Always exit 0
  process.exit(0);
} catch {
  // PostToolUse must NEVER block — always exit 0
  process.exit(0);
}
