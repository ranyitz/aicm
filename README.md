# aicm

AI Configuration Manager for sharing coding agent instructions and tooling across projects.

## Why aicm

aicm solves the distribution challenge of managing coding agent configurations across projects.
It gives you a single source of truth for `AGENTS.md` instructions, skills, subagents, hooks, and MCP configurations,
then installs them into each project so coding agents like Cursor, Claude Code, OpenCode, and Codex can use them.

## Supported Targets

By default, aicm installs to `cursor` and `claude-code`. You can customize this with the `targets` field:

```json
{
  "targets": ["cursor", "claude-code", "opencode", "codex"]
}
```

| Target preset | Instructions | Skills              | Agents              | MCP                  | Hooks      |
| ------------- | ------------ | ------------------- | ------------------- | -------------------- | ---------- |
| `cursor`      | `AGENTS.md`  | `.cursor/skills/`   | `.cursor/agents/`   | `.cursor/mcp.json`   | `.cursor/` |
| `claude-code` | `CLAUDE.md`  | `.claude/skills/`   | `.claude/agents/`   | `.mcp.json`          | `.claude/` |
| `opencode`    | `AGENTS.md`  | `.opencode/skills/` | `.opencode/agents/` | `opencode.json`      | -          |
| `codex`       | `AGENTS.md`  | `.agents/skills/`   | -                   | `.codex/config.toml` | -          |

## Quick Start

The main workflow in aicm is:

1. Create a reusable preset repo.
2. Consume it from app repos and run install.

### Create a preset

Create a preset repository with an `aicm.json` and instruction sources:

```text
my-preset/
  aicm.json
  instructions/
    TESTING.md
  skills/
    code-review/
      SKILL.md
```

Example `aicm.json` in the preset repo:

```json
{
  "rootDir": "./"
}
```

Use `instructions/*.md` for content that should either always be visible to the agent or loaded on demand.

### Consume the preset in an project repo

In the consumer project, configure `aicm.json`:

```json
// aicm.json in the my-app repo
{
  "rootDir": "./",
  "presets": ["https://github.com/acme/my-preset"],
  "targets": ["cursor", "claude-code"]
}
```

Run install:

```bash
pnpm dlx aicm install
```

This generates or modifies target files (for example `AGENTS.md`, `CLAUDE.md`, `.cursor/mcp.json`, `.mcp.json`, `.cursor/skills/code-review/SKILL.md`, `.claude/skills/code-review/SKILL.md`).

**Result after `npx aicm install`:**

```
my-app/
├── AGENTS.md                              # Generated
├── AGENTS.src.md                          # You write this
├── .agents/
│   ├── instructions/
│   │   └── TESTING.md                     # Progressive disclosure file
├── .cursor/
│   └── skills/
│       └── code-review/
│           └── SKILL.md                   # Copied from preset
└── aicm.json
```

`AGENTS.md` (generated):

```markdown
<!-- AICM:BEGIN -->
<!-- WARNING: Everything between these markers will be overwritten during installation -->

## Project Guidelines

- Use pnpm for package management

<!-- From: my-preset -->

- [TESTING](.agents/instructions/TESTING.md): How to run and write tests

<!-- AICM:END -->
```

## Core Concepts

### Instructions

aicm supports two instruction sources:

- Single file: `AGENTS.src.md` (plain markdown, no frontmatter)
- Directory: `instructions/*.md` (requires frontmatter)

When `rootDir` is set, aicm auto-detects `AGENTS.src.md` and `instructions/*.md` if present.

#### Single-file instructions (`AGENTS.src.md`).

```md
## Coding Standards

- Keep functions small
- Prefer explicit error handling
```

#### Instructions directory (`instructions/*.md`)

Use this when you want multiple instruction files and progressive disclosure.

```yml
---
description: Test strategy and patterns
inline: false
---
## Testing

- Use integration tests for critical flows
```

Frontmatter fields:

- `description` (required)
- `inline` (optional, default `false`)

Behavior:

- `inline: true`: full content is embedded into generated AGENTS.md file
- `inline: false`: only a link is embedded, content is written to `.agents/instructions/...` with a link in AGENTS.md for the agent to read on demand.

