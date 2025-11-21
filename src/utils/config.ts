import fs from "fs-extra";
import path from "node:path";
import { cosmiconfig, CosmiconfigResult } from "cosmiconfig";
import fg from "fast-glob";
import {
  loadHooksFromDirectory,
  mergeHooksConfigs,
  HooksJson,
  HookFile,
} from "./hooks";

export interface RawConfig {
  rootDir?: string;
  targets?: string[];
  presets?: string[];
  mcpServers?: MCPServers;
  workspaces?: boolean;
  skipInstall?: boolean;
}

export interface Config {
  rootDir?: string;
  targets: string[];
  presets?: string[];
  mcpServers?: MCPServers;
  workspaces?: boolean;
  skipInstall?: boolean;
}

export type MCPServer =
  | {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      url?: never;
    }
  | {
      url: string;
      env?: Record<string, string>;
      command?: never;
      args?: never;
    }
  | false;

export interface MCPServers {
  [serverName: string]: MCPServer;
}

export interface ManagedFile {
  name: string;
  content: string;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
}

export interface AssetFile {
  name: string;
  content: Buffer;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
}

export type RuleFile = ManagedFile;

export type CommandFile = ManagedFile;

export interface RuleCollection {
  [target: string]: RuleFile[];
}

export interface ResolvedConfig {
  config: Config;
  rules: RuleFile[];
  commands: CommandFile[];
  assets: AssetFile[];
  mcpServers: MCPServers;
  hooks: HooksJson;
  hookFiles: HookFile[];
}

export const ALLOWED_CONFIG_KEYS = [
  "rootDir",
  "targets",
  "presets",
  "mcpServers",
  "workspaces",
  "skipInstall",
] as const;

export const SUPPORTED_TARGETS = [
  "cursor",
  "windsurf",
  "codex",
  "claude",
] as const;
export type SupportedTarget = (typeof SUPPORTED_TARGETS)[number];

export function detectWorkspacesFromPackageJson(cwd: string): boolean {
  try {
    const packageJsonPath = path.join(cwd, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return Boolean(packageJson.workspaces);
  } catch {
    return false;
  }
}

export function resolveWorkspaces(
  config: unknown,
  configFilePath: string,
  cwd: string,
): boolean {
  const hasConfigWorkspaces =
    typeof config === "object" && config !== null && "workspaces" in config;

  if (hasConfigWorkspaces) {
    if (typeof config.workspaces === "boolean") {
      return config.workspaces;
    }

    throw new Error(
      `workspaces must be a boolean in config at ${configFilePath}`,
    );
  }

  return detectWorkspacesFromPackageJson(cwd);
}

export function applyDefaults(config: RawConfig, workspaces: boolean): Config {
  return {
    rootDir: config.rootDir,
    targets: config.targets || ["cursor"],
    presets: config.presets || [],
    mcpServers: config.mcpServers || {},
    workspaces,
    skipInstall: config.skipInstall || false,
  };
}

export function validateConfig(
  config: unknown,
  configFilePath: string,
  cwd: string,
  isWorkspaceMode: boolean = false,
): asserts config is Config {
  if (typeof config !== "object" || config === null) {
    throw new Error(`Config is not an object at ${configFilePath}`);
  }

  const unknownKeys = Object.keys(config).filter(
    (key) =>
      !ALLOWED_CONFIG_KEYS.includes(
        key as (typeof ALLOWED_CONFIG_KEYS)[number],
      ),
  );

  if (unknownKeys.length > 0) {
    throw new Error(
      `Invalid configuration at ${configFilePath}: unknown keys: ${unknownKeys.join(", ")}`,
    );
  }

  // Validate rootDir
  const hasRootDir = "rootDir" in config && typeof config.rootDir === "string";
  const hasPresets =
    "presets" in config &&
    Array.isArray(config.presets) &&
    config.presets.length > 0;

  if (hasRootDir) {
    const rootPath = path.resolve(cwd, config.rootDir as string);

    if (!fs.existsSync(rootPath)) {
      throw new Error(`Root directory does not exist: ${rootPath}`);
    }

    if (!fs.statSync(rootPath).isDirectory()) {
      throw new Error(`Root path is not a directory: ${rootPath}`);
    }

    // Check for at least one valid subdirectory or file
    const hasRules = fs.existsSync(path.join(rootPath, "rules"));
    const hasCommands = fs.existsSync(path.join(rootPath, "commands"));
    const hasHooks = fs.existsSync(path.join(rootPath, "hooks.json"));

    // In workspace mode, root config doesn't need these directories
    // since packages will have their own configurations
    if (
      !isWorkspaceMode &&
      !hasRules &&
      !hasCommands &&
      !hasHooks &&
      !hasPresets
    ) {
      throw new Error(
        `Root directory must contain at least one of: rules/, commands/, hooks.json, or have presets configured`,
      );
    }
  } else if (!isWorkspaceMode && !hasPresets) {
    // If no rootDir specified and not in workspace mode, must have presets
    throw new Error(
      `At least one of rootDir or presets must be specified in config at ${configFilePath}`,
    );
  }

  if ("targets" in config) {
    if (!Array.isArray(config.targets)) {
      throw new Error(
        `targets must be an array in config at ${configFilePath}`,
      );
    }

    if (config.targets.length === 0) {
      throw new Error(
        `targets must not be empty in config at ${configFilePath}`,
      );
    }

    for (const target of config.targets) {
      if (!SUPPORTED_TARGETS.includes(target as SupportedTarget)) {
        throw new Error(
          `Unsupported target: ${target}. Supported targets: ${SUPPORTED_TARGETS.join(", ")}`,
        );
      }
    }
  }
}

export async function loadRulesFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<RuleFile[]> {
  const rules: RuleFile[] = [];

  if (!fs.existsSync(directoryPath)) {
    return rules;
  }

  const pattern = path.join(directoryPath, "**/*.mdc").replace(/\\/g, "/");
  const filePaths = await fg(pattern, {
    onlyFiles: true,
    absolute: true,
  });

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, "utf8");

    // Preserve directory structure by using relative path from source directory
    const relativePath = path.relative(directoryPath, filePath);
    const ruleName = relativePath.replace(/\.mdc$/, "").replace(/\\/g, "/");

    rules.push({
      name: ruleName,
      content,
      sourcePath: filePath,
      source,
      presetName,
    });
  }

  return rules;
}

