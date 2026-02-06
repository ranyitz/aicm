---
name: AICM v1 API Design
overview: Design specification for AICM v1.0 - a major version rewrite from 0.x to 1.0 that shifts from Cursor rules/commands to an AGENTS.md-first instructions system, aligning with industry best practices from the Coding Agents Handbook.
todos:
  - id: phase1-delete-tests
    content: "Phase 1a: Delete tests for removed features (commands, assets, rules, windsurf, readme-example)"
    status: completed
  - id: phase1-adapt-tests
    content: "Phase 1b: Adapt 13 existing test files to v1.0 API (presets, install, skills, agents, hooks, workspaces, codex, claude, ci, api, init, list, clean)"
    status: completed
  - id: phase1-add-tests
    content: "Phase 1c: Add new tests for instructions system, multi-target MCP, multi-preset merging"
    status: completed
  - id: phase2-fixtures
    content: "Phase 2: Create new fixtures and update existing ones for v1.0 features"
    status: completed
  - id: phase3-implement
    content: "Phase 3: Implement v1.0 while ensuring all tests pass (config, instructions parser, install, clean, init, list, api)"
    status: in_progress
  - id: write-migration-guide
    content: Write detailed v0.x to v1.0 migration guide
    status: pending
  - id: update-readme
    content: Update README.md with v1.0 documentation
    status: completed
isProject: false
---

# AICM v1.0 API Design Specification

## Motivation

- Cursor rules (`.cursor/rules/`) should be avoided in favor of `AGENTS.md`
- Passive context in `AGENTS.md` outperforms on-demand retrieval
- Commands should be replaced by skills
- The industry is moving toward `.agents/` directory and `AGENTS.md` as standards

## Breaking Changes from v0.x

| Feature       | v0.x                          | v1.0                                           |
| ------------- | ----------------------------- | ---------------------------------------------- |
| Rules         | `.mdc` files in `rules/`      | **Removed**                                    |
| Commands      | `.md` files in `commands/`    | **Removed**                                    |
| Assets        | Files in `assets/`            | **Removed** (skills handle this)               |
| Output format | File references in AGENTS.md  | **Inlined content** or progressive disclosure  |
| Targets       | `["cursor", "windsurf", ...]` | `{ skills: [...], agents: [...], ... }` object |
| Windsurf      | `.windsurfrules` generation   | **Removed** (use targets object instead)       |

## New Instructions System

### Source Structure

Presets define an `instructions/` directory:

```
my-preset/
├── aicm.json
├── instructions/
│   ├── general.md
│   ├── testing.md
│   └── api-conventions.md
├── skills/
│   └── code-review/
│       └── SKILL.md
├── agents/
│   └── debugger.md
└── hooks.json
```

### Instruction File Format

Each `.md` file in `instructions/` has YAML frontmatter:

```markdown
---
description: TypeScript coding conventions for this project
alwaysInclude: true # false for progressive disclosure
---

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types
  ...
```

**Metadata fields:**

- `description` (required): Brief description of what this instruction covers
- `alwaysInclude` (optional, default: `false`): Whether to inline full content or split to another file and reference it

### Output Modes

**Mode 1: Inline (default / alwaysInclude: true)**
All instruction content is inlined into `AGENTS.md`:

```markdown
<!-- AICM:BEGIN -->
<!-- From: @company/preset -->

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types
  ...

<!-- AICM:END -->
```

**Mode 2: Progressive Disclosure (alwaysInclude: false)**
Only descriptions are inlined, with file references:

```markdown
<!-- AICM:BEGIN -->
<!-- From: @company/preset -->

The following instructions are available:

- [TypeScript Conventions](.agents/aicm/typescript.md): TypeScript coding conventions for this project
- [Testing Guidelines](.agents/aicm/testing.md): How to write and run tests

<!-- AICM:END -->
```

## Configuration Schema (aicm.json)

### Minimal Example (preset-only)

```json
{
  "presets": ["@company/ai-preset"]
}
```

### Local Preset Example (skills only, no instructions)

```json
{
  "rootDir": "./",
  "targets": {
    "skills": [".agents/skills"]
  }
}
```

### Full Example

