import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { checkWorkspacesEnabled } from "../utils/config";
import { withWorkingDirectory } from "../utils/working-directory";
import { removeInstructionsBlock } from "../utils/instructions-file";
import { discoverPackagesWithAicm } from "../utils/workspace-discovery";

export interface CleanOptions {
  /**
   * Base directory to use instead of process.cwd()
   */
  cwd?: string;
  /**
   * Show verbose output
   */
  verbose?: boolean;
}

export interface CleanResult {
  success: boolean;
  error?: Error;
  cleanedCount: number;
}

function cleanFile(filePath: string, verbose: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;

  try {
    fs.removeSync(filePath);
    if (verbose) console.log(chalk.gray(`  Removed ${filePath}`));
    return true;
  } catch {
    console.warn(chalk.yellow(`Warning: Failed to remove ${filePath}`));
    return false;
  }
}

function cleanInstructionsBlock(filePath: string, verbose: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const cleanedContent = removeInstructionsBlock(content);

    if (content === cleanedContent) return false;

    if (cleanedContent.trim() === "") {
      fs.removeSync(filePath);
      if (verbose) console.log(chalk.gray(`  Removed empty file ${filePath}`));
    } else {
      fs.writeFileSync(filePath, cleanedContent);
      if (verbose)
        console.log(
          chalk.gray(`  Cleaned instructions block from ${filePath}`),
        );
    }
    return true;
  } catch {
    console.warn(chalk.yellow(`Warning: Failed to clean ${filePath}`));
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
      const mcpServers = content.mcpServers;

      if (!mcpServers) continue;

      let hasChanges = false;
      const newMcpServers: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(mcpServers)) {
        if (
          typeof value === "object" &&
          value !== null &&
          "aicm" in value &&
          value.aicm === true
        ) {
          hasChanges = true;
        } else {
          newMcpServers[key] = value;
        }
      }

      if (!hasChanges) continue;

      if (
        Object.keys(newMcpServers).length === 0 &&
        Object.keys(content).length === 1
      ) {
        fs.removeSync(mcpPath);
        if (verbose) console.log(chalk.gray(`  Removed empty ${mcpPath}`));
      } else {
        content.mcpServers = newMcpServers;
        fs.writeJsonSync(mcpPath, content, { spaces: 2 });
        if (verbose)
          console.log(chalk.gray(`  Cleaned aicm MCP servers from ${mcpPath}`));
      }
      cleanedAny = true;
    } catch {
      console.warn(chalk.yellow(`Warning: Failed to clean MCP servers`));
    }
  }

  return cleanedAny;
}

function cleanCursorHooks(cwd: string, verbose: boolean): boolean {
  const hooksJsonPath = path.join(cwd, ".cursor", "hooks.json");
  const hooksDir = path.join(cwd, ".cursor", "hooks", "aicm");

  let hasChanges = false;

  // Clean hooks directory
  if (fs.existsSync(hooksDir)) {
    fs.removeSync(hooksDir);
    if (verbose) console.log(chalk.gray(`  Removed ${hooksDir}`));
    hasChanges = true;
  }

  // Clean hooks.json
  if (fs.existsSync(hooksJsonPath)) {
    try {
      const content: {
        version?: number;
        hooks?: Record<string, Array<{ command?: string }>>;
      } = fs.readJsonSync(hooksJsonPath);

      // Filter out aicm-managed hooks (those pointing to hooks/aicm/)
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

            if (userCommands.length < hookCommands.length) {
              removedAny = true;
            }

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
          if (verbose)
            console.log(chalk.gray(`  Removed empty ${hooksJsonPath}`));
        } else {
          fs.writeJsonSync(hooksJsonPath, userConfig, { spaces: 2 });
          if (verbose)
            console.log(
              chalk.gray(`  Cleaned aicm hooks from ${hooksJsonPath}`),
            );
        }
        hasChanges = true;
      }
    } catch {
      console.warn(chalk.yellow(`Warning: Failed to clean hooks.json`));
    }
  }

  return hasChanges;
}