export async function loadCommandsFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<CommandFile[]> {
  const commands: CommandFile[] = [];

  if (!fs.existsSync(directoryPath)) {
    return commands;
  }

  const pattern = path.join(directoryPath, "**/*.md").replace(/\\/g, "/");
  const filePaths = await fg(pattern, {
    onlyFiles: true,
    absolute: true,
  });

  filePaths.sort();

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(directoryPath, filePath);
    const commandName = relativePath.replace(/\.md$/, "").replace(/\\/g, "/");

    commands.push({
      name: commandName,
      content,
      sourcePath: filePath,
      source,
      presetName,
    });
  }

  return commands;
}

export async function loadAssetsFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<AssetFile[]> {
  const assets: AssetFile[] = [];

  if (!fs.existsSync(directoryPath)) {
    return assets;
  }

  // Find all files except .mdc files and hidden files
  const pattern = path.join(directoryPath, "**/*").replace(/\\/g, "/");
  const filePaths = await fg(pattern, {
    onlyFiles: true,
    absolute: true,
    ignore: ["**/*.mdc", "**/.*"],
  });

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath);
    // Preserve directory structure by using relative path from source directory
    const relativePath = path.relative(directoryPath, filePath);
    // Keep extension for assets
    const assetName = relativePath.replace(/\\/g, "/");

    assets.push({
      name: assetName,
      content,
      sourcePath: filePath,
      source,
      presetName,
    });
  }

  return assets;
}

/**
 * Extract namespace from preset path for directory structure
 * Handles both npm packages and local paths consistently
 */
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

export function resolvePresetPath(
  presetPath: string,
  cwd: string,
): string | null {
  // Support specifying aicm.json directory and load the config from it
  if (!presetPath.endsWith(".json")) {
    presetPath = path.join(presetPath, "aicm.json");
  }

  // Support local or absolute paths
  const absolutePath = path.isAbsolute(presetPath)
    ? presetPath
    : path.resolve(cwd, presetPath);

  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }

  try {
    // Support npm packages
    const resolvedPath = require.resolve(presetPath, {
      paths: [cwd, __dirname],
    });
    return fs.existsSync(resolvedPath) ? resolvedPath : null;
  } catch {
    return null;
  }
}

