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
  hooks: {
    [K in HookType]?: HookCommand[];
  };
}

export interface HookFile {
  name: string;
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
                const fileName = path.basename(resolvedPath);

                hookFiles.push({
                  name: fileName,
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

  return { config: hooksConfig, files: hookFiles };
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
 * Rewrite command paths in hooks config to point to managed hooks directory
 */
export function rewriteHooksConfigPaths(
  hooksConfig: HooksJson,
  hookFiles: HookFile[],
): HooksJson {
  // Create a map of basenames
  const basenameMap = new Map<string, string>();
  for (const hookFile of hookFiles) {
    basenameMap.set(hookFile.name, hookFile.name);
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
            if (basenameMap.has(basename)) {
              return { command: `./${basename}` };
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
 * Rewrite command paths to point to the managed hooks directory (hooks/aicm/)
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
          if (
            commandPath &&
            typeof commandPath === "string" &&
            commandPath.startsWith("./")
          ) {
            return { command: `./hooks/aicm/${commandPath.slice(2)}` };
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
 * Dedupe hook files by basename, warn on content conflicts
 */
export function dedupeHookFiles(hookFiles: HookFile[]): HookFile[] {
  const fileMap = new Map<string, { file: HookFile; hash: string }>();

  for (const hookFile of hookFiles) {
    const basename = hookFile.name;
    const hash = getMd5Hash(hookFile.content);

    if (fileMap.has(basename)) {
      const existing = fileMap.get(basename)!;
      if (existing.hash !== hash) {
        console.warn(
          `Warning: Multiple hook files with name "${basename}" have different content. ` +
            `This may indicate a configuration issue. Using last occurrence.`,
        );
      }
      // Last writer wins
      fileMap.set(basename, { file: hookFile, hash });
    } else {
      fileMap.set(basename, { file: hookFile, hash });
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

  // Copy hook files to managed directory (basename only)
  for (const hookFile of dedupedHookFiles) {
    const targetPath = path.join(hooksDir, hookFile.name);
    fs.writeFileSync(targetPath, hookFile.content);
  }

  // Rewrite paths in hooks config to point to managed directory
  const rewrittenConfig = rewriteHooksConfigPaths(
    hooksConfig,
    dedupedHookFiles,
  );
  const finalConfig = rewriteHooksConfigToManagedDir(rewrittenConfig);

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
