import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import {
  loadConfig,
  extractNamespaceFromPresetPath,
  ResolvedConfig,
  RuleFile,
  CommandFile,
  AssetFile,
  SkillFile,
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
   * Number of skills installed
   */
  installedSkillCount: number;
  /**
   * Number of packages installed
   */
  packagesCount: number;
}

/**
 * Rewrite asset references from source paths to installation paths
 * Only rewrites the ../assets/ pattern - everything else is preserved
 *
 * @param content - The file content to rewrite
 * @param presetName - The preset name if this file is from a preset
 * @param fileInstallDepth - The depth of the file's installation directory relative to .cursor/
 *                           For example: .cursor/commands/aicm/file.md has depth 2 (commands, aicm)
 *                                       .cursor/rules/aicm/preset/file.mdc has depth 3 (rules, aicm, preset)
 */
function rewriteAssetReferences(
  content: string,
  presetName?: string,
  fileInstallDepth: number = 2,
): string {
  // Calculate the relative path from the file to .cursor/assets/aicm/
  // We need to go up fileInstallDepth levels to reach .cursor/, then down to assets/aicm/
  const upLevels = "../".repeat(fileInstallDepth);

  // If this is from a preset, include the preset namespace in the asset path
  let assetBasePath = "assets/aicm/";
  if (presetName) {
    const namespace = extractNamespaceFromPresetPath(presetName);
    assetBasePath = path.posix.join("assets", "aicm", ...namespace) + "/";
  }

  const targetPath = upLevels + assetBasePath;

  // Replace ../assets/ with the calculated target path
  // Handles both forward slashes and backslashes for cross-platform compatibility
  return content.replace(/\.\.[\\/]assets[\\/]/g, targetPath);
}

function getTargetPaths(): Record<string, string> {
  const projectDir = process.cwd();

  return {
    cursor: path.join(projectDir, ".cursor", "rules", "aicm"),
    assetsAicm: path.join(projectDir, ".cursor", "assets", "aicm"),
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

    // Calculate the depth for asset path rewriting
    // cursorRulesDir is .cursor/rules/aicm (depth 2 from .cursor)
    // Add namespace depth if present
    let fileInstallDepth = 2; // rules, aicm
    if (rule.presetName) {
      const namespace = extractNamespaceFromPresetPath(rule.presetName);
      fileInstallDepth += namespace.length;
    }
    // Add any subdirectories in the rule name
    fileInstallDepth += ruleNameParts.length - 1; // -1 because the last part is the filename

    // Rewrite asset references before writing
    const content = rewriteAssetReferences(
      rule.content,
      rule.presetName,
      fileInstallDepth,
    );
    fs.writeFileSync(ruleFile, content);
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

    // Calculate the depth for asset path rewriting
    // cursorCommandsDir is .cursor/commands/aicm (depth 2 from .cursor)
    // Commands are NOT namespaced by preset, but we still need to account for subdirectories
    let fileInstallDepth = 2; // commands, aicm
    // Add any subdirectories in the command name
    fileInstallDepth += commandNameParts.length - 1; // -1 because the last part is the filename

    // Rewrite asset references before writing
    const content = rewriteAssetReferences(
      command.content,
      command.presetName,
      fileInstallDepth,
    );
    fs.writeFileSync(commandFile, content);
  }
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

    // For windsurf/codex/claude, assets are installed at the same namespace level as rules
    // Example: .aicm/my-preset/rule.md and .aicm/my-preset/asset.json
    // So we need to remove the 'assets/' part from the path
    // ../assets/file.json -> ../file.json
    // ../../assets/file.json -> ../../file.json
    const content = rule.content.replace(/(\.\.[/\\])assets[/\\]/g, "$1");

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
        targetDir = targetPaths.assetsAicm;
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

/**
 * Metadata file written inside each installed skill to track aicm management
 * The presence of .aicm.json indicates the skill is managed by aicm
 */
interface SkillAicmMetadata {
  source: "local" | "preset";
  presetName?: string;
}

/**
 * Get the skills installation path for a target
 * Returns null for targets that don't support skills
 */
function getSkillsTargetPath(target: SupportedTarget): string | null {
  const projectDir = process.cwd();

  switch (target) {
    case "cursor":
      return path.join(projectDir, ".cursor", "skills");
    case "claude":
      return path.join(projectDir, ".claude", "skills");
    case "codex":
      return path.join(projectDir, ".codex", "skills");
    case "windsurf":
      // Windsurf does not support skills
      return null;
    default:
      return null;
  }
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
  targets: SupportedTarget[],
): void {
  if (skills.length === 0) return;

  for (const target of targets) {
    const targetSkillsDir = getSkillsTargetPath(target);

    if (!targetSkillsDir) {
      // Target doesn't support skills
      continue;
    }

    // Ensure the skills directory exists
    fs.ensureDirSync(targetSkillsDir);

    for (const skill of skills) {
      writeSkillToTarget(skill, targetSkillsDir);
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
        installedSkillCount: 0,
        packagesCount: 0,
      };
    }

    const {
      config,
      rules,
      commands,
      assets,
      skills,
      mcpServers,
      hooks,
      hookFiles,
    } = resolvedConfig;

    if (config.skipInstall === true) {
      return {
        success: true,
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        installedHookCount: 0,
        installedSkillCount: 0,
        packagesCount: 0,
      };
    }

    warnPresetCommandCollisions(commands);
    const commandsToInstall = dedupeCommandsForInstall(commands);

    warnPresetSkillCollisions(skills);
    const skillsToInstall = dedupeSkillsForInstall(skills);

    try {
      if (!options.dryRun) {
        writeRulesToTargets(rules, assets, config.targets as SupportedTarget[]);

        writeCommandsToTargets(
          commandsToInstall,
          config.targets as SupportedTarget[],
        );

        writeSkillsToTargets(
          skillsToInstall,
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
      const uniqueSkillCount = skillsToInstall.length;

      return {
        success: true,
        installedRuleCount: uniqueRuleCount,
        installedCommandCount: uniqueCommandCount,
        installedAssetCount: assets.length,
        installedHookCount: uniqueHookCount,
        installedSkillCount: uniqueSkillCount,
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
        installedSkillCount: 0,
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
      installedSkillCount: 0,
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
    const skillCount = result.installedSkillCount;
    const ruleMessage =
      ruleCount > 0 ? `${ruleCount} rule${ruleCount === 1 ? "" : "s"}` : null;
    const commandMessage =
      commandCount > 0
        ? `${commandCount} command${commandCount === 1 ? "" : "s"}`
        : null;
    const hookMessage =
      hookCount > 0 ? `${hookCount} hook${hookCount === 1 ? "" : "s"}` : null;
    const skillMessage =
      skillCount > 0
        ? `${skillCount} skill${skillCount === 1 ? "" : "s"}`
        : null;
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
    if (skillMessage) {
      countsParts.push(skillMessage);
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
    } else if (
      ruleCount === 0 &&
      commandCount === 0 &&
      hookCount === 0 &&
      skillCount === 0
    ) {
      console.log("No rules, commands, hooks, or skills installed");
    } else if (result.packagesCount > 1) {
      console.log(
        `Successfully installed ${countsMessage} across ${result.packagesCount} packages`,
      );
    } else {
      console.log(`Successfully installed ${countsMessage}`);
    }
  }
}
