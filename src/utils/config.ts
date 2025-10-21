import fs from "fs-extra";
import path from "node:path";
import { cosmiconfig, CosmiconfigResult } from "cosmiconfig";
import fg from "fast-glob";

export interface RawConfig {
  rulesDir?: string;
  commandsDir?: string;
  targets?: string[];
  presets?: string[];
  overrides?: Record<string, string | false>;
  mcpServers?: MCPServers;
  workspaces?: boolean;
  skipInstall?: boolean;
}

export interface Config {
  rulesDir?: string;
  commandsDir?: string;
  targets: string[];
  presets?: string[];
  overrides?: Record<string, string | false>;
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

export type RuleFile = ManagedFile;

export type CommandFile = ManagedFile;

export interface RuleCollection {
  [target: string]: RuleFile[];
}

export interface ResolvedConfig {
  config: Config;
  rules: RuleFile[];
  commands: CommandFile[];
  mcpServers: MCPServers;
}

export const ALLOWED_CONFIG_KEYS = [
  "rulesDir",
  "commandsDir",
  "targets",
  "presets",
  "overrides",
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
    rulesDir: config.rulesDir,
    commandsDir: config.commandsDir,
    targets: config.targets || ["cursor"],
    presets: config.presets || [],
    overrides: config.overrides || {},
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

  // Validate that either rulesDir or presets is provided
  const hasRulesDir =
    "rulesDir" in config && typeof config.rulesDir === "string";
  const hasCommandsDir =
    "commandsDir" in config && typeof config.commandsDir === "string";
  const hasPresets =
    "presets" in config &&
    Array.isArray(config.presets) &&
    config.presets.length > 0;

  // In workspace mode, root config doesn't need rulesDir or presets
  // since packages will have their own configurations
  if (!isWorkspaceMode && !hasRulesDir && !hasPresets && !hasCommandsDir) {
    throw new Error(
      `At least one of rulesDir, commandsDir, or presets must be specified in config at ${configFilePath}`,
    );
  }

  // Validate rulesDir if provided
  if (hasRulesDir) {
    const rulesPath = path.resolve(cwd, config.rulesDir as string);

    if (!fs.existsSync(rulesPath)) {
      throw new Error(`Rules directory does not exist: ${rulesPath}`);
    }

    if (!fs.statSync(rulesPath).isDirectory()) {
      throw new Error(`Rules path is not a directory: ${rulesPath}`);
    }
  }

  if (hasCommandsDir) {
    const commandsPath = path.resolve(cwd, config.commandsDir as string);

    if (!fs.existsSync(commandsPath)) {
      throw new Error(`Commands directory does not exist: ${commandsPath}`);
    }

    if (!fs.statSync(commandsPath).isDirectory()) {
      throw new Error(`Commands path is not a directory: ${commandsPath}`);
    }
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

  // Validate override rule names will be checked after rule resolution
}

export async function loadRulesFromDirectory(
  rulesDir: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<RuleFile[]> {
  const rules: RuleFile[] = [];

  if (!fs.existsSync(rulesDir)) {
    return rules;
  }

  const pattern = path.join(rulesDir, "**/*.mdc").replace(/\\/g, "/");
  const filePaths = await fg(pattern, {
    onlyFiles: true,
    absolute: true,
  });

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, "utf8");

    // Preserve directory structure by using relative path from rulesDir
    const relativePath = path.relative(rulesDir, filePath);
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
  commandsDir: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<CommandFile[]> {
  const commands: CommandFile[] = [];

  if (!fs.existsSync(commandsDir)) {
    return commands;
  }

  const pattern = path.join(commandsDir, "**/*.md").replace(/\\/g, "/");
  const filePaths = await fg(pattern, {
    onlyFiles: true,
    absolute: true,
  });

  filePaths.sort();

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(commandsDir, filePath);
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
  rulesDir?: string;
  commandsDir?: string;
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
  const presetRulesDir = presetConfig.rulesDir
    ? path.resolve(presetDir, presetConfig.rulesDir)
    : undefined;
  const presetCommandsDir = presetConfig.commandsDir
    ? path.resolve(presetDir, presetConfig.commandsDir)
    : undefined;

  if (!presetRulesDir && !presetCommandsDir) {
    throw new Error(
      `Preset "${presetPath}" must have a rulesDir or commandsDir specified`,
    );
  }

  return {
    config: presetConfig,
    rulesDir: presetRulesDir,
    commandsDir: presetCommandsDir,
  };
}

export async function loadAllRules(
  config: Config,
  cwd: string,
): Promise<{
  rules: RuleFile[];
  commands: CommandFile[];
  mcpServers: MCPServers;
}> {
  const allRules: RuleFile[] = [];
  const allCommands: CommandFile[] = [];
  let mergedMcpServers: MCPServers = { ...config.mcpServers };

  // Load local rules only if rulesDir is provided
  if (config.rulesDir) {
    const localRulesPath = path.resolve(cwd, config.rulesDir);
    const localRules = await loadRulesFromDirectory(localRulesPath, "local");
    allRules.push(...localRules);
  }

  if (config.commandsDir) {
    const localCommandsPath = path.resolve(cwd, config.commandsDir);
    const localCommands = await loadCommandsFromDirectory(
      localCommandsPath,
      "local",
    );
    allCommands.push(...localCommands);
  }

  if (config.presets) {
    for (const presetPath of config.presets) {
      const preset = await loadPreset(presetPath, cwd);
      if (preset.rulesDir) {
        const presetRules = await loadRulesFromDirectory(
          preset.rulesDir,
          "preset",
          presetPath,
        );
        allRules.push(...presetRules);
      }

      if (preset.commandsDir) {
        const presetCommands = await loadCommandsFromDirectory(
          preset.commandsDir,
          "preset",
          presetPath,
        );
        allCommands.push(...presetCommands);
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

  return {
    rules: allRules,
    commands: allCommands,
    mcpServers: mergedMcpServers,
  };
}

export function applyOverrides<T extends ManagedFile>(
  files: T[],
  overrides: Record<string, string | false>,
  cwd: string,
): T[] {
  // Validate that all override names exist in the resolved files
  for (const name of Object.keys(overrides)) {
    if (!files.some((file) => file.name === name)) {
      throw new Error(
        `Override entry "${name}" does not exist in resolved files`,
      );
    }
  }

  const fileMap = new Map<string, T>();

  for (const file of files) {
    fileMap.set(file.name, file);
  }

  for (const [name, override] of Object.entries(overrides)) {
    if (override === false) {
      fileMap.delete(name);
    } else if (typeof override === "string") {
      const overridePath = path.resolve(cwd, override);
      if (!fs.existsSync(overridePath)) {
        throw new Error(`Override file not found: ${override} in ${cwd}`);
      }

      const content = fs.readFileSync(overridePath, "utf8");
      const existing = fileMap.get(name);
      fileMap.set(name, {
        ...(existing ?? {}),
        name,
        content,
        sourcePath: overridePath,
        source: "local",
        presetName: undefined,
      } as T);
    }
  }

  return Array.from(fileMap.values());
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
    // Only add if not already defined in config (override handled by config)
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

  const { rules, commands, mcpServers } = await loadAllRules(
    configWithDefaults,
    workingDir,
  );

  let rulesWithOverrides = rules;
  let commandsWithOverrides = commands;

  if (configWithDefaults.overrides) {
    const overrides = configWithDefaults.overrides;
    const ruleNames = new Set(rules.map((rule) => rule.name));
    const commandNames = new Set(commands.map((command) => command.name));

    for (const overrideName of Object.keys(overrides)) {
      if (!ruleNames.has(overrideName) && !commandNames.has(overrideName)) {
        throw new Error(
          `Override entry "${overrideName}" does not exist in resolved rules or commands`,
        );
      }
    }

    const ruleOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([name]) => ruleNames.has(name)),
    );
    const commandOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([name]) => commandNames.has(name)),
    );

    if (Object.keys(ruleOverrides).length > 0) {
      rulesWithOverrides = applyOverrides(rules, ruleOverrides, workingDir);
    }

    if (Object.keys(commandOverrides).length > 0) {
      commandsWithOverrides = applyOverrides(
        commands,
        commandOverrides,
        workingDir,
      );
    }
  }

  return {
    config: configWithDefaults,
    rules: rulesWithOverrides,
    commands: commandsWithOverrides,
    mcpServers,
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
