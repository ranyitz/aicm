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
 * Load hooks configuration from a hooks.json file and collect all referenced files
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
            // Resolve relative paths
            if (commandPath.startsWith("./") || commandPath.startsWith("../")) {
              const resolvedPath = path.resolve(hooksDir, commandPath);

              if (
                fs.existsSync(resolvedPath) &&
                fs.statSync(resolvedPath).isFile() &&
                !seenFiles.has(resolvedPath)
              ) {
                seenFiles.add(resolvedPath);
                const fileContent = await fs.readFile(resolvedPath);
                const basename = path.basename(resolvedPath);

                // Namespace preset files using the same logic as rules
                let namespacedPath: string;
                if (source === "preset" && presetName) {
                  const namespace = extractNamespaceFromPresetPath(presetName);
                  // Use directory structure for namespacing: namespace/basename
                  namespacedPath = path.join(...namespace, basename);
                } else {
                  namespacedPath = basename;
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
  }

  // Rewrite the config to use namespaced file names immediately
  const rewrittenConfig = rewriteHooksConfigForFiles(hooksConfig, hookFiles);

  return { config: rewrittenConfig, files: hookFiles };
}

/**
 * Rewrite hooks config to use the namespaced names from the hook files
 * This must be done per-source to maintain correct basename-to-namespace mapping
 */
function rewriteHooksConfigForFiles(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
): HooksJson {
  // Create a map from basename to the hookFile for this specific source
  const basenameToFile = new Map<string, HookFile>();
  for (const hookFile of hookFiles) {
    basenameToFile.set(hookFile.basename, hookFile);
  }

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
          if (
            commandPath &&
            typeof commandPath === "string" &&
            (commandPath.startsWith("./") || commandPath.startsWith("../"))
          ) {
            const basename = path.basename(commandPath);
            const hookFile = basenameToFile.get(basename);
            if (hookFile) {
              // Use the namespaced name
              return { command: hookFile.name };
            }
          }
          return hookCommand;
        });
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
 * Calculate MD5 hash of file content
 */
function getMd5Hash(content: Buffer): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Dedupe hook files by namespaced path, warn on content conflicts
 * Presets are already namespaced with directories, so same basename from different presets won't collide
 * For workspaces, we dedupe by full namespaced path and warn if MD5 hashes differ
 */
export function dedupeHookFiles(hookFiles: HookFile[]): HookFile[] {
  const fileMap = new Map<string, { file: HookFile; hash: string }>();

  for (const hookFile of hookFiles) {
    const namespacedPath = hookFile.name; // Already includes preset directory if applicable
    const hash = getMd5Hash(hookFile.content);

    if (fileMap.has(namespacedPath)) {
      const existing = fileMap.get(namespacedPath)!;
      if (existing.hash !== hash) {
        const sourceInfo = hookFile.presetName
          ? `from preset "${hookFile.presetName}"`
          : `from ${hookFile.source}`;
        const existingSourceInfo = existing.file.presetName
          ? `from preset "${existing.file.presetName}"`
          : `from ${existing.file.source}`;

        console.warn(
          `Warning: Multiple hook files with path "${namespacedPath}" have different content:\n` +
            `  - ${existingSourceInfo}: ${existing.file.sourcePath}\n` +
            `  - ${sourceInfo}: ${hookFile.sourcePath}\n` +
            `  Using last occurrence.`,
        );
      }
      // Last writer wins
      fileMap.set(namespacedPath, { file: hookFile, hash });
    } else {
      fileMap.set(namespacedPath, { file: hookFile, hash });
    }
  }

  return Array.from(fileMap.values()).map((entry) => entry.file);
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

  // Copy hook files to managed directory with proper directory structure
  for (const hookFile of dedupedHookFiles) {
    const targetPath = path.join(hooksDir, hookFile.name);
    // Ensure parent directory exists for namespaced files (e.g., preset/file.sh)
    fs.ensureDirSync(path.dirname(targetPath));
    fs.writeFileSync(targetPath, hookFile.content);
  }

  const finalConfig = rewriteHooksConfigToManagedDir(hooksConfig);

  // Read existing hooks.json if it exists
  let existingConfig: HooksJson | null = null;
  if (fs.existsSync(hooksJsonPath)) {
    try {
      existingConfig = fs.readJsonSync(hooksJsonPath);
    } catch {
      // If parsing fails, start fresh
      existingConfig = null;
    }
  }

  // Filter out aicm-managed hooks from existing config
  const userHooks: HooksJson = { version: 1, hooks: {} };
  if (existingConfig && existingConfig.hooks) {
    for (const hookType of Object.keys(existingConfig.hooks)) {
      const hookCommands =
        existingConfig.hooks[hookType as keyof typeof existingConfig.hooks];
      if (hookCommands && Array.isArray(hookCommands)) {
        // Keep only user hooks (not pointing to hooks/aicm/)
        const userCommands = hookCommands.filter(
          (cmd) => !cmd.command || !cmd.command.includes("hooks/aicm/"),
        );
        if (userCommands.length > 0) {
          if (!userHooks.hooks[hookType as keyof typeof userHooks.hooks]) {
            userHooks.hooks[hookType as keyof typeof userHooks.hooks] = [];
          }
          userHooks.hooks[hookType as keyof typeof userHooks.hooks]!.push(
            ...userCommands,
          );
        }
      }
    }
  }

  // Merge: user hooks first, then aicm hooks
  const mergedConfig: HooksJson = {
    version: finalConfig.version,
    hooks: {},
  };

  // First, deep copy user hooks
  for (const hookType of Object.keys(userHooks.hooks)) {
    const userCommands =
      userHooks.hooks[hookType as keyof typeof userHooks.hooks];
    if (userCommands && Array.isArray(userCommands)) {
      mergedConfig.hooks[hookType as keyof typeof mergedConfig.hooks] = [
        ...userCommands,
      ];
    }
  }

  // Then add aicm hooks (concatenate with existing arrays)
  if (finalConfig.hooks) {
    for (const hookType of Object.keys(finalConfig.hooks)) {
      const aicmCommands =
        finalConfig.hooks[hookType as keyof typeof finalConfig.hooks];
      if (aicmCommands && Array.isArray(aicmCommands)) {
        if (!mergedConfig.hooks[hookType as keyof typeof mergedConfig.hooks]) {
          mergedConfig.hooks[hookType as keyof typeof mergedConfig.hooks] = [];
        }
        mergedConfig.hooks[hookType as keyof typeof mergedConfig.hooks]!.push(
          ...aicmCommands,
        );
      }
    }
  }

  // Write hooks.json
  fs.ensureDirSync(path.dirname(hooksJsonPath));
  fs.writeJsonSync(hooksJsonPath, mergedConfig, { spaces: 2 });
}
