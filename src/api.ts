import { install as installInternal } from "./commands/install";
import { InstallOptions, InstallResult } from "./commands/install";
import { checkWorkspacesEnabled as checkWorkspacesEnabledInternal } from "./utils/config";

export async function install(
  options: InstallOptions = {},
): Promise<InstallResult> {
  return installInternal(options);
}

export async function checkWorkspacesEnabled(cwd?: string): Promise<boolean> {
  return checkWorkspacesEnabledInternal(cwd);
}

export type { InstallOptions, InstallResult } from "./commands/install";
export type { ResolvedConfig, Config, MCPServers } from "./utils/config";
export type { InstructionFile } from "./utils/instructions";
export type { HookFile, HooksJson, HookType, HookCommand } from "./utils/hooks";
export type { SkillFile, AgentFile } from "./utils/config";
