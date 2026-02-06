/**
 * Recursive preset loading: resolves local, npm, and GitHub presets.
 */

import fs from "fs-extra";
import path from "node:path";
import { InstructionFile, loadInstructionsFromPath } from "./instructions";
import {
  MCPServers,
  SkillFile,
  AgentFile,
  HooksJson,
  HookFile,
  loadSkillsFromDirectory,
  loadAgentsFromDirectory,
} from "./config";
import {
  parsePresetSource,
  GitHubPresetSource,
  isGitHubPreset,
} from "./preset-source";
import {
  getGitHubToken,
  fetchRepoSize,
  fetchFileContent,
  SPARSE_CHECKOUT_THRESHOLD_KB,
} from "./github";
import { shallowClone, sparseClone } from "./git";
import {
  getCacheEntry,
  setCacheEntry,
  isCacheValid,
  getRepoCachePath,
  buildCacheKey,
} from "./install-cache";
import { loadHooksFromDirectory } from "./hooks";

export interface PresetLoadResult {
  instructions: InstructionFile[];
  skills: SkillFile[];
  agents: AgentFile[];
  mcpServers: MCPServers;
  hooksConfigs: HooksJson[];
  hookFiles: HookFile[];
}

interface RawPresetConfig {
  rootDir?: string;
  instructions?: string;
  presets?: string[];
  mcpServers?: MCPServers;
}

