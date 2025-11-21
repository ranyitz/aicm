import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import {
  ResolvedConfig,
  CommandFile,
  AssetFile,
  MCPServers,
  SupportedTarget,
} from "../utils/config";
import {
  HookFile,
  HooksJson,
  mergeHooksConfigs,
  dedupeHookFiles,
  writeHooksToCursor,
} from "../utils/hooks";
import { withWorkingDirectory } from "../utils/working-directory";
import { parseRuleFrontmatter } from "../utils/rules-file-writer";
import { discoverPackagesWithAicm } from "../utils/workspace-discovery";
import {
  installPackage,
  InstallOptions,
  InstallResult,
  writeCommandsToTargets,
  writeAssetsToTargets,
  warnPresetCommandCollisions,
  dedupeCommandsForInstall,
  extractNamespaceFromPresetPath,
  writeMcpServersToFile,
} from "./install";

/**
 * Extract .mdc file references from a command for warning purposes
 * Returns absolute paths to .mdc files that are referenced
 */
function extractMdcReferences(
  content: string,
  commandSourcePath: string,
): string[] {
  const commandDir = path.dirname(commandSourcePath);
  const mdcFiles: string[] = [];
  const seenPaths = new Set<string>();

  // Same regex pattern as rewriteCommandRelativeLinks
  const matches = content.matchAll(/\.\.[/\\][\w\-/\\.]+/g);

  for (const match of matches) {
    const relativePath = match[0];
    const resolved = path.normalize(path.resolve(commandDir, relativePath));

    // Only process .mdc files that exist
    if (
      resolved.endsWith(".mdc") &&
      !seenPaths.has(resolved) &&
      fs.existsSync(resolved) &&
      fs.statSync(resolved).isFile()
    ) {
      seenPaths.add(resolved);
      mdcFiles.push(resolved);
    }
  }

  return mdcFiles;
}

/**
 * Check if a .mdc file is a manual rule (not automatic/auto-attached/agent-requested)
 */
function isManualRule(content: string): boolean {
  const metadata = parseRuleFrontmatter(content);

  // Check for always rules
  if (
    metadata.type === "always" ||
    metadata.alwaysApply === true ||
    metadata.alwaysApply === "true"
  ) {
    return false;
  }

  // Check for auto-attached rules
  if (metadata.type === "auto-attached" || metadata.globs) {
    return false;
  }

  // Check for agent-requested rules
  if (metadata.type === "agent-requested" || metadata.description) {
    return false;
  }

  // Default to manual rule
  return true;
}

/**
 * Process .mdc files referenced by commands in workspace mode
 * Warns about non-manual rules and copies them to root for command access
 */
