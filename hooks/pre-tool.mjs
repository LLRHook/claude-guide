#!/usr/bin/env node
import { readFileSync } from "fs";
import { readProfile } from "../lib/profile.mjs";
import { checkGuardrails } from "../lib/guardrails.mjs";

try {
  // 1. Read stdin synchronously
  const raw = readFileSync(0, "utf8");
  const input = JSON.parse(raw);

  const { tool_name, tool_input } = input;

  // 2. Load profile — if missing, allow everything
  const profile = readProfile();
  if (!profile) process.exit(0);

  // 3. Check guard rails
  const result = checkGuardrails(tool_name, tool_input, profile);

  // 4. If warning (not a block), write to stderr, allow
  if (result.warning) {
    process.stderr.write(result.warning + "\n");
  }

  // 5. If blocked, write block message to stderr, exit 2
  if (result.blocked) {
    process.stderr.write(result.message + "\n");
    process.exit(2);
  }

  // 6. Allow
  process.exit(0);
} catch {
  // Graceful degradation — never block on error
  process.exit(0);
}
