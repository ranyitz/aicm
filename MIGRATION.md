# Migration Guide: v0.x to v1.0

This guide covers the breaking changes in AICM v1.0 and how to migrate your configuration.

## Overview

AICM v1.0 shifts from Cursor-specific `.mdc` rules to an industry-standard `AGENTS.md` instructions system. This aligns with the emerging best practices.

### What Changed

| Feature       | v0.x                           | v1.0                                          |
| ------------- | ------------------------------ | --------------------------------------------- |
| Rules         | `.mdc` files in `rules/`       | **Removed** - use instructions or skills      |
| Commands      | `.md` files in `commands/`     | **Removed** - use skills                      |
| Assets        | Files in `assets/`             | **Removed** - embed in skills                 |
| Output format | Files in `.cursor/rules/aicm/` | Inlined into `AGENTS.md`                      |
| Targets       | `["cursor", "windsurf", ...]`  | `{ skills: [...], instructions: [...], ... }` |
| Windsurf      | `.windsurfrules` generation    | **Removed**                                   |

### What Stayed the Same

- **Skills** - same format, new default path (`.agents/skills`)
- **Agents** - same format, new default path (`.agents/agents`)
- **Hooks** - same format, same behavior (Cursor-only)
- **MCP Servers** - same format, now supports multiple targets
- **Presets** - same concept, adapted for instructions
- **Workspaces** - same concept, adapted for instructions
- **CLI commands** - same names (`init`, `install`, `clean`, `list`)

## Step-by-Step Migration

### 1. Convert Rules to Instructions

**Before (v0.x)** - `.mdc` files with Cursor-specific frontmatter:

```markdown
## <!-- rules/typescript.mdc -->

description: TypeScript conventions
globs: "\*_/_.ts"
alwaysApply: true

---

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types
```

**After (v1.0)** - `.md` files with simplified frontmatter:

```markdown
## <!-- instructions/typescript.md -->

description: TypeScript conventions
inline: true

---

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types
```

**Changes:**

- Move files from `rules/` to `instructions/`
- Change extension from `.mdc` to `.md`
- Remove `globs` (not applicable to `AGENTS.md` instructions)
- Replace `alwaysApply: true` with `inline: true`
- `inline: true` inlines content directly into `AGENTS.md`
- `inline: false` (default) uses progressive disclosure - only the description is inlined with a link to the full content

### 2. Convert Commands to Skills

Commands have been removed in favor of skills, which are the industry standard for giving agents capabilities.

**Before (v0.x):**

```
commands/
└── review.md
```

**After (v1.0):**

```
skills/
└── review/
    └── SKILL.md
```

Move the content of each command `.md` file into a `SKILL.md` inside a named directory under `skills/`.

### 3. Remove Assets

Assets have been removed. If you had shared files in `assets/`:

- Move them into the relevant skill directory
- Or include the content directly in your instructions

### 4. Update `aicm.json`

**Before (v0.x):**

```json
{
  "rootDir": "./",
  "targets": ["cursor"],
  "presets": ["@company/ai-preset"],
  "mcpServers": {
    "my-mcp": { "command": "npx", "args": ["my-mcp"] }
  }
}
```

**After (v1.0):**

```json
{
  "rootDir": "./",
  "instructions": "instructions/",
  "targets": {
    "skills": [".agents/skills"],
    "agents": [".agents/agents"],
    "instructions": ["AGENTS.md"],
    "mcp": [".cursor/mcp.json"],
    "hooks": [".cursor"]
  },
  "presets": ["@company/ai-preset"],
  "mcpServers": {
    "my-mcp": { "command": "npx", "args": ["my-mcp"] }
  }
}
```

**Key changes:**

- Add `"instructions": "instructions/"` (path to your instructions source, relative to `rootDir`)
- Replace `"targets": ["cursor"]` with a `targets` object specifying arrays of paths
- All target values are arrays, allowing multi-target installation

### 5. Update Targets

**Single target (common case):**

```json
{
  "targets": {
    "skills": [".agents/skills"],
    "agents": [".agents/agents"],
    "instructions": ["AGENTS.md"],
    "mcp": [".cursor/mcp.json"],
    "hooks": [".cursor"]
  }
}
```

**Multi-target (e.g., Cursor + Claude):**

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

### 6. Remove Windsurf Target

If you were using `"windsurf"` in your targets array, remove it. Windsurf support has been dropped in v1.0. The `.windsurfrules` file will no longer be generated.

### 7. Update `.gitignore`

**Before:**

```gitignore
.cursor/*/aicm/
.cursor/skills/
.cursor/agents/
```

**After:**

```gitignore
# AICM managed files
.agents/
AGENTS.md
CLAUDE.md
.cursor/mcp.json
.cursor/hooks.json
.cursor/hooks/aicm/
```

### 8. Update Preset Packages

If you maintain an aicm preset package:

1. Rename `rules/` to `instructions/`
2. Convert `.mdc` files to `.md` with updated frontmatter
3. Remove `commands/` and `assets/` directories
4. Add `"instructions": "instructions/"` to the preset's `aicm.json`
5. Remove `"targets"` from the preset (targets are only used in consumer configs)

### 9. Clean and Reinstall

After updating your configuration:

```bash
# Remove old generated files
npx aicm clean

# Install with new configuration
npx aicm install
```

## FAQ

### What happens to my existing `.cursor/rules/aicm/` files?

Run `npx aicm clean` with the old version first (or manually delete `.cursor/rules/aicm/`, `.cursor/commands/aicm/`, and `.cursor/assets/aicm/`), then install with v1.0.

### Can I still use `.mdc` files?

No. v1.0 only supports `.md` files in the `instructions/` directory. The `.mdc` format was Cursor-specific and is no longer needed since instructions are written to `AGENTS.md`.

### What about progressive disclosure?

Instructions with `inline: false` (the default) use progressive disclosure. Only the description is inlined in `AGENTS.md`, with a link to the full content file in `.agents/aicm/`. This is useful for large instructions that would bloat the context window.

### Do I need to update my CI configuration?

If your CI uses `npx aicm install --ci`, the command still works. The output messages have changed (e.g., "installed 3 instructions" instead of "installed 3 rules"), so update any CI scripts that parse the output.

### What about the Node.js API?

The `InstallResult` type has changed:

- `installedRuleCount` is now `installedInstructionCount`
- `installedCommandCount` has been removed
- New fields: `installedSkillCount`, `installedAgentCount`, `installedHookCount`
