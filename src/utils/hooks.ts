/**
 * Hook loading, merging, and writing to Cursor and Claude Code targets.
 */

import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";

export type HookType =
  | "beforeShellExecution"
  | "beforeMCPExecution"
  | "afterShellExecution"
  | "afterMCPExecution"
  | "beforeReadFile"
  | "afterFileEdit"
  | "beforeSubmitPrompt"
  | "stop";

export interface HookCommand {
  command: string;
}

export interface HooksJson {
  version: number;
  hooks: { [K in HookType]?: HookCommand[] };
}

export interface HookFile {
  name: string;
  basename: string;
  content: Buffer;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
}

// ---------- Namespace extraction ----------

function extractNamespaceFromPresetPath(presetPath: string): string[] {
  if (presetPath.startsWith("@")) {
    return presetPath.split("/");
  }
  const parts = presetPath.split(path.posix.sep);
  return parts.filter((p) => p.length > 0 && p !== "." && p !== "..");
}

// ---------- Loading ----------

async function loadAllFilesFromDirectory(
  dir: string,
  baseDir: string = dir,
): Promise<Array<{ relativePath: string; absolutePath: string }>> {
  const files: Array<{ relativePath: string; absolutePath: string }> = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await loadAllFilesFromDirectory(fullPath, baseDir)));
    } else if (entry.isFile() && entry.name !== "hooks.json") {
      files.push({
        relativePath: path.relative(baseDir, fullPath),
        absolutePath: fullPath,
      });
    }
  }

  return files;
}

function validateHookPath(
  commandPath: string,
  rootDir: string,
  hooksDir: string,
): { valid: boolean; relativePath?: string } {
  if (!commandPath.startsWith("./") && !commandPath.startsWith("../")) {
    return { valid: false };
  }
  const resolvedPath = path.resolve(rootDir, commandPath);
  const relativePath = path.relative(hooksDir, resolvedPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return { valid: false };
  }
  return { valid: true, relativePath };
}

export async function loadHooksFromDirectory(
  rootDir: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<{ config: HooksJson; files: HookFile[] }> {
  const hooksFilePath = path.join(rootDir, "hooks.json");
  const hooksDir = path.join(rootDir, "hooks");

  if (!fs.existsSync(hooksFilePath)) {
    return { config: { version: 1, hooks: {} }, files: [] };
  }

  const content = await fs.readFile(hooksFilePath, "utf8");
  const hooksConfig: HooksJson = JSON.parse(content);

  const hookFiles: HookFile[] = [];

  if (fs.existsSync(hooksDir)) {
    const allFiles = await loadAllFilesFromDirectory(hooksDir);

    // Validate commands
    if (hooksConfig.hooks) {
      for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
        const commands = hooksConfig.hooks[hookType];
        if (commands && Array.isArray(commands)) {
          for (const hookCommand of commands) {
            if (
              hookCommand.command &&
              typeof hookCommand.command === "string"
            ) {
              const validation = validateHookPath(
                hookCommand.command,
                rootDir,
                hooksDir,
              );
              if (!validation.valid || !validation.relativePath) {
                console.warn(
                  `Warning: Hook command "${hookCommand.command}" in hooks.json must reference a file within the hooks/ directory. Skipping.`,
                );
              }
            }
          }
        }
      }
    }

    for (const file of allFiles) {
      const fileContent = await fs.readFile(file.absolutePath);
      const basename = path.basename(file.absolutePath);

      let namespacedPath: string;
      if (source === "preset" && presetName) {
        const namespace = extractNamespaceFromPresetPath(presetName);
        namespacedPath = path.posix.join(
          ...namespace,
          file.relativePath.split(path.sep).join(path.posix.sep),
        );
      } else {
        namespacedPath = file.relativePath.split(path.sep).join(path.posix.sep);
      }

      hookFiles.push({
        name: namespacedPath,
        basename,
        content: fileContent,
        sourcePath: file.absolutePath,
        source,
        presetName,
      });
    }
  }

  const rewrittenConfig = rewriteHooksConfigForNamespace(
    hooksConfig,
    hookFiles,
    rootDir,
  );

  return { config: rewrittenConfig, files: hookFiles };
}

function rewriteHooksConfigForNamespace(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  rootDir: string,
): HooksJson {
  const sourcePathToFile = new Map<string, HookFile>();
  for (const hookFile of hookFiles) {
    sourcePathToFile.set(hookFile.sourcePath, hookFile);
  }

  const rewritten: HooksJson = { version: hooksConfig.version, hooks: {} };

  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const commands = hooksConfig.hooks[hookType];
      if (commands && Array.isArray(commands)) {
        rewritten.hooks[hookType] = commands
          .map((hookCommand) => {
            const commandPath = hookCommand.command;
            if (
              commandPath &&
              typeof commandPath === "string" &&
              (commandPath.startsWith("./") || commandPath.startsWith("../"))
            ) {
              const resolved = path.resolve(rootDir, commandPath);
              const matched = sourcePathToFile.get(resolved);
              if (matched) return { command: matched.name };
              return null;
            }
            return hookCommand;
          })
          .filter((entry): entry is HookCommand => entry !== null);
      }
    }
  }

  return rewritten;
}

