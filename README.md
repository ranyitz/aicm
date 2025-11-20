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
@team/ai-preset
├── package.json
├── aicm.json
└── rules/
    ├── typescript.mdc
    └── react.mdc
```

2. **Configure the preset's `aicm.json`**:

```json
{
  "rulesDir": "rules",
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

- Generated rules are always placed in a subdirectory for deterministic cleanup and easy gitignore.
- Users should add `.cursor/rules/aicm/` and `.aicm/` (for Windsurf/Codex) to `.gitignore` to avoid tracking generated rules.

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

### Referencing Auxiliary Files

You can place any file (e.g., `example.ts`, `schema.json`, `guide.md`) in your `rulesDir` alongside your `.mdc` files. These assets are automatically copied to the target location. You can reference them in your rules using relative paths, and aicm will automatically rewrite the links to point to the correct location for each target IDE.

Example `rules/my-rule.mdc`:

```markdown
# My Rule

See [Example](./example.ts) for details.
```

#### Commands Referencing Files

You can also use this feature to create commands that reference auxiliary files in your `rulesDir`. Since assets in `rulesDir` are copied to the target directory, your commands can link to them.

For example, if you have a schema file at `rules/schema.json` and a command at `commands/generate-schema.md`:

```markdown
# Generate Schema

Use the schema defined in [Schema Template](../rules/schema.json) to generate the response.
```

When installed, `aicm` will automatically rewrite the link to point to the correct location of `schema.json` in the target environment (e.g., `../../rules/aicm/schema.json` for Cursor).

> **Note:** Path rewriting works for any relative path format in your commands - markdown links, inline code references, or bare paths - as long as they point to actual files in your `rulesDir`.

#### usage in workspaces mode

When using workspaces, commands installed at the monorepo root need to access auxiliary files located in nested packages (e.g., `packages/frontend/rules/helper.js`).

`aicm` handles this automatically by:

1. Copying referenced auxiliary files from nested packages to the root `.cursor/rules/aicm/` directory
2. Rewriting paths in the root command to point to these copied files

**Warning:** If your command references a `.mdc` file (Cursor rule), `aicm` will check if it's a "manual" rule or an "automatic" rule (one that is always applied or auto-attached via globs). If it's an automatic rule, `aicm` will warn you that copying it to the root might cause the rule to be included twice in the context (once from the nested package and once from the root copy). For best results, only reference manual `.mdc` files or other file types (like `.js`, `.json`, `.md`) from commands.

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
  "rulesDir": "./rules",
  "commandsDir": "./commands",
  "targets": ["cursor"],
  "presets": [],
  "overrides": {},
  "mcpServers": {},
  "skipInstall": false
}
```

- **rulesDir**: Directory containing all rule files.
- **commandsDir**: Directory containing Cursor command files.
- **targets**: IDEs/Agent targets where rules should be installed. Defaults to `["cursor"]`.
- **presets**: List of preset packages or paths to include.
- **overrides**: Map of rule names to `false` (disable) or a replacement file path.
- **mcpServers**: MCP server configurations.
- **workspaces**: Set to `true` to enable workspace mode. If not specified, aicm will automatically detect workspaces from your `package.json`.
- **skipInstall**: Set to `true` to skip rule installation for this package. Useful for preset packages that provide rules but shouldn't have rules installed into them.

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
