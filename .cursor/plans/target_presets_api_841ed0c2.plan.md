---
name: Target Presets API
overview: Add named target presets (starting with `cursor` and `claude-code`) to aicm's `targets` config, providing a simple shorthand for common agent configurations while preserving the existing fine-grained control as an override mechanism.
todos:
  - id: presets-module
    content: Create src/utils/presets.ts with built-in preset definitions (cursor, claude-code), resolvePresets() function, and preset validation
    status: completed
  - id: config-types
    content: Update TargetsConfig/RawConfig types in config.ts to accept string[] or object with presets field, update applyDefaults() and validateConfig()
    status: completed
  - id: claude-code-hooks
    content: Add writeHooksToClaudeCode() in hooks.ts with event name mapping (beforeShellExecution -> PreToolUse, etc.) and .claude/settings.json writer
    status: completed
  - id: install-dispatch
    content: Update writeHooksToTargets() in install.ts to dispatch to Claude Code hook writer when target is .claude
    status: completed
  - id: init-update
    content: "Update init command to default to targets: ['cursor', 'claude-code'] and/or prompt for agent selection"
    status: completed
  - id: clean-update
    content: Update clean command to handle Claude Code settings.json hook cleanup
    status: completed
  - id: tests
    content: Write e2e tests for preset resolution, mixed targets, Claude Code hook writing, backward compatibility
    status: completed
isProject: false
---

# Target Presets API Design

## Context

In v0.x, `targets` was a string array (`["cursor", "windsurf"]`). In v1.0, it was changed to a fine-grained object (`{ skills: [...], instructions: [...] }`). This plan re-introduces named presets as a convenience layer **on top of** the fine-grained control.

## API Design

The `targets` field in `aicm.json` will accept three forms:

### Form 1: Presets Only (most common)

```json
{
  "targets": ["cursor", "claude-code"]
}
```

This is syntactic sugar for `{ "presets": ["cursor", "claude-code"] }`.

### Form 2: Object with Presets + Overrides

```json
{
  "targets": {
    "presets": ["cursor", "claude-code"],
    "mcp": [".cursor/mcp.json", ".mcp.json", "extra-mcp.json"]
  }
}
```

Explicit paths **replace** the preset's value for that target type. In this example, only the `mcp` target is overridden; `instructions`, `skills`, `agents`, and `hooks` still come from the presets.

### Form 3: Fine-Grained Only (backward compatible)

```json
{
  "targets": {
    "skills": [".agents/skills"],
    "instructions": ["AGENTS.md"],
    "mcp": [".cursor/mcp.json"],
    "hooks": [".cursor"]
  }
}
```

When no `presets` key is present and no string array, current behavior is preserved with the same defaults.

## Type Changes

In [src/utils/config.ts](src/utils/config.ts):

```typescript
// targets can be a string[] (preset names) or the existing object
type TargetsInput = string[] | TargetsConfigWithPresets;

interface TargetsConfigWithPresets extends TargetsConfig {
  presets?: string[];
}

// TargetsConfig stays unchanged (backward compatible)
interface TargetsConfig {
  skills?: string[];
  agents?: string[];
  instructions?: string[];
  mcp?: string[];
  hooks?: string[];
}
```

The `RawConfig.targets` type changes from `TargetsConfig | undefined` to `TargetsInput | undefined`. The resolved `Config.targets` stays as `Required<TargetsConfig>` (presets are resolved before this point).

## Built-in Preset Definitions

New file: [src/utils/presets.ts](src/utils/presets.ts)

### `cursor` Preset

