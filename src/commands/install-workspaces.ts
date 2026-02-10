import chalk from "chalk";
import path from "node:path";
import {
  ResolvedConfig,
  SkillFile,
  AgentFile,
  MCPServers,
} from "../utils/config";
import {
  HookFile,
  HooksJson,
  mergeHooksConfigs,
  dedupeHookFiles,
  writeHooksToCursor,
} from "../utils/hooks";
import { withWorkingDirectory } from "../utils/working-directory";
import { discoverPackagesWithAicm } from "../utils/workspace-discovery";
import {
  installPackage,
  InstallOptions,
  InstallResult,
  writeSkillsToTargets,
  writeSubagentsToTargets,
  warnPresetSkillCollisions,
  warnPresetAgentCollisions,
  dedupeSkillsForInstall,
  dedupeAgentsForInstall,
  writeMcpServersToFile,
  writeMcpServersToOpenCode,
  writeMcpServersToCodex,
} from "./install";
import { log } from "../utils/log";

type PkgInfo = { relativePath: string; config: ResolvedConfig };

function collectTargets(
  packages: PkgInfo[],
  key: keyof ResolvedConfig["config"]["targets"],
): string[] {
  const targets = new Set<string>();
  for (const pkg of packages) {
    for (const t of pkg.config.config.targets[key]) targets.add(t);
  }
  return Array.from(targets);
}

