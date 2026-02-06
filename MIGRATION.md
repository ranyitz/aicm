# Migration Guide: v0.x to v1.0

AICM v1.0 replaces Cursor-specific `.mdc` rules with an industry-standard instructions system targeting `AGENTS.md`.

## Quick Summary

| v0.x                           | v1.0                               |
| ------------------------------ | ---------------------------------- |
| `rules/*.mdc`                  | `instructions/*.md`                |
| `commands/*.md`                | `skills/*/SKILL.md`                |
| `assets/*`                     | Embed in skills or instructions    |
| `"targets": ["claude"]`        | `"targets": ["claude-code"]`       |
| Output to `.cursor/rules/aicm` | Output to `AGENTS.md`              |
| Windsurf support               | Removed (new: `opencode`, `codex`) |

## Migrating Rules & Commands to Skills

Cursor 2.4+ includes a built-in `/migrate-to-skills` command that automatically converts dynamic rules and slash commands to skills. [See Cursor docs](https://cursor.com/docs/context/skills#migrating-rules-and-commands-to-skills).

Run it first—it handles most of the Cursor-side migration for you.

## Step-by-Step

### 1. Rename `rules/` to `instructions/`

- Change file extensions from `.mdc` to `.md`
- Remove `globs` from frontmatter
- Replace `alwaysApply: true` with `inline: true`
- `inline: false` (default) uses progressive disclosure—only the description is inlined with a link to the full content

### 2. Convert `commands/` to `skills/`

Move each command file into a named skill directory:

```
commands/review.md  →  skills/review/SKILL.md
```

### 3. Remove `assets/`

Move asset files into the relevant skill directory or inline their content into instructions.

### 4. Update `aicm.json`

Add `instructions` and update `targets` with the new preset names:

```json
{
  "rootDir": "./",
  "instructions": "instructions",
  "targets": ["cursor", "claude-code"]
}
```

Available target presets: `cursor`, `claude-code`, `opencode`, `codex`. Each preset automatically resolves to the correct output paths for that environment. Remove `"windsurf"` if present — it is no longer supported.

### 5. Update `.gitignore`

Replace old entries:

```gitignore
# AICM managed files
**/.cursor/*/aicm/**
**/.claude/*/aicm/**
```

### 6. install

```bash
npx aicm install
```

### 7. Update Preset Packages (if applicable)

If you maintain a preset: rename `rules/` to `instructions/`, convert `.mdc` to `.md`, remove `commands/` and `assets/`, add `"instructions": "instructions"` to its `aicm.json`, and remove `"targets"` from the preset config.