function processMdcFilesForWorkspace(
  mdcFilePaths: Set<string>,
  commands: CommandFile[],
  packages: Array<{
    relativePath: string;
    absolutePath: string;
    config: ResolvedConfig;
  }>,
  rootDir: string,
): AssetFile[] {
  const mdcAssets: AssetFile[] = [];

  // Build a map of command source paths to their preset names
  const commandPresetMap = new Map<string, string | undefined>();
  for (const command of commands) {
    const commandDir = path.dirname(command.sourcePath);
    commandPresetMap.set(commandDir, command.presetName);
  }

  for (const mdcPath of mdcFilePaths) {
    const content = fs.readFileSync(mdcPath, "utf8");

    if (!isManualRule(content)) {
      const relativePath = path.basename(mdcPath);
      console.warn(
        chalk.yellow(
          `Warning: Command references non-manual rule file "${relativePath}". ` +
            `This may cause the rule to be included twice in the context. ` +
            `Consider using manual rules (without alwaysApply, globs, or description metadata) ` +
            `when referencing from commands.`,
        ),
      );
    }

    // Find which command references this .mdc file and get its preset name
    let mdcAssetName = "";
    let presetName: string | undefined;
    let found = false;

    // First check packages for local files
    for (const pkg of packages) {
      const rulesDir = pkg.config.config.rulesDir;
      if (rulesDir) {
        const pkgRulesPath = path.join(pkg.absolutePath, rulesDir);
        if (mdcPath.startsWith(pkgRulesPath)) {
          mdcAssetName = path.relative(pkgRulesPath, mdcPath);
          found = true;
          break;
        }
      }
    }

    // If not found in local packages, it might be from a preset
    if (!found) {
      // Find the command that references this .mdc file
      for (const command of commands) {
        if (command.presetName) {
          const commandDir = path.dirname(command.sourcePath);
          const rulesDir = path.join(path.dirname(commandDir), "rules");

          if (mdcPath.startsWith(rulesDir)) {
            mdcAssetName = path.relative(rulesDir, mdcPath);
            presetName = command.presetName;
            found = true;
            break;
          }
        }
      }
    }

    if (found) {
      // Build the final asset name with preset namespace if applicable
      const finalAssetName = presetName
        ? path.posix.join(
            ...extractNamespaceFromPresetPath(presetName),
            mdcAssetName.replace(/\\/g, "/"),
          )
        : mdcAssetName.replace(/\\/g, "/");

      // Create an AssetFile entry for the .mdc file
      mdcAssets.push({
        name: finalAssetName,
        content: Buffer.from(content),
        sourcePath: mdcPath,
        source: presetName ? "preset" : "local",
        presetName,
      });

      // Copy to root .cursor/rules/aicm/
      const cursorRulesDir = path.join(rootDir, ".cursor", "rules", "aicm");
      const targetPath = path.join(cursorRulesDir, finalAssetName);
      fs.ensureDirSync(path.dirname(targetPath));
      fs.writeFileSync(targetPath, content);
    }
  }

  return mdcAssets;
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
 * Merge hooks from multiple workspace packages
 */
function mergeWorkspaceHooks(
  packages: Array<{ relativePath: string; config: ResolvedConfig }>,
): { merged: HooksJson; hookFiles: HookFile[] } {
  const allHooksConfigs: HooksJson[] = [];
  const allHookFiles: HookFile[] = [];

  for (const pkg of packages) {
    // Collect hooks configs
    if (pkg.config.hooks) {
      allHooksConfigs.push(pkg.config.hooks);
    }

    // Collect hook files
    allHookFiles.push(...pkg.config.hookFiles);
  }

  // Merge hooks configs
  const merged = mergeHooksConfigs(allHooksConfigs);

  // Dedupe hook files by basename with MD5 checking
  const dedupedHookFiles = dedupeHookFiles(allHookFiles);

  return { merged, hookFiles: dedupedHookFiles };
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
    installedHookCount: number;
  }>;
  totalRuleCount: number;
  totalCommandCount: number;
  totalAssetCount: number;
  totalHookCount: number;
}> {
  const results: Array<{
    path: string;
    success: boolean;
    error?: Error;
    installedRuleCount: number;
    installedCommandCount: number;
    installedAssetCount: number;
    installedHookCount: number;
  }> = [];
  let totalRuleCount = 0;
  let totalCommandCount = 0;
  let totalAssetCount = 0;
  let totalHookCount = 0;

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
      totalHookCount += result.installedHookCount;

      results.push({
        path: pkg.relativePath,
        success: result.success,
        error: result.error,
        installedRuleCount: result.installedRuleCount,
        installedCommandCount: result.installedCommandCount,
        installedAssetCount: result.installedAssetCount,
        installedHookCount: result.installedHookCount,
      });
    } catch (error) {
      results.push({
        path: pkg.relativePath,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedRuleCount: 0,
        installedCommandCount: 0,
        installedAssetCount: 0,
        installedHookCount: 0,
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
    totalHookCount,
  };
}

/**
 * Install rules across multiple packages in a workspace
 */
export async function installWorkspaces(
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
        installedHookCount: 0,
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

      // Collect all assets from packages for command path rewriting
      const allAssets = packages.flatMap((pkg) => pkg.config.assets ?? []);

      // Copy assets to root so root commands can reference them
      writeAssetsToTargets(allAssets, workspaceCommandTargets);

      // Extract and process .mdc file references from commands
      const mdcFilesSet = new Set<string>();

      for (const command of dedupedWorkspaceCommands) {
        const mdcRefs = extractMdcReferences(
          command.content,
          command.sourcePath,
        );
        mdcRefs.forEach((ref) => mdcFilesSet.add(ref));
      }

      const mdcAssets = processMdcFilesForWorkspace(
        mdcFilesSet,
        dedupedWorkspaceCommands,
        packages,
        cwd,
      );

      // Merge .mdc assets with regular assets for link rewriting
      const allAssetsWithMdc = [...allAssets, ...mdcAssets];

      writeCommandsToTargets(
        dedupedWorkspaceCommands,
        allAssetsWithMdc,
        workspaceCommandTargets,
      );
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

    // Merge and write hooks for workspace
    const { merged: rootHooks, hookFiles: rootHookFiles } =
      mergeWorkspaceHooks(packages);

    const hasHooks = rootHooks.hooks && Object.keys(rootHooks.hooks).length > 0;

    if (!dryRun && hasCursorTarget && (hasHooks || rootHookFiles.length > 0)) {
      writeHooksToCursor(rootHooks, rootHookFiles, cwd);
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

          if (pkg.installedHookCount > 0) {
            summaryParts.push(
              `${pkg.installedHookCount} hook${
                pkg.installedHookCount === 1 ? "" : "s"
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
        const hookSummary =
          result.totalHookCount > 0
            ? `, ${result.totalHookCount} hook${
                result.totalHookCount === 1 ? "" : "s"
              } total`
            : "";

        console.log(
          chalk.green(
            `Successfully installed: ${
              result.packages.length - failedPackages.length
            }/${result.packages.length} packages (${result.totalRuleCount} rule${
              result.totalRuleCount === 1 ? "" : "s"
            } total${commandSummary}${hookSummary})`,
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
        installedHookCount: result.totalHookCount,
        packagesCount: result.packages.length,
      };
    }

    return {
      success: true,
      installedRuleCount: result.totalRuleCount,
      installedCommandCount: result.totalCommandCount,
      installedAssetCount: result.totalAssetCount,
      installedHookCount: result.totalHookCount,
      packagesCount: result.packages.length,
    };
  });
}