function cleanClaudeCodeHooks(cwd: string, verbose: boolean): boolean {
  const settingsPath = path.join(cwd, ".claude", "settings.json");
  const hooksDir = path.join(cwd, ".claude", "hooks", "aicm");

  let hasChanges = false;

  // Clean hooks directory
  if (fs.existsSync(hooksDir)) {
    fs.removeSync(hooksDir);
    if (verbose) console.log(chalk.gray(`  Removed ${hooksDir}`));
    hasChanges = true;
  }

  // Clean hooks from .claude/settings.json
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
              // Keep groups that don't reference hooks/aicm/
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

            if (userGroups.length < matcherGroups.length) {
              removedAny = true;
            }

            if (userGroups.length > 0) {
              userHooks[eventName] = userGroups;
            }
          }
        }

        if (removedAny) {
          if (Object.keys(userHooks).length > 0) {
            settings.hooks = userHooks;
          } else {
            delete settings.hooks;
          }

          // If settings is now empty (or only has hooks which was deleted), remove the file
          if (Object.keys(settings).length === 0) {
            fs.removeSync(settingsPath);
            if (verbose)
              console.log(chalk.gray(`  Removed empty ${settingsPath}`));
          } else {
            fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
            if (verbose)
              console.log(
                chalk.gray(`  Cleaned aicm hooks from ${settingsPath}`),
              );
          }
          hasChanges = true;
        }
      }
    } catch {
      console.warn(
        chalk.yellow(`Warning: Failed to clean Claude Code settings.json`),
      );
    }
  }

  return hasChanges;
}

function cleanHooks(cwd: string, verbose: boolean): boolean {
  let hasChanges = false;
  if (cleanCursorHooks(cwd, verbose)) hasChanges = true;
  if (cleanClaudeCodeHooks(cwd, verbose)) hasChanges = true;
  return hasChanges;
}

/**
 * Clean aicm-managed skills from a skills directory
 * Only removes skills that have .aicm.json (presence indicates aicm management)
 */
function cleanSkills(cwd: string, verbose: boolean): number {
  let cleanedCount = 0;

  // Skills directories for each target
  const skillsDirs = [
    path.join(cwd, ".agents", "skills"),
    path.join(cwd, ".cursor", "skills"),
    path.join(cwd, ".claude", "skills"),
  ];

  for (const skillsDir of skillsDirs) {
    if (!fs.existsSync(skillsDir)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillPath = path.join(skillsDir, entry.name);
        const metadataPath = path.join(skillPath, ".aicm.json");

        // Only clean skills that have .aicm.json (presence indicates aicm management)
        if (fs.existsSync(metadataPath)) {
          fs.removeSync(skillPath);
          if (verbose) {
            console.log(chalk.gray(`  Removed skill ${skillPath}`));
          }
          cleanedCount++;
        }
      }

      // Remove the skills directory if it's now empty
      const remainingEntries = fs.readdirSync(skillsDir);
      if (remainingEntries.length === 0) {
        fs.removeSync(skillsDir);
        if (verbose) {
          console.log(chalk.gray(`  Removed empty directory ${skillsDir}`));
        }
      }
    } catch {
      console.warn(
        chalk.yellow(`Warning: Failed to clean skills in ${skillsDir}`),
      );
    }
  }

  return cleanedCount;
}

/**
 * Metadata file structure for tracking aicm-managed agents
 */
interface AgentsAicmMetadata {
  managedAgents: string[]; // List of agent names (without path or extension)
}

/**
 * Clean aicm-managed agents from agents directories
 * Only removes agents that are tracked in .aicm.json metadata file
 */
