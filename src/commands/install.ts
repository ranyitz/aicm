import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import {
  loadConfig,
  ResolvedConfig,
  SkillFile,
  AgentFile,
  MCPServers,
  detectWorkspacesFromPackageJson,
} from "../utils/config";
import {
  HookFile,
  HooksJson,
  countHooks,
  writeHooksToCursor,
} from "../utils/hooks";
import { withWorkingDirectory } from "../utils/working-directory";
import { isCIEnvironment } from "../utils/is-ci";
import {
  InstructionFile,
  extractInstructionTitle,
} from "../utils/instructions";
import { writeInstructionsFile } from "../utils/instructions-file";
import { installWorkspaces } from "./install-workspaces";

export interface InstallOptions {
  /**
   * Base directory to use instead of process.cwd()
   */
  cwd?: string;
  /**
   * Custom config object to use instead of loading from file
   */
  config?: ResolvedConfig;
  /**
   * allow installation on CI environments
   */
  installOnCI?: boolean;
  /**
   * Show verbose output during installation
   */
  verbose?: boolean;
  /**
   * Perform a dry run without writing any files
   */
  dryRun?: boolean;
}

/**
 * Result of the install operation
 */
export interface InstallResult {
  /**
   * Whether the operation was successful
   */
  success: boolean;
  /**
   * Error object if the operation failed
   */
  error?: Error;
  /**
   * Number of instructions installed
   */
  installedInstructionCount: number;
  /**
   * Number of hooks installed
   */
  installedHookCount: number;
  /**
   * Number of skills installed
   */
  installedSkillCount: number;
  /**
   * Number of agents installed
   */
  installedAgentCount: number;
  /**
   * Number of packages installed
   */
  packagesCount: number;
}

function resolveTargetPath(targetPath: string, cwd: string): string {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(cwd, targetPath);
}

function formatPresetLabel(presetName?: string): string | null {
  if (!presetName) return null;
  if (presetName.startsWith("@")) return presetName;
  const normalized = presetName.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? presetName;
}

function buildInstructionsContent(instructions: InstructionFile[]): {
  content: string;
  progressiveFiles: Array<{ relativePath: string; content: string }>;
} {
  const lines: string[] = [];
  const progressive: Array<{
    title: string;
    description: string;
    relativePath: string;
    content: string;
  }> = [];

  let currentPreset: string | null = null;

  for (const instruction of instructions) {
    const presetLabel = formatPresetLabel(instruction.presetName);
    if (presetLabel !== currentPreset) {
      if (lines.length > 0) lines.push("");
      if (presetLabel) {
        lines.push(`<!-- From: ${presetLabel} -->`);
      }
      currentPreset = presetLabel;
    }

    if (instruction.inline) {
      lines.push(instruction.content.trim());
    } else {
      const title =
        extractInstructionTitle(instruction.content) ?? instruction.name;
      const relativePath = path.posix.join(
        ".agents",
        "aicm",
        `${instruction.name}.md`,
      );
      progressive.push({
        title,
        description: instruction.description,
        relativePath,
        content: instruction.content,
      });
    }
  }

  if (progressive.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("The following instructions are available:");
    for (const item of progressive) {
      lines.push(
        `- [${item.title}](${item.relativePath}): ${item.description}`,
      );
    }
  }

  return {
    content: lines.join("\n").trim(),
    progressiveFiles: progressive.map((item) => ({
      relativePath: item.relativePath,
      content: item.content,
    })),
  };
}

export function writeInstructionsToTargets(
  instructions: InstructionFile[],
  targetFiles: string[],
  cwd: string,
): void {
  if (instructions.length === 0) return;

  const { content, progressiveFiles } = buildInstructionsContent(instructions);
  if (!content) return;

  for (const targetFile of targetFiles) {
    const resolvedPath = resolveTargetPath(targetFile, cwd);
    writeInstructionsFile(content, resolvedPath);
  }

  if (progressiveFiles.length > 0) {
    for (const file of progressiveFiles) {
      const resolvedPath = resolveTargetPath(file.relativePath, cwd);
      fs.ensureDirSync(path.dirname(resolvedPath));
      fs.writeFileSync(resolvedPath, file.content);
    }
  }
}

/**
 * Metadata file written inside each installed skill to track aicm management
 * The presence of .aicm.json indicates the skill is managed by aicm
 */
interface SkillAicmMetadata {
  source: "local" | "preset";
  presetName?: string;
}

/**
 * Write a single skill to the target directory
 * Copies the entire skill directory and writes .aicm.json metadata
 */