export async function loadPreset(
  presetPath: string,
  cwd: string,
): Promise<{
  config: Config;
  rootDir: string;
}> {
  const resolvedPresetPath = resolvePresetPath(presetPath, cwd);

  if (!resolvedPresetPath) {
    throw new Error(
      `Preset not found: "${presetPath}". Make sure the package is installed or the path is correct.`,
    );
  }

  let presetConfig: Config;

  try {
    const content = await fs.readFile(resolvedPresetPath, "utf8");
    presetConfig = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to load preset "${presetPath}": ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const presetDir = path.dirname(resolvedPresetPath);
  const presetRootDir = path.resolve(presetDir, presetConfig.rootDir || "./");

  // Check for at least one valid subdirectory
  const hasRules = fs.existsSync(path.join(presetRootDir, "rules"));
  const hasCommands = fs.existsSync(path.join(presetRootDir, "commands"));
  const hasHooks = fs.existsSync(path.join(presetRootDir, "hooks.json"));
  const hasAssets = fs.existsSync(path.join(presetRootDir, "assets"));

  if (!hasRules && !hasCommands && !hasHooks && !hasAssets) {
    throw new Error(
      `Preset "${presetPath}" must have at least one of: rules/, commands/, hooks.json, or assets/`,
    );
  }

  return {
    config: presetConfig,
    rootDir: presetRootDir,
  };
}

export async function loadAllRules(
  config: Config,
  cwd: string,
): Promise<{
  rules: RuleFile[];
  commands: CommandFile[];
  assets: AssetFile[];
  mcpServers: MCPServers;
  hooks: HooksJson;
  hookFiles: HookFile[];
}> {
  const allRules: RuleFile[] = [];
  const allCommands: CommandFile[] = [];
  const allAssets: AssetFile[] = [];
  const allHookFiles: HookFile[] = [];
  const allHooksConfigs: HooksJson[] = [];
  let mergedMcpServers: MCPServers = { ...config.mcpServers };

  // Load local files from rootDir only if specified
  if (config.rootDir) {
    const rootPath = path.resolve(cwd, config.rootDir);

    // Load rules from rules/ subdirectory
    const rulesPath = path.join(rootPath, "rules");
    if (fs.existsSync(rulesPath)) {
      const localRules = await loadRulesFromDirectory(rulesPath, "local");
      allRules.push(...localRules);
    }

    // Load commands from commands/ subdirectory
    const commandsPath = path.join(rootPath, "commands");
    if (fs.existsSync(commandsPath)) {
      const localCommands = await loadCommandsFromDirectory(
        commandsPath,
        "local",
      );
      allCommands.push(...localCommands);
    }

    // Load hooks from hooks.json (sibling to hooks/ directory)
    const hooksFilePath = path.join(rootPath, "hooks.json");
    if (fs.existsSync(hooksFilePath)) {
      const { config: localHooksConfig, files: localHookFiles } =
        await loadHooksFromDirectory(rootPath, "local");
      allHooksConfigs.push(localHooksConfig);
      allHookFiles.push(...localHookFiles);
    }

    // Load assets from assets/ subdirectory
    const assetsPath = path.join(rootPath, "assets");
    if (fs.existsSync(assetsPath)) {
      const localAssets = await loadAssetsFromDirectory(assetsPath, "local");
      allAssets.push(...localAssets);
    }
  }

  // Load presets
  if (config.presets) {
    for (const presetPath of config.presets) {
      const preset = await loadPreset(presetPath, cwd);
      const presetRootDir = preset.rootDir;

      // Load preset rules from rules/ subdirectory
      const presetRulesPath = path.join(presetRootDir, "rules");
      if (fs.existsSync(presetRulesPath)) {
        const presetRules = await loadRulesFromDirectory(
          presetRulesPath,
          "preset",
          presetPath,
        );
        allRules.push(...presetRules);
      }

      // Load preset commands from commands/ subdirectory
      const presetCommandsPath = path.join(presetRootDir, "commands");
      if (fs.existsSync(presetCommandsPath)) {
        const presetCommands = await loadCommandsFromDirectory(
          presetCommandsPath,
          "preset",
          presetPath,
        );
        allCommands.push(...presetCommands);
      }

      // Load preset hooks from hooks.json (sibling to hooks/ directory)
      const presetHooksFile = path.join(presetRootDir, "hooks.json");
      if (fs.existsSync(presetHooksFile)) {
        const { config: presetHooksConfig, files: presetHookFiles } =
          await loadHooksFromDirectory(presetRootDir, "preset", presetPath);
        allHooksConfigs.push(presetHooksConfig);
        allHookFiles.push(...presetHookFiles);
      }

      // Load preset assets from assets/ subdirectory
      const presetAssetsPath = path.join(presetRootDir, "assets");
      if (fs.existsSync(presetAssetsPath)) {
        const presetAssets = await loadAssetsFromDirectory(
          presetAssetsPath,
          "preset",
          presetPath,
        );
        allAssets.push(...presetAssets);
      }

      // Merge MCP servers from preset
      if (preset.config.mcpServers) {
        mergedMcpServers = mergePresetMcpServers(
          mergedMcpServers,
          preset.config.mcpServers,
        );
      }
    }
  }

  // Merge all hooks configurations
  const mergedHooks = mergeHooksConfigs(allHooksConfigs);

  return {
    rules: allRules,
    commands: allCommands,
    assets: allAssets,
    mcpServers: mergedMcpServers,
    hooks: mergedHooks,
    hookFiles: allHookFiles,
  };
}

/**
 * Merge preset MCP servers with local config MCP servers
 * Local config takes precedence over preset config
 */
function mergePresetMcpServers(
  configMcpServers: MCPServers,
  presetMcpServers: MCPServers,
): MCPServers {
  const newMcpServers = { ...configMcpServers };

  for (const [serverName, serverConfig] of Object.entries(presetMcpServers)) {
    // Cancel if set to false in config
    if (
      Object.prototype.hasOwnProperty.call(newMcpServers, serverName) &&
      newMcpServers[serverName] === false
    ) {
      delete newMcpServers[serverName];
      continue;
    }
    // Only add if not already defined in config (local config takes precedence)
    if (!Object.prototype.hasOwnProperty.call(newMcpServers, serverName)) {
      newMcpServers[serverName] = serverConfig;
    }
  }

  return newMcpServers;
}

export async function loadConfigFile(
  searchFrom?: string,
): Promise<CosmiconfigResult> {
  const explorer = cosmiconfig("aicm", {
    searchPlaces: ["aicm.json", "package.json"],
  });

  try {
    const result = await explorer.search(searchFrom);
    return result;
  } catch (error) {
    throw new Error(
      `Failed to load configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Check if workspaces mode is enabled without loading all rules/presets
 * This is useful for commands that only need to know the workspace setting
 */
export async function checkWorkspacesEnabled(cwd?: string): Promise<boolean> {
  const workingDir = cwd || process.cwd();

  const configResult = await loadConfigFile(workingDir);

  if (!configResult?.config) {
    return detectWorkspacesFromPackageJson(workingDir);
  }

  return resolveWorkspaces(
    configResult.config,
    configResult.filepath,
    workingDir,
  );
}

export async function loadConfig(cwd?: string): Promise<ResolvedConfig | null> {
  const workingDir = cwd || process.cwd();

  const configResult = await loadConfigFile(workingDir);

  if (!configResult?.config) {
    return null;
  }

  const config = configResult.config;
  const isWorkspaces = resolveWorkspaces(
    config,
    configResult.filepath,
    workingDir,
  );

  validateConfig(config, configResult.filepath, workingDir, isWorkspaces);

  const configWithDefaults = applyDefaults(config, isWorkspaces);

  const { rules, commands, assets, mcpServers, hooks, hookFiles } =
    await loadAllRules(configWithDefaults, workingDir);

  return {
    config: configWithDefaults,
    rules,
    commands,
    assets,
    mcpServers,
    hooks,
    hookFiles,
  };
}

export function saveConfig(config: Config, cwd?: string): boolean {
  const workingDir = cwd || process.cwd();
  const configPath = path.join(workingDir, "aicm.json");

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}
