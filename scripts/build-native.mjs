import { spawnSync } from "child_process";
import { copyFileSync, mkdirSync, renameSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { nativeGuardPath } from "../lib/native-path.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync("cargo", [
  "build", "--offline", "--locked", "--release",
  "--manifest-path", join(root, "native", "Cargo.toml"),
  "--message-format=json-render-diagnostics",
], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.status !== 0) {
  throw new Error(`Could not build guard core: ${result.error?.message || result.status}`);
}
const artifact = result.stdout.split("\n").filter(Boolean).map(line => JSON.parse(line))
  .find(event => event.reason === "compiler-artifact" &&
    event.target.name === "claude_guide_guard_core" && event.target.crate_types.includes("cdylib"));
const library = artifact?.filenames.find(path => /\.(dylib|so|dll)$/.test(path));
if (!library) throw new Error("Cargo did not emit a native guard library");
const destination = nativeGuardPath();
mkdirSync(dirname(destination), { recursive: true });
const temporary = `${destination}.${process.pid}.node`;
try {
  copyFileSync(library, temporary);
  const verify = spawnSync(process.execPath, ["-e",
    'const binding = require(process.argv[1]); if (binding.guardCoreAbi !== 1 || typeof binding.evaluate !== "function") process.exit(1);',
    temporary,
  ], { encoding: "utf8" });
  if (verify.error || verify.status !== 0) {
    throw new Error(`Native guard is incompatible with this Node runtime: ${verify.error?.message || verify.stderr}`);
  }
  renameSync(temporary, destination);
} finally {
  rmSync(temporary, { force: true });
}
console.log(`Built native guard for ${process.platform}-${process.arch}`);
