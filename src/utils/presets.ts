import { TargetsConfig } from "./config";

/**
 * A target preset defines the standard paths for a specific coding agent/IDE
 */
export interface TargetPreset {
  instructions: string[];
  skills: string[];
  agents: string[];
  mcp: string[];
  hooks: string[];
}

/**
 * Built-in target presets for supported coding agents
 *
 * cursor: Based on https://cursor.com/docs/context/rules and https://cursor.com/docs/context/skills
 * claude-code: Based on https://code.claude.com/docs/en/memory.md, skills.md, sub-agents.md, mcp.md
 */
export const BUILT_IN_PRESETS: Record<string, TargetPreset> = {
  cursor: {
    instructions: ["AGENTS.md"],
    skills: [".cursor/skills"],
    agents: [".cursor/agents"],
    mcp: [".cursor/mcp.json"],
    hooks: [".cursor"],
  },
  "claude-code": {
    instructions: ["CLAUDE.md"],
    skills: [".claude/skills"],
    agents: [".claude/agents"],
    mcp: [".mcp.json"],
    hooks: [".claude"],
  },
};

/**
 * Input format for the targets field in aicm.json
 * Can be:
 * - string[] (preset names shorthand, e.g. ["cursor", "claude-code"])
 * - TargetsConfigWithPresets (object with optional presets key and/or fine-grained overrides)
 */
export type TargetsInput = string[] | TargetsConfigWithPresets;

export interface TargetsConfigWithPresets extends TargetsConfig {
  presets?: string[];
}

/**
 * Get the list of available preset names
 */
export function getAvailablePresetNames(): string[] {
  return Object.keys(BUILT_IN_PRESETS);
}

/**
 * Validate that all preset names are recognized
 */
export function validatePresetNames(
  presetNames: string[],
  configFilePath: string,
): void {
  const available = getAvailablePresetNames();
  for (const name of presetNames) {
    if (!available.includes(name)) {
      throw new Error(
        `Unknown target preset "${name}" in config at ${configFilePath}. Available presets: ${available.join(", ")}`,
      );
    }
  }
}

/**
 * Validate the targets input format
 * Accepts string[] (preset names) or object with optional presets key
 */
export function validateTargetsInput(
  targets: unknown,
  configFilePath: string,
): void {
  // Form 1: string[] (preset names shorthand)
  if (Array.isArray(targets)) {
    for (const item of targets) {
      if (typeof item !== "string") {
        throw new Error(
          `targets array entries must be strings in config at ${configFilePath}`,
        );
      }
    }
    validatePresetNames(targets as string[], configFilePath);
    return;
  }

  // Form 2/3: object
  if (typeof targets !== "object" || targets === null) {
    throw new Error(
      `targets must be an array of preset names or an object in config at ${configFilePath}`,
    );
  }

  const obj = targets as Record<string, unknown>;
  const allowedKeys = [
    "presets",
    "skills",
    "agents",
    "instructions",
    "mcp",
    "hooks",
  ];
  const targetTypeKeys = ["skills", "agents", "instructions", "mcp", "hooks"];

  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `Unknown key "${key}" in targets object at ${configFilePath}. Allowed keys: ${allowedKeys.join(", ")}`,
      );
    }
  }

  // Validate presets field if present
  if ("presets" in obj) {
    if (!Array.isArray(obj.presets)) {
      throw new Error(
        `targets.presets must be an array in config at ${configFilePath}`,
      );
    }
    for (const item of obj.presets) {
      if (typeof item !== "string") {
        throw new Error(
          `targets.presets entries must be strings in config at ${configFilePath}`,
        );
      }
    }
    validatePresetNames(obj.presets as string[], configFilePath);
  }

  // Validate target type fields (same rules as before)
  for (const key of targetTypeKeys) {
    if (key in obj) {
      const value = obj[key];
      if (!Array.isArray(value)) {
        throw new Error(
          `targets.${key} must be an array in config at ${configFilePath}`,
        );
      }
      if (value.length === 0) {
        throw new Error(
          `targets.${key} must not be empty in config at ${configFilePath}`,
        );
      }
      for (const item of value) {
        if (typeof item !== "string") {
          throw new Error(
            `targets.${key} entries must be strings in config at ${configFilePath}`,
          );
        }
      }
    }
  }
}

/**
 * Merge multiple presets into a single targets config.
 * Union of all paths, preserving order, deduped.
 */
function mergePresetTargets(presetNames: string[]): Required<TargetsConfig> {
  const merged: Required<TargetsConfig> = {
    instructions: [],
    skills: [],
    agents: [],
    mcp: [],
    hooks: [],
  };

  for (const name of presetNames) {
    const preset = BUILT_IN_PRESETS[name];
    if (!preset) continue;

    for (const key of Object.keys(merged) as (keyof TargetsConfig)[]) {
      for (const value of preset[key]) {
        if (!merged[key].includes(value)) {
          merged[key].push(value);
        }
      }
    }
  }

  return merged;
}

/**
 * Default targets when no presets or overrides are specified.
 * Uses agent-agnostic .agents/ paths and AGENTS.md as a neutral default.
 */
const DEFAULT_TARGETS: Required<TargetsConfig> = {
  skills: [".agents/skills"],
  agents: [".agents/agents"],
  instructions: ["AGENTS.md"],
  mcp: [".agents/mcp.json"],
  hooks: [".agents"],
};

/**
 * Resolve targets input into a fully resolved Required<TargetsConfig>
 *
 * Resolution logic:
 * 1. If targets is string[], treat as { presets: targets }
 * 2. If targets has presets, merge all preset targets (union, deduped)
 * 3. For each explicit target type in the config, replace the preset's merged value
 * 4. For any missing target type without presets, apply defaults
 */
export function resolveTargets(
  targets: TargetsInput | undefined,
): Required<TargetsConfig> {
  // No targets specified at all - use defaults
  if (targets === undefined) {
    return { ...DEFAULT_TARGETS };
  }

  // Form 1: string[] shorthand for preset names
  if (Array.isArray(targets)) {
    if (targets.length === 0) {
      return { ...DEFAULT_TARGETS };
    }
    return mergePresetTargets(targets);
  }

  // Form 2/3: object
  const presetNames = targets.presets ?? [];
  const hasPresets = presetNames.length > 0;

  // Start with presets or defaults
  const base = hasPresets
    ? mergePresetTargets(presetNames)
    : { ...DEFAULT_TARGETS };

  // Apply explicit overrides (replace, not merge)
  const targetTypeKeys: (keyof TargetsConfig)[] = [
    "skills",
    "agents",
    "instructions",
    "mcp",
    "hooks",
  ];

  for (const key of targetTypeKeys) {
    const override = targets[key];
    if (override !== undefined) {
      base[key] = [...override];
    }
  }

  return base;
}
