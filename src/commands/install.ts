import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  loadConfig,
  ResolvedConfig,
  SkillFile,
  AgentFile,
  MCPServers,
  detectWorkspacesFromPackageJson,
} from "../utils/config";
import {
  HooksJson,
  HookFile,
  countHooks,
  writeHooksToCursor,
  writeHooksToClaudeCode,
} from "../utils/hooks";
import {
  InstructionFile,
  extractInstructionTitle,
} from "../utils/instructions";
import { writeInstructionsFile } from "../utils/instructions-file";
import { withWorkingDirectory } from "../utils/working-directory";
import { isCIEnvironment } from "../utils/is-ci";
import { installWorkspaces } from "./install-workspaces";
import { log } from "../utils/log";

export interface InstallOptions {
  cwd?: string;
  config?: ResolvedConfig;
  installOnCI?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
}

export interface InstallResult {
  success: boolean;
  error?: Error;
  installedInstructionCount: number;
  installedHookCount: number;
  installedSkillCount: number;
  installedAgentCount: number;
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
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
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

  const hasAgentsMd = targetFiles.includes("AGENTS.md");
  const hasClaudeMd = targetFiles.includes("CLAUDE.md");

  for (const targetFile of targetFiles) {
    // When both AGENTS.md and CLAUDE.md are targets, only write full content to AGENTS.md
    // CLAUDE.md gets a pointer (@AGENTS.md) if it doesn't already exist
    if (hasAgentsMd && hasClaudeMd && targetFile === "CLAUDE.md") {
      const resolvedPath = resolveTargetPath(targetFile, cwd);
      if (!fs.existsSync(resolvedPath)) {
        fs.ensureDirSync(path.dirname(resolvedPath));
        fs.writeFileSync(resolvedPath, "@AGENTS.md\n");
      }
      // If CLAUDE.md already exists, leave it untouched
      continue;
    }

    const resolvedPath = resolveTargetPath(targetFile, cwd);
    writeInstructionsFile(content, resolvedPath);
  }

  for (const file of progressiveFiles) {
    const resolvedPath = resolveTargetPath(file.relativePath, cwd);
    fs.ensureDirSync(path.dirname(resolvedPath));
    fs.writeFileSync(resolvedPath, file.content);
  }
}

export function writeMcpServersToFile(
  mcpServers: MCPServers,
  mcpPath: string,
): void {
  fs.ensureDirSync(path.dirname(mcpPath));

  const existingConfig: Record<string, unknown> = fs.existsSync(mcpPath)
    ? fs.readJsonSync(mcpPath)
    : {};

  const existingServers =
    (existingConfig?.mcpServers as Record<string, Record<string, unknown>>) ??
    {};

  // Keep only user-defined servers (those without aicm: true)
  const userServers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existingServers)) {
    if (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).aicm !== true
    ) {
      userServers[key] = value;
    }
  }

  // Mark aicm servers and filter out canceled (false) ones
  const aicmServers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mcpServers)) {
    if (value !== false) {
      aicmServers[key] = { ...value, aicm: true };
    }
  }

  const mergedConfig = {
    ...existingConfig,
    mcpServers: { ...userServers, ...aicmServers },
  };

  fs.writeJsonSync(mcpPath, mergedConfig, { spaces: 2 });
}

