import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import {
  loadConfig,
  ResolvedConfig,
  RuleFile,
  CommandFile,
  AssetFile,
  MCPServers,
  SupportedTarget,
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
  parseRuleFrontmatter,
  generateRulesFileContent,
  writeRulesFile,
} from "../utils/rules-file-writer";
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
   * Number of rules installed
   */
  installedRuleCount: number;
  /**
   * Number of commands installed
   */
  installedCommandCount: number;
  /**
   * Number of assets installed
   */
  installedAssetCount: number;
  /**
   * Number of hooks installed
   */
  installedHookCount: number;
  /**
   * Number of packages installed
   */
  packagesCount: number;
}

function getTargetPaths(): Record<string, string> {
  const projectDir = process.cwd();

  return {
    cursor: path.join(projectDir, ".cursor", "rules", "aicm"),
    aicm: path.join(projectDir, ".aicm"),
  };
}

function writeCursorRules(rules: RuleFile[], cursorRulesDir: string): void {
  fs.emptyDirSync(cursorRulesDir);

  for (const rule of rules) {
    let rulePath;

    const ruleNameParts = rule.name.split(path.sep).filter(Boolean);

    if (rule.presetName) {
      // For rules from presets, create a namespaced directory structure
      const namespace = extractNamespaceFromPresetPath(rule.presetName);
      // Path will be: cursorRulesDir/namespace/rule-name.mdc
      rulePath = path.join(cursorRulesDir, ...namespace, ...ruleNameParts);
    } else {
      // For local rules, maintain the original flat structure
      rulePath = path.join(cursorRulesDir, ...ruleNameParts);
    }

    const ruleFile = rulePath + ".mdc";
    fs.ensureDirSync(path.dirname(ruleFile));
    fs.writeFileSync(ruleFile, rule.content);
  }
}

function writeCursorCommands(
  commands: CommandFile[],
  cursorCommandsDir: string,
  assets: AssetFile[],
): void {
  fs.removeSync(cursorCommandsDir);

  for (const command of commands) {
    const commandNameParts = command.name
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);
    const commandPath = path.join(cursorCommandsDir, ...commandNameParts);
    const commandFile = commandPath + ".md";
    fs.ensureDirSync(path.dirname(commandFile));

    // If the command file references assets in the rules directory, we need to rewrite the links.
    // Commands are installed in .cursor/commands/aicm/
    // Rules/assets are installed in .cursor/rules/aicm/
    // So a link like "../rules/asset.json" in source (from commands/ to rules/)
    // needs to become "../../rules/aicm/asset.json" in target (from .cursor/commands/aicm/ to .cursor/rules/aicm/)
    const content = rewriteCommandRelativeLinks(
      command.content,
      command.sourcePath,
      assets,
    );
    fs.writeFileSync(commandFile, content);
  }
}

function rewriteCommandRelativeLinks(
  content: string,
  commandSourcePath: string,
  assets: AssetFile[],
): string {
  const commandDir = path.dirname(commandSourcePath);

  const assetMap = new Map(
    assets.map((a) => {
      let targetPath: string;
      if (a.presetName) {
        const namespace = extractNamespaceFromPresetPath(a.presetName);
        // Use posix paths for URLs/links (always forward slashes)
        targetPath = path.posix.join(...namespace, a.name);
      } else {
        // Normalize to posix for consistent forward slashes in links
        targetPath = a.name.split(path.sep).join(path.posix.sep);
      }
      return [path.normalize(a.sourcePath), targetPath];
    }),
  );

  return content.replace(/\.\.[/\\][\w\-/\\.]+/g, (match) => {
    const resolved = path.normalize(path.resolve(commandDir, match));
    return assetMap.has(resolved)
      ? `../../rules/aicm/${assetMap.get(resolved)}`
      : match;
  });
}

export function extractNamespaceFromPresetPath(presetPath: string): string[] {
  // Special case: npm package names always use forward slashes, regardless of platform
  if (presetPath.startsWith("@")) {
    // For scoped packages like @scope/package/subdir, create nested directories
    return presetPath.split("/");
  }

  const parts = presetPath.split(path.sep);
  return parts.filter(
    (part) => part.length > 0 && part !== "." && part !== "..",
  );
}

/**
 * Write rules to a shared directory and update the given rules file
 */
