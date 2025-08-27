import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { execSync } from "child_process";
import {
  loadConfig,
  ResolvedConfig,
  RuleFile,
  MCPServers,
  SupportedTarget,
  detectWorkspacesFromPackageJson,
} from "../utils/config";
import { withWorkingDirectory } from "../utils/working-directory";
import { isCIEnvironment } from "../utils/is-ci";

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

function extractNamespaceFromPresetPath(presetPath: string): string[] {
  // Special case: npm package names always use forward slashes, regardless of platform
  if (presetPath.startsWith("@")) {
    // For scoped packages like @scope/package/subdir, create nested directories
    return presetPath.split("/");
  }

  const parts = presetPath.split(path.sep);
  return parts.filter((part) => part.length > 0); // Filter out empty segments
}

function generateRulesFileContent(
  ruleFiles: Array<{
    name: string;
    path: string;
    content: string;
  }>,
): string {
  const alwaysApplyRules: string[] = [];
  const optInRules: string[] = [];

  for (const rule of ruleFiles) {
    // Parse metadata to determine rule type
    const metadata = rule.content.match(/^---\n([\s\S]*?)\n---/);
    let alwaysApply = false;

    if (metadata) {
      try {
        const frontmatter = metadata[1];
        // Simple YAML parsing for alwaysApply field
        const alwaysApplyMatch = frontmatter.match(
          /alwaysApply:\s*(true|false)/,
        );
        if (alwaysApplyMatch) {
          alwaysApply = alwaysApplyMatch[1] === "true";
        }
      } catch {
        // If parsing fails, default to false
      }
    }

    if (alwaysApply) {
      alwaysApplyRules.push(`- ${rule.path}`);
    } else {
      optInRules.push(`- ${rule.path}`);
    }
  }

  let content = "<!-- AICM:BEGIN -->\n";
  if (alwaysApplyRules.length > 0) {
    content +=
      "The following rules always apply to all files in the project:\n";
    content += alwaysApplyRules.join("\n") + "\n\n";
  }

  if (optInRules.length > 0) {
    content +=
      "The following rules are available for the AI to include when needed:\n";
    content += optInRules.join("\n") + "\n\n";
  }

  content += "<!-- AICM:END -->";

  return content;
}

/**
 * Write rules file content to a file, preserving existing content outside markers
 */
function writeRulesFile(rulesContent: string, rulesFilePath: string): void {
  const RULES_BEGIN = "<!-- AICM:BEGIN -->";
  const RULES_END = "<!-- AICM:END -->";

  let fileContent: string;

  if (fs.existsSync(rulesFilePath)) {
    const existingContent = fs.readFileSync(rulesFilePath, "utf8");

    if (
      existingContent.includes(RULES_BEGIN) &&
      existingContent.includes(RULES_END)
    ) {
      const beforeMarker = existingContent.split(RULES_BEGIN)[0];
      const afterMarker = existingContent.split(RULES_END)[1];
      fileContent = beforeMarker + rulesContent + afterMarker;
    } else {
      // Preserve the existing content and append markers
      let separator = "";
      if (!existingContent.endsWith("\n")) {
        separator += "\n";
      }

      if (!existingContent.endsWith("\n\n")) {
        separator += "\n";
      }

      fileContent = existingContent + separator + rulesContent;
    }
  } else {
    // Create new file with markers and content
    fileContent = rulesContent + "\n";
  }

  fs.writeFileSync(rulesFilePath, fileContent);
}

/**
 * Write rules to a shared directory and update the given rules file
 */
function writeRulesForFile(
  rules: RuleFile[],
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

    const physicalRulePath = rulePath + ".md";
    fs.ensureDirSync(path.dirname(physicalRulePath));
    fs.writeFileSync(physicalRulePath, rule.content);

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
      content: rule.content,
    };
  });

  const rulesContent = generateRulesFileContent(ruleFiles);
  writeRulesFile(rulesContent, path.join(process.cwd(), rulesFile));
}

/**
 * Write all collected rules to their respective IDE targets
 */
function writeRulesToTargets(
  rules: RuleFile[],
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
          writeRulesForFile(rules, targetPaths.windsurf, ".windsurfrules");
        }
        break;
      case "codex":
        if (rules.length > 0) {
          writeRulesForFile(rules, targetPaths.codex, "AGENTS.md");
        }
        break;
    }
  }
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

/**
 * Merge MCP server configurations from multiple packages
 * Later packages in alphabetical order override earlier ones
 */