export function writeMcpServersToOpenCode(
  mcpServers: MCPServers,
  mcpPath: string,
): void {
  fs.ensureDirSync(path.dirname(mcpPath));

  const existingConfig: Record<string, unknown> = fs.existsSync(mcpPath)
    ? fs.readJsonSync(mcpPath)
    : {};

  const existingMcp =
    (existingConfig?.mcp as Record<string, Record<string, unknown>>) ?? {};

  // Keep only user-defined servers (those without aicm marker)
  const userServers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existingMcp)) {
    if (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).aicm !== true
    ) {
      userServers[key] = value;
    }
  }

  // Convert aicm MCP format to OpenCode format
  const aicmServers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mcpServers)) {
    if (value === false) continue;

    if (value.url) {
      aicmServers[key] = {
        type: "remote",
        url: value.url,
        enabled: true,
        ...(value.env ? { environment: value.env } : {}),
        aicm: true,
      };
    } else if (value.command) {
      const command = [value.command, ...(value.args || [])];
      aicmServers[key] = {
        type: "local",
        command,
        enabled: true,
        ...(value.env ? { environment: value.env } : {}),
        aicm: true,
      };
    }
  }

  const mergedConfig = {
    ...existingConfig,
    mcp: { ...userServers, ...aicmServers },
  };

  fs.writeJsonSync(mcpPath, mergedConfig, { spaces: 2 });
}

export function writeMcpServersToCodex(
  mcpServers: MCPServers,
  mcpPath: string,
): void {
  fs.ensureDirSync(path.dirname(mcpPath));

  // Read existing TOML config
  let existingConfig: Record<string, unknown> = {};
  const managedServerNames = new Set<string>();
  if (fs.existsSync(mcpPath)) {
    try {
      const rawContent = fs.readFileSync(mcpPath, "utf8");

      // Detect aicm-managed servers from comment markers
      const lines = rawContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === "# aicm:managed") {
          const match = lines[i + 1]?.match(/^\[mcp_servers\.("?)(.+)\1\]$/);
          if (match) managedServerNames.add(match[2]);
        }
      }

      existingConfig = parseToml(rawContent) as Record<string, unknown>;
    } catch {
      // If we can't parse, start fresh
      existingConfig = {};
    }
  }

  const existingServers =
    (existingConfig.mcp_servers as Record<string, Record<string, unknown>>) ??
    {};

  // Keep only user-defined servers (skip comment-marked and legacy aicm:true)
  const userServers: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(existingServers)) {
    if (managedServerNames.has(key)) continue;
    if (
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).aicm === true
    ) {
      continue;
    }
    userServers[key] = value as Record<string, unknown>;
  }

  // Convert aicm MCP format to Codex TOML format
  const aicmNames: string[] = [];
  const aicmServers: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(mcpServers)) {
    if (value === false) continue;
    aicmNames.push(key);

    if (value.url) {
      aicmServers[key] = {
        url: value.url,
        ...(value.env ? { env: value.env } : {}),
      };
    } else if (value.command) {
      aicmServers[key] = {
        command: value.command,
        ...(value.args && value.args.length > 0 ? { args: value.args } : {}),
        ...(value.env ? { env: value.env } : {}),
      };
    }
  }

  const mergedConfig = {
    ...existingConfig,
    mcp_servers: { ...userServers, ...aicmServers },
  };

  let tomlContent = stringifyToml(mergedConfig);

  // Add comment markers before aicm-managed server sections
  for (const name of aicmNames) {
    const bare = `[mcp_servers.${name}]`;
    const quoted = `[mcp_servers."${name}"]`;
    if (tomlContent.includes(bare)) {
      tomlContent = tomlContent.replace(bare, `# aicm:managed\n${bare}`);
    } else if (tomlContent.includes(quoted)) {
      tomlContent = tomlContent.replace(quoted, `# aicm:managed\n${quoted}`);
    }
  }

  fs.writeFileSync(mcpPath, tomlContent);
}

function writeMcpServersToTargets(
  mcpServers: MCPServers,
  targets: string[],
  cwd: string,
): void {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return;
  for (const target of targets) {
    const resolvedPath = resolveTargetPath(target, cwd);
    const basename = path.basename(target);

    if (basename === "opencode.json") {
      writeMcpServersToOpenCode(mcpServers, resolvedPath);
    } else if (target === ".codex/config.toml" || basename === "config.toml") {
      writeMcpServersToCodex(mcpServers, resolvedPath);
    } else {
      // Default: Cursor (.cursor/mcp.json) and Claude Code (.mcp.json) format
      writeMcpServersToFile(mcpServers, resolvedPath);
    }
  }
}

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
      const skillTargetPath = path.join(resolvedDir, skill.name);
      if (fs.existsSync(skillTargetPath)) fs.removeSync(skillTargetPath);
      fs.copySync(skill.sourcePath, skillTargetPath);

      const metadata: Record<string, unknown> = { source: skill.source };
      if (skill.presetName) metadata.presetName = skill.presetName;
      fs.writeJsonSync(path.join(skillTargetPath, ".aicm.json"), metadata, {
        spaces: 2,
      });
    }
  }
}

