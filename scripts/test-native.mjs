import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import { nativeGuard } from "../lib/native-guard.mjs";

if (!nativeGuard) throw new Error("Native guard missing; run npm run build:native first");
const result = spawnSync(process.execPath, ["--test", ...readdirSync("test").filter(name => name.endsWith(".test.mjs")).map(name => `test/${name}`)], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
