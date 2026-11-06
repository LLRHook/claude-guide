import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { nativeGuard } from "../lib/native-guard.mjs";

// Published packages already contain a platform build. On a different platform,
// use an installed Rust toolchain when available, without downloading anything.
if (!nativeGuard) {
  const build = fileURLToPath(new URL("./build-native.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [build], { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.warn("claude-guide: native guard unavailable; using JavaScript guard rails.");
  }
}