function writeSkillToTarget(skill: SkillFile, targetSkillsDir: string): void {
  const skillTargetPath = path.join(targetSkillsDir, skill.name);

  // Remove existing skill directory if it exists (to ensure clean install)
  if (fs.existsSync(skillTargetPath)) {
    fs.removeSync(skillTargetPath);
  }

  // Copy the entire skill directory
  fs.copySync(skill.sourcePath, skillTargetPath);

  // Write .aicm.json metadata file
  // The presence of this file indicates the skill is managed by aicm
  const metadata: SkillAicmMetadata = {
    source: skill.source,
  };

  if (skill.presetName) {
    metadata.presetName = skill.presetName;
  }

  const metadataPath = path.join(skillTargetPath, ".aicm.json");
  fs.writeJsonSync(metadataPath, metadata, { spaces: 2 });
}

/**
 * Write skills to all supported target directories
 */
export function writeSkillsToTargets(
  skills: SkillFile[],
  targetDirs: string[],
  cwd: string,
): void {
  if (skills.length === 0) return;

  for (const targetDir of targetDirs) {
    const resolvedDir = resolveTargetPath(targetDir, cwd);
    fs.ensureDirSync(resolvedDir);
    for (const skill of skills) {
      writeSkillToTarget(skill, resolvedDir);
    }
  }
}

/**
 * Warn about skill name collisions from different presets
 */
export function warnPresetSkillCollisions(skills: SkillFile[]): void {
  const collisions = new Map<
    string,
    { presets: Set<string>; lastPreset: string }
  >();

  for (const skill of skills) {
    if (!skill.presetName) continue;

    const entry = collisions.get(skill.name);
    if (entry) {
      entry.presets.add(skill.presetName);
      entry.lastPreset = skill.presetName;
    } else {
      collisions.set(skill.name, {
        presets: new Set([skill.presetName]),
        lastPreset: skill.presetName,
      });
    }
  }

  for (const [skillName, { presets, lastPreset }] of collisions) {
    if (presets.size > 1) {
      const presetList = Array.from(presets).sort().join(", ");
      console.warn(
        chalk.yellow(
          `Warning: multiple presets provide the "${skillName}" skill (${presetList}). Using definition from ${lastPreset}.`,
        ),
      );
    }
  }
}

/**
 * Dedupe skills by name (last one wins)
 */
export function dedupeSkillsForInstall(skills: SkillFile[]): SkillFile[] {
  const unique = new Map<string, SkillFile>();
  for (const skill of skills) {
    unique.set(skill.name, skill);
  }
  return Array.from(unique.values());
}

/**
 * Metadata file written to the agents directory to track aicm-managed agents
 */
interface AgentsAicmMetadata {
  managedAgents: string[]; // List of agent names (without path or extension)
}

/**
 * Write agents to all supported target directories
 * Similar to skills, agents are written directly to the agents directory
 * with a .aicm.json metadata file tracking which agents are managed
 */
export function writeAgentsToTargets(
  agents: AgentFile[],
  targetDirs: string[],
  cwd: string,
): void {
  if (agents.length === 0) return;

  for (const targetDir of targetDirs) {
    const targetAgentsDir = resolveTargetPath(targetDir, cwd);
    fs.ensureDirSync(targetAgentsDir);

    // Read existing metadata to clean up old managed agents
    const metadataPath = path.join(targetAgentsDir, ".aicm.json");
    if (fs.existsSync(metadataPath)) {
      try {
        const existingMetadata: AgentsAicmMetadata =
          fs.readJsonSync(metadataPath);
        // Remove previously managed agents
        for (const agentName of existingMetadata.managedAgents || []) {
          // Skip invalid names containing path separators
          if (agentName.includes("/") || agentName.includes("\\")) {
            console.warn(
              chalk.yellow(
                `Warning: Skipping invalid agent name "${agentName}" (contains path separator)`,
              ),
            );
            continue;
          }
          const fullPath = path.join(targetAgentsDir, agentName + ".md");
          if (fs.existsSync(fullPath)) {
            fs.removeSync(fullPath);
          }
        }
      } catch {
        // Ignore errors reading metadata
      }
    }

    const managedAgents: string[] = [];

    for (const agent of agents) {
      // Use base name only
      const agentName = path.basename(agent.name, path.extname(agent.name));
      const agentFile = path.join(targetAgentsDir, agentName + ".md");

      fs.writeFileSync(agentFile, agent.content);
      managedAgents.push(agentName);
    }

    // Write metadata file to track managed agents
    const metadata: AgentsAicmMetadata = {
      managedAgents,
    };
    fs.writeJsonSync(metadataPath, metadata, { spaces: 2 });
  }
}

/**
 * Warn about agent name collisions from different presets
 */
