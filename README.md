# 🗂️ aicm

> AI Configuration Manager

A CLI tool for managing Agentic configurations across projects.

![aicm](https://github.com/user-attachments/assets/ca38f2d6-ece6-43ad-a127-6f4fce8b2a5a)

## Table of Contents

- [Why](#why)
- [Supported Environments](#supported-environments)
- [Getting Started](#getting-started)
  - [Creating a Preset](#creating-a-preset)
  - [Using a Preset](#using-a-preset)
- [Features](#features)
  - [Rules](#rules)
  - [Commands](#commands)
  - [Skills](#skills)
  - [Agents](#agents)
  - [Hooks](#hooks)
  - [MCP Servers](#mcp-servers)
  - [Assets](#assets)
- [Workspaces Support](#workspaces-support)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Node.js API](#nodejs-api)
- [FAQ](#faq)

## Why

Modern AI-powered IDEs like Cursor and Agents like Codex allow developers to add custom instructions, commands, and MCP servers. However, keeping these configurations consistent across a team or multiple projects is a challenge.

**aicm** enables **"Write Once, Use Everywhere"** for your AI configurations.

- **Team Consistency:** Ensure every developer on your team uses the same rules and best practices.
- **Reusable Presets:** Bundle your rules, commands & MCP configurations into npm packages (e.g., `@company/ai-preset`) to share them across your organization.
- **Multi-Target Support:** Write rules once in the comprehensive `.mdc` format, and automatically deploy them to Cursor, Windsurf, Codex, and Claude.

## Supported Environments

aicm acts as a bridge between your configuration and your AI tools. It accepts Cursor's `.mdc` format and can transform it for other environments:

| Target       | Installation                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| **Cursor**   | Copies `.mdc` files to `.cursor/rules/aicm/` and configures `.cursor/mcp.json` |
| **Windsurf** | Generates a `.windsurfrules` file that links to rules in `.aicm/`              |
| **Codex**    | Generates an `AGENTS.md` file that references rules in `.aicm/`                |
| **Claude**   | Generates a `CLAUDE.md` file that references rules in `.aicm/`                 |

## Getting Started

The easiest way to get started with aicm is by using **presets** - npm packages containing rules and MCP configurations that you can install in any project.

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

3. **Install all rules & MCPs from your configuration**:

```bash
npx aicm install
```

After installation, open Cursor and ask it to do something. Your AI assistant will respond with pirate-themed coding advice.

### Creating a Preset

1. **Create an npm package** with the following structure:

```
@team/ai-preset/
├── package.json
├── aicm.json
├── rules/           # Rule files (.mdc)
│   ├── typescript.mdc
│   └── react.mdc
├── commands/        # Command files (.md) [optional]
├── skills/          # Agent Skills [optional]
├── agents/          # Subagents (.md) [optional]
├── assets/          # Auxiliary files [optional]
└── hooks.json       # Hook configuration [optional]
```

2. **Configure the preset's `aicm.json`**:

```json
{
  "rootDir": "./",
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

To use a real preset in your production project:

1. **Install a preset npm package**:

```bash
npm install --save-dev @team/ai-preset
```

2. **Create an `aicm.json` file** in your project root:

```json
{ "presets": ["@team/ai-preset"] }
```

3. **Add a prepare script** to your `package.json` to ensure rules are always up to date:

```json
{
  "scripts": {
    "prepare": "npx aicm -y install"
  }
}
```

The rules are now installed in `.cursor/rules/aicm/` and any MCP servers are configured in `.cursor/mcp.json`.

### Notes

- Generated files are always placed in subdirectories for deterministic cleanup and easy gitignore.
- Users may add `.cursor/*/aicm/`, `.cursor/skills/`, `.cursor/agents/`, `.claude/`, and `.codex/` to `.gitignore` to avoid tracking generated files.

## Features

### Rules

aicm uses Cursor's `.mdc` files for rules. Read more about the format [here](https://cursor.com/docs/context/rules).

Create a `rules/` directory in your project (at the `rootDir` location):

```
my-project/
├── aicm.json
└── rules/
    ├── typescript.mdc
    └── react.mdc
```

Configure your `aicm.json`:

```json
{
  "rootDir": "./",
  "targets": ["cursor"]
}
```

Rules are installed in `.cursor/rules/aicm/` and are loaded automatically by Cursor.

### Commands

Cursor supports custom commands that can be invoked directly in the chat interface. aicm can manage these command files alongside your rules and MCP configurations.

Create a `commands/` directory in your project (at the `rootDir` location):

```
my-project/
├── aicm.json
└── commands/
    ├── review.md
    └── generate.md
```

Configure your `aicm.json`:

```json
{
  "rootDir": "./",
  "targets": ["cursor"]
}
```

Command files ending in `.md` are installed to `.cursor/commands/aicm/` and appear in Cursor under the `/` command menu.

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
  "targets": ["cursor"]
}
```

Skills are installed to different locations based on the target:

| Target     | Skills Location   |
| ---------- | ----------------- |
| **Cursor** | `.cursor/skills/` |
| **Claude** | `.claude/skills/` |
| **Codex**  | `.codex/skills/`  |

When installed, each skill directory is copied in its entirety (including `scripts/`, `references/`, `assets/` subdirectories). A `.aicm.json` file is added inside each installed skill to track that it's managed by aicm.

In workspace mode, skills are installed both to each package and merged at the root level, similar to commands.

### Agents

aicm supports [Cursor Subagents](https://cursor.com/docs/context/subagents) and [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) - specialized AI assistants that can be delegated specific tasks. Agents are markdown files with YAML frontmatter that define custom prompts, descriptions, and model configurations.

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
  "targets": ["cursor", "claude"]
}
```

Agents are installed to different locations based on the target:

| Target     | Agents Location   |
| ---------- | ----------------- |
| **Cursor** | `.cursor/agents/` |
| **Claude** | `.claude/agents/` |

A `.aicm.json` metadata file is created in the agents directory to track which agents are managed by aicm. This allows the clean command to remove only aicm-managed agents while preserving any manually created agents.

**Supported Configuration Fields:**

Only fields that work in both Cursor and Claude Code are documented:

- `name` - Unique identifier (defaults to filename without extension)
- `description` - When the agent should be used for task delegation
- `model` - Model to use (`inherit`, or platform-specific values like `sonnet`, `haiku`, `fast`)

> **Note:** Users may include additional platform-specific fields (e.g., `tools`, `hooks` for Claude Code, or `readonly`, `is_background` for Cursor) - aicm will preserve them, but they only work on the respective platform.

In workspace mode, agents are installed both to each package and merged at the root level, similar to commands and skills.

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

**Example workspace structure:**

```
my-monorepo/
├── aicm.json (workspaces: true)
├── .cursor/hooks.json (merged from all packages)
├── package-a/
│   ├── aicm.json
│   ├── hooks.json
│   ├── hooks/
│   │   └── check.sh
│   └── .cursor/hooks.json (package-specific)
└── package-b/
    ├── aicm.json
    ├── hooks.json
    ├── hooks/
    │   └── validate.js
    └── .cursor/hooks.json (package-specific)
```

#### Content Collision Detection

If the same hook file (by path) has different content across workspace packages, aicm will:

1. Warn you about the collision with full source information
2. Use the last occurrence (last-writer-wins)
3. Continue installation

### MCP Servers

You can configure MCP servers directly in your `aicm.json`, which is useful for sharing mcp configurations across your team or bundling them into presets.

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

When installed, these servers are automatically added to your `.cursor/mcp.json`.

### Assets

You can include assets (examples, schemas, scripts, etc.) that can be referenced by your rules, commands, and hooks by placing them in the `assets/` directory.

All files in `assets/` are copied to `.cursor/assets/aicm/` (for Cursor) or `.aicm/` (for Windsurf/Codex/Claude).

**Example structure:**

```
my-project/
├── aicm.json
├── rules/
│   └── api-guide.mdc        # References ../assets/schema.json
├── commands/
│   └── generate.md          # References ../assets/schema.json
├── assets/
│   ├── schema.json
│   ├── examples/
│   │   └── config.ts
│   └── hooks/
│       └── validate.sh
└── hooks.json               # References ./hooks/validate.sh
```

**Referencing assets from rules and commands:**

```markdown
<!-- rules/api.mdc -->

Use [this schema](../assets/schema.json) for validation.
Check the example at `../assets/examples/response.json`.
```

**Note:** The `../assets/` path is automatically adjusted during installation to `../../assets/aicm/` to match the final directory structure. You don't need to worry about the installation paths - just use `../assets/`.

**After installation:**

```
.cursor/
├── assets/aicm/             # All assets copied here
│   ├── schema.json
│   ├── examples/
│   │   └── config.ts
│   └── hooks/
│       └── validate.sh
├── rules/aicm/
│   └── api-guide.mdc        # References ../../assets/aicm/schema.json
├── commands/aicm/
│   └── generate.md          # References ../../assets/aicm/schema.json
└── hooks/
    ├── aicm/
    └── hooks.json
```

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
2. **Install per package**: Install rules, commands, skills, and agents for each package individually in their respective directories.
3. **Merge MCP servers**: Write a merged `.cursor/mcp.json` at the repository root containing all MCP servers from every package.
4. **Merge commands**: Write a merged `.cursor/commands/aicm/` at the repository root containing all commands from every package.
5. **Merge skills**: Write merged skills to the repository root (e.g., `.cursor/skills/`) containing all skills from every package.
6. **Merge agents**: Write merged agents to the repository root (e.g., `.cursor/agents/`) containing all agents from every package.

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

Running `npx aicm install` will install rules for each package in their respective directories:

- `packages/frontend/.cursor/rules/aicm/`
- `packages/backend/.cursor/rules/aicm/`
- `services/api/.cursor/rules/aicm/`

**Why install in both places?**
`aicm` installs configurations at both the package level AND the root level to support different workflows:

- **Package-level context:** When a developer opens a specific package folder (e.g., `packages/frontend`) in their IDE, they get the specific rules, commands, and MCP servers for that package.
- **Root-level context:** When a developer opens the monorepo root, `aicm` ensures they have access to all commands and MCP servers from all packages via the merged root configuration. While rules are typically read from nested directories by Cursor, commands and MCP servers must be configured at the root to be accessible.

### Preset Packages in Workspaces

When you have a preset package within your workspace (a package that provides rules to be consumed by others), you can prevent aicm from installing rules into it by setting `skipInstall: true`:

```json
{
  "skipInstall": true,
  "rootDir": "./",
  "targets": ["cursor"]
}
```

This is useful when your workspace contains both consumer packages (that need rules installed) and provider packages (that only export rules).

## Configuration

Create an `aicm.json` file in your project root, or an `aicm` key in your project's `package.json`.

```json
{
  "rootDir": "./",
  "targets": ["cursor"],
  "presets": [],
  "mcpServers": {},
  "skipInstall": false
}
```

### Configuration Options

- **rootDir**: Directory containing your aicm structure. Must contain one or more of: `rules/`, `commands/`, `skills/`, `agents/`, `assets/`, `hooks/`, or `hooks.json`. If not specified, aicm will only install rules from presets and will not pick up any local directories.
- **targets**: IDEs/Agent targets where rules should be installed. Defaults to `["cursor"]`. Supported targets: `cursor`, `windsurf`, `codex`, `claude`.
- **presets**: List of preset packages or paths to include.
- **mcpServers**: MCP server configurations.
- **workspaces**: Set to `true` to enable workspace mode. If not specified, aicm will automatically detect workspaces from your `package.json`.
- **skipInstall**: Set to `true` to skip rule installation for this package. Useful for preset packages that provide rules but shouldn't have rules installed into them.

### Configuration Examples

#### Preset-Only Configuration

For projects that only consume presets and don't have their own rules, you can omit `rootDir`:

```json
{
  "presets": ["@company/ai-preset"]
}
```

This ensures that only rules from the preset are installed, and any local directories like `commands/` or `rules/` in your project (used for your application) won't be accidentally picked up by aicm.

#### Mixed Local and Preset Configuration

To combine your own rules with preset rules:

```json
{
  "rootDir": "./ai-config",
  "presets": ["@company/ai-preset"],
  "targets": ["cursor", "windsurf"]
}
```

This will load rules from both `./ai-config/rules/` and the preset, installing them to both Cursor and Windsurf.

### Directory Structure

aicm uses a convention-based directory structure:

```
my-project/
├── aicm.json
├── rules/           # Rule files (.mdc) [optional]
│   ├── api.mdc
│   └── testing.mdc
├── commands/        # Command files (.md) [optional]
│   └── generate.md
├── skills/          # Agent Skills [optional]
│   └── my-skill/
│       └── SKILL.md
├── agents/          # Subagents (.md) [optional]
│   └── code-reviewer.md
├── assets/          # Auxiliary files [optional]
│   ├── schema.json
│   └── examples/
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

Edit this file to add your rules, presets, or other settings.

### `install`

Installs all rules and MCPs configured in your `aicm.json`.

```bash
npx aicm install
```

Options:

- `--ci`: run in CI environments (default: `false`)
- `--verbose`: show detailed output and stack traces for debugging
- `--dry-run`: simulate installation without writing files, useful for validating presets in CI

### `clean`

Removes all files, directories & changes made by aicm.

```bash
npx aicm clean
```

## Node.js API

In addition to the CLI, aicm can be used programmatically in Node.js applications:

```javascript
const { install, Config } = require("aicm");

install().then((result) => {
  if (result.success) {
    console.log(`Successfully installed ${result.installedRuleCount} rules`);
  } else {
    console.error(`Error: ${result.error}`);
  }
});

// Install with custom options
const customConfig = {
  targets: ["cursor"],
  rootDir: "./",
  presets: ["@team/ai-preset"],
};

install({
  config: customConfig,
  cwd: "/path/to/project",
}).then((result) => {
  // Handle result
});
```

## Security Note

To prevent [prompt-injection](https://en.wikipedia.org/wiki/Prompt_injection), use only packages from trusted sources.

## FAQ

### Can I reference rules from commands or vice versa?

**No, direct references between rules and commands are not supported.** This is because:

- **Commands are hoisted** to the root level in workspace mode (`.cursor/commands/aicm/`)
- **Rules remain nested** at the package level (`package-a/.cursor/rules/aicm/`)
- This creates broken relative paths when commands try to reference rules

**❌ Don't do this:**

```markdown
<!-- commands/validate.md -->

Follow the rules in [api-rule.mdc](../rules/api-rule.mdc) <!-- BROKEN! -->
```

**✅ Do this instead:**

```markdown
<!-- Put shared content in assets/coding-standards.md -->

# Coding Standards

- Use TypeScript for all new code
- Follow ESLint rules
- Write unit tests for all functions
```

```markdown
<!-- rules/api-rule.mdc -->

Follow the coding standards in [coding-standards.md](../assets/coding-standards.md).
```

```markdown
<!-- commands/validate.md -->

Validate against our [coding standards](../assets/coding-standards.md).
```

Use shared assets for content that needs to be referenced by both rules and commands. Assets are properly rewritten and work in all modes.

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
