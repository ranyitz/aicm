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
import { InstructionFile, loadInstructionsFromPath } from "./instructions";
import { TargetsInput, validateTargetsInput, resolveTargets } from "./presets";

export interface TargetsConfig {
  skills?: string[];
  agents?: string[];
  instructions?: string[];
  mcp?: string[];
  hooks?: string[];
}

export interface RawConfig {
  rootDir?: string;
  instructions?: string;
  targets?: TargetsInput;
  presets?: string[];
  mcpServers?: MCPServers;
  workspaces?: boolean;
  skipInstall?: boolean;
}

export interface Config {
  rootDir?: string;
  instructions?: string;
  targets: Required<TargetsConfig>;
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

export interface SkillFile {
  name: string; // skill directory name
  sourcePath: string; // absolute path to source skill directory
  source: "local" | "preset";
  presetName?: string;
}

export type AgentFile = ManagedFile;

export interface ResolvedConfig {
  config: Config;
  instructions: InstructionFile[];
  skills: SkillFile[];
  agents: AgentFile[];
  mcpServers: MCPServers;
  hooks: HooksJson;
  hookFiles: HookFile[];
}

export const ALLOWED_CONFIG_KEYS = [
  "rootDir",
  "instructions",
  "targets",
  "presets",
  "mcpServers",
  "workspaces",
  "skipInstall",
] as const;

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
    instructions: config.instructions,
    targets: resolveTargets(config.targets),
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
  const hasInstructions =
    "instructions" in config && typeof config.instructions === "string";
  const hasPresets =
    "presets" in config &&
    Array.isArray(config.presets) &&
    config.presets.length > 0;

  if (hasInstructions) {
    const baseDir = hasRootDir
      ? path.resolve(cwd, config.rootDir as string)
      : cwd;
    const instructionPath = path.resolve(
      baseDir,
      config.instructions as string,
    );
    if (!fs.existsSync(instructionPath)) {
      throw new Error(`Instructions path does not exist: ${instructionPath}`);
    }
  }

  if (hasRootDir) {
    const rootPath = path.resolve(cwd, config.rootDir as string);

    if (!fs.existsSync(rootPath)) {
      throw new Error(`Root directory does not exist: ${rootPath}`);
    }

    if (!fs.statSync(rootPath).isDirectory()) {
      throw new Error(`Root path is not a directory: ${rootPath}`);
    }

    // Check for at least one valid subdirectory or file
    const hasInstructionsSource = hasInstructions
      ? fs.existsSync(path.resolve(rootPath, config.instructions as string))
      : false;
    const hasHooks = fs.existsSync(path.join(rootPath, "hooks.json"));
    const hasSkills = fs.existsSync(path.join(rootPath, "skills"));
    const hasAgents = fs.existsSync(path.join(rootPath, "agents"));

    // In workspace mode, root config doesn't need these directories
    // since packages will have their own configurations
    if (
      !isWorkspaceMode &&
      !hasInstructionsSource &&
      !hasHooks &&
      !hasSkills &&
      !hasAgents &&
      !hasPresets
    ) {
      throw new Error(
        `Root directory must contain at least one of: instructions, skills/, agents/, hooks.json, or have presets configured`,
      );
    }
  } else if (!isWorkspaceMode && !hasPresets && !hasInstructions) {
    // If no rootDir specified and not in workspace mode, must have presets or instructions
    throw new Error(
      `At least one of rootDir, instructions, or presets must be specified in config at ${configFilePath}`,
    );
  }

  if ("targets" in config) {
    validateTargetsInput(config.targets, configFilePath);
  }
}

/**
 * Load skills from a skills/ directory
 * Each direct subdirectory containing a SKILL.md file is considered a skill
 */
export async function loadSkillsFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<SkillFile[]> {
  const skills: SkillFile[] = [];

  if (!fs.existsSync(directoryPath)) {
    return skills;
  }

  // Get all direct subdirectories
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(directoryPath, entry.name);
    const skillMdPath = path.join(skillPath, "SKILL.md");

    // Only include directories that contain a SKILL.md file
    if (!fs.existsSync(skillMdPath)) {
      continue;
    }

    skills.push({
      name: entry.name,
      sourcePath: skillPath,
      source,
      presetName,
    });
  }

  return skills;
}

/**
 * Load agents from an agents/ directory
 * Agents are markdown files (.md) with YAML frontmatter
 */
