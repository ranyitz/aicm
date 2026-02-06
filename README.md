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
- [Features](#features)
  - [Instructions](#instructions)
  - [Skills](#skills)
  - [Agents](#agents)
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

- **Team Consistency:** Ensure every developer on your team uses the same instructions and best practices.
- **Reusable Presets:** Bundle your instructions, skills, and MCP configurations into npm packages (e.g., `@company/ai-preset`) to share them across your organization.
- **Multi-Target Support:** Write instructions once and install them to `AGENTS.md`, `CLAUDE.md`, and other target locations.

## Supported Environments

aicm writes instructions to standard markdown files that work across AI tools:

| Target        | Installation                                                                           |
| ------------- | -------------------------------------------------------------------------------------- |
| **AGENTS.md** | Inlines instructions into `AGENTS.md` (works with Cursor, Codex, and other agents)     |
| **CLAUDE.md** | Inlines instructions into `CLAUDE.md` (works with Claude Code)                         |
| **MCP**       | Configures `.cursor/mcp.json` and/or `.mcp.json` for MCP servers                       |
| **Skills**    | Copies skill directories to `.agents/skills/`, `.cursor/skills/`, or `.claude/skills/` |
| **Agents**    | Copies agent definitions to `.agents/agents/`, `.cursor/agents/`, or `.claude/agents/` |
| **Hooks**     | Configures `.cursor/hooks.json` for Cursor agent hooks                                 |

## Getting Started

The easiest way to get started with aicm is by using **presets** - npm packages containing instructions and MCP configurations that you can install in any project.

### Demo

We'll install [an npm package](https://github.com/ranyitz/pirate-coding) containing a simple "Pirate Coding" preset to demonstrate how aicm works.

1. **Install the demo preset package**:

```bash
npm install --save-dev pirate-coding
```

2. **Create an `aicm.json` file** in your project:

```bash
echo '{ "presets": ["pirate-coding"] }' > aicm.json
```

3. **Install all instructions and MCPs from your configuration**:

```bash
npx aicm install
```

After installation, open your AI-powered IDE and start coding. Your AI assistant will follow the instructions from the preset.

### Creating a Preset

1. **Create an npm package** with the following structure:

```
@team/ai-preset/
├── package.json
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

2. **Configure the preset's `aicm.json`**:

```json
{
  "rootDir": "./",
  "instructions": "instructions/",
  "mcpServers": {
    "my-mcp": { "url": "https://example.com/sse" }
  }
}
```

3. **Publish the package** and use it in your project's `aicm.json`:

```json
{ "presets": ["@team/ai-preset"] }
```

> **Note:** This is syntactic sugar for `@team/ai-preset/aicm.json`.

### Using a Preset

To use a preset in your project:

1. **Install a preset npm package**:

```bash
npm install --save-dev @team/ai-preset
```

2. **Create an `aicm.json` file** in your project root:

```json
{ "presets": ["@team/ai-preset"] }
```

3. **Add a prepare script** to your `package.json` to ensure configurations are always up to date:

```json
{
  "scripts": {
    "prepare": "npx aicm -y install"
  }
}
```

The instructions are inlined into `AGENTS.md` and any MCP servers are configured in `.cursor/mcp.json`.

### Notes

- Generated content in `AGENTS.md` is enclosed in `<!-- AICM:BEGIN -->` / `<!-- AICM:END -->` markers for deterministic cleanup.
- Users may add `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.cursor/mcp.json`, and `.cursor/hooks/aicm/` to `.gitignore` to avoid tracking generated files.

## Features

### Instructions

Instructions are markdown files that provide AI agents with context about your project. They replace the old `.mdc` rules system with a simpler, more portable format.

Create an `instructions/` directory in your project (at the `rootDir` location):

```
my-project/
├── aicm.json
└── instructions/
    ├── general.md
    ├── typescript.md
    └── testing.md
```

Each instruction file uses YAML frontmatter:

```markdown
---
description: TypeScript coding conventions for this project
inline: true
---

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types
```

**Frontmatter fields:**

- `description` (required): Brief description of what this instruction covers
- `inline` (optional, default: `false`): Whether to inline the full content or use progressive disclosure

Configure your `aicm.json`:

```json
{
  "rootDir": "./",
  "instructions": "instructions/",
  "targets": {
    "instructions": ["AGENTS.md"]
  }
}
```

#### Output Modes

**Inline Mode** (`inline: true`): The full content is inlined into `AGENTS.md`:

```markdown
<!-- AICM:BEGIN -->

## TypeScript Conventions

- Use strict mode
- Prefer interfaces over types

<!-- AICM:END -->
```

**Progressive Disclosure** (`inline: false`): Only the description is inlined, with a link to the full content:

```markdown
<!-- AICM:BEGIN -->

- [TypeScript Conventions](.agents/aicm/typescript.md): TypeScript coding conventions for this project

<!-- AICM:END -->
```

The full content is written to `.agents/aicm/typescript.md` for the agent to read on demand.

#### Single File Instructions

Instead of a directory, you can point `instructions` to a single `.md` file:

```json
{
  "rootDir": "./",
  "instructions": "INSTRUCTIONS.md"
}
```

The content of the file is inlined directly into the target(s).

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

Configure your `aicm.json`:

```json
{
  "rootDir": "./",
  "targets": {
    "skills": [".agents/skills"]
  }
}
```

Skills are installed to the directories specified in `targets.skills`. Default: `.agents/skills`.

When installed, each skill directory is copied in its entirety (including `scripts/`, `references/`, `assets/` subdirectories). A `.aicm.json` file is added inside each installed skill to track that it's managed by aicm.

### Agents

aicm supports [Cursor Subagents](https://cursor.com/docs/context/subagents) and [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) - specialized AI assistants that can be delegated specific tasks. Agents are markdown files with YAML frontmatter.

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

Each agent file should have YAML frontmatter with at least a `name` and `description`:

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

Configure your `aicm.json`:

```json
{
  "rootDir": "./",
  "targets": {
    "agents": [".agents/agents", ".cursor/agents", ".claude/agents"]
  }
}
```

Agents are installed to the directories specified in `targets.agents`. Default: `.agents/agents`.

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

MCP servers are written to the paths specified in `targets.mcp`. Default: `.cursor/mcp.json`.

**Multi-target MCP:** You can write MCP configs to multiple target files:

```json
{
  "targets": {
    "mcp": [".cursor/mcp.json", ".mcp.json"]
  }
}
```

This writes the same MCP server configuration to both Cursor's MCP file and Claude Code's project-level MCP file.

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
3. **Merge instructions**: Write a merged `AGENTS.md` at the repository root containing instructions from all packages.
4. **Merge MCP servers**: Write a merged MCP config at the repository root containing all MCP servers from every package.
5. **Merge skills**: Write merged skills to the repository root containing all skills from every package.
6. **Merge agents**: Write merged agents to the repository root containing all agents from every package.

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

Running `npx aicm install` will install instructions for each package in their respective `AGENTS.md` files and merge them at the root.

**Why install in both places?**
`aicm` installs configurations at both the package level AND the root level to support different workflows:

- **Package-level context:** When a developer opens a specific package folder (e.g., `packages/frontend`) in their IDE, they get the specific instructions and MCP servers for that package.
- **Root-level context:** When a developer opens the monorepo root, `aicm` ensures they have access to all instructions and MCP servers from all packages via the merged root configuration.

### Preset Packages in Workspaces

When you have a preset package within your workspace (a package that provides configurations to be consumed by others), you can prevent aicm from installing into it by setting `skipInstall: true`:

```json
{
  "skipInstall": true,
  "rootDir": "./",
  "instructions": "instructions/"
}
```

This is useful when your workspace contains both consumer packages (that need instructions installed) and provider packages (that only export instructions).

## Configuration

Create an `aicm.json` file in your project root, or an `aicm` key in your project's `package.json`.

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
  "presets": [],
  "mcpServers": {},
  "skipInstall": false
}
```

### Configuration Options

- **rootDir**: Directory containing your aicm structure. Must contain one or more of: `instructions`, `skills/`, `agents/`, or `hooks.json`. If not specified, aicm will only install from presets and will not pick up any local directories.
- **instructions**: Path to the instructions source (a single `.md` file or a directory containing `.md` files), resolved relative to `rootDir`. Optional - if not set, no instructions are loaded from local files.
- **targets**: An object specifying where each component type should be installed. Each value is an array of paths.
- **presets**: List of preset packages or paths to include.
- **mcpServers**: MCP server configurations.
- **workspaces**: Set to `true` to enable workspace mode. If not specified, aicm will automatically detect workspaces from your `package.json`.
- **skipInstall**: Set to `true` to skip installation for this package. Useful for preset packages in workspaces.

### Targets Object

Each target is an array of paths where the component should be installed:

| Target Key     | Type       | Default                | Description                        |
| -------------- | ---------- | ---------------------- | ---------------------------------- |
| `skills`       | `string[]` | `[".agents/skills"]`   | Directories to install skills into |
| `agents`       | `string[]` | `[".agents/agents"]`   | Directories to install agents into |
| `instructions` | `string[]` | `["AGENTS.md"]`        | Files to write instructions into   |
| `mcp`          | `string[]` | `[".cursor/mcp.json"]` | MCP config files to write to       |
| `hooks`        | `string[]` | `[".cursor"]`          | Directories for hooks config       |

**Example - Install to both Cursor and Claude locations:**

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
  "instructions": "instructions/",
  "presets": ["@company/ai-preset"],
  "targets": {
    "instructions": ["AGENTS.md", "CLAUDE.md"],
    "mcp": [".cursor/mcp.json", ".mcp.json"]
  }
}
```

This will load instructions from both `./ai-config/instructions/` and the preset, installing them to both `AGENTS.md` and `CLAUDE.md`.

### Directory Structure

aicm uses a convention-based directory structure:

```
my-project/
├── aicm.json
├── instructions/    # Instruction files (.md)
│   ├── general.md
│   └── testing.md
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
