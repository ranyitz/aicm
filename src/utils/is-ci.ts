import { env } from "node:process";

/**
 * Detect whether the current process is running in a CI environment.
 */
export function isCIEnvironment(): boolean {
  return (
    (env.CI !== "0" && env.CI !== "false" && "CI" in env) ||
    "CONTINUOUS_INTEGRATION" in env ||
    Object.keys(env).some((key) => key.startsWith("CI_"))
  );
}