export async function loadAgentsFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<AgentFile[]> {
  const agents: AgentFile[] = [];

  if (!fs.existsSync(directoryPath)) {
    return agents;
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
    const agentName = relativePath.replace(/\.md$/, "").replace(/\\/g, "/");

    agents.push({
      name: agentName,
      content,
      sourcePath: filePath,
      source,
      presetName,
    });
  }

  return agents;
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

  // Always split by forward slash since JSON config files use forward slashes on all platforms
  const parts = presetPath.split(path.posix.sep);
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
  config: RawConfig;
  rootDir: string;
  resolvedPath: string;
}> {
  const resolvedPresetPath = resolvePresetPath(presetPath, cwd);

  if (!resolvedPresetPath) {
    throw new Error(
      `Preset not found: "${presetPath}". Make sure the package is installed or the path is correct.`,
    );
  }

  let presetConfig: RawConfig;

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

  // Check if preset has content or inherits from other presets
  const hasInstructionsSource =
    typeof presetConfig.instructions === "string"
      ? fs.existsSync(path.resolve(presetRootDir, presetConfig.instructions))
      : false;
  const hasHooks = fs.existsSync(path.join(presetRootDir, "hooks.json"));
  const hasSkills = fs.existsSync(path.join(presetRootDir, "skills"));
  const hasAgents = fs.existsSync(path.join(presetRootDir, "agents"));
  const hasNestedPresets =
    Array.isArray(presetConfig.presets) && presetConfig.presets.length > 0;

  const hasAnyContent =
    hasInstructionsSource ||
    hasHooks ||
    hasSkills ||
    hasAgents ||
    hasNestedPresets;

  if (!hasAnyContent) {
    throw new Error(
      `Preset "${presetPath}" must have at least one of: instructions, skills/, agents/, hooks.json, or presets`,
    );
  }

  return {
    config: presetConfig,
    rootDir: presetRootDir,
    resolvedPath: resolvedPresetPath,
  };
}

/**
 * Result of recursively loading a preset and its dependencies
 */
interface PresetLoadResult {
  instructions: InstructionFile[];
  skills: SkillFile[];
  agents: AgentFile[];
  mcpServers: MCPServers;
  hooksConfigs: HooksJson[];
  hookFiles: HookFile[];
}

/**
 * Recursively load a preset and all its dependencies
 * @param presetPath The original preset path (used for namespacing)
 * @param cwd The current working directory for resolving paths
 * @param visited Set of already visited preset paths (by resolved absolute path) for cycle detection
 */
async function loadPresetRecursively(
  presetPath: string,
  cwd: string,
  visited: Set<string>,
): Promise<PresetLoadResult> {
  const preset = await loadPreset(presetPath, cwd);
  const presetRootDir = preset.rootDir;
  const presetDir = path.dirname(preset.resolvedPath);

  // Check for circular dependency
  if (visited.has(preset.resolvedPath)) {
    throw new Error(
      `Circular preset dependency detected: "${presetPath}" has already been loaded`,
    );
  }
  visited.add(preset.resolvedPath);

  const result: PresetLoadResult = {
    instructions: [],
    skills: [],
    agents: [],
    mcpServers: {},
    hooksConfigs: [],
    hookFiles: [],
  };

  // Load entities from this preset's rootDir
  if (preset.config.instructions) {
    const instructionsPath = path.resolve(
      presetRootDir,
      preset.config.instructions,
    );
    const presetInstructions = await loadInstructionsFromPath(
      instructionsPath,
      "preset",
      presetPath,
    );
    result.instructions.push(...presetInstructions);
  }

  const presetHooksFile = path.join(presetRootDir, "hooks.json");
  if (fs.existsSync(presetHooksFile)) {
    const { config: presetHooksConfig, files: presetHookFiles } =
      await loadHooksFromDirectory(presetRootDir, "preset", presetPath);
    result.hooksConfigs.push(presetHooksConfig);
    result.hookFiles.push(...presetHookFiles);
  }

  const presetSkillsPath = path.join(presetRootDir, "skills");
  if (fs.existsSync(presetSkillsPath)) {
    const presetSkills = await loadSkillsFromDirectory(
      presetSkillsPath,
      "preset",
      presetPath,
    );
    result.skills.push(...presetSkills);
  }

  const presetAgentsPath = path.join(presetRootDir, "agents");
  if (fs.existsSync(presetAgentsPath)) {
    const presetAgents = await loadAgentsFromDirectory(
      presetAgentsPath,
      "preset",
      presetPath,
    );
    result.agents.push(...presetAgents);
  }

  // Add MCP servers from this preset
  if (preset.config.mcpServers) {
    result.mcpServers = { ...preset.config.mcpServers };
  }

  // Recursively load nested presets
  if (preset.config.presets && preset.config.presets.length > 0) {
    for (const nestedPresetPath of preset.config.presets) {
      const nestedResult = await loadPresetRecursively(
        nestedPresetPath,
        presetDir, // Use preset's directory as cwd for relative paths
        visited,
      );

      // Merge results from nested preset
      result.instructions.push(...nestedResult.instructions);
      result.skills.push(...nestedResult.skills);
      result.agents.push(...nestedResult.agents);
      result.hooksConfigs.push(...nestedResult.hooksConfigs);
      result.hookFiles.push(...nestedResult.hookFiles);

      // Merge MCP servers (current preset takes precedence over nested)
      result.mcpServers = mergePresetMcpServers(
        result.mcpServers,
        nestedResult.mcpServers,
      );
    }
  }

  return result;
}

