import { createRequire } from "module";
import { nativeGuardPath } from "./native-path.mjs";
export { nativeGuardPath } from "./native-path.mjs";

// Loading never compiles, launches a process, or reads user configuration.
let nativeGuard = null;
try {
  const binding = createRequire(import.meta.url)(nativeGuardPath());
  if (binding.guardCoreAbi === 1 && typeof binding.evaluate === "function") {
    nativeGuard = binding;
  }
} catch {
  // Missing, damaged or foreign-architecture builds use the original JS guard
  // evaluator. Loading failure must not disable the existing safety rules.
}

export { nativeGuard };
