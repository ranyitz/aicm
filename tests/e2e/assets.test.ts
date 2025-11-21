import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
  getDirectoryStructure,
} from "./helpers";

describe("assetsDir functionality", () => {
  test("installs assets to .cursor/assets/aicm/ for cursor target", async () => {
    await setupFromFixture("assets-dir-basic");

    const { code, stdout } = await runCommand("install --ci");
    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed");

    // Verify assets are in .cursor/assets/aicm/
    expect(fileExists(".cursor/assets/aicm/schema.json")).toBe(true);
    expect(fileExists(".cursor/assets/aicm/examples/response.json")).toBe(true);

    // Verify asset contents
    const schemaContent = readTestFile(".cursor/assets/aicm/schema.json");
    expect(schemaContent).toContain('"type": "object"');

    const exampleContent = readTestFile(
      ".cursor/assets/aicm/examples/response.json",
    );
    expect(exampleContent).toContain('"id": "123"');
  });

  test("rules preserve relative paths to assets", async () => {
    await setupFromFixture("assets-dir-basic");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Read the installed rule
    const ruleContent = readTestFile(".cursor/rules/aicm/api.mdc");

    // Verify relative paths are rewritten to point to assets/aicm/
    expect(ruleContent).toContain(
      "[schema.json](../../assets/aicm/schema.json)",
    );
    expect(ruleContent).toContain("`../../assets/aicm/examples/response.json`");
  });

  test("commands preserve relative paths to assets", async () => {
    await setupFromFixture("assets-dir-basic");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Read the installed command
    const commandContent = readTestFile(".cursor/commands/aicm/generate.md");

    // Verify relative paths are rewritten to point to assets/aicm/
    expect(commandContent).toContain(
      "[this schema](../../assets/aicm/schema.json)",
    );
    expect(commandContent).toContain(
      "Check the example at ../../assets/aicm/examples/response.json",
    );
  });

  test("hook scripts can be stored in assetsDir", async () => {
    await setupFromFixture("assets-dir-hooks");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Hook files are now stored in the hooks/ directory
    expect(fileExists(".cursor/hooks/aicm/validate.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/helper.js")).toBe(true);

    // Verify hooks.json points to the correct location
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toHaveLength(2);
    expect(hooksJson.hooks.beforeShellExecution[0].command).toBe(
      "./hooks/aicm/validate.sh",
    );
    expect(hooksJson.hooks.beforeShellExecution[1].command).toBe(
      "./hooks/aicm/helper.js",
    );

    // Verify hook script content is preserved
    const validateContent = readTestFile(".cursor/hooks/aicm/validate.sh");
    expect(validateContent).toContain("./helper.js");
    expect(validateContent).toContain("Validation complete");

    // Verify both hook files maintain their relative paths to each other
    const helperContent = readTestFile(".cursor/hooks/aicm/helper.js");
    expect(helperContent).toContain("Helper executed");
  });

  test("assets installed to .aicm/ for windsurf/codex/claude targets", async () => {
    await setupFromFixture("assets-dir-multitarget");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Verify assets are in .aicm/ for non-cursor targets
    expect(fileExists(".aicm/config.yaml")).toBe(true);
    expect(fileExists(".aicm/data.json")).toBe(true);

    // Verify asset contents
    const configContent = readTestFile(".aicm/config.yaml");
    expect(configContent).toContain("version: 1.0");

    const dataContent = readTestFile(".aicm/data.json");
    expect(dataContent).toContain('"id": 1');
  });

  test("assets installed to both .cursor/assets/aicm/ and .aicm/ for multi-target", async () => {
    await setupFromFixture("assets-dir-multitarget");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Verify assets exist in both locations
    expect(fileExists(".cursor/assets/aicm/config.yaml")).toBe(true);
    expect(fileExists(".cursor/assets/aicm/data.json")).toBe(true);
    expect(fileExists(".aicm/config.yaml")).toBe(true);
    expect(fileExists(".aicm/data.json")).toBe(true);

    // Verify rule references are rewritten to point to .cursor/assets/aicm/
    const ruleContent = readTestFile(".cursor/rules/aicm/example.mdc");
    expect(ruleContent).toContain(
      "[config file](../../assets/aicm/config.yaml)",
    );
    expect(ruleContent).toContain("`../../assets/aicm/data.json`");
  });

  test("windsurf target receives assets in .aicm/", async () => {
    await setupFromFixture("assets-dir-multitarget");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Read windsurf rules file
    const windsurfContent = readTestFile(".windsurfrules");

    // Should reference .aicm/ directory
    expect(windsurfContent).toContain("aicm/example.md");

    // Verify assets are in .aicm/ (same directory as rules for windsurf)
    expect(fileExists(".aicm/config.yaml")).toBe(true);
    expect(fileExists(".aicm/data.json")).toBe(true);
    expect(fileExists(".aicm/example.md")).toBe(true);
  });

  test("preserves directory structure in assets", async () => {
    await setupFromFixture("assets-dir-basic");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Check directory structure is preserved
    const structure = getDirectoryStructure(".cursor/assets/aicm");

    expect(structure).toContain(".cursor/assets/aicm/examples/");
    expect(structure).toContain(".cursor/assets/aicm/examples/response.json");
    expect(structure).toContain(".cursor/assets/aicm/schema.json");

    // Verify subdirectory structure maintained
    expect(fileExists(".cursor/assets/aicm/examples/response.json")).toBe(true);
  });

  test("installs successfully without assetsDir", async () => {
    // Use a fixture that doesn't have assetsDir
    await setupFromFixture("commands-basic");

    const { code, stdout } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Should install commands successfully
    expect(stdout).toContain("Successfully installed 2 commands");
    expect(fileExists(".cursor/commands/aicm/test.md")).toBe(true);

    // No assets directory should be created
    expect(fileExists(".cursor/assets")).toBe(false);
  });
});
