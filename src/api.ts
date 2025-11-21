import { install as installInternal } from "./commands/install";
import { InstallOptions, InstallResult } from "./commands/install";
import { checkWorkspacesEnabled as checkWorkspacesEnabledInternal } from "./utils/config";

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

/**
 * Check if workspaces mode is enabled without loading all rules/presets
 * @param cwd Current working directory (optional, defaults to process.cwd())
 * @returns True if workspaces mode is enabled
 */
export async function checkWorkspacesEnabled(cwd?: string): Promise<boolean> {
  return checkWorkspacesEnabledInternal(cwd);
}

export type { InstallOptions, InstallResult } from "./commands/install";
export type {
  ResolvedConfig,
  Config,
  RuleFile,
  CommandFile,
  MCPServers,
} from "./utils/config";
export type { HookFile, HooksJson, HookType, HookCommand } from "./utils/hooks";
