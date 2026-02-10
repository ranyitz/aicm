# Migration Guide: v0.x to v1.0

AICM v1.0 replaces Cursor-specific `.mdc` rules with an industry-standard instructions system targeting `AGENTS.md`.

## Quick Summary

| v0.x                           | v1.0                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `rules/*.mdc`                  | `AGENTS.src.md`, `instructions/*.md`, or keep `rules/*.md` |
| `commands/*.md`                | `skills/*/SKILL.md`                                        |
| `assets/*`                     | Embed in skills or instructions                            |
| `"targets": ["claude"]`        | `"targets": ["claude-code"]`                               |
| Output to `.cursor/rules/aicm` | Output to `AGENTS.md`                                      |
| Windsurf support               | Removed (new: `opencode`, `codex`)                         |

## Migrating Rules

In Cursor, `.mdc` rules have three modes: **Apply Always**, **Apply Intelligently**, and **Apply to Specific Files**. Each maps to a different v1.0 concept:

### "Apply Always" Rules → Instructions

These become inline instructions in `AGENTS.md`. If you're using a single file (`AGENTS.src.md`), just strip the `.mdc` frontmatter entirely — no frontmatter is needed. If you're using a directory with multiple files, rename `.mdc` to `.md`, remove `globs`, and replace `alwaysApply: true` with `inline: true`.

### "Apply Intelligently" Rules

These rules don't have a single migration path — choose the option that best fits each rule:

1. **Progressive disclosure instructions** (`inline: false`) — Best for general guidelines that the agent should load on demand. The description is inlined into `AGENTS.md` with a link to the full content. Use a descriptive `description` field so the agent knows when to read it.

2. **Skills** — Best for workflow-specific or invokable rules (e.g. a testing workflow, a code review checklist). Convert these into a `skills/<name>/SKILL.md` directory.

### "Apply to Specific Files" Rules

Glob-based rules (`globs` frontmatter) don't have a direct equivalent in v1.0. The recommended approach is to convert them to progressive disclosure instructions (`inline: false`) with a description that tells the agent when to apply them:

```markdown
---
description: TypeScript coding conventions — read this when working with *.ts files
inline: false
---

## TypeScript Conventions

...
```

## Migrating Commands to Skills

Cursor 2.4+ includes a built-in `/migrate-to-skills` command that automatically converts dynamic rules and slash commands to skills. [See Cursor docs](https://cursor.com/docs/context/skills#migrating-rules-and-commands-to-skills).

Run it first—it handles most of the Cursor-side migration for you.

## Step-by-Step

### 1. Migrate your rules

You have three options — pick the one that fits your setup:

**Option A: Single file** — Merge your `.mdc` rules into one `AGENTS.src.md` file:

- Remove all `.mdc` frontmatter (`globs`, `alwaysApply`) and combine the content
- No frontmatter needed — a single file is plain markdown and is always fully inlined
- You can also use a custom filename via `"instructionsFile": "MY-RULES.md"` in `aicm.json`

**Option B: Keep your directory** — You can keep `rules/` (or any directory name) as-is. Convert the files (`.mdc` → `.md`, remove `globs`) and add frontmatter with `description` and `inline: true` or `false` (see [Migrating Rules](#migrating-rules)). Then point to it explicitly in `aicm.json`:

```json
{
  "rootDir": "./",
  "instructionsDir": "rules",
  "targets": ["cursor", "claude-code"]
}
```

**Option C: Rename to `instructions/`** — Same as Option B, but rename `rules/` to `instructions/`. This follows the convention and enables auto-detection, so you don't need the explicit `"instructionsDir"` field.

> **Note:** `AGENTS.src.md` and `instructions/` are auto-detected when present under `rootDir`. Any other name requires an explicit `"instructionsFile"` (for a single file) or `"instructionsDir"` (for a directory) field.

### 2. Convert `commands/` to `skills/`

Move each command file into a named skill directory:

```
commands/review.md  →  skills/review/SKILL.md
```

### 3. Remove `assets/`

Move asset files into the relevant skill directory or inline their content into instructions.

### 4. Update `aicm.json`

Update `targets` with the new preset names. `AGENTS.src.md` and `instructions/` are auto-detected when present under `rootDir`:

```json
{
  "rootDir": "./",
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

If you maintain a preset: rename `rules/` to `instructions/`, convert `.mdc` to `.md`, remove `commands/` and `assets/`, and remove `"targets"` from the preset config. The `instructions/` directory is auto-detected when present under `rootDir`.