function writeRulesForFile(
  rules: RuleFile[],
  assets: AssetFile[],
  ruleDir: string,
  rulesFile: string,
): void {
  fs.emptyDirSync(ruleDir);

  const ruleFiles = rules.map((rule) => {
    let rulePath;

    const ruleNameParts = rule.name.split(path.sep).filter(Boolean);

    if (rule.presetName) {
      // For rules from presets, create a namespaced directory structure
      const namespace = extractNamespaceFromPresetPath(rule.presetName);
      // Path will be: ruleDir/namespace/rule-name.md
      rulePath = path.join(ruleDir, ...namespace, ...ruleNameParts);
    } else {
      // For local rules, maintain the original flat structure
      rulePath = path.join(ruleDir, ...ruleNameParts);
    }

    const content = rule.content;

    const physicalRulePath = rulePath + ".md";
    fs.ensureDirSync(path.dirname(physicalRulePath));
    fs.writeFileSync(physicalRulePath, content);

    const relativeRuleDir = path.basename(ruleDir);

    // For the rules file, maintain the same structure
    let windsurfPath;
    if (rule.presetName) {
      const namespace = extractNamespaceFromPresetPath(rule.presetName);
      windsurfPath =
        path.join(relativeRuleDir, ...namespace, ...ruleNameParts) + ".md";
    } else {
      windsurfPath = path.join(relativeRuleDir, ...ruleNameParts) + ".md";
    }

    // Normalize to POSIX style for cross-platform compatibility
    const windsurfPathPosix = windsurfPath.replace(/\\/g, "/");

    return {
      name: rule.name,
      path: windsurfPathPosix,
      metadata: parseRuleFrontmatter(content),
    };
  });

  const rulesContent = generateRulesFileContent(ruleFiles);
  writeRulesFile(rulesContent, path.join(process.cwd(), rulesFile));
}

export function writeAssetsToTargets(
  assets: AssetFile[],
  targets: SupportedTarget[],
): void {
  const targetPaths = getTargetPaths();

  for (const target of targets) {
    let targetDir: string;

    switch (target) {
      case "cursor":
        targetDir = targetPaths.cursor;
        break;
      case "windsurf":
      case "codex":
      case "claude":
        targetDir = targetPaths.aicm;
        break;
      default:
        continue;
    }

    for (const asset of assets) {
      let assetPath;
      if (asset.presetName) {
        const namespace = extractNamespaceFromPresetPath(asset.presetName);
        assetPath = path.join(targetDir, ...namespace, asset.name);
      } else {
        assetPath = path.join(targetDir, asset.name);
      }

      fs.ensureDirSync(path.dirname(assetPath));
      fs.writeFileSync(assetPath, asset.content);
    }
  }
}

/**
 * Write all collected rules to their respective IDE targets
 */
function writeRulesToTargets(
  rules: RuleFile[],
  assets: AssetFile[],
  targets: SupportedTarget[],
): void {
  const targetPaths = getTargetPaths();

  for (const target of targets) {
    switch (target) {
      case "cursor":
        if (rules.length > 0) {
          writeCursorRules(rules, targetPaths.cursor);
        }
        break;
      case "windsurf":
        if (rules.length > 0) {
          writeRulesForFile(rules, assets, targetPaths.aicm, ".windsurfrules");
        }
        break;
      case "codex":
        if (rules.length > 0) {
          writeRulesForFile(rules, assets, targetPaths.aicm, "AGENTS.md");
        }
        break;
      case "claude":
        if (rules.length > 0) {
          writeRulesForFile(rules, assets, targetPaths.aicm, "CLAUDE.md");
        }
        break;
    }
  }

  // Write assets after rules so they don't get wiped by emptyDirSync
  writeAssetsToTargets(assets, targets);
}

export function writeCommandsToTargets(
  commands: CommandFile[],
  assets: AssetFile[],
  targets: SupportedTarget[],
): void {
  const projectDir = process.cwd();
  const cursorRoot = path.join(projectDir, ".cursor");

  for (const target of targets) {
    if (target === "cursor") {
      const commandsDir = path.join(cursorRoot, "commands", "aicm");

      writeCursorCommands(commands, commandsDir, assets);
    }
    // Other targets do not support commands yet
  }
}

export function warnPresetCommandCollisions(commands: CommandFile[]): void {
  const collisions = new Map<
    string,
    { presets: Set<string>; lastPreset: string }
  >();

  for (const command of commands) {
    if (!command.presetName) continue;

    const entry = collisions.get(command.name);
    if (entry) {
      entry.presets.add(command.presetName);
      entry.lastPreset = command.presetName;
    } else {
      collisions.set(command.name, {
        presets: new Set([command.presetName]),
        lastPreset: command.presetName,
      });
    }
  }

  for (const [commandName, { presets, lastPreset }] of collisions) {
    if (presets.size > 1) {
      const presetList = Array.from(presets).sort().join(", ");
      console.warn(
        chalk.yellow(
          `Warning: multiple presets provide the "${commandName}" command (${presetList}). Using definition from ${lastPreset}.`,
        ),
      );
    }
  }
}

