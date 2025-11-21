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
  - [Rules](#using-rules)
  - [Commands](#using-commands)
  - [Hooks](#using-hooks)
  - [MCP Servers](#mcp-servers)
  - [Auxiliary Files](#referencing-auxiliary-files)
  - [Overrides](#overrides)
- [Workspaces Support](#workspaces-support)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Node.js API](#nodejs-api)

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
- Users should add `.cursor/*/aicm/` to `.gitignore` to avoid tracking generated files. This single pattern covers all aicm-managed directories (rules, commands, assets, hooks).

## Features

### Using Rules

aicm uses Cursor's `.mdc` files for rules. Read more about the format [here](https://cursor.com/docs/context/rules).

Add a rules directory to your project configuration:

```json
{
  "rulesDir": "./rules",
  "targets": ["cursor"]
}
```

Rules are installed in `.cursor/rules/aicm/` and are loaded automatically by Cursor.

### Using Commands

Cursor supports custom commands that can be invoked directly in the chat interface. aicm can manage these command files alongside your rules and MCP configurations.

Add a commands directory to your project configuration:

```json
{
  "commandsDir": "./commands",
  "targets": ["cursor"]
}
```

Command files ending in `.md` are installed to `.cursor/commands/aicm/` and appear in Cursor under the `/` command menu.

### Using Hooks

aicm provides first-class support for [Cursor Agent Hooks](https://docs.cursor.com/advanced/hooks), allowing you to intercept and extend the agent's behavior. Hooks enable you to run custom scripts before/after shell execution, file edits, MCP calls, and more.

#### Basic Setup

Hooks follow a convention similar to Cursor's own structure:

1. Create a `hooks.json` file in your project root (or `rootDir`)
2. Create a `hooks/` directory as a sibling to `hooks.json`
3. Place all your hook scripts inside the `hooks/` directory

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

### Using Assets

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

### Overrides

You can disable or replace specific rules or commands provided by presets using the `overrides` field:

```json
{
  "presets": ["@company/ai-rules"],
  "overrides": {
    "rule-from-preset-a": "./rules/override-rule.mdc",
    "rule-from-preset-b": false,
    "legacy-command": false
  }
}
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
2. **Install per package**: Install rules and MCPs for each package individually in their respective directories.
3. **Merge MCP servers**: Write a merged `.cursor/mcp.json` at the repository root containing all MCP servers from every package.
4. **Merge commands**: Write a merged `.cursor/commands/aicm/` at the repository root containing all commands from every package.

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
  "rulesDir": "./rules",
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
  "overrides": {},
  "mcpServers": {},
  "skipInstall": false
}
```

### Configuration Options

- **rootDir**: Directory containing your aicm structure. Must contain one or more of: `rules/`, `commands/`, `assets/`, `hooks/`, or `hooks.json`. If not specified, aicm will only install rules from presets and will not pick up any local directories.
- **targets**: IDEs/Agent targets where rules should be installed. Defaults to `["cursor"]`. Supported targets: `cursor`, `windsurf`, `codex`, `claude`.
- **presets**: List of preset packages or paths to include.
- **overrides**: Map of rule names to `false` (disable) or a replacement file path.
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
├── rules/           # Rule files (.mdc) [required for rules]
│   ├── api.mdc
│   └── testing.mdc
├── commands/        # Command files (.md) [optional]
│   └── generate.md
├── assets/          # Auxiliary files [optional]
│   ├── schema.json
│   └── examples/
├── hooks/           # Hook scripts [optional]
│   └── validate.sh
└── hooks.json       # Hook configuration [optional]
```

## Migration from v2.x to v3.0

### Breaking Changes

v3.0 introduces a convention-based directory structure for simplicity and predictability.

#### Configuration Keys Changed

**Before (v2.x):**

```json
{
  "rulesDir": "./my-rules",
  "commandsDir": "./my-commands",
  "assetsDir": "./my-assets",
  "hooksFile": "./my-hooks.json",
  "targets": ["cursor"]
}
```

**After (v3.0):**

```json
{
  "rootDir": "./",
  "targets": ["cursor"]
}
```

#### Fixed Directory Structure

Projects must now use the standard directory structure:

- `rules/` for rule files
- `commands/` for command files
- `assets/` for auxiliary files
- `hooks/` for hook scripts
- `hooks.json` for hook configuration

### Migration Steps

1. **Create the standard structure:**

```bash
mkdir -p rules commands assets hooks
```

2. **Move your files:**

```bash
# Move rules (if needed)
mv my-rules/* rules/

# Move commands (if needed)
mv my-commands/* commands/

# Move assets (if needed)
mv my-assets/* assets/

# Move hooks (if needed)
mv my-hooks.json hooks.json
mv my-hooks/* hooks/
```

3. **Update `aicm.json`:**

```json
{
  "rootDir": "./",
  "targets": ["cursor"],
  "presets": [],
  "overrides": {}
}
```

4. **Test the installation:**

```bash
npx aicm install
```

### Benefits

- **Simpler configuration:** One config key (`rootDir`) instead of four
- **Predictable paths:** Always know where files are located
- **Easier to document:** Standard structure across all projects
- **Better IDE support:** Convention-based structure is easier to understand

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
  rulesDir: "rules",
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
