import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";
import { extractNamespaceFromPresetPath } from "./config";

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
  hooks: {
    [K in HookType]?: HookCommand[];
  };
}

export interface HookFile {
  name: string; // Namespaced path for installation (e.g., "preset-name/script.sh" or "script.sh")
  basename: string; // Original basename (e.g., "script.sh")
  content: Buffer;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
}

/**
 * Validate that a command path points to a file within the hooks directory
 */
function validateHookPath(
  commandPath: string,
  hooksDir: string,
): { valid: boolean; relativePath?: string } {
  if (!commandPath.startsWith("./") && !commandPath.startsWith("../")) {
    return { valid: false };
  }

  const resolvedPath = path.resolve(hooksDir, commandPath);
  const relativePath = path.relative(hooksDir, resolvedPath);

  // Check if the file is within hooks directory (not using .. to escape)
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return { valid: false };
  }

  return { valid: true, relativePath };
}

/**
 * Load hooks configuration from a hooks.json file and collect all referenced files
 * All hook script files must be in the hooks directory (same directory as hooks.json)
 */
export async function loadHooksFromFile(
  hooksFilePath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<{ config: HooksJson; files: HookFile[] }> {
  if (!fs.existsSync(hooksFilePath)) {
    return {
      config: { version: 1, hooks: {} },
      files: [],
    };
  }

  const content = await fs.readFile(hooksFilePath, "utf8");
  const hooksConfig: HooksJson = JSON.parse(content);

  const hooksDir = path.dirname(hooksFilePath);
  const hookFiles: HookFile[] = [];
  const seenFiles = new Set<string>();

  // Collect all command paths from the hooks configuration
  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const hookCommands = hooksConfig.hooks[hookType];

      if (hookCommands && Array.isArray(hookCommands)) {
        for (const hookCommand of hookCommands) {
          const commandPath = hookCommand.command;

          if (commandPath && typeof commandPath === "string") {
            const validation = validateHookPath(commandPath, hooksDir);

            if (!validation.valid || !validation.relativePath) {
              console.warn(
                `Warning: Hook command "${commandPath}" must point to a file within the hooks directory. Skipping.`,
              );
              continue;
            }

            const resolvedPath = path.resolve(hooksDir, commandPath);

            if (
              fs.existsSync(resolvedPath) &&
              fs.statSync(resolvedPath).isFile() &&
              !seenFiles.has(resolvedPath)
            ) {
              seenFiles.add(resolvedPath);
              const fileContent = await fs.readFile(resolvedPath);
              const basename = path.basename(resolvedPath);

              // Use the relative path from hooks directory
              const relativePath = validation.relativePath;

              // Namespace preset files
              let namespacedPath: string;
              if (source === "preset" && presetName) {
                const namespace = extractNamespaceFromPresetPath(presetName);
                // Use posix paths for consistent cross-platform behavior
                namespacedPath = path.posix.join(
                  ...namespace,
                  relativePath.split(path.sep).join(path.posix.sep),
                );
              } else {
                // For local files, use the relative path as-is
                namespacedPath = relativePath
                  .split(path.sep)
                  .join(path.posix.sep);
              }

              hookFiles.push({
                name: namespacedPath,
                basename,
                content: fileContent,
                sourcePath: resolvedPath,
                source,
                presetName,
              });
            }
          }
        }
      }
    }
  }

  // Rewrite the config to use namespaced file names
  const rewrittenConfig = rewriteHooksConfigForNamespace(
    hooksConfig,
    hookFiles,
    hooksDir,
  );

  return { config: rewrittenConfig, files: hookFiles };
}

/**
 * Rewrite hooks config to use the namespaced names from the hook files
 */
function rewriteHooksConfigForNamespace(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  hooksDir: string,
): HooksJson {
  // Create a map from sourcePath to the hookFile
  const sourcePathToFile = new Map<string, HookFile>();
  for (const hookFile of hookFiles) {
    sourcePathToFile.set(hookFile.sourcePath, hookFile);
  }

  const rewritten: HooksJson = {
    version: hooksConfig.version,
    hooks: {},
  };

  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const hookCommands = hooksConfig.hooks[hookType];
      if (hookCommands && Array.isArray(hookCommands)) {
        rewritten.hooks[hookType] = hookCommands
          .map((hookCommand) => {
            const commandPath = hookCommand.command;
            if (
              commandPath &&
              typeof commandPath === "string" &&
              (commandPath.startsWith("./") || commandPath.startsWith("../"))
            ) {
              const resolvedPath = path.resolve(hooksDir, commandPath);
              const hookFile = sourcePathToFile.get(resolvedPath);
              if (hookFile) {
                // Use the namespaced name
                return { command: hookFile.name };
              }
              // File was invalid or not found, filter it out
              return null;
            }
            return hookCommand;
          })
          .filter((cmd): cmd is HookCommand => cmd !== null);
      }
    }
  }

  return rewritten;
}

/**
 * Merge multiple hooks configurations into one
 * Later configurations override earlier ones for the same hook type
 */
export function mergeHooksConfigs(configs: HooksJson[]): HooksJson {
  const merged: HooksJson = {
    version: 1,
    hooks: {},
  };

  for (const config of configs) {
    // Use the latest version
    if (config.version) {
      merged.version = config.version;
    }

    // Merge hooks - concatenate arrays for each hook type
    if (config.hooks) {
      for (const hookType of Object.keys(config.hooks) as HookType[]) {
        const hookCommands = config.hooks[hookType];
        if (hookCommands && Array.isArray(hookCommands)) {
          if (!merged.hooks[hookType]) {
            merged.hooks[hookType] = [];
          }
          // Concatenate commands (later configs add to the list)
          merged.hooks[hookType] = [
            ...(merged.hooks[hookType] || []),
            ...hookCommands,
          ];
        }
      }
    }
  }

  return merged;
}

