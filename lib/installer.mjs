import {
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
} from "fs";
import { fileURLToPath } from "url";
import {
  CLAUDE_DIR,
  GUIDE_DIR,
  PROFILE_PATH,
  JOURNAL_PATH,
  SETTINGS_PATH,
  CLAUDE_MD_PATH,
  BACKUP_SETTINGS,
  BACKUP_CLAUDE_MD,
} from "./paths.mjs";
import { defaultProfile, writeProfile } from "./profile.mjs";

function verifyClaudeInstalled() {
  if (!existsSync(CLAUDE_DIR)) {
    console.log("Install Claude Code first: https://claude.ai/download");
    process.exit(1);
  }
}

function createGuideDir() {
  mkdirSync(GUIDE_DIR, { recursive: true });
}

function backupExistingConfig() {
  if (existsSync(SETTINGS_PATH) && !existsSync(BACKUP_SETTINGS)) {
    copyFileSync(SETTINGS_PATH, BACKUP_SETTINGS);
  }
  if (existsSync(CLAUDE_MD_PATH) && !existsSync(BACKUP_CLAUDE_MD)) {
    copyFileSync(CLAUDE_MD_PATH, BACKUP_CLAUDE_MD);
  }
}

function writeInitialProfile() {
  if (!existsSync(PROFILE_PATH)) {
    writeProfile(defaultProfile());
  }
}

function initJournal() {
  if (!existsSync(JOURNAL_PATH)) {
    writeFileSync(JOURNAL_PATH, "");
  }
}

function resolveHookPaths() {
  const prePath = fileURLToPath(
    new URL("../hooks/pre-tool.mjs", import.meta.url)
  );
  const postPath = fileURLToPath(
    new URL("../hooks/post-tool.mjs", import.meta.url)
  );
  return { prePath, postPath };
}

function mergeSettings(prePath, postPath) {
  let settings = {};
  if (existsSync(SETTINGS_PATH)) {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    try {
      settings = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Could not parse your existing settings.json: ${err.message}\n` +
        `Fix the file manually (or delete it) and re-run: claude-guide init`
      );
    }
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const buildEntry = (hookPath) => ({
    matcher: "",
    _source: "claude-guide",
    hooks: [{ type: "command", command: `node "${hookPath}"` }],
  });

  // PreToolUse
  if (!Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse = [];
  }
  const alreadyHasPre = settings.hooks.PreToolUse.some(
    (e) => e._source === "claude-guide"
  );
  if (!alreadyHasPre) {
    settings.hooks.PreToolUse.push(buildEntry(prePath));
  }

  // PostToolUse
  if (!Array.isArray(settings.hooks.PostToolUse)) {
    settings.hooks.PostToolUse = [];
  }
  const alreadyHasPost = settings.hooks.PostToolUse.some(
    (e) => e._source === "claude-guide"
  );
  if (!alreadyHasPost) {
    settings.hooks.PostToolUse.push(buildEntry(postPath));
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function appendClaudeMdOverlay() {
  let existing = "";
  if (existsSync(CLAUDE_MD_PATH)) {
    existing = readFileSync(CLAUDE_MD_PATH, "utf8");
  }

  if (existing.includes("<!-- CLAUDE-GUIDE:START -->")) {
    return;
  }

  const overlayPath = fileURLToPath(
    new URL("../data/claude-md-overlay.md", import.meta.url)
  );
  const overlayContent = readFileSync(overlayPath, "utf8");

  const appended =
    existing +
    "\n\n<!-- CLAUDE-GUIDE:START -->\n" +
    overlayContent +
    "\n<!-- CLAUDE-GUIDE:END -->\n";

  writeFileSync(CLAUDE_MD_PATH, appended);
}

function printWelcome() {
  console.log(`\u2705 claude-guide is installed!

From now on, Claude will explain everything it does in plain
English before it does it. You don't need to change anything —
just use Claude Code like normal.

As you get comfortable with different actions, Claude will
offer to stop explaining them. You're in control.

To see your progress:  claude-guide status
To see your history:   claude-guide journal
To remove everything:  claude-guide uninstall`);
}

export function install() {
  verifyClaudeInstalled();
  createGuideDir();
  backupExistingConfig();
  writeInitialProfile();
  initJournal();
  const { prePath, postPath } = resolveHookPaths();
  mergeSettings(prePath, postPath);
  appendClaudeMdOverlay();
  printWelcome();
}
