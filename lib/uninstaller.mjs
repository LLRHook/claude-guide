import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import readline from "readline";
import {
  GUIDE_DIR,
  JOURNAL_PATH,
  SETTINGS_PATH,
  CLAUDE_MD_PATH,
  BACKUP_SETTINGS,
  BACKUP_CLAUDE_MD,
} from "./paths.mjs";

function removeHooksFromSettings() {
  if (!existsSync(SETTINGS_PATH)) {
    return;
  }

  let settings;
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return;
  }

  if (!settings.hooks) {
    return;
  }

  if (Array.isArray(settings.hooks.PreToolUse)) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
      (e) => e._source !== "claude-guide"
    );
    if (settings.hooks.PreToolUse.length === 0) {
      delete settings.hooks.PreToolUse;
    }
  }

  if (Array.isArray(settings.hooks.PostToolUse)) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (e) => e._source !== "claude-guide"
    );
    if (settings.hooks.PostToolUse.length === 0) {
      delete settings.hooks.PostToolUse;
    }
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function removeOverlayFromClaudeMd() {
  if (!existsSync(CLAUDE_MD_PATH)) {
    return;
  }

  let content = readFileSync(CLAUDE_MD_PATH, "utf8");
  content = content.replace(
    /\n*<!-- CLAUDE-GUIDE:START -->[\s\S]*?<!-- CLAUDE-GUIDE:END -->\n*/,
    ""
  );
  writeFileSync(CLAUDE_MD_PATH, content);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function offerRestoreBackups() {
  if (existsSync(BACKUP_SETTINGS)) {
    const answer = await prompt(
      "Would you like to restore your original settings? (y/n) "
    );
    if (answer === "y" || answer === "Y") {
      copyFileSync(BACKUP_SETTINGS, SETTINGS_PATH);
    }
  }

  if (existsSync(BACKUP_CLAUDE_MD)) {
    const answer = await prompt(
      "Would you like to restore your original CLAUDE.md? (y/n) "
    );
    if (answer === "y" || answer === "Y") {
      copyFileSync(BACKUP_CLAUDE_MD, CLAUDE_MD_PATH);
    }
  }
}

async function offerKeepJournal() {
  const answer = await prompt(
    "Would you like to keep your learning journal? (y/n) "
  );

  if (answer === "y" || answer === "Y") {
    // Delete everything in GUIDE_DIR except journal.jsonl
    if (existsSync(GUIDE_DIR)) {
      const entries = readdirSync(GUIDE_DIR);
      for (const entry of entries) {
        if (entry === "journal.jsonl") {
          continue;
        }
        const fullPath = join(GUIDE_DIR, entry);
        rmSync(fullPath, { recursive: true, force: true });
      }
    }
  } else {
    rmSync(GUIDE_DIR, { recursive: true, force: true });
  }
}

function printGoodbye() {
  console.log(
    "claude-guide has been removed. Claude Code is back to normal."
  );
}

export async function uninstall() {
  removeHooksFromSettings();
  removeOverlayFromClaudeMd();
  await offerRestoreBackups();
  await offerKeepJournal();
  printGoodbye();
}