/**
 * Rewrite command paths to point to the managed hooks directory (hooks/aicm/)
 * At this point, paths are already namespaced filenames from loadHooksFromFile
 */
export function rewriteHooksConfigToManagedDir(
  hooksConfig: HooksJson,
): HooksJson {
  const rewritten: HooksJson = {
    version: hooksConfig.version,
    hooks: {},
  };

  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const hookCommands = hooksConfig.hooks[hookType];
      if (hookCommands && Array.isArray(hookCommands)) {
        rewritten.hooks[hookType] = hookCommands.map((hookCommand) => {
          const commandPath = hookCommand.command;
          if (commandPath && typeof commandPath === "string") {
            return { command: `./hooks/aicm/${commandPath}` };
          }
          return hookCommand;
        });
      }
    }
  }

  return rewritten;
}

/**
 * Count the number of hook entries in a hooks configuration
 */
export function countHooks(hooksConfig: HooksJson): number {
  let count = 0;
  if (hooksConfig.hooks) {
    for (const hookType of Object.keys(hooksConfig.hooks) as HookType[]) {
      const hookCommands = hooksConfig.hooks[hookType];
      if (hookCommands && Array.isArray(hookCommands)) {
        count += hookCommands.length;
      }
    }
  }
  return count;
}

/**
 * Dedupe hook files by namespaced path, warn on content conflicts
 * Presets are namespaced with directories, so same basename from different presets won't collide
 */
export function dedupeHookFiles(hookFiles: HookFile[]): HookFile[] {
  const fileMap = new Map<string, HookFile>();

  for (const hookFile of hookFiles) {
    const namespacedPath = hookFile.name;

    if (fileMap.has(namespacedPath)) {
      const existing = fileMap.get(namespacedPath)!;
      const existingHash = crypto
        .createHash("md5")
        .update(existing.content)
        .digest("hex");
      const currentHash = crypto
        .createHash("md5")
        .update(hookFile.content)
        .digest("hex");

      if (existingHash !== currentHash) {
        const sourceInfo = hookFile.presetName
          ? `preset "${hookFile.presetName}"`
          : hookFile.source;
        const existingSourceInfo = existing.presetName
          ? `preset "${existing.presetName}"`
          : existing.source;

        console.warn(
          `Warning: Hook file "${namespacedPath}" has different content from ${existingSourceInfo} and ${sourceInfo}. Using last occurrence.`,
        );
      }
      // Last writer wins
      fileMap.set(namespacedPath, hookFile);
    } else {
      fileMap.set(namespacedPath, hookFile);
    }
  }

  return Array.from(fileMap.values());
}

/**
 * Write hooks configuration and files to Cursor target
 */
export function writeHooksToCursor(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
  cwd: string,
): void {
  const cursorRoot = path.join(cwd, ".cursor");
  const hooksJsonPath = path.join(cursorRoot, "hooks.json");
  const hooksDir = path.join(cursorRoot, "hooks", "aicm");

  // Dedupe hook files
  const dedupedHookFiles = dedupeHookFiles(hookFiles);

  // Create hooks directory and clean it
  fs.emptyDirSync(hooksDir);

  // Copy hook files to managed directory
  for (const hookFile of dedupedHookFiles) {
    const targetPath = path.join(hooksDir, hookFile.name);
    fs.ensureDirSync(path.dirname(targetPath));
    fs.writeFileSync(targetPath, hookFile.content);
  }

  // Rewrite paths to point to managed directory
  const finalConfig = rewriteHooksConfigToManagedDir(hooksConfig);

  // Read existing hooks.json and preserve user hooks
  let existingConfig: HooksJson | null = null;
  if (fs.existsSync(hooksJsonPath)) {
    try {
      existingConfig = fs.readJsonSync(hooksJsonPath);
    } catch {
      existingConfig = null;
    }
  }

  // Extract user hooks (non-aicm managed)
  const userHooks: HooksJson = { version: 1, hooks: {} };
  if (existingConfig?.hooks) {
    for (const hookType of Object.keys(existingConfig.hooks) as HookType[]) {
      const commands = existingConfig.hooks[hookType];
      if (commands && Array.isArray(commands)) {
        const userCommands = commands.filter(
          (cmd) => !cmd.command?.includes("hooks/aicm/"),
        );
        if (userCommands.length > 0) {
          userHooks.hooks[hookType] = userCommands;
        }
      }
    }
  }

  // Merge user hooks with aicm hooks
  const mergedConfig: HooksJson = {
    version: finalConfig.version,
    hooks: {},
  };

  // Add user hooks first
  if (userHooks.hooks) {
    for (const hookType of Object.keys(userHooks.hooks) as HookType[]) {
      const commands = userHooks.hooks[hookType];
      if (commands) {
        mergedConfig.hooks[hookType] = [...commands];
      }
    }
  }

  // Then add aicm hooks
  if (finalConfig.hooks) {
    for (const hookType of Object.keys(finalConfig.hooks) as HookType[]) {
      const commands = finalConfig.hooks[hookType];
      if (commands) {
        if (!mergedConfig.hooks[hookType]) {
          mergedConfig.hooks[hookType] = [];
        }
        mergedConfig.hooks[hookType]!.push(...commands);
      }
    }
  }

  // Write hooks.json
  fs.ensureDirSync(path.dirname(hooksJsonPath));
  fs.writeJsonSync(hooksJsonPath, mergedConfig, { spaces: 2 });
}
