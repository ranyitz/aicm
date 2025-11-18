import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { execSync } from "child_process";
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
import { withWorkingDirectory } from "../utils/working-directory";
import { isCIEnvironment } from "../utils/is-ci";
import {
  parseRuleFrontmatter,
  generateRulesFileContent,
  writeRulesFile,
} from "../utils/rules-file-writer";

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
   * Number of packages installed
   */
  packagesCount: number;
}

function getTargetPaths(): Record<string, string> {
  const projectDir = process.cwd();

  return {
    cursor: path.join(projectDir, ".cursor", "rules", "aicm"),
    windsurf: path.join(projectDir, ".aicm"),
    codex: path.join(projectDir, ".aicm"),
    claude: path.join(projectDir, ".aicm"),
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
    fs.writeFileSync(commandFile, command.content);
  }
}

function extractNamespaceFromPresetPath(presetPath: string): string[] {
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

    // Rewrite links in content
    // const content = rewriteRuleContent(rule.content, rule, assets); // Moved up

    return {
      name: rule.name,
      path: windsurfPathPosix,
      metadata: parseRuleFrontmatter(content),
    };
  });

  const rulesContent = generateRulesFileContent(ruleFiles);
  writeRulesFile(rulesContent, path.join(process.cwd(), rulesFile));
}

function writeAssetsToTargets(
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
        // For single file targets, assets go to the same directory as the config file
        // which is .aicm/ (from getTargetPaths implementation)
        targetDir = targetPaths.aicm; // they are all .aicm
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
          writeRulesForFile(
            rules,
            assets,
            targetPaths.windsurf,
            ".windsurfrules",
          );
        }
        break;
      case "codex":
        if (rules.length > 0) {
          writeRulesForFile(rules, assets, targetPaths.codex, "AGENTS.md");
        }
        break;
      case "claude":
        if (rules.length > 0) {
          writeRulesForFile(rules, assets, targetPaths.claude, "CLAUDE.md");
        }
        break;
    }
  }

  // Write assets after rules so they don't get wiped by emptyDirSync
  writeAssetsToTargets(assets, targets);
}

function writeCommandsToTargets(
  commands: CommandFile[],
  targets: SupportedTarget[],
): void {
  const projectDir = process.cwd();
  const cursorRoot = path.join(projectDir, ".cursor");

  for (const target of targets) {
    if (target === "cursor") {
      const commandsDir = path.join(cursorRoot, "commands", "aicm");

      writeCursorCommands(commands, commandsDir);
    }
    // Other targets do not support commands yet
  }
}

function warnPresetCommandCollisions(commands: CommandFile[]): void {
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

function dedupeCommandsForInstall(commands: CommandFile[]): CommandFile[] {
  const unique = new Map<string, CommandFile>();
  for (const command of commands) {
    unique.set(command.name, command);
  }
  return Array.from(unique.values());
}

function mergeWorkspaceCommands(
  packages: Array<{
    relativePath: string;
    config: ResolvedConfig;
  }>,
): CommandFile[] {
  const commands: CommandFile[] = [];
  const seenPresetCommands = new Set<string>();

  for (const pkg of packages) {
    const hasCursorTarget = pkg.config.config.targets.includes("cursor");
    if (!hasCursorTarget) {
      continue;
    }

    for (const command of pkg.config.commands ?? []) {
      if (command.presetName) {
        const presetKey = `${command.presetName}::${command.name}`;
        if (seenPresetCommands.has(presetKey)) {
          continue;
        }
        seenPresetCommands.add(presetKey);
      }

      commands.push(command);
    }
  }

  return commands;
}

function collectWorkspaceCommandTargets(
  packages: Array<{
    relativePath: string;
    config: ResolvedConfig;
  }>,
): SupportedTarget[] {
  const targets = new Set<SupportedTarget>();

  for (const pkg of packages) {
    if (pkg.config.config.targets.includes("cursor")) {
      targets.add("cursor");
    }
  }

  return Array.from(targets);
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
 * Write MCP servers configuration to a specific file
 */
function writeMcpServersToFile(mcpServers: MCPServers, mcpPath: string): void {
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

interface MergeConflict {
  key: string;
  packages: string[];
  chosen: string;
}

function mergeWorkspaceMcpServers(
  packages: Array<{ relativePath: string; config: ResolvedConfig }>,
): { merged: MCPServers; conflicts: MergeConflict[] } {
  const merged: MCPServers = {};
  const info: Record<
    string,
    {
      configs: Set<string>;
      packages: string[];
      chosen: string;
    }
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

/**
 * Discover all packages with aicm configurations using git ls-files
 */
function findAicmFiles(rootDir: string): string[] {
  try {
    const output = execSync(
      "git ls-files --cached --others --exclude-standard aicm.json **/aicm.json",
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );

    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file: string) => path.resolve(rootDir, file));
  } catch {
    // Fallback to manual search if git is not available
    return [];
  }
}

/**
 * Discover all packages with aicm configurations
 */
async function discoverPackagesWithAicm(
  rootDir: string,
): Promise<
  Array<{ relativePath: string; absolutePath: string; config: ResolvedConfig }>
> {
  const aicmFiles = findAicmFiles(rootDir);
  const packages: Array<{
    relativePath: string;
    absolutePath: string;
    config: ResolvedConfig;
  }> = [];

  for (const aicmFile of aicmFiles) {
    const packageDir = path.dirname(aicmFile);
    const relativePath = path.relative(rootDir, packageDir);

    // Normalize to forward slashes for cross-platform compatibility
    const normalizedRelativePath = relativePath.replace(/\\/g, "/");

    const config = await loadConfig(packageDir);

    if (config) {
      packages.push({
        relativePath: normalizedRelativePath || ".",
        absolutePath: packageDir,
        config,
      });
    }
  }

  // Sort packages by relativePath for deterministic order
  return packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
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
        packagesCount: 0,
      };
    }

    const { config, rules, commands, assets, mcpServers } = resolvedConfig;

    if (config.skipInstall === true) {
      return {
        success: true,
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
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
          config.targets as SupportedTarget[],
        );

        if (mcpServers && Object.keys(mcpServers).length > 0) {
          writeMcpServersToTargets(
            mcpServers,
            config.targets as SupportedTarget[],
            cwd,
          );
        }
      }

      const uniqueRuleCount = new Set(rules.map((rule) => rule.name)).size;
      const uniqueCommandCount = new Set(
        commandsToInstall.map((command) => command.name),
      ).size;

      return {
        success: true,
        installedRuleCount: uniqueRuleCount,
        installedCommandCount: uniqueCommandCount,
        installedAssetCount: assets.length,
        packagesCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        packagesCount: 0,
      };
    }
  });
}