```json
{
  "rootDir": "./",
  "instructions": "instructions/",
  "targets": {
    "skills": [".agents/skills"],
    "agents": [".agents/agents"],
    "instructions": ["AGENTS.md"],
    "mcp": [".cursor/mcp.json", ".mcp.json"],
    "hooks": [".cursor"]
  },
  "presets": ["@company/ai-preset"],
  "mcpServers": { ... },
  "hooks": { ... }
}
```

### Config Options

| Option         | Type       | Default   | Description                                                                     |
| -------------- | ---------- | --------- | ------------------------------------------------------------------------------- |
| `rootDir`      | `string`   | -         | Base directory for source files (skills/, agents/, hooks/, instructions)        |
| `instructions` | `string`   | -         | Optional. Source path for instructions (file or directory), relative to rootDir |
| `targets`      | `object`   | see below | Installation paths (arrays for multi-target support)                            |
| `presets`      | `string[]` | `[]`      | Preset packages to include                                                      |
| `mcpServers`   | `object`   | `{}`      | MCP server configurations                                                       |
| `hooks`        | `object`   | `{}`      | Hook configurations                                                             |

### Targets Object

Each target is an array of paths where the component should be installed:

| Target Key     | Type       | Default                | Description                        |
| -------------- | ---------- | ---------------------- | ---------------------------------- |
| `skills`       | `string[]` | `[".agents/skills"]`   | Directories to install skills into |
| `agents`       | `string[]` | `[".agents/agents"]`   | Directories to install agents into |
| `instructions` | `string[]` | `["AGENTS.md"]`        | Files to write instructions into   |
| `mcp`          | `string[]` | `[".cursor/mcp.json"]` | MCP config files to write to       |
| `hooks`        | `string[]` | `[".cursor"]`          | Directories with hooks config      |

**Example - Install to both Claude and Cursor locations:**

```json
{
  "targets": {
    "skills": [".agents/skills", ".cursor/skills", ".claude/skills"],
    "agents": [".agents/agents", ".cursor/agents", ".claude/agents"],
    "instructions": ["AGENTS.md", "CLAUDE.md"],
    "mcp": [".cursor/mcp.json", ".mcp.json"],
    "hooks": [".cursor"]
  }
}
```

### MCP Target Paths

MCP configs share a similar `{ mcpServers: { ... } }` format across tools:

- Cursor: `.cursor/mcp.json`
- Claude Code: `.mcp.json` (project scope)

AICM writes the same `mcpServers` object to each target path, creating/merging the file.

### Hooks Target Consideration

**Important design note**: Cursor and Claude hooks use fundamentally different formats:

- **Cursor**: `.cursor/hooks.json` with `{ version: 1, hooks: { beforeShellExecution: [...] } }`
- **Claude Code**: `.claude/settings.json` with `{ hooks: { PreToolUse: [{ matcher: ..., hooks: [...] }] } }`

For v1.0, hooks remain Cursor-format only (installed to `.cursor/`). Claude Code hook support can be added in v1.x as a separate feature since the format translation is non-trivial.

### How rootDir Works

When `rootDir` is set, AICM looks for these directories within it:

- `skills/` - Agent skills (SKILL.md folders)
- `agents/` - Subagent definitions (.md files)
- `hooks/` + `hooks.json` - Hook scripts and configuration

If `instructions` is also set, it's resolved relative to `rootDir`:

```json
{
  "rootDir": "./ai-config",
  "instructions": "instructions/"
}
// Looks for instructions in ./ai-config/instructions/
// Looks for skills in ./ai-config/skills/

// Looks for agents in ./ai-config/agents/
```

### Instructions Source (Auto-Detection)

The `instructions` option is **optional** and accepts either a file path or directory path (relative to `rootDir`):

- **Ends with `.md**`-> single file (e.g.,`"instructions": "PRESET-AGENTS.md"`)
- **Otherwise** -> directory containing `.md` files (e.g., `"instructions": "instructions/"`)

## Multi-Preset Merging

When multiple presets provide instructions, merge deterministically with clear separators:

```markdown
<!-- AICM:BEGIN -->

<!-- From: @company/base-preset -->

## General Coding Standards

...

<!-- From: @company/react-preset -->

## React Conventions

...

<!-- AICM:END -->
```

**Merge order:** Presets are processed in array order; later presets append after earlier ones.

## Features Retained from v0.x

### Skills