export function warnPresetAgentCollisions(agents: AgentFile[]): void {
  const collisions = new Map<
    string,
    { presets: Set<string>; lastPreset: string }
  >();

  for (const agent of agents) {
    if (!agent.presetName) continue;

    const entry = collisions.get(agent.name);
    if (entry) {
      entry.presets.add(agent.presetName);
      entry.lastPreset = agent.presetName;
    } else {
      collisions.set(agent.name, {
        presets: new Set([agent.presetName]),
        lastPreset: agent.presetName,
      });
    }
  }

  for (const [agentName, { presets, lastPreset }] of collisions) {
    if (presets.size > 1) {
      const presetList = Array.from(presets).sort().join(", ");
      console.warn(
        chalk.yellow(
          `Warning: multiple presets provide the "${agentName}" agent (${presetList}). Using definition from ${lastPreset}.`,
        ),
      );
    }
  }
}

/**
 * Dedupe agents by name (last one wins)
 */
export function dedupeAgentsForInstall(agents: AgentFile[]): AgentFile[] {
  const unique = new Map<string, AgentFile>();
  for (const agent of agents) {
    unique.set(agent.name, agent);
  }
  return Array.from(unique.values());
}

/**
 * Write MCP servers configuration to IDE targets
 */
function writeMcpServersToTargets(
  mcpServers: MCPServers,
  targets: string[],
  cwd: string,
): void {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return;

  for (const target of targets) {
    const mcpPath = resolveTargetPath(target, cwd);
    writeMcpServersToFile(mcpServers, mcpPath);
  }
}

/**
 * Write hooks to IDE targets
 */
function writeHooksToTargets(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  targets: string[],
  cwd: string,
): void {
  const hasHooks =
    hooksConfig.hooks && Object.keys(hooksConfig.hooks).length > 0;

  if (!hasHooks && hookFiles.length === 0) {
    return;
  }

  for (const target of targets) {
    const targetPath = resolveTargetPath(target, cwd);
    if (path.basename(targetPath) === ".cursor") {
      writeHooksToCursor(hooksConfig, hookFiles, path.dirname(targetPath));
    }
  }
}

/**
 * Write MCP servers configuration to a specific file
 */
export function writeMcpServersToFile(
  mcpServers: MCPServers,
  mcpPath: string,
): void {
  fs.ensureDirSync(path.dirname(mcpPath));

  const existingConfig: Record<string, unknown> = fs.existsSync(mcpPath)
    ? fs.readJsonSync(mcpPath)
    : {};

  const existingMcpServers = existingConfig?.mcpServers ?? {};

  // Filter out any existing aicm-managed servers (with aicm: true)
  // This removes stale aicm servers that are no longer in the configuration
  const userMcpServers: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(existingMcpServers)) {
    if (typeof value === "object" && value !== null && value.aicm !== true) {
      userMcpServers[key] = value;
    }
  }

  // Mark new aicm servers as managed and filter out canceled servers
  const aicmMcpServers: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(mcpServers)) {
    if (value !== false) {
      aicmMcpServers[key] = {
        ...value,
        aicm: true,
      };
    }
  }

  // Merge user servers with aicm servers (aicm servers override user servers with same key)
  const mergedMcpServers = {
    ...userMcpServers,
    ...aicmMcpServers,
  };

  const mergedConfig = {
    ...existingConfig,
    mcpServers: mergedMcpServers,
  };

  fs.writeJsonSync(mcpPath, mergedConfig, { spaces: 2 });
}

/**
 * Install instructions for a single package (used within workspaces and standalone installs)
 */
export async function installPackage(
  options: InstallOptions = {},
): Promise<InstallResult> {
  const cwd = options.cwd || process.cwd();

  return withWorkingDirectory(cwd, async () => {
    let resolvedConfig: ResolvedConfig | null;

    if (options.config) {
      resolvedConfig = options.config;
    } else {
      resolvedConfig = await loadConfig(cwd);
    }

    if (!resolvedConfig) {
      return {
        success: false,
        error: new Error("Configuration file not found"),
        installedInstructionCount: 0,
        installedHookCount: 0,
        installedSkillCount: 0,
        installedAgentCount: 0,
        packagesCount: 0,
      };
    }

    const {
      config,
      instructions,
      skills,
      agents,
      mcpServers,
      hooks,
      hookFiles,
    } = resolvedConfig;

    if (config.skipInstall === true) {
      return {
        success: true,
        installedInstructionCount: 0,
        installedHookCount: 0,
        installedSkillCount: 0,
        installedAgentCount: 0,
        packagesCount: 0,
      };
    }

    warnPresetSkillCollisions(skills);
    const skillsToInstall = dedupeSkillsForInstall(skills);

    warnPresetAgentCollisions(agents);
    const agentsToInstall = dedupeAgentsForInstall(agents);

    try {
      if (!options.dryRun) {
        writeInstructionsToTargets(
          instructions,
          config.targets.instructions,
          cwd,
        );

        writeSkillsToTargets(skillsToInstall, config.targets.skills, cwd);

        writeAgentsToTargets(agentsToInstall, config.targets.agents, cwd);

        if (mcpServers && Object.keys(mcpServers).length > 0) {
          writeMcpServersToTargets(mcpServers, config.targets.mcp, cwd);
        }

        if (hooks && (countHooks(hooks) > 0 || hookFiles.length > 0)) {
          writeHooksToTargets(hooks, hookFiles, config.targets.hooks, cwd);
        }
      }

      const uniqueInstructionCount = new Set(
        instructions.map(
          (instruction) =>
            `${instruction.presetName ?? "local"}::${instruction.name}`,
        ),
      ).size;
      const uniqueHookCount = countHooks(hooks);
      const uniqueSkillCount = skillsToInstall.length;
      const uniqueAgentCount = agentsToInstall.length;

      return {
        success: true,
        installedInstructionCount: uniqueInstructionCount,
        installedHookCount: uniqueHookCount,
        installedSkillCount: uniqueSkillCount,
        installedAgentCount: uniqueAgentCount,
        packagesCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedInstructionCount: 0,
        installedHookCount: 0,
        installedSkillCount: 0,
        installedAgentCount: 0,
        packagesCount: 0,
      };
    }
  });
}

