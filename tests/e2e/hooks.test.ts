import {
  getDirectoryStructure,
  readTestFile,
  fileExists,
  runCommand,
  setupFromFixture,
} from "./helpers";

describe("hooks installation", () => {
  test("installs local hooks", async () => {
    await setupFromFixture("hooks-basic");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 hooks");

    // Check hooks.json was created
    expect(fileExists(".cursor/hooks.json")).toBe(true);

    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.version).toBe(1);
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/audit.sh" },
    ]);
    expect(hooksJson.hooks.afterFileEdit).toEqual([
      { command: "./hooks/aicm/format.js" },
    ]);

    // Check hook files were copied
    const structure = getDirectoryStructure(".cursor/hooks");
    expect(structure).toEqual([
      ".cursor/hooks/aicm/",
      ".cursor/hooks/aicm/audit.sh",
      ".cursor/hooks/aicm/format.js",
    ]);

    // Verify content
    expect(readTestFile(".cursor/hooks/aicm/audit.sh")).toContain(
      "Running audit...",
    );
    expect(readTestFile(".cursor/hooks/aicm/format.js")).toContain(
      "Formatting file...",
    );
  });

  test("installs preset hooks", async () => {
    await setupFromFixture("hooks-preset");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 hooks");

    // Check hooks.json
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.version).toBe(1);
    expect(hooksJson.hooks.beforeMCPExecution).toEqual([
      { command: "./hooks/aicm/validate.sh" },
    ]);
    expect(hooksJson.hooks.afterMCPExecution).toEqual([
      { command: "./hooks/aicm/track.js" },
    ]);

    // Check files were copied
    expect(fileExists(".cursor/hooks/aicm/validate.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/track.js")).toBe(true);

    // Verify content
    expect(readTestFile(".cursor/hooks/aicm/validate.sh")).toContain(
      "Validating...",
    );
    expect(readTestFile(".cursor/hooks/aicm/track.js")).toContain(
      "Tracking plan...",
    );
  });

  test("merges local and preset hooks", async () => {
    await setupFromFixture("hooks-local-and-preset");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 hooks");

    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.version).toBe(1);
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/local-hook.sh" },
    ]);
    expect(hooksJson.hooks.afterFileEdit).toEqual([
      { command: "./hooks/aicm/preset-hook.js" },
    ]);

    // Both files should be present
    expect(fileExists(".cursor/hooks/aicm/local-hook.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/preset-hook.js")).toBe(true);
  });

  test("installs hooks in workspace mode", async () => {
    await setupFromFixture("hooks-workspace");

    const { stdout } = await runCommand("install --ci --verbose");

    expect(stdout).toContain("Successfully installed");
    expect(stdout).toContain("2 packages");

    // Check root hooks.json
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.version).toBe(1);
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/check-a.sh" },
    ]);
    expect(hooksJson.hooks.afterFileEdit).toEqual([
      { command: "./hooks/aicm/validate-b.js" },
    ]);

    // Check files in root
    expect(fileExists(".cursor/hooks/aicm/check-a.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/validate-b.js")).toBe(true);

    // Check individual packages also have hooks installed
    expect(fileExists("package-a/.cursor/hooks.json")).toBe(true);
    expect(fileExists("package-b/.cursor/hooks.json")).toBe(true);

    const pkgAHooks = JSON.parse(readTestFile("package-a/.cursor/hooks.json"));
    expect(pkgAHooks.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/check-a.sh" },
    ]);

    const pkgBHooks = JSON.parse(readTestFile("package-b/.cursor/hooks.json"));
    expect(pkgBHooks.hooks.afterFileEdit).toEqual([
      { command: "./hooks/aicm/validate-b.js" },
    ]);
  });

  test("warns about hook file collisions with different content", async () => {
    await setupFromFixture("hooks-collision");

    const { stdout, stderr } = await runCommand("install --ci --verbose");

    expect(stdout).toContain("Successfully installed");

    // Check for warning about file collision
    expect(stderr).toContain(
      'Warning: Multiple hook files with name "audit.sh" have different content',
    );
    expect(stderr).toContain("This may indicate a configuration issue");

    // Only one audit.sh should be installed (last writer wins)
    const structure = getDirectoryStructure(".cursor/hooks");
    expect(structure).toEqual([
      ".cursor/hooks/aicm/",
      ".cursor/hooks/aicm/audit.sh",
    ]);

    // The last package's version should be used
    const content = readTestFile(".cursor/hooks/aicm/audit.sh");
    expect(content).toContain("Package B audit");
  });

  test("preserves user-managed hooks in hooks.json", async () => {
    await setupFromFixture("hooks-user-preserved");

    // Run install
    await runCommand("install --ci");

    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));

    // User hooks should be preserved (doesn't point to hooks/aicm/)
    expect(hooksJson.hooks.beforeShellExecution).toContainEqual({
      command: "./user-scripts/custom.sh",
    });
    expect(hooksJson.hooks.stop).toContainEqual({
      command: "./user-scripts/stop.sh",
    });

    // AICM hooks should also be present
    expect(hooksJson.hooks.beforeShellExecution).toContainEqual({
      command: "./hooks/aicm/audit.sh",
    });
    expect(hooksJson.hooks.afterFileEdit).toContainEqual({
      command: "./hooks/aicm/format.js",
    });

    // Verify both user and aicm hooks coexist in beforeShellExecution
    expect(hooksJson.hooks.beforeShellExecution).toHaveLength(2);
  });

  test("handles empty hooks file", async () => {
    await setupFromFixture("hooks-empty");

    const { stdout } = await runCommand("install --ci");

    // Should succeed but install 0 hooks
    expect(stdout).toContain("No rules, commands, or hooks installed");
  });

  test("validates hooks file exists", async () => {
    await setupFromFixture("hooks-invalid-file");

    const { runFailedCommand } = await import("./helpers");
    const { stderr, stdout } = await runFailedCommand("install --ci");

    const output = stderr + stdout;
    expect(output).toContain("Hooks file does not exist");
  });

  test("validates hooks file is valid JSON", async () => {
    await setupFromFixture("hooks-invalid-json");

    const { runFailedCommand } = await import("./helpers");
    const { stderr, stdout } = await runFailedCommand("install --ci");

    const output = stderr + stdout;
    expect(output).toContain("not valid JSON");
  });

  test("handles nested hook file paths", async () => {
    await setupFromFixture("hooks-nested");

    const { stdout } = await runCommand("install --ci");

    // Should have 1 hook
    expect(stdout).toMatch(/Successfully installed.*1 hook/);

    // File should be copied with basename only
    expect(fileExists(".cursor/hooks/aicm/hook.sh")).toBe(true);

    // Path in hooks.json should be rewritten
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/hook.sh" },
    ]);
  });

  test("handles array values in hooks config", async () => {
    await setupFromFixture("hooks-arrays");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed");

    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/audit.sh" },
      { command: "./hooks/aicm/format.js" },
    ]);
  });

  test("dry run shows hooks count", async () => {
    await setupFromFixture("hooks-basic");

    const { stdout } = await runCommand("install --ci --dry-run");

    expect(stdout).toContain("Dry run: validated");
    expect(stdout).toContain("2 hooks");

    // Should not create any files
    expect(fileExists(".cursor/hooks.json")).toBe(false);
    expect(fileExists(".cursor/hooks/aicm")).toBe(false);
  });
});