### Presets

Presets are reusable aicm configurations referenced from either:

- Local path: `"./presets/team"`
- npm package: `"@acme/my-preset"`
- GitHub URL: `"https://github.com/acme/my-preset"`

GitHub presets also support:

- Branch/tag refs: `/tree/main`
- Subpath presets: `/tree/main/path/to/preset`
- Private repos via `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`

Example:

```json
{
  "presets": [
    "./presets/local-team",
    "@acme/my-preset",
    "https://github.com/acme/my-preset/tree/main/frontend"
  ]
}
```

> **Note:** Presets are recursive and can depend on other presets.

### Targets

`targets` configures where the output files are written to.

```json
{
  "targets": ["cursor", "claude-code", "opencode", "codex"]
}
```

If omitted, defaults to:

```json
["cursor", "claude-code"]
```

### Skills

Put skills in `skills/<name>/SKILL.md`.
Each skill directory is copied to target skill locations.

```text
skills/
  code-review/
    SKILL.md
```

### Agents (_Subagents_)

Put markdown file in `agents/*.md`.
They are installed to the target agents directories.

```text
agents/
  reviewer.md
```

### Hooks

Define hooks with:

- `hooks.json`
- `hooks/` scripts directory

Local and preset hooks are merged and namespaced during install.

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [{ "command": "./hooks/audit.sh" }]
  }
}
```

### MCP servers

Define MCP servers in `aicm.json` and install them to target MCP files.

```json
{
  "mcpServers": {
    "Playwright": {
      "command": "npx",
      "args": ["@playwright/mcp"]
    }
  }
}
```

### Workspaces

aicm supports monorepos/workspaces:

- Auto-detected from `package.json` `workspaces` field, or set `"workspaces": true` in `aicm.json`
- Installs per package
- Also merges non-instruction outputs at the repository root (`skills`, `agents`, `mcp`, `hooks`)

Use `"skipInstall": true` in packages that only provide shared presets/content.

## Configuration

Use either:

- `aicm.json` at project root, or
- `aicm` key inside `package.json`

### Configuration fields

- `rootDir`: base directory for local sources
- `instructionsFile`: single instructions file path (relative to `rootDir` if set)
- `instructionsDir`: directory instructions path (relative to `rootDir` if set)
- `targets`: target presets (`cursor`, `claude-code`, `opencode`, `codex`)
- `presets`: preset sources (local path, npm package, GitHub URL)
- `mcpServers`: MCP configuration
- `workspaces`: boolean override for workspace mode
- `skipInstall`: skip this package during install (workspace use case)

## CLI

```bash
aicm init
aicm install [--ci] [--dry-run] [--verbose]
aicm list
aicm clean [--verbose]
```

- `init`: scaffold `aicm.json`, `AGENTS.src.md`, and optional directories
- `install`: resolve config/presets and write target output
- `list`: show configured instructions
- `clean`: remove aicm-managed generated content

Global options:

- `-h, --help`
- `-v, --version`

## Node.js API

```js
const { install, checkWorkspacesEnabled } = require("aicm");

const result = await install({ dryRun: true });
const workspaces = await checkWorkspacesEnabled();
```

## Generated Files and Git

Most installed output is generated from source config/content.
A common setup is to ignore generated output:

```gitignore
AGENTS.md
CLAUDE.md
.cursor/
.claude/
.agents/
```

Keep your **local setup** in source files, and commit them:

- `aicm.json`
- `AGENTS.src.md`
- `skills/<name>/SKILL.md`
- `agents/*.md`

After each change, run `aicm install` to regenerate the generated files and merge with 3rd party presets.

## CLAUDE.md

If both `AGENTS.md` and `CLAUDE.md` are targets, aicm writes the full merged
content to `AGENTS.md`. `CLAUDE.md` is created as `@AGENTS.md` only when it
does not already exist, if it already exists, it is up to the user to point to `AGENTS.md` instead.

## Migration from v0.x

See [MIGRATION.md](MIGRATION.md).

## Security Note

Treat presets as executable team policy. Use trusted sources only, especially for hooks/scripts and remote presets.
