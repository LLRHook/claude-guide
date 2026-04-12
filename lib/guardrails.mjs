import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

// ─── Pattern Loading (once at module load, synchronous, cached) ──────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const patternsPath = join(__dirname, "..", "data", "dangerous-patterns.json");

let permanentRules = [];
let beginnerRules = [];
let sensitiveRules = [];

try {
  const rawPatterns = JSON.parse(readFileSync(patternsPath, "utf8"));

  function compilePatterns(rules) {
    return rules.map(rule => ({
      ...rule,
      compiled: new RegExp(rule.pattern, rule.flags || "")
    }));
  }

  permanentRules = compilePatterns(rawPatterns.permanent || []);
  beginnerRules  = compilePatterns(rawPatterns.beginner  || []);
  sensitiveRules = compilePatterns(rawPatterns.sensitive_file_warning || []);
} catch {
  // Patterns file unavailable — all rule arrays stay empty, guardrails no-op
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function matchesRule(rule, toolName, toolInput) {
  // Tool filter
  if (rule.tool !== undefined) {
    if (Array.isArray(rule.tool)) {
      if (!rule.tool.includes(toolName)) return false;
    } else {
      if (toolName !== rule.tool) return false;
    }
  }

  // Collect candidate values to test
  const candidates = [];

  if (Array.isArray(rule.fields)) {
    for (const f of rule.fields) {
      const v = toolInput[f];
      if (typeof v === "string") candidates.push(v);
    }
  } else if (typeof rule.field === "string") {
    const v = toolInput[rule.field];
    if (typeof v === "string") candidates.push(v);
  }

  if (candidates.length === 0) return false;

  return candidates.some(val => rule.compiled.test(val));
}

export function formatBlockMessage(rule) {
  return [
    `\uD83D\uDED1 ${rule.title}`,
    "",
    "What was about to happen:",
    `  ${rule.what}`,
    `  ${rule.analogy}`,
    "",
    "What you should do:",
    `  ${rule.suggestion}`
  ].join("\n");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function checkGuardrails(toolName, toolInput, profile) {
  try {
    // 1. Permanent rules (always enforced)
    for (const rule of permanentRules) {
      if (matchesRule(rule, toolName, toolInput)) {
        return { blocked: true, warning: null, message: formatBlockMessage(rule) };
      }
    }

    // 2. Beginner rules (only for beginner level)
    if (profile?.level === "beginner") {
      for (const rule of beginnerRules) {
        if (matchesRule(rule, toolName, toolInput)) {
          return { blocked: true, warning: null, message: formatBlockMessage(rule) };
        }
      }
    }

    // 3. Sensitive file warnings (all levels)
    for (const rule of sensitiveRules) {
      if (matchesRule(rule, toolName, toolInput)) {
        return { blocked: false, warning: rule.message, message: null };
      }
    }

    return { blocked: false, warning: null, message: null };
  } catch {
    return { blocked: false, warning: null, message: null };
  }
}