/**
 * Core implementation of the instruction installation logic
 */
export async function install(
  options: InstallOptions = {},
): Promise<InstallResult> {
  const cwd = options.cwd || process.cwd();
  const installOnCI = options.installOnCI === true; // Default to false if not specified

  const inCI = isCIEnvironment();
  if (inCI && !installOnCI) {
    console.log(chalk.yellow("Detected CI environment, skipping install."));

    return {
      success: true,
      installedInstructionCount: 0,
      installedHookCount: 0,
      installedSkillCount: 0,
      installedAgentCount: 0,
      packagesCount: 0,
    };
  }

  return withWorkingDirectory(cwd, async () => {
    let resolvedConfig: ResolvedConfig | null;

    if (options.config) {
      resolvedConfig = options.config;
    } else {
      resolvedConfig = await loadConfig(cwd);
    }

    const shouldUseWorkspaces =
      resolvedConfig?.config.workspaces ||
      (!resolvedConfig && detectWorkspacesFromPackageJson(cwd));

    if (shouldUseWorkspaces) {
      return await installWorkspaces(
        cwd,
        installOnCI,
        options.verbose,
        options.dryRun,
      );
    }

    return installPackage(options);
  });
}

/**
 * CLI command wrapper for install
 */
export async function installCommand(
  installOnCI?: boolean,
  verbose?: boolean,
  dryRun?: boolean,
): Promise<void> {
  const result = await install({ installOnCI, verbose, dryRun });

  if (!result.success) {
    throw result.error ?? new Error("Installation failed with unknown error");
  } else {
    const instructionCount = result.installedInstructionCount;
    const hookCount = result.installedHookCount;
    const skillCount = result.installedSkillCount;
    const agentCount = result.installedAgentCount;
    const instructionMessage =
      instructionCount > 0
        ? `${instructionCount} instruction${instructionCount === 1 ? "" : "s"}`
        : null;
    const hookMessage =
      hookCount > 0 ? `${hookCount} hook${hookCount === 1 ? "" : "s"}` : null;
    const skillMessage =
      skillCount > 0
        ? `${skillCount} skill${skillCount === 1 ? "" : "s"}`
        : null;
    const agentMessage =
      agentCount > 0
        ? `${agentCount} agent${agentCount === 1 ? "" : "s"}`
        : null;
    const countsParts: string[] = [];
    if (instructionMessage) {
      countsParts.push(instructionMessage);
    }
    if (hookMessage) {
      countsParts.push(hookMessage);
    }
    if (skillMessage) {
      countsParts.push(skillMessage);
    }
    if (agentMessage) {
      countsParts.push(agentMessage);
    }
    const countsMessage =
      countsParts.length > 0
        ? countsParts.join(", ").replace(/, ([^,]*)$/, " and $1")
        : "0 instructions";

    if (dryRun) {
      if (result.packagesCount > 1) {
        console.log(
          `Dry run: validated ${countsMessage} across ${result.packagesCount} packages`,
        );
      } else {
        console.log(`Dry run: validated ${countsMessage}`);
      }
    } else if (
      instructionCount === 0 &&
      hookCount === 0 &&
      skillCount === 0 &&
      agentCount === 0
    ) {
      console.log("No instructions, hooks, skills, or agents installed");
    } else if (result.packagesCount > 1) {
      console.log(
        `Successfully installed ${countsMessage} across ${result.packagesCount} packages`,
      );
    } else {
      console.log(`Successfully installed ${countsMessage}`);
    }
  }
}