export async function loadAllInstructions(
  config: Config,
  cwd: string,
): Promise<{
  instructions: InstructionFile[];
  skills: SkillFile[];
  agents: AgentFile[];
  mcpServers: MCPServers;
  hooks: HooksJson;
  hookFiles: HookFile[];
}> {
  const allInstructions: InstructionFile[] = [];
  const allSkills: SkillFile[] = [];
  const allAgents: AgentFile[] = [];
  const allHookFiles: HookFile[] = [];
  const allHooksConfigs: HooksJson[] = [];
  let mergedMcpServers: MCPServers = { ...config.mcpServers };

  // Load local files from rootDir (or cwd if rootDir is not set)
  if (config.instructions) {
    const basePath = config.rootDir ? path.resolve(cwd, config.rootDir) : cwd;
    const instructionsPath = path.resolve(basePath, config.instructions);
    const localInstructions = await loadInstructionsFromPath(
      instructionsPath,
      "local",
    );
    allInstructions.push(...localInstructions);
  }

  if (config.rootDir) {
    const rootPath = path.resolve(cwd, config.rootDir);

    // Load hooks from hooks.json (sibling to hooks/ directory)
    const hooksFilePath = path.join(rootPath, "hooks.json");
    if (fs.existsSync(hooksFilePath)) {
      const { config: localHooksConfig, files: localHookFiles } =
        await loadHooksFromDirectory(rootPath, "local");
      allHooksConfigs.push(localHooksConfig);
      allHookFiles.push(...localHookFiles);
    }

    // Load skills from skills/ subdirectory
    const skillsPath = path.join(rootPath, "skills");
    if (fs.existsSync(skillsPath)) {
      const localSkills = await loadSkillsFromDirectory(skillsPath, "local");
      allSkills.push(...localSkills);
    }

    // Load agents from agents/ subdirectory
    const agentsPath = path.join(rootPath, "agents");
    if (fs.existsSync(agentsPath)) {
      const localAgents = await loadAgentsFromDirectory(agentsPath, "local");
      allAgents.push(...localAgents);
    }
  }

  // Load presets recursively
  if (config.presets && config.presets.length > 0) {
    const visited = new Set<string>();

    for (const presetPath of config.presets) {
      const presetResult = await loadPresetRecursively(
        presetPath,
        cwd,
        visited,
      );

      allInstructions.push(...presetResult.instructions);
      allSkills.push(...presetResult.skills);
      allAgents.push(...presetResult.agents);
      allHooksConfigs.push(...presetResult.hooksConfigs);
      allHookFiles.push(...presetResult.hookFiles);

      // Merge MCP servers (local config takes precedence)
      mergedMcpServers = mergePresetMcpServers(
        mergedMcpServers,
        presetResult.mcpServers,
      );
    }
  }

  // Merge all hooks configurations
  const mergedHooks = mergeHooksConfigs(allHooksConfigs);

  return {
    instructions: allInstructions,
    skills: allSkills,
    agents: allAgents,
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
 * Check if workspaces mode is enabled without loading all instructions/presets
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

  const { instructions, skills, agents, mcpServers, hooks, hookFiles } =
    await loadAllInstructions(configWithDefaults, workingDir);

  return {
    config: configWithDefaults,
    instructions,
    skills,
    agents,
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
