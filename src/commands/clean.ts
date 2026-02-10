import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { checkWorkspacesEnabled } from "../utils/config";
import { withWorkingDirectory } from "../utils/working-directory";
import { removeInstructionsBlock } from "../utils/instructions-file";
import { discoverPackagesWithAicm } from "../utils/workspace-discovery";
import { log } from "../utils/log";

interface CleanResult {
  success: boolean;
  cleanedCount: number;
}

function cleanFile(filePath: string, verbose: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    fs.removeSync(filePath);
    if (verbose) log.info(chalk.gray(`  Removed ${filePath}`));
    return true;
  } catch {
    log.warn(`Warning: Failed to remove ${filePath}`);
    return false;
  }
}

function cleanInstructionsBlock(filePath: string, verbose: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const cleaned = removeInstructionsBlock(content);
    if (content === cleaned) return false;

    if (cleaned.trim() === "") {
      fs.removeSync(filePath);
      if (verbose) log.info(chalk.gray(`  Removed empty file ${filePath}`));
    } else {
      fs.writeFileSync(filePath, cleaned);
      if (verbose)
        log.info(chalk.gray(`  Cleaned instructions block from ${filePath}`));
    }
    return true;
  } catch {
    log.warn(`Warning: Failed to clean ${filePath}`);
    return false;
  }
}

function cleanMcpServers(cwd: string, verbose: boolean): boolean {
  const mcpPaths = [
    path.join(cwd, ".cursor", "mcp.json"),
    path.join(cwd, ".mcp.json"),
  ];
  let cleanedAny = false;

  for (const mcpPath of mcpPaths) {
    if (!fs.existsSync(mcpPath)) continue;
    try {
      const content = fs.readJsonSync(mcpPath);
      const servers = content.mcpServers;
      if (!servers) continue;

      let hasChanges = false;
      const userServers: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(servers)) {
        if (
          typeof value === "object" &&
          value !== null &&
          (value as Record<string, unknown>).aicm === true
        ) {
          hasChanges = true;
        } else {
          userServers[key] = value;
        }
      }

      if (!hasChanges) continue;

      if (
        Object.keys(userServers).length === 0 &&
        Object.keys(content).length === 1
      ) {
        fs.removeSync(mcpPath);
        if (verbose) log.info(chalk.gray(`  Removed empty ${mcpPath}`));
      } else {
        content.mcpServers = userServers;
        fs.writeJsonSync(mcpPath, content, { spaces: 2 });
        if (verbose)
          log.info(chalk.gray(`  Cleaned aicm MCP servers from ${mcpPath}`));
      }
      cleanedAny = true;
    } catch {
      log.warn(`Warning: Failed to clean MCP servers`);
    }
  }

  return cleanedAny;
}

function cleanOpenCodeMcp(cwd: string, verbose: boolean): boolean {
  const mcpPath = path.join(cwd, "opencode.json");
  if (!fs.existsSync(mcpPath)) return false;

  try {
    const content = fs.readJsonSync(mcpPath);
    const mcp = content.mcp as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!mcp) return false;

    let hasChanges = false;
    const userServers: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mcp)) {
      if (
        typeof value === "object" &&
        value !== null &&
        (value as Record<string, unknown>).aicm === true
      ) {
        hasChanges = true;
      } else {
        userServers[key] = value;
      }
    }

    if (!hasChanges) return false;

    if (
      Object.keys(userServers).length === 0 &&
      Object.keys(content).length === 1
    ) {
      fs.removeSync(mcpPath);
      if (verbose) log.info(chalk.gray(`  Removed empty ${mcpPath}`));
    } else {
      content.mcp = userServers;
      fs.writeJsonSync(mcpPath, content, { spaces: 2 });
      if (verbose)
        log.info(chalk.gray(`  Cleaned aicm MCP servers from ${mcpPath}`));
    }
    return true;
  } catch {
    log.warn(`Warning: Failed to clean OpenCode MCP servers`);
    return false;
  }
}

