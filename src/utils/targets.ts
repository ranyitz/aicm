/**
 * Target resolution: maps target preset names
 * into fully resolved target paths for each resource type.
 */

export interface TargetsConfig {
  skills: string[];
  agents: string[];
  instructions: string[];
  mcp: string[];
  hooks: string[];
}

interface TargetPreset {
  instructions: string[];
  skills: string[];
  agents: string[];
  mcp: string[];
  hooks: string[];
}

const BUILT_IN_PRESETS: Record<string, TargetPreset> = {
  cursor: {
    instructions: ["AGENTS.md"],
    skills: [".agents/skills"],
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
  opencode: {
    instructions: ["AGENTS.md"],
    skills: [".opencode/skills"],
    agents: [".opencode/agents"],
    mcp: ["opencode.json"],
    hooks: [],
  },
  codex: {
    instructions: ["AGENTS.md"],
    skills: [".agents/skills"],
    agents: [],
    mcp: [".codex/config.toml"],
    hooks: [],
  },
};

const DEFAULT_PRESET_NAMES = ["cursor", "claude-code"];

export function validateTargetsInput(
  targets: unknown,
  configFilePath: string,
): void {
  if (!Array.isArray(targets)) {
    throw new Error(
      `targets must be an array of preset names in config at ${configFilePath}. ` +
        `Available presets: ${Object.keys(BUILT_IN_PRESETS).join(", ")}`,
    );
  }

  for (const item of targets) {
    if (typeof item !== "string") {
      throw new Error(
        `targets array entries must be strings in config at ${configFilePath}`,
      );
    }
  }

  validatePresetNames(targets as string[], configFilePath);
}

function validatePresetNames(names: string[], configFilePath: string): void {
  const available = Object.keys(BUILT_IN_PRESETS);
  for (const name of names) {
    if (!available.includes(name)) {
      throw new Error(
        `Unknown target preset "${name}" in config at ${configFilePath}. Available presets: ${available.join(", ")}`,
      );
    }
  }
}

function mergePresetTargets(presetNames: string[]): TargetsConfig {
  const merged: TargetsConfig = {
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

export function resolveTargets(targets: string[] | undefined): TargetsConfig {
  if (targets === undefined || targets.length === 0) {
    return mergePresetTargets(DEFAULT_PRESET_NAMES);
  }

  return mergePresetTargets(targets);
}
