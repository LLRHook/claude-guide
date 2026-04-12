/**
 * Guard rails tests — the most safety-critical component.
 *
 * Tests every pattern in dangerous-patterns.json:
 *   - 10 permanent blocks (should block at ALL levels)
 *   - 4 beginner-only blocks (should block at beginner, allow at intermediate)
 *   - 1 sensitive file warning (should warn, never block)
 *   - Negative cases (safe commands that should never be blocked)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkGuardrails, formatBlockMessage } from "../lib/guardrails.mjs";

// ─── Helpers ────────────────────────────────────────────────────────────────

const beginner     = { level: "beginner" };
const intermediate = { level: "intermediate" };

function shouldBlock(toolName, toolInput, profile = beginner) {
  const r = checkGuardrails(toolName, toolInput, profile);
  assert.equal(r.blocked, true, `Expected block for ${toolName}: ${JSON.stringify(toolInput)}`);
  assert.ok(r.message, "Block should include a message");
}

function shouldAllow(toolName, toolInput, profile = beginner) {
  const r = checkGuardrails(toolName, toolInput, profile);
  assert.equal(r.blocked, false, `Expected allow for ${toolName}: ${JSON.stringify(toolInput)}`);
}

function shouldWarn(toolName, toolInput, profile = beginner) {
  const r = checkGuardrails(toolName, toolInput, profile);
  assert.equal(r.blocked, false, "Warning should not block");
  assert.ok(r.warning, `Expected warning for ${toolName}: ${JSON.stringify(toolInput)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMANENT BLOCKS — must block at both beginner and intermediate
// ═══════════════════════════════════════════════════════════════════════════

describe("Permanent blocks", () => {

  describe("rm -rf", () => {
    const cases = [
      "rm -rf /",
      "rm -rf /home/user",
      "rm -fr /tmp/stuff",
      "rm --force --recursive /tmp",
      "rm --recursive --force /tmp",
      "rm -r -f /tmp",
      "rm -f -r /tmp",
    ];

    for (const cmd of cases) {
      it(`blocks: ${cmd}`, () => {
        shouldBlock("Bash", { command: cmd });
        shouldBlock("Bash", { command: cmd }, intermediate);
      });
    }

    it("allows plain rm (no -rf)", () => {
      shouldAllow("Bash", { command: "rm file.txt" });
    });

    it("allows rm -r without -f", () => {
      shouldAllow("Bash", { command: "rm -r folder/" });
    });

    // BSD uppercase flag variants (macOS: -R and -F are valid)
    it("blocks rm -rF (BSD uppercase)", () => {
      shouldBlock("Bash", { command: "rm -rF /tmp/stuff" });
    });

    it("blocks rm -Rf (BSD uppercase)", () => {
      shouldBlock("Bash", { command: "rm -Rf /tmp/stuff" });
    });

    it("blocks rm -RF (BSD uppercase)", () => {
      shouldBlock("Bash", { command: "rm -RF /tmp/stuff" });
    });
  });

  describe("git push --force", () => {
    it("blocks git push --force", () => {
      shouldBlock("Bash", { command: "git push --force" });
      shouldBlock("Bash", { command: "git push --force" }, intermediate);
    });

    it("blocks git push -f", () => {
      shouldBlock("Bash", { command: "git push -f" });
    });

    it("blocks git push origin main --force", () => {
      shouldBlock("Bash", { command: "git push origin main --force" });
    });

    it("allows git push --force-with-lease", () => {
      shouldAllow("Bash", { command: "git push --force-with-lease" });
    });

    it("allows regular git push", () => {
      shouldAllow("Bash", { command: "git push origin main" });
    });
  });

  describe("git reset --hard", () => {
    it("blocks git reset --hard", () => {
      shouldBlock("Bash", { command: "git reset --hard" });
      shouldBlock("Bash", { command: "git reset --hard" }, intermediate);
    });

    it("blocks git reset --hard HEAD~1", () => {
      shouldBlock("Bash", { command: "git reset --hard HEAD~1" });
    });

    it("allows git reset --soft", () => {
      shouldAllow("Bash", { command: "git reset --soft HEAD~1" });
    });

    it("allows git reset (no flags)", () => {
      shouldAllow("Bash", { command: "git reset HEAD~1" });
    });
  });

  describe("dd of=/dev/", () => {
    it("blocks dd of=/dev/sda", () => {
      shouldBlock("Bash", { command: "dd if=/dev/zero of=/dev/sda bs=1M" });
    });

    it("blocks at intermediate too", () => {
      shouldBlock("Bash", { command: "dd if=/dev/zero of=/dev/sda" }, intermediate);
    });
  });

  describe("mkfs", () => {
    it("blocks mkfs.ext4", () => {
      shouldBlock("Bash", { command: "mkfs.ext4 /dev/sda1" });
    });

    it("blocks mkfs.xfs", () => {
      shouldBlock("Bash", { command: "mkfs.xfs /dev/sdb" });
    });
  });

  describe("/dev redirect", () => {
    it("blocks > /dev/sda", () => {
      shouldBlock("Bash", { command: "echo garbage > /dev/sda" });
    });

    it("blocks > /dev/hda", () => {
      shouldBlock("Bash", { command: "cat file > /dev/hda" });
    });
  });

  describe("fork bomb", () => {
    it("blocks :(){ :|:&", () => {
      shouldBlock("Bash", { command: ":(){ :|:& };:" });
    });
  });

  describe("system file writes (Unix — Write/Edit)", () => {
    const systemPaths = [
      "/etc/passwd",
      "/etc/hosts",
      "/usr/bin/something",
      "/sys/kernel/something",
      "/boot/grub/grub.cfg",
      "/proc/sys/something",
    ];

    for (const p of systemPaths) {
      it(`blocks Write to ${p}`, () => {
        shouldBlock("Write", { file_path: p });
        shouldBlock("Write", { file_path: p }, intermediate);
      });

      it(`blocks Edit of ${p}`, () => {
        shouldBlock("Edit", { file_path: p });
      });
    }

    it("allows Write to user directory", () => {
      shouldAllow("Write", { file_path: "/Users/jane/project/file.js" });
    });

    it("blocks Write to /dev/ device files", () => {
      shouldBlock("Write", { file_path: "/dev/sda" });
    });

    it("blocks Edit of /dev/null (device files)", () => {
      shouldBlock("Edit", { file_path: "/dev/null" });
    });
  });

  describe("system file writes (Unix — Bash tee/redirect)", () => {
    it("blocks tee /etc/hosts", () => {
      shouldBlock("Bash", { command: "echo 127.0.0.1 | tee /etc/hosts" });
    });

    it("blocks >> /etc/resolv.conf", () => {
      shouldBlock("Bash", { command: "echo nameserver 8.8.8.8 >> /etc/resolv.conf" });
    });

    it("blocks > /usr/local/bin/script", () => {
      shouldBlock("Bash", { command: "cat script.sh > /usr/local/bin/script" });
    });

    it("blocks tee -a /etc/hosts (flags before path)", () => {
      shouldBlock("Bash", { command: "echo 127.0.0.1 | tee -a /etc/hosts" });
    });

    it("blocks tee --append /etc/passwd", () => {
      shouldBlock("Bash", { command: "echo root | tee --append /etc/passwd" });
    });
  });

  describe("system file writes (Windows — Write/Edit)", () => {
    it("blocks Write to C:\\Windows\\System32", () => {
      shouldBlock("Write", { file_path: "C:\\Windows\\System32\\config" });
    });

    it("blocks Edit of C:\\Program Files\\app", () => {
      shouldBlock("Edit", { file_path: "C:\\Program Files\\app\\config.json" });
    });

    it("is case-insensitive for Windows paths", () => {
      shouldBlock("Write", { file_path: "c:\\windows\\system32\\drivers" });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BEGINNER-ONLY BLOCKS — block at beginner, allow at intermediate
// ═══════════════════════════════════════════════════════════════════════════

describe("Beginner-only blocks", () => {

  describe("curl | bash", () => {
    it("blocks curl | bash at beginner", () => {
      shouldBlock("Bash", { command: "curl -fsSL http://example.com/install.sh | bash" });
    });

    it("blocks curl | sh at beginner", () => {
      shouldBlock("Bash", { command: "curl http://example.com | sh" });
    });

    it("allows curl | bash at intermediate", () => {
      shouldAllow("Bash", { command: "curl http://example.com | bash" }, intermediate);
    });

    it("allows plain curl (no pipe)", () => {
      shouldAllow("Bash", { command: "curl http://example.com/api" });
    });
  });

  describe("chmod 777", () => {
    it("blocks chmod 777 at beginner", () => {
      shouldBlock("Bash", { command: "chmod 777 /tmp/file" });
    });

    it("allows chmod 777 at intermediate", () => {
      shouldAllow("Bash", { command: "chmod 777 /tmp/file" }, intermediate);
    });

    it("allows chmod 755", () => {
      shouldAllow("Bash", { command: "chmod 755 script.sh" });
    });
  });

  describe("eval $()", () => {
    it("blocks eval $() at beginner", () => {
      shouldBlock("Bash", { command: "eval $(ssh-agent)" });
    });

    it("allows eval $() at intermediate", () => {
      shouldAllow("Bash", { command: "eval $(ssh-agent)" }, intermediate);
    });
  });

  describe("npm install -g", () => {
    it("blocks npm install -g at beginner", () => {
      shouldBlock("Bash", { command: "npm install -g typescript" });
    });

    it("blocks npm i -g at beginner", () => {
      shouldBlock("Bash", { command: "npm i -g eslint" });
    });

    it("blocks npm install --global at beginner", () => {
      shouldBlock("Bash", { command: "npm install --global prettier" });
    });

    it("allows npm install -g at intermediate", () => {
      shouldAllow("Bash", { command: "npm install -g typescript" }, intermediate);
    });

    it("allows local npm install", () => {
      shouldAllow("Bash", { command: "npm install express" });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SENSITIVE FILE WARNINGS — warn but never block
// ═══════════════════════════════════════════════════════════════════════════

describe("Sensitive file warnings", () => {
  it("warns on .env file path", () => {
    shouldWarn("Read", { file_path: "/project/.env" });
  });

  it("warns on file with 'password' in path", () => {
    shouldWarn("Edit", { file_path: "/project/config/password.json" });
  });

  it("warns on file with 'secret' in path", () => {
    shouldWarn("Write", { file_path: "/project/secrets/api-keys.json" });
  });

  it("warns on file with 'token' in path", () => {
    shouldWarn("Read", { file_path: "/project/token-store.json" });
  });

  it("warns on Bash command referencing .env", () => {
    shouldWarn("Bash", { command: "cat .env" });
  });

  it("does not warn on normal file paths", () => {
    const r = checkGuardrails("Read", { file_path: "/project/src/index.js" }, beginner);
    assert.equal(r.blocked, false);
    assert.equal(r.warning, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NEGATIVE CASES — safe operations that must NEVER be blocked
// ═══════════════════════════════════════════════════════════════════════════

describe("Safe operations (negative cases)", () => {
  const safeBashCommands = [
    "git status",
    "git add .",
    "git commit -m 'fix: something'",
    "git push origin main",
    "git log --oneline -10",
    "npm test",
    "npm install express",
    "npm run build",
    "ls -la",
    "cat README.md",
    "node index.js",
    "echo hello",
    "pwd",
    "mkdir -p src/components",
    "cp file.txt backup.txt",
  ];

  for (const cmd of safeBashCommands) {
    it(`allows: ${cmd}`, () => {
      shouldAllow("Bash", { command: cmd });
    });
  }

  it("allows Read of normal files", () => {
    shouldAllow("Read", { file_path: "/Users/jane/project/src/index.js" });
  });

  it("allows Write to project files", () => {
    shouldAllow("Write", { file_path: "/Users/jane/project/src/utils.js" });
  });

  it("allows Edit of project files", () => {
    shouldAllow("Edit", { file_path: "/Users/jane/project/package.json" });
  });

  it("allows Grep (no dangerous patterns apply)", () => {
    shouldAllow("Grep", { pattern: "TODO", path: "/project" });
  });

  it("allows Glob (no dangerous patterns apply)", () => {
    shouldAllow("Glob", { pattern: "**/*.js" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("handles null profile gracefully", () => {
    const r = checkGuardrails("Bash", { command: "rm -rf /" }, null);
    // Permanent rules should still block even with null profile
    assert.equal(r.blocked, true);
  });

  it("handles missing tool_input fields", () => {
    const r = checkGuardrails("Bash", {}, beginner);
    assert.equal(r.blocked, false);
  });

  it("handles unknown tool names", () => {
    const r = checkGuardrails("UnknownTool", { command: "rm -rf /" }, beginner);
    // rm -rf rule is tool-specific to Bash, so unknown tool should pass
    assert.equal(r.blocked, false);
  });

  it("handles empty command string", () => {
    const r = checkGuardrails("Bash", { command: "" }, beginner);
    assert.equal(r.blocked, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatBlockMessage
// ═══════════════════════════════════════════════════════════════════════════

describe("formatBlockMessage", () => {
  it("formats a block message with all required sections", () => {
    const rule = {
      title: "TEST — bad thing",
      what: "Something bad happens.",
      analogy: "Like doing a bad thing.",
      suggestion: "Do a good thing instead.",
    };

    const msg = formatBlockMessage(rule);
    assert.ok(msg.includes("TEST — bad thing"), "Should include title");
    assert.ok(msg.includes("What was about to happen:"), "Should include what section");
    assert.ok(msg.includes("Something bad happens."), "Should include what text");
    assert.ok(msg.includes("What you should do:"), "Should include suggestion section");
    assert.ok(msg.includes("Do a good thing instead."), "Should include suggestion text");
  });
});
