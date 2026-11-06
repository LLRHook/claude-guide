import { it } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

it("disables rustup toolchain auto-install before invoking offline Cargo", async () => {
  const original = childProcess.spawnSync;
  const stopped = new Error("synthetic compiler boundary");
  childProcess.spawnSync = (command, arguments_, options) => {
    assert.equal(command, "cargo");
    assert.ok(arguments_.includes("--offline"));
    assert.equal(options.env.RUSTUP_AUTO_INSTALL, "0");
    assert.deepEqual(options.env, { ...process.env, RUSTUP_AUTO_INSTALL: "0" });
    throw stopped;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(import("../scripts/build-native.mjs?offline-regression"), error => error === stopped);
  } finally {
    childProcess.spawnSync = original;
    syncBuiltinESMExports();
  }
});