Based on [Cursor docs](https://cursor.com/docs/context/rules) and [Skills](https://cursor.com/docs/context/skills):

| Target       | Path               | Rationale                                          |
| ------------ | ------------------ | -------------------------------------------------- |
| instructions | `AGENTS.md`        | Cursor's recommended format for agent instructions |
| skills       | `.cursor/skills`   | Primary skill directory per Cursor docs            |
| agents       | `.cursor/agents`   | Cursor subagent definitions directory              |
| mcp          | `.cursor/mcp.json` | Standard Cursor MCP config location                |
| hooks        | `.cursor`          | Cursor hooks in `.cursor/hooks.json`               |

### `claude-code` Preset

Based on [Claude Code Memory](https://code.claude.com/docs/en/memory.md), [Skills](https://code.claude.com/docs/en/skills.md), [Subagents](https://code.claude.com/docs/en/sub-agents.md), and [MCP](https://code.claude.com/docs/en/mcp.md):

| Target       | Path             | Rationale                                    |
| ------------ | ---------------- | -------------------------------------------- |
| instructions | `CLAUDE.md`      | Claude Code's project memory file            |
| skills       | `.claude/skills` | Claude Code skill directory                  |
| agents       | `.claude/agents` | Claude Code subagent definitions             |
| mcp          | `.mcp.json`      | Claude Code project-scoped MCP config        |
| hooks        | `.claude`        | Claude Code hooks in `.claude/settings.json` |

### Preset Definition Structure

```typescript
interface TargetPreset {
  instructions: string[];
  skills: string[];
  agents: string[];
  mcp: string[];
  hooks: string[];
}

const BUILT_IN_PRESETS: Record<string, TargetPreset> = {
  cursor: { ... },
  "claude-code": { ... },
};
```

## Preset Resolution Logic

New function `resolvePresets()` in [src/utils/presets.ts](src/utils/presets.ts):

1. If `targets` is `string[]`, treat as `{ presets: targets }`
2. Validate all preset names exist in `BUILT_IN_PRESETS`
3. Merge all preset targets (union of all paths, preserving order, deduped)
4. For each explicit target type in the config object, **replace** the preset's merged value for that type
5. Return a fully resolved `Required<TargetsConfig>`

When no presets are specified, fall back to current default behavior.

## Hook Format Differences

This is the only area where presets need format-aware logic, not just different paths:

- **Cursor**: `hooks.json` + script files in `.cursor/hooks/aicm/` (current implementation in `writeHooksToCursor`)
- **Claude Code**: Hooks config in `.claude/settings.json` under a `hooks` key with events like `PreToolUse`, `PostToolUse`, `Stop`, etc.

The current hook type system ([src/utils/hooks.ts](src/utils/hooks.ts)) uses Cursor-specific event names (`beforeShellExecution`, `afterFileEdit`, etc.). Claude Code uses different names (`PreToolUse`, `PostToolUse`, `Stop`, etc.) with a richer JSON schema.

### Approach

Add a `writeHooksToClaudeCode()` function that:

- Maps aicm hook types to Claude Code hook events
- Writes hook config to `.claude/settings.json` (merging with existing settings, using aicm markers)
- Copies script files to `.claude/hooks/aicm/`

The hook target dispatch in [src/commands/install.ts](src/commands/install.ts) currently only handles `.cursor`:

```typescript
if (path.basename(targetPath) === ".cursor") {
  writeHooksToCursor(hooksConfig, hookFiles, path.dirname(targetPath));
}
```

This will be extended to also handle `.claude`:

```typescript
if (path.basename(targetPath) === ".cursor") {
  writeHooksToCursor(hooksConfig, hookFiles, path.dirname(targetPath));
} else if (path.basename(targetPath) === ".claude") {
  writeHooksToClaudeCode(hooksConfig, hookFiles, path.dirname(targetPath));
}
```

## Files to Change

- **[src/utils/presets.ts](src/utils/presets.ts)** (new): Preset definitions, resolution logic, validation
- **[src/utils/config.ts](src/utils/config.ts)**: Update `RawConfig.targets` type, update `applyDefaults()` to call preset resolution, update `validateConfig()` to accept new format
- **[src/utils/hooks.ts](src/utils/hooks.ts)**: Add `writeHooksToClaudeCode()` and hook event mapping
- **[src/commands/install.ts](src/commands/install.ts)**: Update `writeHooksToTargets()` to dispatch to Claude Code writer
- **[src/commands/init.ts](src/commands/init.ts)**: Update `init` to default to `targets: ["cursor", "claude-code"]` or prompt for agent selection
- **[src/commands/clean.ts](src/commands/clean.ts)**: Update clean to handle Claude Code hook/settings cleanup
- **Tests**: Update existing tests, add new tests for preset resolution, mixed modes, and Claude Code hook writing