export function writeSubagentsToTargets(
  agents: AgentFile[],
  targetDirs: string[],
  cwd: string,
): void {
  if (agents.length === 0) return;

  for (const targetDir of targetDirs) {
    const targetAgentsDir = resolveTargetPath(targetDir, cwd);
    fs.ensureDirSync(targetAgentsDir);

    const metadataPath = path.join(targetAgentsDir, ".aicm.json");
    if (fs.existsSync(metadataPath)) {
      const existing = fs.readJsonSync(metadataPath) as {
        managedAgents?: string[];
      };

      for (const agentName of existing.managedAgents || []) {
        if (agentName.includes("/") || agentName.includes("\\")) {
          log.warn(
            `Warning: Skipping invalid agent name "${agentName}" (contains path separator)`,
          );
          continue;
        }
        const fullPath = path.join(targetAgentsDir, agentName + ".md");
        if (fs.existsSync(fullPath)) fs.removeSync(fullPath);
      }
    }

    const managedAgents: string[] = [];
    for (const agent of agents) {
      const agentName = path.basename(agent.name, path.extname(agent.name));
      fs.writeFileSync(
        path.join(targetAgentsDir, agentName + ".md"),
        agent.content,
      );
      managedAgents.push(agentName);
    }

    fs.writeJsonSync(metadataPath, { managedAgents }, { spaces: 2 });
  }
}

export function warnPresetSkillCollisions(skills: SkillFile[]): void {
  const seen = new Map<string, { presets: Set<string>; last: string }>();
  for (const skill of skills) {
    if (!skill.presetName) continue;
    const entry = seen.get(skill.name);
    if (entry) {
      entry.presets.add(skill.presetName);
      entry.last = skill.presetName;
    } else {
      seen.set(skill.name, {
        presets: new Set([skill.presetName]),
        last: skill.presetName,
      });
    }
  }

  for (const [name, { presets, last }] of seen) {
    if (presets.size > 1) {
      const list = Array.from(presets).sort().join(", ");
      console.warn(
        chalk.yellow(
          `Warning: multiple presets provide the "${name}" skill (${list}). Using definition from ${last}.`,
        ),
      );
    }
  }
}

export function warnPresetAgentCollisions(agents: AgentFile[]): void {
  const seen = new Map<string, { presets: Set<string>; last: string }>();
  for (const agent of agents) {
    if (!agent.presetName) continue;
    const entry = seen.get(agent.name);
    if (entry) {
      entry.presets.add(agent.presetName);
      entry.last = agent.presetName;
    } else {
      seen.set(agent.name, {
        presets: new Set([agent.presetName]),
        last: agent.presetName,
      });
    }
  }

  for (const [name, { presets, last }] of seen) {
    if (presets.size > 1) {
      const list = Array.from(presets).sort().join(", ");
      console.warn(
        chalk.yellow(
          `Warning: multiple presets provide the "${name}" agent (${list}). Using definition from ${last}.`,
        ),
      );
    }
  }
}

export function dedupeSkillsForInstall(skills: SkillFile[]): SkillFile[] {
  const unique = new Map<string, SkillFile>();
  for (const skill of skills) unique.set(skill.name, skill);
  return Array.from(unique.values());
}

export function dedupeAgentsForInstall(agents: AgentFile[]): AgentFile[] {
  const unique = new Map<string, AgentFile>();
  for (const agent of agents) unique.set(agent.name, agent);
  return Array.from(unique.values());
}