function mergeWorkspaceSkills(packages: PkgInfo[]): SkillFile[] {
  const skills: SkillFile[] = [];
  const seen = new Set<string>();
  for (const pkg of packages) {
    if (pkg.config.config.targets.skills.length === 0) continue;
    for (const skill of pkg.config.skills ?? []) {
      if (skill.presetName) {
        const key = `${skill.presetName}::${skill.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      skills.push(skill);
    }
  }
  return skills;
}

function mergeWorkspaceAgents(packages: PkgInfo[]): AgentFile[] {
  const agents: AgentFile[] = [];
  const seen = new Set<string>();
  for (const pkg of packages) {
    if (pkg.config.config.targets.agents.length === 0) continue;
    for (const agent of pkg.config.agents ?? []) {
      if (agent.presetName) {
        const key = `${agent.presetName}::${agent.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      agents.push(agent);
    }
  }
  return agents;
}

interface MergeConflict {
  key: string;
  packages: string[];
  chosen: string;
}

function mergeWorkspaceMcpServers(packages: PkgInfo[]): {
  merged: MCPServers;
  conflicts: MergeConflict[];
} {
  const merged: MCPServers = {};
  const info: Record<
    string,
    { configs: Set<string>; packages: string[]; chosen: string }
  > = {};

  for (const pkg of packages) {
    for (const [key, value] of Object.entries(pkg.config.mcpServers)) {
      if (value === false) continue;
      const json = JSON.stringify(value);
      if (!info[key]) {
        info[key] = {
          configs: new Set([json]),
          packages: [pkg.relativePath],
          chosen: pkg.relativePath,
        };
      } else {
        info[key].packages.push(pkg.relativePath);
        info[key].configs.add(json);
        info[key].chosen = pkg.relativePath;
      }
      merged[key] = value;
    }
  }

  const conflicts: MergeConflict[] = [];
  for (const [key, data] of Object.entries(info)) {
    if (data.configs.size > 1) {
      conflicts.push({ key, packages: data.packages, chosen: data.chosen });
    }
  }

  return { merged, conflicts };
}

function mergeWorkspaceHooks(packages: PkgInfo[]): {
  merged: HooksJson;
  hookFiles: HookFile[];
} {
  const allConfigs: HooksJson[] = [];
  const allFiles: HookFile[] = [];

  for (const pkg of packages) {
    if (pkg.config.hooks) allConfigs.push(pkg.config.hooks);
    allFiles.push(...pkg.config.hookFiles);
  }

  return {
    merged: mergeHooksConfigs(allConfigs),
    hookFiles: dedupeHookFiles(allFiles),
  };
}

async function installWorkspacesPackages(
  packages: Array<{
    relativePath: string;
    absolutePath: string;
    config: ResolvedConfig;
  }>,
  options: InstallOptions,
): Promise<{
  success: boolean;
  packages: Array<{
    path: string;
    success: boolean;
    error?: Error;
    installedInstructionCount: number;
    installedHookCount: number;
    installedSkillCount: number;
    installedAgentCount: number;
  }>;
  totalInstructionCount: number;
  totalHookCount: number;
  totalSkillCount: number;
  totalAgentCount: number;
}> {
  const results: Array<{
    path: string;
    success: boolean;
    error?: Error;
    installedInstructionCount: number;
    installedHookCount: number;
    installedSkillCount: number;
    installedAgentCount: number;
  }> = [];
  let totalInstructions = 0,
    totalHooks = 0,
    totalSkills = 0,
    totalAgents = 0;

  for (const pkg of packages) {
    try {
      const result = await installPackage({
        ...options,
        cwd: pkg.absolutePath,
        config: pkg.config,
      });
      totalInstructions += result.installedInstructionCount;
      totalHooks += result.installedHookCount;
      totalSkills += result.installedSkillCount;
      totalAgents += result.installedAgentCount;
      results.push({
        path: pkg.relativePath,
        success: result.success,
        error: result.error,
        installedInstructionCount: result.installedInstructionCount,
        installedHookCount: result.installedHookCount,
        installedSkillCount: result.installedSkillCount,
        installedAgentCount: result.installedAgentCount,
      });
    } catch (error) {
      results.push({
        path: pkg.relativePath,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedInstructionCount: 0,
        installedHookCount: 0,
        installedSkillCount: 0,
        installedAgentCount: 0,
      });
    }
  }

  return {
    success: results.every((r) => r.success),
    packages: results,
    totalInstructionCount: totalInstructions,
    totalHookCount: totalHooks,
    totalSkillCount: totalSkills,
    totalAgentCount: totalAgents,
  };
}

export async function installWorkspaces(
  cwd: string,
  installOnCI: boolean,
  verbose: boolean = false,
  dryRun: boolean = false,
): Promise<InstallResult> {
  return withWorkingDirectory(cwd, async () => {
    if (verbose) log.info(chalk.blue("🔍 Discovering packages..."));

    const allPackages = await discoverPackagesWithAicm(cwd);

    const packages = allPackages.filter((pkg) => {
      if (pkg.config.config.skipInstall === true) return false;
      const isRoot = pkg.relativePath === ".";
      if (!isRoot) return true;
      const hasInstructions =
        pkg.config.instructions && pkg.config.instructions.length > 0;
      const hasSkills = pkg.config.skills && pkg.config.skills.length > 0;
      const hasAgents = pkg.config.agents && pkg.config.agents.length > 0;
      const hasPresets =
        pkg.config.config.presets && pkg.config.config.presets.length > 0;
      return hasInstructions || hasSkills || hasAgents || hasPresets;
    });

    if (packages.length === 0) {
      return {
        success: false,
        error: new Error("No packages with aicm configurations found"),
        installedInstructionCount: 0,
        installedHookCount: 0,
        installedSkillCount: 0,
        installedAgentCount: 0,
        packagesCount: 0,
      };
    }

    if (verbose) {
      log.info(
        chalk.blue(
          `Found ${packages.length} packages with aicm configurations:`,
        ),
      );
      packages.forEach((pkg) =>
        log.info(chalk.gray(`  - ${pkg.relativePath}`)),
      );
      log.info(chalk.blue("📦 Installing configurations..."));
    }

    const result = await installWorkspacesPackages(packages, {
      installOnCI,
      verbose,
      dryRun,
    });

    const workspaceSkills = mergeWorkspaceSkills(packages);
    const skillTargets = collectTargets(packages, "skills");
    if (workspaceSkills.length > 0) warnPresetSkillCollisions(workspaceSkills);
    if (!dryRun && workspaceSkills.length > 0 && skillTargets.length > 0) {
      writeSkillsToTargets(
        dedupeSkillsForInstall(workspaceSkills),
        skillTargets,
        cwd,
      );
    }

    const workspaceAgents = mergeWorkspaceAgents(packages);
    const agentTargets = collectTargets(packages, "agents");
    if (workspaceAgents.length > 0) warnPresetAgentCollisions(workspaceAgents);
    if (!dryRun && workspaceAgents.length > 0 && agentTargets.length > 0) {
      writeSubagentsToTargets(
        dedupeAgentsForInstall(workspaceAgents),
        agentTargets,
        cwd,
      );
    }

    const { merged: rootMcp, conflicts } = mergeWorkspaceMcpServers(packages);
    const mcpTargets = collectTargets(packages, "mcp");
    if (!dryRun && mcpTargets.length > 0 && Object.keys(rootMcp).length > 0) {
      for (const target of mcpTargets) {
        const mcpPath = path.isAbsolute(target)
          ? target
          : path.join(cwd, target);
        const basename = path.basename(target);

        if (basename === "opencode.json") {
          writeMcpServersToOpenCode(rootMcp, mcpPath);
        } else if (
          target === ".codex/config.toml" ||
          basename === "config.toml"
        ) {
          writeMcpServersToCodex(rootMcp, mcpPath);
        } else {
          writeMcpServersToFile(rootMcp, mcpPath);
        }
      }
    }

    for (const conflict of conflicts) {
      console.warn(
        `Warning: MCP configuration conflict detected\n  Key: "${conflict.key}"\n  Packages: ${conflict.packages.join(", ")}\n  Using configuration from: ${conflict.chosen}`,
      );
    }

    const { merged: rootHooks, hookFiles: rootHookFiles } =
      mergeWorkspaceHooks(packages);
    const hookTargets = collectTargets(packages, "hooks");
    const hasCursorTarget = hookTargets.some((target) => {
      const resolved = path.isAbsolute(target)
        ? target
        : path.join(cwd, target);
      return path.basename(resolved) === ".cursor";
    });
    const hasHooksContent =
      rootHooks.hooks && Object.keys(rootHooks.hooks).length > 0;

    if (
      !dryRun &&
      hasCursorTarget &&
      (hasHooksContent || rootHookFiles.length > 0)
    ) {
      writeHooksToCursor(rootHooks, rootHookFiles, cwd);
    }

    if (verbose) {
      result.packages.forEach((pkg) => {
        if (pkg.success) {
          const parts = [
            `${pkg.installedInstructionCount} instruction${pkg.installedInstructionCount === 1 ? "" : "s"}`,
          ];
          if (pkg.installedHookCount > 0)
            parts.push(
              `${pkg.installedHookCount} hook${pkg.installedHookCount === 1 ? "" : "s"}`,
            );
          if (pkg.installedSkillCount > 0)
            parts.push(
              `${pkg.installedSkillCount} skill${pkg.installedSkillCount === 1 ? "" : "s"}`,
            );
          if (pkg.installedAgentCount > 0)
            parts.push(
              `${pkg.installedAgentCount} agent${pkg.installedAgentCount === 1 ? "" : "s"}`,
            );
          log.info(chalk.green(`✅ ${pkg.path} (${parts.join(", ")})`));
        } else {
          log.info(chalk.red(`❌ ${pkg.path}: ${pkg.error}`));
        }
      });
    }

    const failed = result.packages.filter((r) => !r.success);
    if (failed.length > 0) {
      log.info(chalk.yellow("Installation completed with errors"));
      const errorDetails = failed
        .map((p) => `${p.path}: ${p.error}`)
        .join("; ");
      return {
        success: false,
        error: new Error(
          `Package installation failed for ${failed.length} package(s): ${errorDetails}`,
        ),
        installedInstructionCount: result.totalInstructionCount,
        installedHookCount: result.totalHookCount,
        installedSkillCount: result.totalSkillCount,
        installedAgentCount: result.totalAgentCount,
        packagesCount: result.packages.length,
      };
    }

    return {
      success: true,
      installedInstructionCount: result.totalInstructionCount,
      installedHookCount: result.totalHookCount,
      installedSkillCount: result.totalSkillCount,
      installedAgentCount: result.totalAgentCount,
      packagesCount: result.packages.length,
    };
  });
}