export function dedupeCommandsForInstall(
  commands: CommandFile[],
): CommandFile[] {
  const unique = new Map<string, CommandFile>();
  for (const command of commands) {
    unique.set(command.name, command);
  }
  return Array.from(unique.values());
}

/**
 * Write MCP servers configuration to IDE targets
 */
function writeMcpServersToTargets(
  mcpServers: MCPServers,
  targets: SupportedTarget[],
  cwd: string,
): void {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return;

  for (const target of targets) {
    if (target === "cursor") {
      const mcpPath = path.join(cwd, ".cursor", "mcp.json");
      writeMcpServersToFile(mcpServers, mcpPath);
    }
    // Windsurf and Codex do not support project mcpServers, so skip
  }
}

/**
 * Write hooks to IDE targets
 */
function writeHooksToTargets(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  targets: SupportedTarget[],
  cwd: string,
): void {
  const hasHooks =
    hooksConfig.hooks && Object.keys(hooksConfig.hooks).length > 0;

  if (!hasHooks && hookFiles.length === 0) {
    return;
  }

  for (const target of targets) {
    if (target === "cursor") {
      writeHooksToCursor(hooksConfig, hookFiles, cwd);
    }
    // Other targets do not support hooks yet
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
 * Install rules for a single package (used within workspaces and standalone installs)
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
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        installedHookCount: 0,
        packagesCount: 0,
      };
    }

    const { config, rules, commands, assets, mcpServers, hooks, hookFiles } =
      resolvedConfig;

    if (config.skipInstall === true) {
      return {
        success: true,
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        installedHookCount: 0,
        packagesCount: 0,
      };
    }

    warnPresetCommandCollisions(commands);
    const commandsToInstall = dedupeCommandsForInstall(commands);

    try {
      if (!options.dryRun) {
        writeRulesToTargets(rules, assets, config.targets as SupportedTarget[]);

        writeCommandsToTargets(
          commandsToInstall,
          assets,
          config.targets as SupportedTarget[],
        );

        if (mcpServers && Object.keys(mcpServers).length > 0) {
          writeMcpServersToTargets(
            mcpServers,
            config.targets as SupportedTarget[],
            cwd,
          );
        }

        if (hooks && (countHooks(hooks) > 0 || hookFiles.length > 0)) {
          writeHooksToTargets(
            hooks,
            hookFiles,
            config.targets as SupportedTarget[],
            cwd,
          );
        }
      }

      const uniqueRuleCount = new Set(rules.map((rule) => rule.name)).size;
      const uniqueCommandCount = new Set(
        commandsToInstall.map((command) => command.name),
      ).size;
      const uniqueHookCount = countHooks(hooks);

      return {
        success: true,
        installedRuleCount: uniqueRuleCount,
        installedCommandCount: uniqueCommandCount,
        installedAssetCount: assets.length,
        installedHookCount: uniqueHookCount,
        packagesCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        installedHookCount: 0,
        packagesCount: 0,
      };
    }
  });
}

/**
 * Core implementation of the rule installation logic
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
      installedRuleCount: 0,
      installedCommandCount: 0,
      installedAssetCount: 0,
      installedHookCount: 0,
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
    const ruleCount = result.installedRuleCount;
    const commandCount = result.installedCommandCount;
    const hookCount = result.installedHookCount;
    const ruleMessage =
      ruleCount > 0 ? `${ruleCount} rule${ruleCount === 1 ? "" : "s"}` : null;
    const commandMessage =
      commandCount > 0
        ? `${commandCount} command${commandCount === 1 ? "" : "s"}`
        : null;
    const hookMessage =
      hookCount > 0 ? `${hookCount} hook${hookCount === 1 ? "" : "s"}` : null;
    const countsParts: string[] = [];
    if (ruleMessage) {
      countsParts.push(ruleMessage);
    }
    if (commandMessage) {
      countsParts.push(commandMessage);
    }
    if (hookMessage) {
      countsParts.push(hookMessage);
    }
    const countsMessage =
      countsParts.length > 0
        ? countsParts.join(", ").replace(/, ([^,]*)$/, " and $1")
        : "0 rules";

    if (dryRun) {
      if (result.packagesCount > 1) {
        console.log(
          `Dry run: validated ${countsMessage} across ${result.packagesCount} packages`,
        );
      } else {
        console.log(`Dry run: validated ${countsMessage}`);
      }
    } else if (ruleCount === 0 && commandCount === 0 && hookCount === 0) {
      console.log("No rules, commands, or hooks installed");
    } else if (result.packagesCount > 1) {
      console.log(
        `Successfully installed ${countsMessage} across ${result.packagesCount} packages`,
      );
    } else {
      console.log(`Successfully installed ${countsMessage}`);
    }
  }
}