function writeHooksToTargets(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  targets: string[],
  cwd: string,
): void {
  const hookCount = countHooks(hooksConfig);
  if (hookCount === 0 && hookFiles.length === 0) return;

  for (const target of targets) {
    const targetPath = resolveTargetPath(target, cwd);
    if (path.basename(targetPath) === ".cursor") {
      writeHooksToCursor(hooksConfig, hookFiles, path.dirname(targetPath));
    } else if (path.basename(targetPath) === ".claude") {
      writeHooksToClaudeCode(hooksConfig, hookFiles, path.dirname(targetPath));
    }
  }
}

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
        writeSubagentsToTargets(agentsToInstall, config.targets.agents, cwd);

        if (mcpServers && Object.keys(mcpServers).length > 0) {
          writeMcpServersToTargets(mcpServers, config.targets.mcp, cwd);
        }

        const hooksCount = countHooks(hooks);
        if (hooksCount > 0 || hookFiles.length > 0) {
          writeHooksToTargets(hooks, hookFiles, config.targets.hooks, cwd);
        }
      }

      const uniqueInstructionCount = new Set(
        instructions.map((i) => `${i.presetName ?? "local"}::${i.name}`),
      ).size;
      const uniqueHookCount = countHooks(hooks);

      return {
        success: true,
        installedInstructionCount: uniqueInstructionCount,
        installedHookCount: uniqueHookCount,
        installedSkillCount: skillsToInstall.length,
        installedAgentCount: agentsToInstall.length,
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

export async function install(
  options: InstallOptions = {},
): Promise<InstallResult> {
  const cwd = options.cwd || process.cwd();
  const installOnCI = options.installOnCI === true;

  if (isCIEnvironment() && !installOnCI) {
    log.info(chalk.yellow("Detected CI environment, skipping install."));
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
      return installWorkspaces(
        cwd,
        installOnCI,
        options.verbose,
        options.dryRun,
      );
    }

    return installPackage(options);
  });
}

export async function installCommand(
  installOnCI?: boolean,
  verbose?: boolean,
  dryRun?: boolean,
): Promise<void> {
  const result = await install({ installOnCI, verbose, dryRun });

  if (!result.success) {
    throw result.error ?? new Error("Installation failed with unknown error");
  }

  const {
    installedInstructionCount,
    installedHookCount,
    installedSkillCount,
    installedAgentCount,
  } = result;
  const parts: string[] = [];
  if (installedInstructionCount > 0)
    parts.push(
      `${installedInstructionCount} instruction${installedInstructionCount === 1 ? "" : "s"}`,
    );
  if (installedHookCount > 0)
    parts.push(
      `${installedHookCount} hook${installedHookCount === 1 ? "" : "s"}`,
    );
  if (installedSkillCount > 0)
    parts.push(
      `${installedSkillCount} skill${installedSkillCount === 1 ? "" : "s"}`,
    );
  if (installedAgentCount > 0)
    parts.push(
      `${installedAgentCount} agent${installedAgentCount === 1 ? "" : "s"}`,
    );

  const countsMessage =
    parts.length > 0
      ? parts.join(", ").replace(/, ([^,]*)$/, " and $1")
      : "0 instructions";

  if (dryRun) {
    if (result.packagesCount > 1) {
      log.info(
        `Dry run: validated ${countsMessage} across ${result.packagesCount} packages`,
      );
    } else {
      log.info(`Dry run: validated ${countsMessage}`);
    }
  } else if (
    installedInstructionCount === 0 &&
    installedHookCount === 0 &&
    installedSkillCount === 0 &&
    installedAgentCount === 0
  ) {
    log.info("No instructions, hooks, skills, or agents installed");
  } else if (result.packagesCount > 1) {
    log.info(
      `Successfully installed ${countsMessage} across ${result.packagesCount} packages`,
    );
  } else {
    log.info(`Successfully installed ${countsMessage}`);
  }
}