function cleanCodexMcp(cwd: string, verbose: boolean): boolean {
  const mcpPath = path.join(cwd, ".codex", "config.toml");
  if (!fs.existsSync(mcpPath)) return false;

  try {
    const rawContent = fs.readFileSync(mcpPath, "utf8");

    // Detect aicm-managed servers from comment markers
    const managedServerNames = new Set<string>();
    const lines = rawContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "# aicm:managed") {
        const match = lines[i + 1]?.match(/^\[mcp_servers\.("?)(.+)\1\]$/);
        if (match) managedServerNames.add(match[2]);
      }
    }

    const config = parseToml(rawContent) as Record<string, unknown>;
    const mcpServers = config.mcp_servers as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (!mcpServers) return false;

    // Also detect legacy aicm property marker
    for (const [key, value] of Object.entries(mcpServers)) {
      if (
        typeof value === "object" &&
        value !== null &&
        (value as Record<string, unknown>).aicm === true
      ) {
        managedServerNames.add(key);
      }
    }

    if (managedServerNames.size === 0) return false;

    const userServers: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(mcpServers)) {
      if (!managedServerNames.has(key)) {
        userServers[key] = value as Record<string, unknown>;
      }
    }

    if (
      Object.keys(userServers).length === 0 &&
      Object.keys(config).length === 1
    ) {
      fs.removeSync(mcpPath);
      if (verbose) log.info(chalk.gray(`  Removed empty ${mcpPath}`));
    } else {
      config.mcp_servers = userServers;
      const tomlContent = stringifyToml(config);
      fs.writeFileSync(mcpPath, tomlContent);
      if (verbose)
        log.info(chalk.gray(`  Cleaned aicm MCP servers from ${mcpPath}`));
    }
    return true;
  } catch {
    log.warn(`Warning: Failed to clean Codex MCP servers`);
    return false;
  }
}

function cleanCursorHooks(cwd: string, verbose: boolean): boolean {
  const hooksJsonPath = path.join(cwd, ".cursor", "hooks.json");
  const hooksDir = path.join(cwd, ".cursor", "hooks", "aicm");
  let hasChanges = false;

  if (fs.existsSync(hooksDir)) {
    fs.removeSync(hooksDir);
    if (verbose) log.info(chalk.gray(`  Removed ${hooksDir}`));
    hasChanges = true;
  }

  if (fs.existsSync(hooksJsonPath)) {
    try {
      const content: {
        version?: number;
        hooks?: Record<string, Array<{ command?: string }>>;
      } = fs.readJsonSync(hooksJsonPath);

      const userConfig: typeof content = {
        version: content.version || 1,
        hooks: {},
      };
      let removedAny = false;

      if (content.hooks) {
        for (const [hookType, hookCommands] of Object.entries(content.hooks)) {
          if (Array.isArray(hookCommands)) {
            const userCommands = hookCommands.filter(
              (cmd) => !cmd.command || !cmd.command.includes("hooks/aicm/"),
            );
            if (userCommands.length < hookCommands.length) removedAny = true;
            if (userCommands.length > 0) {
              userConfig.hooks![hookType] = userCommands;
            }
          }
        }
      }

      if (removedAny) {
        const hasUserHooks =
          userConfig.hooks && Object.keys(userConfig.hooks).length > 0;
        if (!hasUserHooks) {
          fs.removeSync(hooksJsonPath);
          if (verbose) log.info(chalk.gray(`  Removed empty ${hooksJsonPath}`));
        } else {
          fs.writeJsonSync(hooksJsonPath, userConfig, { spaces: 2 });
          if (verbose)
            log.info(chalk.gray(`  Cleaned aicm hooks from ${hooksJsonPath}`));
        }
        hasChanges = true;
      }
    } catch {
      log.warn(`Warning: Failed to clean hooks.json`);
    }
  }

  return hasChanges;
}

function cleanClaudeCodeHooks(cwd: string, verbose: boolean): boolean {
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const hooksDir = path.join(cwd, ".claude", "hooks", "aicm");
  let hasChanges = false;

  if (fs.existsSync(hooksDir)) {
    fs.removeSync(hooksDir);
    if (verbose) log.info(chalk.gray(`  Removed ${hooksDir}`));
    hasChanges = true;
  }

  if (fs.existsSync(settingsPath)) {
    try {
      const settings: Record<string, unknown> = fs.readJsonSync(settingsPath);
      const hooks = settings.hooks as Record<string, unknown[]> | undefined;

      if (hooks) {
        const userHooks: Record<string, unknown[]> = {};
        let removedAny = false;

        for (const [eventName, matcherGroups] of Object.entries(hooks)) {
          if (Array.isArray(matcherGroups)) {
            const userGroups = matcherGroups.filter((group) => {
              if (typeof group !== "object" || group === null) return true;
              const g = group as Record<string, unknown>;
              if (!Array.isArray(g.hooks)) return true;
              return !g.hooks.some(
                (h: unknown) =>
                  typeof h === "object" &&
                  h !== null &&
                  typeof (h as Record<string, unknown>).command === "string" &&
                  ((h as Record<string, unknown>).command as string).includes(
                    "hooks/aicm/",
                  ),
              );
            });
            if (userGroups.length < matcherGroups.length) removedAny = true;
            if (userGroups.length > 0) userHooks[eventName] = userGroups;
          }
        }

        if (removedAny) {
          if (Object.keys(userHooks).length > 0) {
            settings.hooks = userHooks;
          } else {
            delete settings.hooks;
          }

          if (Object.keys(settings).length === 0) {
            fs.removeSync(settingsPath);
            if (verbose)
              log.info(chalk.gray(`  Removed empty ${settingsPath}`));
          } else {
            fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
            if (verbose)
              log.info(chalk.gray(`  Cleaned aicm hooks from ${settingsPath}`));
          }
          hasChanges = true;
        }
      }
    } catch {
      log.warn(`Warning: Failed to clean Claude Code settings.json`);
    }
  }

  return hasChanges;
}

