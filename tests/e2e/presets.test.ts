import path from "path";
import {
  setupFromFixture,
  runCommand,
  runFailedCommand,
  fileExists,
  readTestFile,
  testDir,
} from "./helpers";

test("install rules from a preset file", async () => {
  await setupFromFixture("presets-from-file");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 rules");

  // Check that rules from preset were installed with preset namespace
  expect(
    fileExists(
      path.join(
        ".cursor",
        "rules",
        "aicm",
        "company-preset-full.json",
        "typescript.mdc",
      ),
    ),
  ).toBe(true);
  expect(
    fileExists(
      path.join(
        ".cursor",
        "rules",
        "aicm",
        "company-preset-full.json",
        "react.mdc",
      ),
    ),
  ).toBe(true);

  const typescriptRuleContent = readTestFile(
    path.join(
      ".cursor",
      "rules",
      "aicm",
      "company-preset-full.json",
      "typescript.mdc",
    ),
  );
  expect(typescriptRuleContent).toContain("TypeScript Best Practices");

  const reactRuleContent = readTestFile(
    path.join(
      ".cursor",
      "rules",
      "aicm",
      "company-preset-full.json",
      "react.mdc",
    ),
  );
  expect(reactRuleContent).toContain("React Best Practices");
});

test("merge rules from presets with main configuration", async () => {
  await setupFromFixture("presets-merged");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 rules");

  // Check that preset rule was installed with preset namespace
  expect(
    fileExists(
      path.join(
        ".cursor",
        "rules",
        "aicm",
        "company-preset.json",
        "preset-rule.mdc",
      ),
    ),
  ).toBe(true);

  // Check that local rule was installed in the main namespace
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "local-rule.mdc")),
  ).toBe(true);

  const presetRuleContent = readTestFile(
    path.join(
      ".cursor",
      "rules",
      "aicm",
      "company-preset.json",
      "preset-rule.mdc",
    ),
  );
  expect(presetRuleContent).toContain("Preset Rule");

  const localRuleContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "local-rule.mdc"),
  );
  expect(localRuleContent).toContain("Local Rule");

  // Check that MCP config was installed
  const mcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(mcpPath)).toBe(true);
  const mcpConfig = JSON.parse(readTestFile(mcpPath));
  expect(mcpConfig).toHaveProperty("mcpServers");
  expect(mcpConfig.mcpServers["preset-mcp"]).toMatchObject({
    command: "./scripts/preset-mcp.sh",
    env: { MCP_TOKEN: "preset" },
    aicm: true,
  });
});

test("handle npm package presets", async () => {
  await setupFromFixture("presets-npm");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Check that npm package rule was installed with npm package namespace
  expect(
    fileExists(
      path.join(
        ".cursor",
        "rules",
        "aicm",
        "@company",
        "ai-rules",
        "npm-rule.mdc",
      ),
    ),
  ).toBe(true);

  const npmRuleContent = readTestFile(
    path.join(
      ".cursor",
      "rules",
      "aicm",
      "@company",
      "ai-rules",
      "npm-rule.mdc",
    ),
  );
  expect(npmRuleContent).toContain("NPM Package Rule");
});

test("install rules from sibling preset using ../ path", async () => {
  await setupFromFixture("presets-sibling");

  // Run from the project/ subdirectory which has the main config
  const projectDir = path.join(testDir, "project");
  const { stdout, code } = await runCommand("install --ci", projectDir);

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Check that rule from sibling preset was installed with sibling-preset namespace
  // This specifically tests that ../sibling-preset is correctly parsed as namespace ["sibling-preset"]
  // and NOT ["../sibling-preset"] which would create wrong directory structure
  expect(
    fileExists(
      path.join(
        ".cursor",
        "rules",
        "aicm",
        "sibling-preset",
        "sibling-rule.mdc",
      ),
      projectDir,
    ),
  ).toBe(true);

  const ruleContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "sibling-preset", "sibling-rule.mdc"),
    projectDir,
  );
  expect(ruleContent).toContain("Sibling Preset Rule");
});

test("handle errors with missing preset files", async () => {
  await setupFromFixture("presets-missing-preset");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toContain("Preset not found");
});

test("install rules from preset only (no rootDir)", async () => {
  await setupFromFixture("presets-only");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Check that rules from preset were installed with preset namespace
  expect(
    fileExists(
      path.join(".cursor", "rules", "aicm", "preset.json", "typescript.mdc"),
    ),
  ).toBe(true);

  const typescriptRuleContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "preset.json", "typescript.mdc"),
  );
  expect(typescriptRuleContent).toContain(
    "TypeScript Best Practices (Preset Only)",
  );
});

test("install rules from preset only without picking up user's app directories", async () => {
  await setupFromFixture("presets-only-with-app-commands");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Check that rules from preset were installed
  expect(
    fileExists(
      path.join(".cursor", "rules", "aicm", "preset.json", "typescript.mdc"),
    ),
  ).toBe(true);

  const typescriptRuleContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "preset.json", "typescript.mdc"),
  );
  expect(typescriptRuleContent).toContain("TypeScript Best Practices (Preset)");

  // Check that user's app commands directory was NOT picked up
  // Since there's no rootDir, the commands/ directory should be ignored
  expect(
    fileExists(path.join(".cursor", "commands", "user-app-command.md")),
  ).toBe(false);

  // The command should not be installed anywhere in .cursor
  expect(stdout).not.toContain("user-app-command");
});

test("preset commands and rules correctly reference assets with namespace paths", async () => {
  await setupFromFixture("preset-commands-assets");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed");

  // Check that assets are installed with namespace
  expect(
    fileExists(
      path.join(".cursor", "assets", "aicm", "my-preset", "schema.json"),
    ),
  ).toBe(true);

  // Commands are NOT namespaced by preset (unlike rules)
  expect(fileExists(path.join(".cursor", "commands", "aicm", "setup.md"))).toBe(
    true,
  );

  // Check that rule is installed with namespace
  expect(
    fileExists(
      path.join(".cursor", "rules", "aicm", "my-preset", "preset-rule.mdc"),
    ),
  ).toBe(true);

  // Read the installed command and verify asset paths are correctly rewritten
  const commandContent = readTestFile(
    path.join(".cursor", "commands", "aicm", "setup.md"),
  );

  // The command is at .cursor/commands/aicm/setup.md
  // The asset is at .cursor/assets/aicm/my-preset/schema.json
  // Original path in preset: ../assets/schema.json
  // After rewriting: ../../assets/aicm/my-preset/schema.json
  expect(commandContent).toContain(
    "[schema.json](../../assets/aicm/my-preset/schema.json)",
  );
  expect(commandContent).toContain("`../../assets/aicm/my-preset/schema.json`");
  expect(commandContent).toContain(
    "Check the file at ../../assets/aicm/my-preset/schema.json for more details",
  );

  // Read the installed rule and verify asset paths are correctly rewritten
  const ruleContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "my-preset", "preset-rule.mdc"),
  );

  // The rule is at .cursor/rules/aicm/my-preset/preset-rule.mdc
  // The asset is at .cursor/assets/aicm/my-preset/schema.json
  // Original path in preset: ../assets/schema.json
  // After rewriting: ../../../assets/aicm/my-preset/schema.json
  expect(ruleContent).toContain(
    "[schema.json](../../../assets/aicm/my-preset/schema.json)",
  );
});