async function resolvePresetPath(
  presetPath: string,
  cwd: string,
): Promise<string | null> {
  const source = parsePresetSource(presetPath);

  if (source.type === "github") {
    return resolveGitHubPreset(source);
  }

  if (!presetPath.endsWith(".json")) {
    presetPath = path.join(presetPath, "aicm.json");
  }

  const absolutePath = path.isAbsolute(presetPath)
    ? presetPath
    : path.resolve(cwd, presetPath);

  if (fs.existsSync(absolutePath)) return absolutePath;

  try {
    const resolved = require.resolve(presetPath, { paths: [cwd, __dirname] });
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

async function resolveGitHubPreset(
  source: GitHubPresetSource,
): Promise<string> {
  const { owner, repo, ref, subpath } = source;
  const cacheKey = buildCacheKey(owner, repo);

  const cached = await getCacheEntry(cacheKey);
  if (cached && isCacheValid(cached)) {
    const aicmJsonPath = subpath
      ? path.join(cached.cachePath, subpath, "aicm.json")
      : path.join(cached.cachePath, "aicm.json");
    if (fs.existsSync(aicmJsonPath)) return aicmJsonPath;
  }

  const token = getGitHubToken();
  const repoSizeKB = await fetchRepoSize(owner, repo, token);
  const destPath = getRepoCachePath(owner, repo);

  if (fs.existsSync(destPath)) await fs.remove(destPath);
  await fs.ensureDir(path.dirname(destPath));

  const useSparse =
    repoSizeKB !== null && repoSizeKB > SPARSE_CHECKOUT_THRESHOLD_KB;

  if (useSparse) {
    const sparsePaths = await determineSparseCheckoutPaths(
      owner,
      repo,
      subpath,
      ref,
      token,
    );
    try {
      await sparseClone(source.cloneUrl, destPath, sparsePaths, ref);
    } catch {
      if (fs.existsSync(destPath)) await fs.remove(destPath);
      await shallowClone(source.cloneUrl, destPath, ref);
    }
  } else {
    await shallowClone(source.cloneUrl, destPath, ref);
  }

  const aicmJsonPath = subpath
    ? path.join(destPath, subpath, "aicm.json")
    : path.join(destPath, "aicm.json");

  if (!fs.existsSync(aicmJsonPath)) {
    const location = subpath ? `${subpath}/` : "root of ";
    throw new Error(
      `No aicm.json found at ${location}${owner}/${repo}. ` +
        `Make sure the repository contains an aicm.json configuration file at the specified path.`,
    );
  }

  await setCacheEntry(cacheKey, {
    url: source.raw,
    ref,
    subpath,
    cachedAt: new Date().toISOString(),
    cachePath: destPath,
  });

  return aicmJsonPath;
}

async function determineSparseCheckoutPaths(
  owner: string,
  repo: string,
  subpath: string | undefined,
  ref: string | undefined,
  token: string | null,
): Promise<string[]> {
  const configPath = subpath
    ? path.posix.join(subpath, "aicm.json")
    : "aicm.json";

  const content = await fetchFileContent(owner, repo, configPath, ref, token);

  if (!content) return subpath ? [subpath] : ["."];

  try {
    const config = JSON.parse(content) as { rootDir?: string };
    const rootDir = config.rootDir || ".";

    if (subpath) {
      const resolvedRoot = path.posix.normalize(
        path.posix.join(subpath, rootDir),
      );
      if (
        !resolvedRoot.startsWith(subpath) &&
        resolvedRoot !== subpath.replace(/\/$/, "")
      ) {
        throw new Error(
          `rootDir "${rootDir}" in preset escapes the specified subpath "${subpath}". ` +
            `rootDir must reference a path within the preset's directory.`,
        );
      }

      const paths = [path.posix.join(subpath, "aicm.json")];
      const rootPath = path.posix.normalize(path.posix.join(subpath, rootDir));
      if (rootPath !== subpath && rootPath !== path.posix.join(subpath, ".")) {
        paths.push(rootPath);
      } else {
        paths.push(subpath);
      }
      return [...new Set(paths)];
    }

    const paths = ["aicm.json"];
    if (rootDir !== "." && rootDir !== "./") paths.push(rootDir);
    return paths.length > 0 ? paths : ["."];
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("rootDir") &&
      error.message.includes("escapes")
    ) {
      throw error;
    }
    return subpath ? [subpath] : ["."];
  }
}

// ---------- Preset loading ----------

async function loadPreset(
  presetPath: string,
  cwd: string,
): Promise<{
  config: RawPresetConfig;
  rootDir: string;
  resolvedPath: string;
}> {
  const resolvedPresetPath = await resolvePresetPath(presetPath, cwd);

  if (!resolvedPresetPath) {
    const hint = isGitHubPreset(presetPath)
      ? "Make sure the GitHub URL is correct and the repository contains an aicm.json."
      : "Make sure the package is installed or the path is correct.";
    throw new Error(`Preset not found: "${presetPath}". ${hint}`);
  }

  let presetConfig: RawPresetConfig;
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

  const hasInstructions =
    typeof presetConfig.instructions === "string"
      ? fs.existsSync(path.resolve(presetRootDir, presetConfig.instructions))
      : false;
  const hasHooks = fs.existsSync(path.join(presetRootDir, "hooks.json"));
  const hasSkills = fs.existsSync(path.join(presetRootDir, "skills"));
  const hasAgents = fs.existsSync(path.join(presetRootDir, "agents"));
  const hasNestedPresets =
    Array.isArray(presetConfig.presets) && presetConfig.presets.length > 0;

  if (
    !hasInstructions &&
    !hasHooks &&
    !hasSkills &&
    !hasAgents &&
    !hasNestedPresets
  ) {
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

export async function loadPresetRecursively(
  presetPath: string,
  cwd: string,
  visited: Set<string>,
): Promise<PresetLoadResult> {
  const preset = await loadPreset(presetPath, cwd);
  const presetRootDir = preset.rootDir;
  const presetDir = path.dirname(preset.resolvedPath);

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

  if (preset.config.instructions) {
    const instructionsPath = path.resolve(
      presetRootDir,
      preset.config.instructions,
    );
    result.instructions.push(
      ...(await loadInstructionsFromPath(
        instructionsPath,
        "preset",
        presetPath,
      )),
    );
  }

  if (fs.existsSync(path.join(presetRootDir, "hooks.json"))) {
    const { config: hooksConfig, files } = await loadHooksFromDirectory(
      presetRootDir,
      "preset",
      presetPath,
    );
    result.hooksConfigs.push(hooksConfig);
    result.hookFiles.push(...files);
  }

  const skillsPath = path.join(presetRootDir, "skills");
  if (fs.existsSync(skillsPath)) {
    result.skills.push(
      ...(await loadSkillsFromDirectory(skillsPath, "preset", presetPath)),
    );
  }

  const agentsPath = path.join(presetRootDir, "agents");
  if (fs.existsSync(agentsPath)) {
    result.agents.push(
      ...(await loadAgentsFromDirectory(agentsPath, "preset", presetPath)),
    );
  }

  if (preset.config.mcpServers) {
    result.mcpServers = { ...preset.config.mcpServers };
  }

  if (preset.config.presets && preset.config.presets.length > 0) {
    for (const nestedPresetPath of preset.config.presets) {
      const nested = await loadPresetRecursively(
        nestedPresetPath,
        presetDir,
        visited,
      );
      result.instructions.push(...nested.instructions);
      result.skills.push(...nested.skills);
      result.agents.push(...nested.agents);
      result.hooksConfigs.push(...nested.hooksConfigs);
      result.hookFiles.push(...nested.hookFiles);
      result.mcpServers = mergePresetMcpServers(
        result.mcpServers,
        nested.mcpServers,
      );
    }
  }

  return result;
}

export function mergePresetMcpServers(
  configServers: MCPServers,
  presetServers: MCPServers,
): MCPServers {
  const merged = { ...configServers };

  for (const [name, config] of Object.entries(presetServers)) {
    if (
      Object.prototype.hasOwnProperty.call(merged, name) &&
      merged[name] === false
    ) {
      delete merged[name];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(merged, name)) {
      merged[name] = config;
    }
  }

  return merged;
}