function cleanSkills(cwd: string, verbose: boolean): number {
  let cleanedCount = 0;
  const skillsDirs = [
    path.join(cwd, ".agents", "skills"),
    path.join(cwd, ".cursor", "skills"),
    path.join(cwd, ".claude", "skills"),
    path.join(cwd, ".opencode", "skills"),
  ];

  for (const dir of skillsDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(dir, entry.name);
        if (fs.existsSync(path.join(skillPath, ".aicm.json"))) {
          fs.removeSync(skillPath);
          if (verbose) log.info(chalk.gray(`  Removed skill ${skillPath}`));
          cleanedCount++;
          continue;
        }

        // LEGACY(v0->v1): clean old namespaced skill layout (<target>/skills/aicm/<skill>/).
        // Keep this block temporarily so `aicm clean` can remove pre-migration installs.
        if (
          entry.name === "aicm" &&
          !fs.existsSync(path.join(skillPath, "SKILL.md"))
        ) {
          const namespacedEntries = fs.readdirSync(skillPath, {
            withFileTypes: true,
          });
          for (const namespacedEntry of namespacedEntries) {
            if (!namespacedEntry.isDirectory()) continue;
            const namespacedSkillPath = path.join(
              skillPath,
              namespacedEntry.name,
            );
            if (fs.existsSync(path.join(namespacedSkillPath, ".aicm.json"))) {
              fs.removeSync(namespacedSkillPath);
              if (verbose)
                log.info(chalk.gray(`  Removed skill ${namespacedSkillPath}`));
              cleanedCount++;
            }
          }
          if (
            fs.existsSync(skillPath) &&
            fs.readdirSync(skillPath).length === 0
          ) {
            fs.removeSync(skillPath);
            if (verbose) log.info(chalk.gray(`  Removed ${skillPath}`));
          }
        }
      }
      if (fs.readdirSync(dir).length === 0) {
        fs.removeSync(dir);
        if (verbose) log.info(chalk.gray(`  Removed empty directory ${dir}`));
      }
    } catch {
      log.warn(`Warning: Failed to clean skills in ${dir}`);
    }
  }

  return cleanedCount;
}

function cleanAgents(cwd: string, verbose: boolean): number {
  let cleanedCount = 0;
  const agentsDirs = [
    path.join(cwd, ".agents", "agents"),
    path.join(cwd, ".cursor", "agents"),
    path.join(cwd, ".claude", "agents"),
    path.join(cwd, ".opencode", "agents"),
  ];

  for (const dir of agentsDirs) {
    const metadataPath = path.join(dir, ".aicm.json");
    if (!fs.existsSync(metadataPath)) continue;

    try {
      const metadata = fs.readJsonSync(metadataPath) as {
        managedAgents?: string[];
      };
      for (const agentName of metadata.managedAgents || []) {
        if (agentName.includes("/") || agentName.includes("\\")) {
          log.warn(
            `Warning: Skipping invalid agent name "${agentName}" (contains path separator)`,
          );
          continue;
        }
        const fullPath = path.join(dir, agentName + ".md");
        if (fs.existsSync(fullPath)) {
          fs.removeSync(fullPath);
          if (verbose) log.info(chalk.gray(`  Removed agent ${fullPath}`));
          cleanedCount++;
        }
      }
      fs.removeSync(metadataPath);
      if (verbose) log.info(chalk.gray(`  Removed ${metadataPath}`));

      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.removeSync(dir);
        if (verbose) log.info(chalk.gray(`  Removed empty directory ${dir}`));
      }
    } catch {
      log.warn(`Warning: Failed to clean agents in ${dir}`);
    }
  }

  return cleanedCount;
}