function cleanAgents(cwd: string, verbose: boolean): number {
  let cleanedCount = 0;

  // Agents directories for each target
  const agentsDirs = [
    path.join(cwd, ".agents", "agents"),
    path.join(cwd, ".cursor", "agents"),
    path.join(cwd, ".claude", "agents"),
  ];

  for (const agentsDir of agentsDirs) {
    const metadataPath = path.join(agentsDir, ".aicm.json");

    if (!fs.existsSync(metadataPath)) {
      continue;
    }

    try {
      const metadata: AgentsAicmMetadata = fs.readJsonSync(metadataPath);

      // Remove all managed agents (names only)
      for (const agentName of metadata.managedAgents || []) {
        // Skip invalid names containing path separators (security check)
        if (agentName.includes("/") || agentName.includes("\\")) {
          console.warn(
            chalk.yellow(
              `Warning: Skipping invalid agent name "${agentName}" (contains path separator)`,
            ),
          );
          continue;
        }
        const fullPath = path.join(agentsDir, agentName + ".md");
        if (fs.existsSync(fullPath)) {
          fs.removeSync(fullPath);
          if (verbose) {
            console.log(chalk.gray(`  Removed agent ${fullPath}`));
          }
          cleanedCount++;
        }
      }

      // Remove the metadata file
      fs.removeSync(metadataPath);
      if (verbose) {
        console.log(chalk.gray(`  Removed ${metadataPath}`));
      }

      // Remove the agents directory if it's now empty
      if (fs.existsSync(agentsDir)) {
        const remainingEntries = fs.readdirSync(agentsDir);
        if (remainingEntries.length === 0) {
          fs.removeSync(agentsDir);
          if (verbose) {
            console.log(chalk.gray(`  Removed empty directory ${agentsDir}`));
          }
        }
      }
    } catch {
      console.warn(
        chalk.yellow(`Warning: Failed to clean agents in ${agentsDir}`),
      );
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
    path.join(cwd, ".agents", "aicm"),
    path.join(cwd, ".agents"),
    path.join(cwd, ".claude", "hooks"),
    path.join(cwd, ".claude", "skills"),
    path.join(cwd, ".claude", "agents"),
    path.join(cwd, ".claude"),
  ];

  for (const dir of dirsToCheck) {
    if (fs.existsSync(dir)) {
      try {
        const contents = fs.readdirSync(dir);
        if (contents.length === 0) {
          fs.removeSync(dir);
          if (verbose)
            console.log(chalk.gray(`  Removed empty directory ${dir}`));
          cleanedCount++;
        }
      } catch {
        // Ignore errors when checking/removing empty directories
      }
    }
  }

  return cleanedCount;
}

export async function cleanPackage(
  options: CleanOptions = {},
): Promise<CleanResult> {
  const cwd = options.cwd || process.cwd();
  const verbose = options.verbose || false;

  return withWorkingDirectory(cwd, async () => {
    let cleanedCount = 0;

    const filesToClean = [path.join(cwd, ".agents", "aicm")];

    const instructionsFilesToClean = [
      path.join(cwd, "AGENTS.md"),
      path.join(cwd, "CLAUDE.md"),
    ];

    // Clean directories and files
    for (const file of filesToClean) {
      if (cleanFile(file, verbose)) cleanedCount++;
    }

    // Clean instructions blocks from files
    for (const file of instructionsFilesToClean) {
      if (cleanInstructionsBlock(file, verbose)) cleanedCount++;
    }

    // Clean MCP servers
    if (cleanMcpServers(cwd, verbose)) cleanedCount++;

    // Clean hooks
    if (cleanHooks(cwd, verbose)) cleanedCount++;

    // Clean skills
    cleanedCount += cleanSkills(cwd, verbose);

    // Clean agents
    cleanedCount += cleanAgents(cwd, verbose);

    // Clean empty directories
    cleanedCount += cleanEmptyDirectories(cwd, verbose);

    return {
      success: true,
      cleanedCount,
    };
  });
}

export async function cleanWorkspaces(
  cwd: string,
  verbose: boolean = false,
): Promise<CleanResult> {
  if (verbose) console.log(chalk.blue("🔍 Discovering packages..."));

  const packages = await discoverPackagesWithAicm(cwd);

  if (verbose && packages.length > 0) {
    console.log(
      chalk.blue(`Found ${packages.length} packages with aicm configurations.`),
    );
  }

  let totalCleaned = 0;

  // Clean all discovered packages
  for (const pkg of packages) {
    if (verbose)
      console.log(chalk.blue(`Cleaning package: ${pkg.relativePath}`));

    const result = await cleanPackage({
      cwd: pkg.absolutePath,
      verbose,
    });

    totalCleaned += result.cleanedCount;
  }

  // Always clean root directory (for merged artifacts like mcp.json)
  const rootPackage = packages.find((p) => p.absolutePath === cwd);
  if (!rootPackage) {
    if (verbose)
      console.log(chalk.blue(`Cleaning root workspace artifacts...`));
    const rootResult = await cleanPackage({ cwd, verbose });
    totalCleaned += rootResult.cleanedCount;
  }

  return {
    success: true,
    cleanedCount: totalCleaned,
  };
}

export async function clean(options: CleanOptions = {}): Promise<CleanResult> {
  const cwd = options.cwd || process.cwd();
  const verbose = options.verbose || false;

  const shouldUseWorkspaces = await checkWorkspacesEnabled(cwd);

  if (shouldUseWorkspaces) {
    return cleanWorkspaces(cwd, verbose);
  }

  return cleanPackage(options);
}

export async function cleanCommand(verbose?: boolean): Promise<void> {
  const result = await clean({ verbose });

  if (result.cleanedCount === 0) {
    console.log("Nothing to clean.");
  } else {
    console.log(
      chalk.green(
        `Successfully cleaned ${result.cleanedCount} file(s)/director(y/ies).`,
      ),
    );
  }
}