export function mergeHooksConfigs(configs: HooksJson[]): HooksJson {
  const merged: HooksJson = { version: 1, hooks: {} };

  for (const config of configs) {
    if (config.version) merged.version = config.version;
    if (config.hooks) {
      for (const hookType of Object.keys(config.hooks) as HookType[]) {
        const commands = config.hooks[hookType];
        if (commands && Array.isArray(commands)) {
          if (!merged.hooks[hookType]) merged.hooks[hookType] = [];
          merged.hooks[hookType] = [
            ...(merged.hooks[hookType] || []),
            ...commands,
          ];
        }
      }
    }
  }

  return merged;
}

export function countHooks(hooksConfig: HooksJson): number {
  let count = 0;
  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const commands = hooksConfig.hooks[hookType];
      if (commands && Array.isArray(commands)) count += commands.length;
    }
  }
  return count;
}

export function dedupeHookFiles(hookFiles: HookFile[]): HookFile[] {
  const fileMap = new Map<string, HookFile>();

  for (const hookFile of hookFiles) {
    if (fileMap.has(hookFile.name)) {
      const existing = fileMap.get(hookFile.name)!;
      const existingHash = crypto
        .createHash("md5")
        .update(existing.content)
        .digest("hex");
      const currentHash = crypto
        .createHash("md5")
        .update(hookFile.content)
        .digest("hex");

      if (existingHash !== currentHash) {
        const src = hookFile.presetName
          ? `preset "${hookFile.presetName}"`
          : hookFile.source;
        const existSrc = existing.presetName
          ? `preset "${existing.presetName}"`
          : existing.source;
        console.warn(
          `Warning: Hook file "${hookFile.name}" has different content from ${existSrc} and ${src}. Using last occurrence.`,
        );
      }
    }
    fileMap.set(hookFile.name, hookFile);
  }

  return Array.from(fileMap.values());
}

function rewriteHooksConfigToManagedDir(hooksConfig: HooksJson): HooksJson {
  const rewritten: HooksJson = { version: hooksConfig.version, hooks: {} };

  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const commands = hooksConfig.hooks[hookType];
      if (commands && Array.isArray(commands)) {
        rewritten.hooks[hookType] = commands.map((hookCommand) => {
          if (hookCommand.command && typeof hookCommand.command === "string") {
            return { command: `./hooks/aicm/${hookCommand.command}` };
          }
          return hookCommand;
        });
      }
    }
  }

  return rewritten;
}

/**
 * Write hooks to Cursor target (.cursor/hooks.json + .cursor/hooks/aicm/).
 * Preserves user-defined hooks while replacing aicm-managed ones.
 */
export function writeHooksToCursor(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  cwd: string,
): void {
  const cursorRoot = path.join(cwd, ".cursor");
  const hooksJsonPath = path.join(cursorRoot, "hooks.json");
  const hooksDir = path.join(cursorRoot, "hooks", "aicm");

  const dedupedFiles = dedupeHookFiles(hookFiles);
  fs.emptyDirSync(hooksDir);

  for (const hookFile of dedupedFiles) {
    const targetPath = path.join(hooksDir, hookFile.name);
    fs.ensureDirSync(path.dirname(targetPath));
    fs.writeFileSync(targetPath, hookFile.content);
  }

  const finalConfig = rewriteHooksConfigToManagedDir(hooksConfig);

  let existingConfig: HooksJson | null = null;
  if (fs.existsSync(hooksJsonPath)) {
    try {
      existingConfig = fs.readJsonSync(hooksJsonPath);
    } catch {
      existingConfig = null;
    }
  }

  // Extract user-defined hooks (not managed by aicm)
  const userHooks: HooksJson = { version: 1, hooks: {} };
  if (existingConfig?.hooks) {
    for (const hookType of Object.keys(existingConfig.hooks) as HookType[]) {
      const commands = existingConfig.hooks[hookType];
      if (commands && Array.isArray(commands)) {
        const userCommands = commands.filter(
          (cmd) => !cmd.command?.includes("hooks/aicm/"),
        );
        if (userCommands.length > 0) userHooks.hooks[hookType] = userCommands;
      }
    }
  }

  // Merge: user hooks first, then aicm hooks
  const mergedConfig: HooksJson = { version: finalConfig.version, hooks: {} };

  if (userHooks.hooks) {
    for (const hookType of Object.keys(userHooks.hooks) as HookType[]) {
      const commands = userHooks.hooks[hookType];
      if (commands) mergedConfig.hooks[hookType] = [...commands];
    }
  }

  if (finalConfig.hooks) {
    for (const hookType of Object.keys(finalConfig.hooks) as HookType[]) {
      const commands = finalConfig.hooks[hookType];
      if (commands) {
        if (!mergedConfig.hooks[hookType]) mergedConfig.hooks[hookType] = [];
        mergedConfig.hooks[hookType]!.push(...commands);
      }
    }
  }

  fs.ensureDirSync(path.dirname(hooksJsonPath));
  fs.writeJsonSync(hooksJsonPath, mergedConfig, { spaces: 2 });
}