- Source: `skills/` directory with `SKILL.md` files
- Installation: Copied to target skills directories
- No changes to skill format

### Agents (Subagents)

- Source: `agents/` directory with `.md` files
- Installation: Copied to target agents directories
- No changes to agent format

### Hooks

- Source: `hooks.json` + `hooks/` directory
- Installation: Merged into target hooks configuration
- No changes to hooks format (Cursor-only for v1.0)

### MCP Servers

- Source: `mcpServers` in `aicm.json`
- Installation: Merged into all target MCP config files
- Same `{ mcpServers: {...} }` format

### Workspaces

- Auto-detection from `package.json` workspaces / Bazel BUILD files
- Per-package configurations
- Root-level MCP merging from workspace packages
- `skipInstall: true` support

### Other Preserved Behaviors

- Recursive preset handling (presets inheriting from presets)
- Circular dependency detection
- CI environment detection and `--ci` flag
- `--verbose` flag with stack traces on error
- `--dry-run` mode
- Stale file cleanup on re-install

## Migration Guide Outline (v0.x to v1.0)

1. **Rules to Instructions**: Convert `.mdc` files to `.md` in `instructions/`

- Remove Cursor-specific frontmatter (`globs`, `alwaysApply`)
- Add v1.0 frontmatter (`description`, `alwaysInclude`)

1. **Commands to Skills**: Convert command files to skill directories

- Create `SKILL.md` with proper frontmatter

1. **Assets**: Move into relevant skills or remove if unused
2. **Config Update**: Update `aicm.json` schema

- Keep `rootDir` (unchanged)
- Replace `targets` array with `targets` object
- Add optional `instructions` string
- Add `mcp` and `hooks` arrays to targets

1. **Windsurf**: Replace `"windsurf"` target with appropriate `targets` entries

## CLI Changes

```bash
# v1.0 commands (unchanged names, updated behavior)
aicm init          # Creates v1.0 aicm.json structure
aicm install       # Installs instructions, skills, agents, hooks, MCP
aicm clean         # Removes installed files
aicm list          # Lists installed components (was "rules" in v0.x)

# New command for migration
aicm migrate       # Converts v0.x structure to v1.0
```

## Public API Changes ([src/api.ts](src/api.ts))

The exported API needs updates:

- `InstallResult.installedRuleCount` -> `InstallResult.installedInstructionCount`
- `InstallResult.installedCommandCount` -> **Removed**
- Add `InstallResult.installedSkillCount`, `installedAgentCount`, `installedHookCount`
- Remove exported types: `RuleFile`, `CommandFile`
- Add exported types: `InstructionFile`, etc.

## TDD Implementation Strategy

### Phase 1: Adapt Tests to New API

**Tests to DELETE (features being removed):**

- `commands.test.ts` - commands feature removed entirely
- `assets.test.ts` - assets feature removed entirely
- `readme-example.test.ts` - uses presets-npm fixture with rules; needs full rewrite
- Rule-specific tests in `install.test.ts` (e.g., single rule, multiple rules, rule subdirs)
- Rule-specific tests in `presets.test.ts` (adapt to instructions)

**Tests to ADAPT (change API, preserve behavior):**

| Test File               | Changes Required                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `presets.test.ts`       | Change rules to instructions, preserve recursive preset handling                                                        |
| `install.test.ts`       | Keep MCP tests, skipInstall tests; remove rule-specific tests; update success messages                                  |
| `codex.test.ts`         | Adapt to new AGENTS.md inlined format (currently references `.aicm/` files)                                             |
| `claude.test.ts`        | Adapt to new CLAUDE.md inlined format (currently references `.aicm/` files)                                             |
| `windsurf.test.ts`      | **DELETE** - windsurf as a named target is removed                                                                      |
| `skills.test.ts`        | Adapt target paths to arrays; update default target from `.cursor/skills` to `.agents/skills`                           |
| `agents.test.ts`        | Adapt target paths to arrays; update default target from `.cursor/agents` to `.agents/agents`                           |
| `hooks.test.ts`         | Keep mostly as-is; hooks format unchanged                                                                               |
| `workspaces.test.ts`    | Major rewrite - all assertions reference `.cursor/rules/aicm/*.mdc`; needs instructions                                 |
| `clean.test.ts`         | Update for new directory structure (`.agents/` instead of `.cursor/rules/aicm/`)                                        |
| `ci.test.ts`            | Update fixture reference and success message (currently: "1 rule", needs: "1 instruction")                              |
| `api.test.ts`           | Update `InstallResult` assertions (`installedRuleCount` -> `installedInstructionCount`, remove `installedCommandCount`) |
| `init.test.ts`          | Update expected default config from `{ rootDir: "./", targets: ["cursor"] }` to v1.0 schema                             |
| `list.test.ts`          | Currently lists "rules"; needs to list instructions/components                                                          |
| `verbose-error.test.ts` | May need fixture updates if config validation changes                                                                   |
| `cli.test.ts`           | Update help text assertions if description changes                                                                      |