function cleanEmptyDirectories(cwd: string, verbose: boolean): number {
  let cleanedCount = 0;
  const dirsToCheck = [
    path.join(cwd, ".cursor", "hooks"),
    path.join(cwd, ".cursor", "skills"),
    path.join(cwd, ".cursor", "agents"),
    path.join(cwd, ".cursor"),
    path.join(cwd, ".agents", "skills"),
    path.join(cwd, ".agents", "agents"),
    path.join(cwd, ".agents", "instructions"),
    path.join(cwd, ".agents"),
    path.join(cwd, ".claude", "hooks"),
    path.join(cwd, ".claude", "skills"),
    path.join(cwd, ".claude", "agents"),
    path.join(cwd, ".claude"),
    path.join(cwd, ".opencode", "skills"),
    path.join(cwd, ".opencode", "agents"),
    path.join(cwd, ".opencode"),
    path.join(cwd, ".codex"),
  ];

  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) continue;
    try {
      if (fs.readdirSync(dir).length === 0) {
        fs.removeSync(dir);
        if (verbose) log.info(chalk.gray(`  Removed empty directory ${dir}`));
        cleanedCount++;
      }
    } catch {
      // ignore
    }
  }

  return cleanedCount;
}

async function cleanPackage(
  cwd: string,
  verbose: boolean,
): Promise<CleanResult> {
  return withWorkingDirectory(cwd, async () => {
    let cleanedCount = 0;

    if (cleanFile(path.join(cwd, ".agents", "instructions"), verbose))
      cleanedCount++;

    if (cleanInstructionsBlock(path.join(cwd, "AGENTS.md"), verbose))
      cleanedCount++;

    // For CLAUDE.md: if it's only the @AGENTS.md pointer created by aicm, remove entirely
    const claudeMdPath = path.join(cwd, "CLAUDE.md");
    if (fs.existsSync(claudeMdPath)) {
      const claudeContent = fs.readFileSync(claudeMdPath, "utf8");
      if (claudeContent.trim() === "@AGENTS.md") {
        fs.removeSync(claudeMdPath);
        if (verbose)
          log.info(chalk.gray(`  Removed pointer file ${claudeMdPath}`));
        cleanedCount++;
      } else if (cleanInstructionsBlock(claudeMdPath, verbose)) {
        cleanedCount++;
      }
    }

    if (cleanMcpServers(cwd, verbose)) cleanedCount++;
    if (cleanOpenCodeMcp(cwd, verbose)) cleanedCount++;
    if (cleanCodexMcp(cwd, verbose)) cleanedCount++;
    if (cleanCursorHooks(cwd, verbose)) cleanedCount++;
    if (cleanClaudeCodeHooks(cwd, verbose)) cleanedCount++;
    cleanedCount += cleanSkills(cwd, verbose);
    cleanedCount += cleanAgents(cwd, verbose);
    cleanedCount += cleanEmptyDirectories(cwd, verbose);

    return { success: true, cleanedCount };
  });
}

async function cleanWorkspaces(
  cwd: string,
  verbose: boolean,
): Promise<CleanResult> {
  const packages = await discoverPackagesWithAicm(cwd);
  let totalCleaned = 0;

  for (const pkg of packages) {
    if (verbose) log.info(chalk.blue(`Cleaning package: ${pkg.relativePath}`));
    const result = await cleanPackage(pkg.absolutePath, verbose);
    totalCleaned += result.cleanedCount;
  }

  const rootPackage = packages.find((p) => p.absolutePath === cwd);
  if (!rootPackage) {
    const rootResult = await cleanPackage(cwd, verbose);
    totalCleaned += rootResult.cleanedCount;
  }

  return { success: true, cleanedCount: totalCleaned };
}

export async function cleanCommand(verbose?: boolean): Promise<void> {
  const cwd = process.cwd();
  const v = verbose || false;

  const shouldUseWorkspaces = await checkWorkspacesEnabled(cwd);
  const result = shouldUseWorkspaces
    ? await cleanWorkspaces(cwd, v)
    : await cleanPackage(cwd, v);

  if (result.cleanedCount === 0) {
    log.info("Nothing to clean.");
  } else {
    log.info(
      chalk.green(
        `Successfully cleaned ${result.cleanedCount} file(s)/director(y/ies).`,
      ),
    );
  }
}
