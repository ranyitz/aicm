/**
 * Configuration loading and validation.
 *
 * Loads aicm.json via cosmiconfig, validates structure,
 * and resolves all referenced resources (instructions, skills, agents, hooks, presets).
 */

import fs from "fs-extra";
import path from "node:path";
import fg from "fast-glob";
import { cosmiconfig } from "cosmiconfig";
import { InstructionFile, loadInstructionsFromPath } from "./instructions";
import { TargetsConfig, validateTargetsInput, resolveTargets } from "./targets";
import {
  HookFile,
  HooksJson,
  loadHooksFromDirectory,
  mergeHooksConfigs,
} from "./hooks";
import { loadPresetRecursively, mergePresetMcpServers } from "./preset-loader";

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

export interface SkillFile {
  name: string;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
}

export interface AgentFile {
  name: string;
  content: string;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
}

export type { HookFile, HooksJson } from "./hooks";

export interface Config {
  rootDir?: string;
  instructionsFile?: string;
  instructionsDir?: string;
  targets: TargetsConfig;
  presets?: string[];
  mcpServers?: MCPServers;
  workspaces?: boolean;
  skipInstall?: boolean;
}

export interface ResolvedConfig {
  config: Config;
  instructions: InstructionFile[];
  skills: SkillFile[];
  agents: AgentFile[];
  mcpServers: MCPServers;
  hooks: HooksJson;
  hookFiles: HookFile[];
}

const ALLOWED_CONFIG_KEYS = [
  "rootDir",
  "instructionsFile",
  "instructionsDir",
  "targets",
  "presets",
  "mcpServers",
  "workspaces",
  "skipInstall",
] as const;

const DEFAULT_INSTRUCTIONS_FILE = "AGENTS.src.md";

/**
 * Auto-detect instruction source under a root directory.
 * Detects both AGENTS.src.md (single file) and instructions/ (directory) when present.
 */
function autoDetectInstructions(rootPath: string): {
  instructionsFile?: string;
  instructionsDir?: string;
} {
  const detected: { instructionsFile?: string; instructionsDir?: string } = {};

  if (fs.existsSync(path.join(rootPath, DEFAULT_INSTRUCTIONS_FILE))) {
    detected.instructionsFile = DEFAULT_INSTRUCTIONS_FILE;
  }
  if (fs.existsSync(path.join(rootPath, "instructions"))) {
    detected.instructionsDir = "instructions";
  }

  return detected;
}

