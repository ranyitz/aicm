import {
  getDirectoryStructure,
  readTestFile,
  fileExists,
  runCommand,
  setupFromFixture,
} from "./helpers";

describe("command installation", () => {
  test("installs local commands", async () => {
    await setupFromFixture("commands-basic");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 commands");

    const structure = getDirectoryStructure(".cursor/commands");

    expect(structure).toEqual([
      ".cursor/commands/aicm/",
      ".cursor/commands/aicm/build/",
      ".cursor/commands/aicm/build/release.md",
      ".cursor/commands/aicm/test.md",
    ]);

    expect(readTestFile(".cursor/commands/aicm/test.md")).toContain(
      "Run the unit test suite.",
    );
    expect(readTestFile(".cursor/commands/aicm/build/release.md")).toContain(
      "Build the project for release.",
    );
  });

  test("installs preset commands without preset namespace", async () => {
    await setupFromFixture("commands-preset");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 commands");

    const structure = getDirectoryStructure(".cursor/commands");

    expect(structure).toEqual([
      ".cursor/commands/aicm/",
      ".cursor/commands/aicm/local/",
      ".cursor/commands/aicm/local/custom.md",
      ".cursor/commands/aicm/test/",
      ".cursor/commands/aicm/test/run-tests.md",
    ]);

    expect(readTestFile(".cursor/commands/aicm/local/custom.md")).toContain(
      "project-specific",
    );
    expect(readTestFile(".cursor/commands/aicm/test/run-tests.md")).toContain(
      "shared test suite",
    );
  });

  test("applies command overrides", async () => {
    await setupFromFixture("commands-override");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 commands");

    const structure = getDirectoryStructure(".cursor/commands");

    expect(structure).toEqual([
      ".cursor/commands/aicm/",
      ".cursor/commands/aicm/keep.md",
      ".cursor/commands/aicm/replace.md",
    ]);

    expect(readTestFile(".cursor/commands/aicm/replace.md")).toContain(
      "project specific logic",
    );
    expect(fileExists(".cursor/commands/aicm/deprecated.md")).toBe(false);
  });

  test("warns when presets provide the same command", async () => {
    await setupFromFixture("commands-collision");

    const { stdout, stderr } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 command");
    expect(stderr).toContain(
      'Warning: multiple presets provide the "shared/run" command',
    );
    expect(stderr).toContain("Using definition from ./preset-b");

    expect(readTestFile(".cursor/commands/aicm/shared/run.md")).toContain(
      "Preset B version",
    );
  });

  test("installs commands for each workspace package", async () => {
    await setupFromFixture("commands-workspace");

    const { stdout } = await runCommand("install --ci --verbose");

    expect(stdout).toContain(
      "Successfully installed 2 commands across 2 packages",
    );

    const rootStructure = getDirectoryStructure(".cursor/commands");

    expect(rootStructure).toEqual([
      ".cursor/commands/aicm/",
      ".cursor/commands/aicm/test-a.md",
      ".cursor/commands/aicm/test-b.md",
    ]);

    expect(readTestFile(".cursor/commands/aicm/test-a.md")).toContain(
      "Package A Command",
    );
    expect(readTestFile(".cursor/commands/aicm/test-b.md")).toContain(
      "Package B Command",
    );

    expect(readTestFile("package-a/.cursor/commands/aicm/test-a.md")).toContain(
      "Package A Command",
    );
    expect(readTestFile("package-b/.cursor/commands/aicm/test-b.md")).toContain(
      "Package B Command",
    );
  });

  test("dedupes preset commands when joining workspace commands", async () => {
    await setupFromFixture("commands-workspace-preset");

    const { stdout } = await runCommand("install --ci --verbose");

    expect(stdout).toContain(
      "Successfully installed 2 commands across 2 packages",
    );

    const structure = getDirectoryStructure(".cursor/commands");

    expect(structure).toEqual([
      ".cursor/commands/aicm/",
      ".cursor/commands/aicm/test/",
      ".cursor/commands/aicm/test/run-tests.md",
    ]);

    expect(readTestFile(".cursor/commands/aicm/test/run-tests.md")).toContain(
      "Run shared workspace tests.",
    );
  });

  test("preserves subdirectory structure in command asset links", async () => {
    await setupFromFixture("commands-subdirectory-links");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    const commandPath = ".cursor/commands/aicm/example.md";
    expect(fileExists(commandPath)).toBe(true);

    const commandContent = readTestFile(commandPath);

    // Markdown links should be rewritten with subdirectory structure preserved
    expect(commandContent).toContain(
      "[First asset in subdirectory](../../rules/aicm/category-a/asset-one.mjs)",
    );
    expect(commandContent).toContain(
      "[Second asset in subdirectory](../../rules/aicm/category-a/asset-two.mjs)",
    );
    expect(commandContent).toContain(
      "[Deeply nested asset](../../rules/aicm/deep/nested/structure/config.json)",
    );

    // Inline code references should be rewritten (filesystem-based detection)
    expect(commandContent).toContain(
      "`node ../../rules/aicm/category-a/asset-one.mjs`",
    );
    expect(commandContent).toContain(
      "`../../rules/aicm/category-a/asset-two.mjs`",
    );

    // Bare path references should be rewritten
    expect(commandContent).toContain(
      "You can also run: ../../rules/aicm/deep/nested/structure/config.json",
    );

    // Code blocks should NOT be rewritten (contains example paths)
    expect(commandContent).toContain("../rules/example/fake.js");

    // Non-existent paths should NOT be rewritten
    expect(commandContent).toContain("../rules/nonexistent/file.js");
  });
});
