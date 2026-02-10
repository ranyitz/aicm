# aicm

> AI Configuration Manager

A CLI tool for managing AI agent configurations across projects.

![aicm](https://github.com/user-attachments/assets/ca38f2d6-ece6-43ad-a127-6f4fce8b2a5a)

## Table of Contents

- [Why](#why)
- [Supported Environments](#supported-environments)
- [Getting Started](#getting-started)
  - [Creating a Preset](#creating-a-preset)
  - [Using a Preset](#using-a-preset)
  - [End-to-End Example](#end-to-end-example)
- [Features](#features)
  - [Instructions](#instructions)
  - [Skills](#skills)
  - [Subagents](#subagents)
  - [Hooks](#hooks)
  - [MCP Servers](#mcp-servers)
- [Workspaces Support](#workspaces-support)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Node.js API](#nodejs-api)
- [Migration from v0.x](#migration-from-v0x)
- [FAQ](#faq)

## Why

Modern AI-powered IDEs like Cursor and agents like Claude Code allow developers to add custom instructions, skills, and MCP servers. However, keeping these configurations consistent across a team or multiple projects is a challenge.

**aicm** enables **"Write Once, Use Everywhere"** for your AI configurations.

- **Team Consistency:** Ensure every developer on your team can use the same instructions and best practices across different projects.
- **Reusable Presets:** Bundle your instructions, skills, and MCP configurations into presets to share them across projects.
- **Multi-Target Support:** Write once and install in multiple coding agent configurations.

## Supported Environments

| Preset        | Environment | Instructions | Skills            | Subagents           | MCP                  | Hooks      |
| ------------- | ----------- | ------------ | ----------------- | ------------------- | -------------------- | ---------- |
| `cursor`      | Cursor IDE  | `AGENTS.md`  | `.cursor/skills/` | `.cursor/agents/`   | `.cursor/mcp.json`   | `.cursor/` |
| `claude-code` | Claude Code | `CLAUDE.md`  | `.claude/skills/` | `.claude/agents/`   | `.mcp.json`          | `.claude/` |
| `opencode`    | OpenCode    | `AGENTS.md`  | `.agents/skills/` | `.opencode/agents/` | `opencode.json`      | —          |
| `codex`       | Codex CLI   | `AGENTS.md`  | `.agents/skills/` | —                   | `.codex/config.toml` | —          |

By default, aicm targets both `cursor` and `claude-code`. You can customize this with the `targets` field:

```json
{
  "targets": ["cursor", "claude-code", "opencode", "codex"]
}
```

## Getting Started

### Quick Start

1. **Create a reusable preset repository**:

Create an `aicm.json` and your shared instructions/skills, then push to GitHub:

```markdown
my-ai-preset/
├── aicm.json
├── instructions/
│ └── general.md
└── skills/
└── code-review/
└── SKILL.md
```

2. **Consume the preset in your project**:

Reference the GitHub repo in your project's `aicm.json`, then install:

```json
{
  "presets": ["https://github.com/your-org/my-ai-preset"]
}
```

```bash
npx aicm install
```

This generates `AGENTS.md`, `CLAUDE.md`, and target-specific output from the preset.

### Creating a Preset

A preset is a repository (or npm package) containing an `aicm.json` and the resources it references:

```
my-ai-preset/
├── aicm.json
├── instructions/      # Instruction files (.md)
│   ├── typescript.md
│   └── react.md
├── skills/            # Agent Skills [optional]
│   └── code-review/
│       └── SKILL.md
├── agents/            # Subagents (.md) [optional]
│   └── debugger.md
└── hooks.json         # Hook configuration [optional]
```

Configure the preset's `aicm.json`:

```json
{
  "rootDir": "./",
  "mcpServers": {
    "my-mcp": { "url": "https://example.com/sse" }
  }
}
```

Push the repository to GitHub and reference it in any project's `aicm.json`:

```json
{ "presets": ["https://github.com/your-org/my-ai-preset"] }
```

### Using a Preset

Use a GitHub preset for normal team/shared usage:

**GitHub URL**:

```json
{ "presets": ["https://github.com/your-org/my-ai-preset"] }
```

You can also point to a specific branch or subdirectory:

```json
{
  "presets": [
    "https://github.com/your-org/mono-repo/tree/main/presets/frontend"
  ]
}
```

Use a local path when testing preset changes before pushing to GitHub:

```json
{ "presets": ["./presets/my-preset"] }
```

After configuring your presets, run `npx aicm install` to install everything. Add a prepare script to keep configurations up to date:

```json
{
  "scripts": {
    "prepare": "npx -y aicm install"
  }
}
```

### End-to-End Example

Here is a complete example showing a **preset repo** and a **consumer repo** side by side.

**Preset repo** (`github.com/acme/ai-preset`):

```
acme-ai-preset/
├── aicm.json
├── instructions/
│   ├── typescript.md
│   └── testing.md
└── skills/
    └── code-review/
        └── SKILL.md
```

`aicm.json`:

```json
{
  "rootDir": "./"
}
```

`instructions/typescript.md` (inline — always visible):

```markdown
---
description: TypeScript coding conventions
inline: true
---

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types
```

`instructions/testing.md` (progressive disclosure — loaded on demand):

```markdown
---
description: Testing best practices — read when writing or reviewing tests
inline: false
---

## Testing Best Practices

- Write unit tests for all business logic
- Use descriptive test names
- Prefer integration tests for API endpoints
```

**Consumer repo** (`my-app`):

```
my-app/
├── package.json
├── aicm.json
└── AGENTS.src.md
```

`aicm.json`:

```json
{
  "rootDir": "./",
  "presets": ["https://github.com/acme/ai-preset"],
  "targets": ["cursor"]
}
```

`AGENTS.src.md`:

```markdown
## Project Guidelines

- Use pnpm for package management
- All PRs require at least one review
```

**Result after `npx aicm install`:**

```
my-app/
├── AGENTS.md                              # Generated
├── AGENTS.src.md                          # You write this
├── .agents/
│   ├── instructions/
│   │   └── testing.md                     # Progressive disclosure file
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
- All PRs require at least one review

<!-- From: ai-preset -->

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types

- [Testing Best Practices](.agents/instructions/testing.md): Testing best practices — read when writing or reviewing tests

<!-- AICM:END -->
```

Local instructions appear first, followed by preset instructions grouped under a `<!-- From: preset-name -->` comment. Inline instructions are embedded directly, while progressive disclosure instructions appear as links the agent can follow when relevant.

### Notes

- **Recommended:** Add generated files to `.gitignore`. Files like `AGENTS.md`, `CLAUDE.md`, and generated directories (`**/.cursor/*/aicm/**`, `**/.claude/*/aicm/**`, `**/.agents/*/instructions/**`) are derived artifacts. The repo should commit only source files (`aicm.json`, `AGENTS.src.md`, `skills/`, etc.) and regenerate the output locally via `aicm install` (e.g. through a `prepare` script). This keeps commits focused on intentional changes and avoids stale versions across repos.

  ```gitignore
  # AICM generated files
  AGENTS.md
  CLAUDE.md
  **/.cursor/*/aicm/**
  **/.claude/*/aicm/**
  **/.agents/*/instructions/**
  ```

- **Alternative:** If you prefer the generated instructions to be visible in the repository without running `aicm install`, you can commit `AGENTS.md` and `CLAUDE.md`. Note that aicm regenerates content within the `<!-- AICM:BEGIN -->` and `<!-- AICM:END -->` markers on each install, so preset updates may produce diffs in unrelated PRs.
- GitHub presets are cloned and cached locally. Authentication is resolved from `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token` for private repositories.

## Features

### Instructions

Instructions are markdown files that provide AI agents with context about your project. They replace the old `.mdc` rules system with a simpler, more portable format.

The simplest way is to write an `AGENTS.src.md` file in your project root — just plain markdown, no frontmatter needed:

```markdown
## Coding Standards

- Use TypeScript strict mode
- Write tests for all new features
```

When `rootDir` is set, aicm auto-detects `AGENTS.src.md` and uses it as an instruction source. The entire content is inlined into `AGENTS.md` / `CLAUDE.md` between the AICM markers:

```markdown
<!-- AICM:BEGIN -->

## Coding Standards

- Use TypeScript strict mode
- Write tests for all new features

<!-- AICM:END -->
```

#### Instructions Directory (Advanced)

For presets or projects that need multiple instruction files, you can use an `instructions/` directory instead:

```
my-project/
├── aicm.json
└── instructions/
    ├── typescript.md
    ├── testing.md
    └── security.md
```

Files in a directory **require frontmatter** with a `description` and an optional `inline` flag:

- `description` (required): Brief description of what this instruction covers
- `inline` (optional, default: `false`): Whether to inline the full content or use progressive disclosure

**Inline Mode** (`inline: true`): The full content is inlined into `AGENTS.md`.

**Progressive Disclosure** (`inline: false`): Only the description is inlined, with a link to the full content. The full file is written to `.agents/instructions/` for the agent to read on demand:

```markdown
<!-- AICM:BEGIN -->

- [testing](.agents/instructions/testing.md): How to run and write tests

<!-- AICM:END -->
```

When an `instructions/` directory exists under `rootDir`, aicm auto-detects it. If both `AGENTS.src.md` and `instructions/` exist, both are loaded. You can also point to a custom directory via the `instructionsDir` config field:

```json
{
  "rootDir": "./",
  "instructionsDir": "my-custom-instructions"
}
```

### Skills

aicm supports [Agent Skills](https://agentskills.io) - a standard format for giving AI agents new capabilities and expertise. Skills are folders containing instructions, scripts, and resources that agents can discover and use.

Create a `skills/` directory where each subdirectory is a skill (containing a `SKILL.md` file):

```
my-project/
├── aicm.json
└── skills/
    ├── pdf-processing/
    │   ├── SKILL.md
    │   ├── scripts/
    │   │   └── extract.py
    │   └── references/
    │       └── REFERENCE.md
    └── code-review/
        └── SKILL.md
```

Each skill must have a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: pdf-processing
description: Extract text and tables from PDF files, fill forms, merge documents.
---

# PDF Processing Skill

This skill enables working with PDF documents.

## Usage

Run the extraction script:
scripts/extract.py
```

Skills are installed to the directories specified by your target presets. With the default targets (`cursor` + `claude-code`), skills are installed to `.cursor/skills/` and `.claude/skills/`.

When installed, each skill directory is copied in its entirety (including `scripts/`, `references/`, `assets/` subdirectories). A `.aicm.json` file is added inside each installed skill to track that it's managed by aicm.

### Subagents

aicm supports [Cursor Subagents](https://cursor.com/docs/context/subagents) and [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents)

Create an `agents/` directory in your project (at the `rootDir` location):

```
my-project/
├── aicm.json
└── agents/
    ├── code-reviewer.md
    ├── debugger.md
    └── specialized/
        └── security-auditor.md
```

Each subagent file should have YAML frontmatter with at least a `name` and `description`:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices. Use after code changes.
model: inherit
---

You are a senior code reviewer ensuring high standards of code quality and security.

When invoked:

1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately

Review checklist:

- Code is clear and readable
- Functions and variables are well-named
- No duplicated code
- Proper error handling
```

Agents are installed to the directories specified by your target presets. With the default targets (`cursor` + `claude-code`), agents are installed to `.cursor/agents/` and `.claude/agents/`.

A `.aicm.json` metadata file is created in the agents directory to track which agents are managed by aicm. This allows the clean command to remove only aicm-managed agents while preserving any manually created agents.

**Supported Configuration Fields:**

Only fields that work in both Cursor and Claude Code are documented:

- `name` - Unique identifier (defaults to filename without extension)
- `description` - When the agent should be used for task delegation
- `model` - Model to use (`inherit`, or platform-specific values like `sonnet`, `haiku`, `fast`)

> **Note:** Users may include additional platform-specific fields (e.g., `tools`, `hooks` for Claude Code, or `readonly`, `is_background` for Cursor) - aicm will preserve them, but they only work on the respective platform.

### Hooks

aicm provides first-class support for [Cursor Agent Hooks](https://docs.cursor.com/advanced/hooks), allowing you to intercept and extend the agent's behavior. Hooks enable you to run custom scripts before/after shell execution, file edits, MCP calls, and more.

#### Basic Setup

Hooks follow a convention similar to Cursor's own structure:

```
my-project/
├── aicm.json
├── hooks.json
└── hooks/
    ├── audit.sh
    └── format.js
```

Your `hooks.json` file should reference scripts within the `hooks/` directory:

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [{ "command": "./hooks/audit.sh" }],
    "afterFileEdit": [{ "command": "./hooks/format.js" }]
  }
}
```

> **Important:** All hook scripts must be within the `hooks/` directory. References to files outside this directory will be warned about and skipped.

#### Installation Behavior

When you run `aicm install`, the following happens:

1. **Directory Copy**: All files in the `hooks/` directory (except `hooks.json`) are copied
2. **Path Rewriting**: Command paths in `hooks.json` are rewritten to point to `.cursor/hooks/aicm/`
3. **File Installation**: Scripts are copied to `.cursor/hooks/aicm/` (for local hooks) or `.cursor/hooks/aicm/<preset-name>/` (for preset hooks) with their directory structure preserved
4. **Config Merging**: Your hooks configuration is merged into `.cursor/hooks.json`

#### Preset Namespacing

aicm uses directory-based namespacing to prevent collisions:

```
.cursor/hooks/aicm/
├── preset-a/
│   └── validate.sh    # From preset-a
└── preset-b/
    └── validate.sh    # From preset-b
```

#### Workspace Support

In monorepo/workspace mode, hooks are:

- Installed individually for each package (in `package-x/.cursor/hooks.json`)
- Merged and installed at the root (in `.cursor/hooks.json`)
- Deduplicated by full path (including preset namespace)

#### Content Collision Detection

If the same hook file (by path) has different content across workspace packages, aicm will:

1. Warn you about the collision with full source information
2. Use the last occurrence (last-writer-wins)
3. Continue installation

### MCP Servers

You can configure MCP servers directly in your `aicm.json`, which is useful for sharing MCP configurations across your team or bundling them into presets.

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

MCP servers are written to the paths specified by your target presets. With the default targets (`cursor` + `claude-code`), MCP servers are written to both `.cursor/mcp.json` and `.mcp.json`.

## Workspaces Support

aicm supports workspaces by automatically discovering and installing configurations across multiple packages in your repository.

You can enable workspaces mode by setting the `workspaces` property to `true` in your root `aicm.json`:

```json
{
  "workspaces": true
}
```

aicm automatically detects workspaces if your `package.json` contains a `workspaces` configuration.

### How It Works

1. **Discover packages**: Automatically find all directories containing `aicm.json` files in your repository.
2. **Install per package**: Install instructions, skills, and agents for each package individually in their respective directories.
3. **Keep instructions package-scoped**: Do not merge package instructions into a root `AGENTS.md` in workspace mode.
4. **Merge MCP servers**: Write a merged MCP config at the repository root containing all MCP servers from every package.
5. **Merge skills**: Write merged skills to the repository root containing all skills from every package.
6. **Merge agents**: Write merged agents to the repository root containing all agents from every package.
7. **Merge hooks**: Write merged hooks to root-level hook targets.

For example, in a workspace structure like:

```
├── aicm.json (with "workspaces": true)
├── packages/
│   ├── frontend/
│   │   └── aicm.json
│   └── backend/
│       └── aicm.json
└── services/
    └── api/
        └── aicm.json
```

Running `npx aicm install` will install instructions for each package in their respective `AGENTS.md` files. It does not merge package instructions into a root `AGENTS.md` in workspace mode.

**Why install in both places?**
`aicm` installs configurations at both the package level AND the root level to support different workflows:

- **Package-level context:** When a developer opens a specific package folder (e.g., `packages/frontend`) in their IDE, they get the specific instructions and MCP servers for that package.
- **Root-level context:** When a developer opens the monorepo root, `aicm` provides merged non-instruction outputs (MCP servers, skills, agents, and hooks) from all packages.

### Preset Packages in Workspaces

When you have a preset package within your workspace (a package that provides configurations to be consumed by others), you can prevent aicm from installing into it by setting `skipInstall: true`:

```json
{
  "skipInstall": true,
  "rootDir": "./"
}
```

This is useful when your workspace contains both consumer packages (that need instructions installed) and provider packages (that only export instructions).

## Configuration

Create an `aicm.json` file in your project root, or an `aicm` key in your project's `package.json`.

```json
{
  "rootDir": "./",
  "targets": ["cursor", "claude-code"]
}
```

### Configuration Options

- **rootDir**: Directory containing your aicm structure. Must contain one or more of: `AGENTS.src.md`, `instructions/`, `skills/`, `agents/`, or `hooks.json`. If not specified, aicm will only install from presets and will not pick up any local directories.
- **instructionsFile**: Path to a single markdown instructions file, resolved relative to `rootDir`. No frontmatter needed — the entire content is inlined. Auto-detected as `AGENTS.src.md` when present. Can be used together with `instructionsDir`. Set this to use a custom filename (e.g. `"instructionsFile": "RULES.md"`).
- **instructionsDir**: Path to a directory containing multiple instruction `.md` files (each with frontmatter), resolved relative to `rootDir`. Auto-detected as `instructions/` when present. Can be used together with `instructionsFile`. Set this to use a custom directory name.
- **targets**: An array of target preset names specifying which environments to install into. Default: `["cursor", "claude-code"]`. Available presets: `cursor`, `claude-code`, `opencode`, `codex`.
- **presets**: List of preset packages or paths to include.
- **mcpServers**: MCP server configurations.
- **workspaces**: Set to `true` to enable workspace mode. If not specified, aicm will automatically detect workspaces from your `package.json`.
- **skipInstall**: Set to `true` to skip installation for this package. Useful for preset packages in workspaces.

### Target Presets

Target presets determine where each component type is installed. See the [Supported Environments](#supported-environments) table for the full mapping of each preset.

**Example - Install to Cursor, Claude Code, and OpenCode:**

```json
{
  "targets": ["cursor", "claude-code", "opencode"]
}
```

When multiple presets are selected, their paths are merged and deduplicated. For example, the default `["cursor", "claude-code"]` results in instructions being written to both `AGENTS.md` and `CLAUDE.md`, MCP servers to both `.cursor/mcp.json` and `.mcp.json`, etc.

### Configuration Examples

#### Preset-Only Configuration

For projects that only consume presets and don't have their own instructions:

```json
{
  "presets": ["@company/ai-preset"]
}
```

#### Mixed Local and Preset Configuration

To combine your own instructions with preset instructions:

```json
{
  "rootDir": "./ai-config",
  "presets": ["@company/ai-preset"],
  "targets": ["cursor", "claude-code"]
}
```

This will load instructions from `./ai-config/AGENTS.src.md`, `./ai-config/instructions/` (when present), and the preset, installing them to both `AGENTS.md` and `CLAUDE.md`.

### Directory Structure

aicm uses a convention-based directory structure:

```
my-project/
├── aicm.json
├── AGENTS.src.md    # Your instructions (source)
├── skills/          # Agent Skills [optional]
│   └── my-skill/
│       └── SKILL.md
├── agents/          # Subagents (.md) [optional]
│   └── code-reviewer.md
├── hooks/           # Hook scripts [optional]
│   └── validate.sh
└── hooks.json       # Hook configuration [optional]
```

## CLI Commands

### Global Options

These options are available for all commands:

- `--help`, `-h`: Show help information
- `--version`, `-v`: Show version information

### `init`

Initializes a new configuration file in your current directory.

```bash
npx aicm init
```

Creates an `aicm.json` with default configuration and a starter `instructions/` directory.

### `install`

Installs all instructions, skills, agents, hooks, and MCP servers configured in your `aicm.json`.

```bash
npx aicm install
```

Options:

- `--ci`: Run in CI environments (default: `false`)
- `--verbose`: Show detailed output and stack traces for debugging
- `--dry-run`: Simulate installation without writing files, useful for validating presets in CI

### `clean`

Removes all files, directories, and changes made by aicm.

```bash
npx aicm clean
```

Options:

- `--verbose`: Show detailed output of what's being cleaned

### `list`

Lists all configured instructions and their status.

```bash
npx aicm list
```

## Node.js API

In addition to the CLI, aicm can be used programmatically in Node.js applications:

```javascript
const { install } = require("aicm");

install().then((result) => {
  if (result.success) {
    console.log(
      `Successfully installed ${result.installedInstructionCount} instructions`,
    );
    console.log(`Skills: ${result.installedSkillCount}`);
    console.log(`Agents: ${result.installedAgentCount}`);
    console.log(`Hooks: ${result.installedHookCount}`);
  } else {
    console.error(`Error: ${result.error}`);
  }
});
```

## Security Note

To prevent [prompt-injection](https://en.wikipedia.org/wiki/Prompt_injection), use only packages from trusted sources.

## Migration from v0.x

If you're upgrading from aicm v0.x, see the [Migration Guide](MIGRATION.md) for detailed instructions on converting your configuration.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a Pull Request.

## Development

### Testing

```bash
pnpm test
```

### Publishing

```bash
npm run release
```