**Tests to ADD (new functionality):**

- Instructions source auto-detection (file vs directory)
- Instructions frontmatter parsing (`description`, `alwaysInclude`)
- Instructions inlining mode
- Instructions progressive disclosure mode
- Multi-target array installation for skills, agents, instructions
- Multi-target MCP installation (`.cursor/mcp.json` + `.mcp.json`)
- Multi-preset instructions merging with separators

### Phase 2: Update Fixtures

Create new fixtures for:

- `instructions-basic/` - basic instructions directory
- `instructions-single-file/` - single .md file source
- `instructions-progressive/` - progressive disclosure mode
- `instructions-preset/` - instructions from presets
- `instructions-recursive/` - recursive preset with instructions
- `targets-multi/` - multi-target array installation
- `targets-mcp-multi/` - MCP to multiple targets

Update existing fixtures:

- All `single-rule*` fixtures -> instruction-based equivalents
- All workspace fixtures -> replace `.cursor/rules/aicm/*.mdc` with instruction targets
- `codex-*` and `claude-*` fixtures -> update to v1.0 config schema
- `presets-*` fixtures -> replace rules with instructions

### Phase 3: Implement While Tests Pass

1. Update config schema validation ([src/utils/config.ts](src/utils/config.ts))
2. Add instructions parsing (new `src/utils/instructions.ts`)
3. Update install command for new flow ([src/commands/install.ts](src/commands/install.ts))
4. Remove rules-file-writer ([src/utils/rules-file-writer.ts](src/utils/rules-file-writer.ts)) - no longer needed
5. Update clean command for new structure ([src/commands/clean.ts](src/commands/clean.ts))
6. Update init command for v1.0 schema ([src/commands/init.ts](src/commands/init.ts))
7. Update list command ([src/commands/list.ts](src/commands/list.ts))
8. Update public API types ([src/api.ts](src/api.ts))

### Key Behaviors to Preserve

From `presets.test.ts`:

- Recursive preset handling (test: "install rules from recursively inherited presets")
- Circular dependency detection (test: "detect circular preset dependencies")
- Empty preset chain error (test: "error on empty preset without content or nested presets")
- Inherits-only preset (test: "install rules from inherits-only preset")
- Sibling preset paths (test: "install rules from sibling preset using ../ path")
- NPM package presets (test: "handle npm package presets")

From `install.test.ts`:

- MCP server preservation and merging
- Stale MCP cleanup
- Skip installation flag
- Dry run mode

From `workspaces.test.ts`:

- All workspace discovery modes (npm, Bazel, mixed, auto-detect, explicit false)
- Partial configurations (some packages with configs, some without)
- MCP merge from workspaces to root
- MCP conflict warnings
- `skipInstall: true` support
- Empty root config in workspace mode

From `agents.test.ts`:

- Agent collision warnings (multiple presets provide same agent)
- Clean preserves non-aicm agents (metadata tracking via `.aicm.json`)
- Multi-target agent installation

From `hooks.test.ts`:

- All 13 hook test scenarios (local, preset, merged, workspace, collision, etc.)
- User-managed hooks preservation
- Hook file namespacing for presets

## Open Questions for Future Discussion

1. **Claude hooks support**: Claude Code uses a fundamentally different hook format. v1.x could add a format translator.
2. **Symlink support**: Should `CLAUDE.md` symlink to `AGENTS.md` or be generated separately?
3. **Validation**: Should AICM validate instruction file size / token count?
4. **Compression**: Should AICM support compressed instruction formats?
