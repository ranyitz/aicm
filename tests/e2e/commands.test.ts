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
});
