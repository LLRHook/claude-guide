import { readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { dirname } from "path";
import { PROFILE_PATH } from "./paths.mjs";

export function defaultProfile() {
  return {
    version: 1,
    installed_at: new Date().toISOString(),
    level: "beginner",
    tools: {
      Bash:  { seen: 0, graduated: false, threshold: 15 },
      Read:  { seen: 0, graduated: false, threshold: 5  },
      Edit:  { seen: 0, graduated: false, threshold: 10 },
      Write: { seen: 0, graduated: false, threshold: 8  },
      Grep:  { seen: 0, graduated: false, threshold: 8  },
      Glob:  { seen: 0, graduated: false, threshold: 5  },
      Agent: { seen: 0, graduated: false, threshold: 12 }
    },
    guardrails: {
      block_destructive_bash: true,
      block_force_push: true,
      block_system_file_writes: true,
      warn_on_large_edits: true,
      explain_errors: true,
      explain_permissions: true
    },
    sessions: 0,
    total_tool_calls: 0,
    last_session: null
  };
}

export function readProfile() {
  try {
    const data = readFileSync(PROFILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

export function writeProfile(profile) {
  const tmp = PROFILE_PATH + ".tmp";
  mkdirSync(dirname(PROFILE_PATH), { recursive: true });
  writeFileSync(tmp, JSON.stringify(profile, null, 2) + "\n");
  renameSync(tmp, PROFILE_PATH);
}

export function incrementTool(profile, toolName) {
  if (profile.tools && profile.tools[toolName]) {
    profile.tools[toolName].seen += 1;
    profile.total_tool_calls += 1;
  }
  return profile;
}

export function isGraduationReady(profile, toolName) {
  const tool = profile?.tools?.[toolName];
  if (!tool) return false;
  return tool.seen >= tool.threshold && !tool.graduated;
}

export function graduateTool(profile, toolName) {
  if (profile.tools?.[toolName]) {
    profile.tools[toolName].graduated = true;
  }
  return profile;
}

export function checkFullGraduation(profile) {
  if (!profile.tools) return false;
  return Object.values(profile.tools).every(t => t.graduated);
}

export function setLevel(profile, level) {
  profile.level = level;
  return profile;
}