function mergeWorkspaceMcpServers(
  packages: Array<{ relativePath: string; config: ResolvedConfig }>,
): MCPServers {
  const merged: MCPServers = {};
  const seen: Record<
    string,
    { configStr: string; packages: string[]; chosen: string }
  > = {};

  for (const pkg of packages) {
    const mcpServers = pkg.config.mcpServers;
    if (!mcpServers) continue;

    for (const [key, value] of Object.entries(mcpServers)) {
      const configStr = JSON.stringify(value);

      if (!Object.prototype.hasOwnProperty.call(seen, key)) {
        merged[key] = value;
        seen[key] = {
          configStr,
          packages: [pkg.relativePath],
          chosen: pkg.relativePath,
        };
      } else if (seen[key].configStr !== configStr) {
        seen[key].packages.push(pkg.relativePath);
        seen[key].configStr = configStr;
        seen[key].chosen = pkg.relativePath;
        merged[key] = value;

        console.warn(
          `Warning: MCP configuration conflict detected\n` +
            `  Key: "${key}"\n` +
            `  Packages: ${seen[key].packages.join(", ")}\n` +
            `  Using configuration from: ${pkg.relativePath}`,
        );
      } else {
        // Same configuration; just record the package
        seen[key].packages.push(pkg.relativePath);
      }
    }
  }

  return merged;
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
        packagesCount: 0,
      };
    }

    const { config, rules, mcpServers } = resolvedConfig;

    // Check if rules are defined (either directly or through presets)
    if (!rules || rules.length === 0) {
      // If there are no presets defined either, show a message
      if (!config.presets || config.presets.length === 0) {
        return {
          success: false,
          error: new Error("No rules defined in configuration"),
          installedRuleCount: 0,
          packagesCount: 0,
        };
      }
    }

    try {
      if (!options.dryRun) {
        // Write rules to targets
        writeRulesToTargets(rules, config.targets as SupportedTarget[]);

        // Write MCP servers
        if (mcpServers && Object.keys(mcpServers).length > 0) {
          writeMcpServersToTargets(
            mcpServers,
            config.targets as SupportedTarget[],
            cwd,
          );
        }
      }

      return {
        success: true,
        installedRuleCount: rules.length,
        packagesCount: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedRuleCount: 0,
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
  }>;
  totalRuleCount: number;
}> {
  const results: Array<{
    path: string;
    success: boolean;
    error?: Error;
    installedRuleCount: number;
  }> = [];
  let totalRuleCount = 0;

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

      results.push({
        path: pkg.relativePath,
        success: result.success,
        error: result.error,
        installedRuleCount: result.installedRuleCount,
      });
    } catch (error) {
      results.push({
        path: pkg.relativePath,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        installedRuleCount: 0,
      });
    }
  }

  const failedPackages = results.filter((r) => !r.success);

  return {
    success: failedPackages.length === 0,
    packages: results,
    totalRuleCount,
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
      const isRoot = pkg.relativePath === ".";
      if (!isRoot) return true;

      // For root directories, only keep if it has rules or presets
      const hasRules = pkg.config.rules && pkg.config.rules.length > 0;
      const hasPresets =
        pkg.config.config.presets && pkg.config.config.presets.length > 0;
      return hasRules || hasPresets;
    });

    if (packages.length === 0) {
      return {
        success: false,
        error: new Error("No packages with aicm configurations found"),
        installedRuleCount: 0,
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

    // Merge MCP servers from all packages into root configuration
    const mergedMcpServers = mergeWorkspaceMcpServers(allPackages);
    if (!dryRun && Object.keys(mergedMcpServers).length > 0) {
      const rootMcpPath = path.join(cwd, ".cursor", "mcp.json");
      writeMcpServersToFile(mergedMcpServers, rootMcpPath);
    }

    if (verbose) {
      result.packages.forEach((pkg) => {
        if (pkg.success) {
          console.log(
            chalk.green(`✅ ${pkg.path} (${pkg.installedRuleCount} rules)`),
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
        console.log(
          chalk.green(
            `Successfully installed: ${result.packages.length - failedPackages.length}/${result.packages.length} packages (${result.totalRuleCount} rules total)`,
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
        packagesCount: result.packages.length,
      };
    }

    return {
      success: true,
      installedRuleCount: result.totalRuleCount,
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
    const rulesInstalledMessage = `${result.installedRuleCount} rule${result.installedRuleCount === 1 ? "" : "s"}`;

    if (dryRun) {
      if (result.packagesCount > 1) {
        console.log(
          `Dry run: validated ${rulesInstalledMessage} across ${result.packagesCount} packages`,
        );
      } else {
        console.log(`Dry run: validated ${rulesInstalledMessage}`);
      }
    } else if (result.packagesCount > 1) {
      console.log(
        `Successfully installed ${rulesInstalledMessage} across ${result.packagesCount} packages`,
      );
    } else {
      console.log(`Successfully installed ${rulesInstalledMessage}`);
    }
  }
}
