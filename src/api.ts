import { install as installInternal } from "./commands/install";
import { InstallOptions, InstallResult } from "./commands/install";

/**
 * Install AICM rules based on configuration
 * @param options Installation options
 * @returns Result of the install operation
 */
export async function install(
  options: InstallOptions = {},
): Promise<InstallResult> {
  return installInternal(options);
}

// Re-export types for convenience
export type { InstallOptions, InstallResult } from "./commands/install";
export type {
  ResolvedConfig,
  Config,
  RuleFile,
  MCPServers,
} from "./utils/config";