// ---------- Claude Code hooks ----------
// Claude Code uses a different hooks format in .claude/settings.json:
// hooks are grouped by event name with matcher patterns, not by aicm HookType.

const AICM_TO_CLAUDE_CODE_HOOK_MAP: Partial<Record<HookType, string>> = {
  beforeShellExecution: "PreToolUse",
  afterShellExecution: "PostToolUse",
  beforeMCPExecution: "PreToolUse",
  afterMCPExecution: "PostToolUse",
  beforeReadFile: "PreToolUse",
  afterFileEdit: "PostToolUse",
  beforeSubmitPrompt: "UserPromptSubmit",
  stop: "Stop",
};

const AICM_TO_CLAUDE_CODE_MATCHER_MAP: Partial<
  Record<HookType, string | undefined>
> = {
  beforeShellExecution: "Bash",
  afterShellExecution: "Bash",
  beforeMCPExecution: "mcp__.*",
  afterMCPExecution: "mcp__.*",
  beforeReadFile: "Read",
  afterFileEdit: "Edit|Write",
  beforeSubmitPrompt: undefined,
  stop: undefined,
};

function convertHooksToClaudeCodeFormat(
  hooksConfig: HooksJson,
): Record<
  string,
  Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>
> {
  const claudeHooks: Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>
  > = {};

  if (!hooksConfig.hooks) return claudeHooks;

  for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
    const commands = hooksConfig.hooks[hookType];
    if (!commands || commands.length === 0) continue;

    const claudeEvent = AICM_TO_CLAUDE_CODE_HOOK_MAP[hookType];
    if (!claudeEvent) continue;

    const matcher = AICM_TO_CLAUDE_CODE_MATCHER_MAP[hookType];
    const handlers = commands.map((hookCommand) => ({
      type: "command" as const,
      command: hookCommand.command,
    }));

    if (!claudeHooks[claudeEvent]) claudeHooks[claudeEvent] = [];

    const group: {
      matcher?: string;
      hooks: Array<{ type: string; command: string }>;
    } = { hooks: handlers };
    if (matcher) group.matcher = matcher;

    claudeHooks[claudeEvent].push(group);
  }

  return claudeHooks;
}

/**
 * Write hooks to Claude Code target (.claude/settings.json + .claude/hooks/aicm/).
 * Converts aicm hook types to Claude Code event/matcher format.
 */
export function writeHooksToClaudeCode(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  cwd: string,
): void {
  const claudeRoot = path.join(cwd, ".claude");
  const settingsPath = path.join(claudeRoot, "settings.json");
  const hooksDir = path.join(claudeRoot, "hooks", "aicm");

  const dedupedFiles = dedupeHookFiles(hookFiles);
  fs.emptyDirSync(hooksDir);

  for (const hookFile of dedupedFiles) {
    const targetPath = path.join(hooksDir, hookFile.name);
    fs.ensureDirSync(path.dirname(targetPath));
    fs.writeFileSync(targetPath, hookFile.content);
  }

  const rewrittenConfig = rewriteHooksConfigToManagedDir(hooksConfig);
  const claudeHooks = convertHooksToClaudeCodeFormat(rewrittenConfig);

  let existingSettings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existingSettings = fs.readJsonSync(settingsPath);
    } catch {
      existingSettings = {};
    }
  }

  const existingHooks =
    (existingSettings.hooks as Record<string, unknown[]> | undefined) ?? {};
  const userHooks: Record<string, unknown[]> = {};

  for (const [eventName, matcherGroups] of Object.entries(existingHooks)) {
    if (Array.isArray(matcherGroups)) {
      const userGroups = matcherGroups.filter((group) => {
        if (typeof group !== "object" || group === null) return true;
        const g = group as Record<string, unknown>;
        if (!Array.isArray(g.hooks)) return true;
        return !g.hooks.some(
          (h: unknown) =>
            typeof h === "object" &&
            h !== null &&
            typeof (h as Record<string, unknown>).command === "string" &&
            ((h as Record<string, unknown>).command as string).includes(
              "hooks/aicm/",
            ),
        );
      });
      if (userGroups.length > 0) userHooks[eventName] = userGroups;
    }
  }

  const mergedHooks: Record<string, unknown[]> = { ...userHooks };
  for (const [eventName, groups] of Object.entries(claudeHooks)) {
    if (!mergedHooks[eventName]) mergedHooks[eventName] = [];
    mergedHooks[eventName].push(...groups);
  }

  const mergedSettings: Record<string, unknown> = { ...existingSettings };
  if (Object.keys(mergedHooks).length > 0) {
    mergedSettings.hooks = mergedHooks;
  } else {
    delete mergedSettings.hooks;
  }

  fs.ensureDirSync(path.dirname(settingsPath));
  fs.writeJsonSync(settingsPath, mergedSettings, { spaces: 2 });
}