/**
 * Install aicm configurations for all packages in a workspace
 */
async function installWorkspacesPackages(
  packages: Array<{
    relativePath: string;
    absolutePath: string;
    config: ResolvedConfig;
  }>,
  options: InstallOptions = {},
): Promise<{
  success: boolean;
  packages: Array<{
    path: string;
    success: boolean;
    error?: Error;
    installedRuleCount: number;
    installedCommandCount: number;
    installedAssetCount: number;
  }>;
  totalRuleCount: number;
  totalCommandCount: number;
  totalAssetCount: number;
}> {
  const results: Array<{
    path: string;
    success: boolean;
    error?: Error;
    installedRuleCount: number;
    installedCommandCount: number;
    installedAssetCount: number;
  }> = [];
  let totalRuleCount = 0;
  let totalCommandCount = 0;
  let totalAssetCount = 0;

  // Install packages sequentially for now (can be parallelized later)
  for (const pkg of packages) {
    const packagePath = pkg.absolutePath;

    try {
      const result = await installPackage({
        ...options,
        cwd: packagePath,
        config: pkg.config,
      });

      totalRuleCount += result.installedRuleCount;
      totalCommandCount += result.installedCommandCount;
      totalAssetCount += result.installedAssetCount;

      results.push({
        path: pkg.relativePath,
        success: result.success,
        error: result.error,
        installedRuleCount: result.installedRuleCount,
        installedCommandCount: result.installedCommandCount,
        installedAssetCount: result.installedAssetCount,
      });
    } catch (error) {
      results.push({
        path: pkg.relativePath,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
      });
    }
  }

  const failedPackages = results.filter((r) => !r.success);

  return {
    success: failedPackages.length === 0,
    packages: results,
    totalRuleCount,
    totalCommandCount,
    totalAssetCount,
  };
}

/**
 * Install rules across multiple packages in a workspace
 */