function validateConfig(
  config: unknown,
  configFilePath: string,
  cwd: string,
  isWorkspaceMode: boolean = false,
): void {
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

  const obj = config as Record<string, unknown>;
  const hasRootDir = typeof obj.rootDir === "string";
  const hasExplicitFile = typeof obj.instructionsFile === "string";
  const hasExplicitDir = typeof obj.instructionsDir === "string";
  const hasPresets =
    Array.isArray(obj.presets) && (obj.presets as unknown[]).length > 0;

  // Resolve the effective instruction source (explicit or auto-detected)
  const baseDir = hasRootDir ? path.resolve(cwd, obj.rootDir as string) : cwd;
  let resolvedFile: string | undefined;
  let resolvedDir: string | undefined;

  if (hasExplicitFile) {
    resolvedFile = obj.instructionsFile as string;
  }
  if (hasExplicitDir) {
    resolvedDir = obj.instructionsDir as string;
  }
  if (!hasExplicitFile && !hasExplicitDir && hasRootDir) {
    const detected = autoDetectInstructions(
      path.resolve(cwd, obj.rootDir as string),
    );
    resolvedFile = detected.instructionsFile;
    resolvedDir = detected.instructionsDir;
  }

  const hasInstructions =
    resolvedFile !== undefined || resolvedDir !== undefined;

  // Validate explicit paths exist
  if (hasExplicitFile) {
    const filePath = path.resolve(baseDir, obj.instructionsFile as string);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Instructions file does not exist: ${filePath}`);
    }
  }
  if (hasExplicitDir) {
    const dirPath = path.resolve(baseDir, resolvedDir as string);
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Instructions path does not exist: ${dirPath}`);
    }
  }

  if (hasRootDir) {
    const rootPath = path.resolve(cwd, obj.rootDir as string);
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Root directory does not exist: ${rootPath}`);
    }
    if (!fs.statSync(rootPath).isDirectory()) {
      throw new Error(`Root path is not a directory: ${rootPath}`);
    }

    const hasResolvedFile = resolvedFile
      ? fs.existsSync(path.resolve(rootPath, resolvedFile))
      : false;
    const hasResolvedDir = resolvedDir
      ? fs.existsSync(path.resolve(rootPath, resolvedDir))
      : false;
    const hasInstructionsSource = hasResolvedFile || hasResolvedDir;
    const hasHooks = fs.existsSync(path.join(rootPath, "hooks.json"));
    const hasSkills = fs.existsSync(path.join(rootPath, "skills"));
    const hasAgents = fs.existsSync(path.join(rootPath, "agents"));

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
    throw new Error(
      `At least one of rootDir, instructionsFile, instructionsDir, or presets must be specified in config at ${configFilePath}`,
    );
  }

  if ("targets" in obj) {
    validateTargetsInput(obj.targets, configFilePath);
  }
}

export function detectWorkspacesFromPackageJson(cwd: string): boolean {
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(pkg.workspaces);
  } catch {
    return false;
  }
}

function resolveWorkspacesFlag(
  config: unknown,
  configFilePath: string,
  cwd: string,
): boolean {
  const hasWorkspaces =
    typeof config === "object" && config !== null && "workspaces" in config;

  if (hasWorkspaces) {
    if (typeof (config as Record<string, unknown>).workspaces === "boolean") {
      return (config as Record<string, unknown>).workspaces as boolean;
    }
    throw new Error(
      `workspaces must be a boolean in config at ${configFilePath}`,
    );
  }

  return detectWorkspacesFromPackageJson(cwd);
}

interface RawConfig {
  rootDir?: string;
  instructionsFile?: string;
  instructionsDir?: string;
  targets?: string[];
  presets?: string[];
  mcpServers?: MCPServers;
  workspaces?: boolean;
  skipInstall?: boolean;
}

function applyDefaults(
  raw: RawConfig,
  workspaces: boolean,
  cwd: string,
): Config {
  let instructionsFile = raw.instructionsFile;
  let instructionsDir = raw.instructionsDir;

  // Auto-detect when neither field is explicitly set
  if (!instructionsFile && !instructionsDir && raw.rootDir) {
    const detected = autoDetectInstructions(path.resolve(cwd, raw.rootDir));
    instructionsFile = detected.instructionsFile;
    instructionsDir = detected.instructionsDir;
  }

  return {
    rootDir: raw.rootDir,
    instructionsFile,
    instructionsDir,
    targets: resolveTargets(raw.targets),
    presets: raw.presets || [],
    mcpServers: raw.mcpServers || {},
    workspaces,
    skipInstall: raw.skipInstall || false,
  };
}

async function loadConfigFile(searchFrom?: string) {
  const explorer = cosmiconfig("aicm", {
    searchPlaces: ["aicm.json", "package.json"],
  });

  try {
    return await explorer.search(searchFrom);
  } catch (error) {
    throw new Error(
      `Failed to load configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Check if workspaces mode is enabled without loading all resources.
 */
export async function checkWorkspacesEnabled(cwd?: string): Promise<boolean> {
  const workingDir = cwd || process.cwd();
  const result = await loadConfigFile(workingDir);

  if (!result?.config) {
    return detectWorkspacesFromPackageJson(workingDir);
  }

  return resolveWorkspacesFlag(result.config, result.filepath, workingDir);
}

/**
 * Load and fully resolve the configuration, including all instructions,
 * skills, agents, hooks, and presets.
 */
export async function loadConfig(cwd?: string): Promise<ResolvedConfig | null> {
  const workingDir = cwd || process.cwd();
  const configResult = await loadConfigFile(workingDir);

  if (!configResult?.config) {
    return null;
  }

  const raw = configResult.config;
  const isWorkspaces = resolveWorkspacesFlag(
    raw,
    configResult.filepath,
    workingDir,
  );

  validateConfig(raw, configResult.filepath, workingDir, isWorkspaces);

  const config = applyDefaults(raw, isWorkspaces, workingDir);

  const { instructions, skills, agents, mcpServers, hooks, hookFiles } =
    await loadAllResources(config, workingDir);

  return { config, instructions, skills, agents, mcpServers, hooks, hookFiles };
}

// ---------- Resource loading ----------

async function loadAllResources(
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
  let mergedMcpServers: MCPServers = { ...config.mcpServers };
  const allHooksConfigs: HooksJson[] = [];

  // Load local instructions (single file and/or directory)
  const basePath = config.rootDir ? path.resolve(cwd, config.rootDir) : cwd;
  if (config.instructionsFile) {
    const instructionsFilePath = path.resolve(
      basePath,
      config.instructionsFile,
    );
    const local = await loadInstructionsFromPath(instructionsFilePath, "local");
    allInstructions.push(...local);
  }
  if (config.instructionsDir) {
    const instructionsDirPath = path.resolve(basePath, config.instructionsDir);
    const local = await loadInstructionsFromPath(instructionsDirPath, "local");
    allInstructions.push(...local);
  }

  // Load local skills, agents, hooks from rootDir
  if (config.rootDir) {
    const rootPath = path.resolve(cwd, config.rootDir);

    const hooksFilePath = path.join(rootPath, "hooks.json");
    if (fs.existsSync(hooksFilePath)) {
      const { config: hooksConfig, files } = await loadHooksFromDirectory(
        rootPath,
        "local",
      );
      allHooksConfigs.push(hooksConfig);
      allHookFiles.push(...files);
    }

    const skillsPath = path.join(rootPath, "skills");
    if (fs.existsSync(skillsPath)) {
      const skills = await loadSkillsFromDirectory(skillsPath, "local");
      allSkills.push(...skills);
    }

    const agentsPath = path.join(rootPath, "agents");
    if (fs.existsSync(agentsPath)) {
      const agents = await loadAgentsFromDirectory(agentsPath, "local");
      allAgents.push(...agents);
    }
  }

  // Load presets recursively
  if (config.presets && config.presets.length > 0) {
    const visited = new Set<string>();

    for (const presetPath of config.presets) {
      const result = await loadPresetRecursively(presetPath, cwd, visited);
      allInstructions.push(...result.instructions);
      allSkills.push(...result.skills);
      allAgents.push(...result.agents);
      allHooksConfigs.push(...result.hooksConfigs);
      allHookFiles.push(...result.hookFiles);
      mergedMcpServers = mergePresetMcpServers(
        mergedMcpServers,
        result.mcpServers,
      );
    }
  }

  // Merge hooks configs
  const mergedHooks: HooksJson =
    allHooksConfigs.length > 0
      ? mergeHooksConfigs(allHooksConfigs)
      : { version: 1, hooks: {} };

  return {
    instructions: allInstructions,
    skills: allSkills,
    agents: allAgents,
    mcpServers: mergedMcpServers,
    hooks: mergedHooks,
    hookFiles: allHookFiles,
  };
}

async function loadSkillsFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<SkillFile[]> {
  if (!fs.existsSync(directoryPath)) return [];

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const skills: SkillFile[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(directoryPath, entry.name);
    if (!fs.existsSync(path.join(skillPath, "SKILL.md"))) continue;
    skills.push({
      name: entry.name,
      sourcePath: skillPath,
      source,
      presetName,
    });
  }

  return skills;
}

export { loadSkillsFromDirectory, loadAgentsFromDirectory };

async function loadAgentsFromDirectory(
  directoryPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<AgentFile[]> {
  if (!fs.existsSync(directoryPath)) return [];

  const pattern = path.join(directoryPath, "**/*.md").replace(/\\/g, "/");
  const filePaths = await fg(pattern, { onlyFiles: true, absolute: true });
  filePaths.sort();

  const agents: AgentFile[] = [];
  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = path
      .relative(directoryPath, filePath)
      .replace(/\\/g, "/");
    const agentName = relativePath.replace(/\.md$/, "");
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
