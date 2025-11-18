# 🗂️ aicm

> AI Configuration Manager

A CLI tool for managing Agentic configurations across projects

![aicm](https://github.com/user-attachments/assets/ca38f2d6-ece6-43ad-a127-6f4fce8b2a5a)

## Why

Modern AI-powered IDEs like Cursor and Agents like Codex enable developers to write custom instructions to maintain context across coding sessions. They also support MCPs for enhanced functionality. However, sharing these configurations across multiple projects is a challenge.

**aicm** solves this by enabling you to create reusable presets that bundle rules and MCP configurations together. With multi-target support, you can write your rules once and deploy them consistently across different AI tools and IDEs.

## How it works

aicm accepts Cursor's `.mdc` format as it provides the most comprehensive feature set. For other AI tools and IDEs, aicm automatically generates compatible formats:

- **Cursor**: Native `.mdc` files with full feature support
- **Windsurf**: Generates `.windsurfrules` file
- **Codex**: Generates `AGENTS.md` file
- **Claude**: Generates `CLAUDE.md` file

This approach ensures you write your rules once in the richest format available, while maintaining compatibility across different AI development environments.

## Getting Started

The easiest way to get started with aicm is by using **presets** - npm packages containing rules and MCP configurations that you can install in any project.

### Using a preset

1. **Install a preset npm package**:

```bash
npm install --save-dev @team/ai-preset
```

2. **Create an `aicm.json` file** in your project root:

```json
{ "presets": ["@team/ai-preset"] }
```

3. **Add a prepare script** to your `package.json` to install all preset rules and MCPs:

```json
{
  "scripts": {
    "prepare": "npx aicm  -y install"
  }
}
```

The rules are now installed in `.cursor/rules/aicm/` and any MCP servers are configured in `.cursor/mcp.json`.

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

### Using Local Rules

For project-specific rules, you can specify `rulesDir` in your `aicm.json` config. This approach allows you to write rules once and automatically generate them for all configured targets.

```json
{
  "rulesDir": "path/to/rules/dir"
}
```

**Referencing Auxiliary Files**

You can place any file (e.g., `example.ts`, `schema.json`, `guide.md`) in your `rulesDir` alongside your `.mdc` files. These assets are automatically copied to the target location. You can reference them in your rules using relative paths, and aicm will automatically rewrite the links to point to the correct location for each target IDE.

Example `rules/my-rule.mdc`:

```markdown
# My Rule

See [Example](./example.ts) for details.
```

**Commands referencing files**

You can also use this feature to create commands that reference auxiliary files in your `rulesDir`. Since assets in `rulesDir` are copied to the target directory, your commands can link to them.

For example, if you have a schema file at `rules/schema.json` and a command at `commands/generate-schema.md`:

```markdown
# Generate Schema

Use the schema defined in [Schema Template](../rules/schema.json) to generate the response.
```

When installed, `aicm` will automatically rewrite the link to point to the correct location of `schema.json` in the target environment (e.g., `../../rules/aicm/schema.json` for Cursor).

### Using Commands

Cursor supports custom commands that can be invoked directly in the chat interface. aicm can manage these command files
alongside your rules and MCP configurations so they install automatically into Cursor.

#### Local Commands

Add a commands directory to your project configuration:

```json
{
  "commandsDir": "./commands",
  "targets": ["cursor"]
}
```

Command files ending in `.md` are installed to `.cursor/commands/aicm/` and appear in Cursor under the `/` command menu.

#### Commands in Presets

Presets can ship reusable command libraries in addition to rules:

```json
{
  "rulesDir": "rules",
  "commandsDir": "commands"
}
```

Preset command files install alongside local ones in `.cursor/commands/aicm/` so they appear with concise paths inside Cursor.
If multiple presets provide a command at the same relative path, aicm will warn during installation and use the version from the
last preset listed in your configuration. Use `overrides` to explicitly choose a different definition when needed.

#### Command Overrides

Use the existing `overrides` field to customize or disable commands provided by presets:

```json
{
  "presets": ["@team/dev-preset"],
  "overrides": {
    "legacy-command": false,
    "custom-test": "./commands/test.md"
  }
}
```

### Notes

- Generated rules are always placed in a subdirectory for deterministic cleanup and easy gitignore.
- Users may add `.cursor/rules/aicm/` and `.aicm/` (for Windsurf/Codex) to `.gitignore` if they do not want to track generated rules.

### Overrides

You can disable or replace specific rules provided by presets using the `overrides` field:

```json
{
  "presets": ["@company/ai-rules"],
  "overrides": {
    "rule-from-preset-a": "./rules/override-rule.mdc",
    "rule-from-preset-b": false
  }
}
```

### Demo

We'll install [an npm package](https://github.com/ranyitz/pirate-coding) containing a simple preset to demonstrate how aicm works.

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

This command installs all configured rules and MCPs to their IDE-specific locations.

After installation, open Cursor and ask it to do something. Your AI assistant will respond with pirate-themed coding advice. You can also ask it about the aicm library which uses https://gitmcp.io/ to give you advice based on the latest documentation.

## Security Note

To prevent [prompt-injection](https://en.wikipedia.org/wiki/Prompt_injection), use only packages from trusted sources.

## Workspaces Support

aicm supports workspaces by automatically discovering and installing configurations across multiple packages in your repository.

You can enable workspaces mode by setting the `workspaces` property to `true` in your root `aicm.json`:

```json
{
  "workspaces": true
}
```

aicm automatically detects workspaces if your `package.json` contains a `workspaces` configuration:

### How It Works

1. **Discover packages**: Automatically find all directories containing `aicm.json` files in your repository
2. **Install per package**: Install rules and MCPs for each package individually in their respective directories
3. **Merge MCP servers**: Write a merged `.cursor/mcp.json` at the repository root containing all MCP servers from every package

### How It Works

Each directory containing an `aicm.json` file is treated as a separate package with its own configuration.

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

### MCP Server Installation

- **Cursor**: MCP server configs are written to `.cursor/mcp.json`.

## Supported Targets

- **Cursor**: Rules are installed as individual `.mdc` files in the Cursor rules directory (`.cursor/rules/aicm/`), mcp servers are installed to `.cursor/mcp.json`
- **Windsurf**: Rules are installed in the `.aicm` directory which should be added to your `.gitignore` file. Our approach for Windsurf is to create links from the `.windsurfrules` file to the respective rules in the `.aicm` directory. There is no support for local mcp servers at the moment.
- **Codex**: Rules are installed in the `.aicm` directory and referenced from `AGENTS.md`.

## Commands

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

### API Reference

#### `install(options?: InstallOptions): Promise<InstallResult>`

Installs rules and MCP servers based on configuration.

**Options:**

- `cwd`: Base directory to use instead of `process.cwd()`
- `config`: Custom config object to use instead of loading from file
- `installOnCI`: Run installation on CI environments (default: `false`)
- `verbose`: Show verbose output and stack traces for debugging (default: `false`)
- `dryRun`: Simulate installation without writing files, useful for preset validation in CI (default: `false`)

**Returns:**

A Promise that resolves to an object with:

- `success`: Whether the operation was successful
- `error`: Error object if the operation failed
- `installedRuleCount`: Number of rules installed

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