async function installWorkspaces(
  cwd: string,
  installOnCI: boolean,
  verbose: boolean = false,
  dryRun: boolean = false,
): Promise<InstallResult> {
  return withWorkingDirectory(cwd, async () => {
    if (verbose) {
      console.log(chalk.blue("🔍 Discovering packages..."));
    }

    const allPackages = await discoverPackagesWithAicm(cwd);

    const packages = allPackages.filter((pkg) => {
      if (pkg.config.config.skipInstall === true) {
        return false;
      }

      const isRoot = pkg.relativePath === ".";
      if (!isRoot) return true;

      // For root directories, only keep if it has rules, commands, or presets
      const hasRules = pkg.config.rules && pkg.config.rules.length > 0;
      const hasCommands = pkg.config.commands && pkg.config.commands.length > 0;
      const hasPresets =
        pkg.config.config.presets && pkg.config.config.presets.length > 0;
      return hasRules || hasCommands || hasPresets;
    });

    if (packages.length === 0) {
      return {
        success: false,
        error: new Error("No packages with aicm configurations found"),
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        packagesCount: 0,
      };
    }

    if (verbose) {
      console.log(
        chalk.blue(
          `Found ${packages.length} packages with aicm configurations:`,
        ),
      );
      packages.forEach((pkg) => {
        console.log(chalk.gray(`  - ${pkg.relativePath}`));
      });

      console.log(chalk.blue(`📦 Installing configurations...`));
    }

    const result = await installWorkspacesPackages(packages, {
      installOnCI,
      verbose,
      dryRun,
    });

    const workspaceCommands = mergeWorkspaceCommands(packages);
    const workspaceCommandTargets = collectWorkspaceCommandTargets(packages);

    if (workspaceCommands.length > 0) {
      warnPresetCommandCollisions(workspaceCommands);
    }

    if (
      !dryRun &&
      workspaceCommands.length > 0 &&
      workspaceCommandTargets.length > 0
    ) {
      const dedupedWorkspaceCommands =
        dedupeCommandsForInstall(workspaceCommands);

      writeCommandsToTargets(dedupedWorkspaceCommands, workspaceCommandTargets);
    }

    const { merged: rootMcp, conflicts } = mergeWorkspaceMcpServers(packages);

    const hasCursorTarget = packages.some((p) =>
      p.config.config.targets.includes("cursor"),
    );

    if (!dryRun && hasCursorTarget && Object.keys(rootMcp).length > 0) {
      const mcpPath = path.join(cwd, ".cursor", "mcp.json");
      writeMcpServersToFile(rootMcp, mcpPath);
    }

    for (const conflict of conflicts) {
      console.warn(
        `Warning: MCP configuration conflict detected\n  Key: "${conflict.key}"\n  Packages: ${conflict.packages.join(", ")}\n  Using configuration from: ${conflict.chosen}`,
      );
    }

    if (verbose) {
      result.packages.forEach((pkg) => {
        if (pkg.success) {
          const summaryParts = [`${pkg.installedRuleCount} rules`];

          if (pkg.installedCommandCount > 0) {
            summaryParts.push(
              `${pkg.installedCommandCount} command${
                pkg.installedCommandCount === 1 ? "" : "s"
              }`,
            );
          }

          console.log(
            chalk.green(`✅ ${pkg.path} (${summaryParts.join(", ")})`),
          );
        } else {
          console.log(chalk.red(`❌ ${pkg.path}: ${pkg.error}`));
        }
      });
    }

    const failedPackages = result.packages.filter((r) => !r.success);

    if (failedPackages.length > 0) {
      console.log(chalk.yellow(`Installation completed with errors`));
      if (verbose) {
        const commandSummary =
          result.totalCommandCount > 0
            ? `, ${result.totalCommandCount} command${
                result.totalCommandCount === 1 ? "" : "s"
              } total`
            : "";

        console.log(
          chalk.green(
            `Successfully installed: ${
              result.packages.length - failedPackages.length
            }/${result.packages.length} packages (${result.totalRuleCount} rule${
              result.totalRuleCount === 1 ? "" : "s"
            } total${commandSummary})`,
          ),
        );
        console.log(
          chalk.red(
            `Failed packages: ${failedPackages.map((p) => p.path).join(", ")}`,
          ),
        );
      }

      const errorDetails = failedPackages
        .map((p) => `${p.path}: ${p.error}`)
        .join("; ");

      return {
        success: false,
        error: new Error(
          `Package installation failed for ${failedPackages.length} package(s): ${errorDetails}`,
        ),
        installedRuleCount: result.totalRuleCount,
        installedCommandCount: result.totalCommandCount,
        installedAssetCount: result.totalAssetCount,
        packagesCount: result.packages.length,
      };
    }

    return {
      success: true,
      installedRuleCount: result.totalRuleCount,
      installedCommandCount: result.totalCommandCount,
      installedAssetCount: result.totalAssetCount,
      packagesCount: result.packages.length,
    };
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
    const ruleMessage =
      ruleCount > 0 ? `${ruleCount} rule${ruleCount === 1 ? "" : "s"}` : null;
    const commandMessage =
      commandCount > 0
        ? `${commandCount} command${commandCount === 1 ? "" : "s"}`
        : null;
    const countsParts: string[] = [];
    if (ruleMessage) {
      countsParts.push(ruleMessage);
    }
    if (commandMessage) {
      countsParts.push(commandMessage);
    }
    const countsMessage =
      countsParts.length > 0 ? countsParts.join(" and ") : "0 rules";

    if (dryRun) {
      if (result.packagesCount > 1) {
        console.log(
          `Dry run: validated ${countsMessage} across ${result.packagesCount} packages`,
        );
      } else {
        console.log(`Dry run: validated ${countsMessage}`);
      }
    } else if (ruleCount === 0 && commandCount === 0) {
      console.log("No rules or commands installed");
    } else if (result.packagesCount > 1) {
      console.log(
        `Successfully installed ${countsMessage} across ${result.packagesCount} packages`,
      );
    } else {
      console.log(`Successfully installed ${countsMessage}`);
    }
  }
}
