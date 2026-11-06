import { fileURLToPath } from "url";

// Look up only this package's exact platform/architecture, never PATH.
export function nativeGuardPath(platform = process.platform, arch = process.arch) {
  if (!/^[a-z0-9_]+$/.test(platform) || !/^[a-z0-9_]+$/.test(arch)) {
    throw new Error("Invalid native platform or architecture");
  }
  return fileURLToPath(new URL(`../native/${platform}-${arch}/guardrails.node`, import.meta.url));
}
