import { homedir } from "os";
import { join } from "path";

export const CLAUDE_DIR       = join(homedir(), ".claude");
export const GUIDE_DIR        = join(CLAUDE_DIR, "guide");
export const PROFILE_PATH     = join(GUIDE_DIR, "profile.json");
export const JOURNAL_PATH     = join(GUIDE_DIR, "journal.jsonl");
export const GRADUATION_PATH  = join(GUIDE_DIR, "ready-to-graduate.txt");
export const SETTINGS_PATH    = join(CLAUDE_DIR, "settings.json");
export const CLAUDE_MD_PATH   = join(CLAUDE_DIR, "CLAUDE.md");
export const BACKUP_SETTINGS  = join(GUIDE_DIR, "backup.settings.json");
export const BACKUP_CLAUDE_MD = join(GUIDE_DIR, "backup.CLAUDE.md");
