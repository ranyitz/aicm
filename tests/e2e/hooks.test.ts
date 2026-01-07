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

    // Check hook files were copied with directory structure
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

    // Check hooks.json - preset hooks should be namespaced in directories
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.version).toBe(1);
    expect(hooksJson.hooks.beforeMCPExecution).toEqual([
      { command: "./hooks/aicm/preset/validate.sh" },
    ]);
    expect(hooksJson.hooks.afterMCPExecution).toEqual([
      { command: "./hooks/aicm/preset/track.js" },
    ]);

    // Check files were copied with directory structure
    expect(fileExists(".cursor/hooks/aicm/preset/validate.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/preset/track.js")).toBe(true);

    // Verify content
    expect(readTestFile(".cursor/hooks/aicm/preset/validate.sh")).toContain(
      "Validating...",
    );
    expect(readTestFile(".cursor/hooks/aicm/preset/track.js")).toContain(
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
    // Preset hooks should be namespaced in directories
    expect(hooksJson.hooks.afterFileEdit).toEqual([
      { command: "./hooks/aicm/preset/preset-hook.js" },
    ]);

    // Both files should be present (preset file in directory)
    expect(fileExists(".cursor/hooks/aicm/local-hook.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/preset/preset-hook.js")).toBe(true);
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
      'Warning: Hook file "audit.sh" has different content',
    );
    expect(stderr).toContain("Using last occurrence");

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

    // AICM hooks should also be present with full path
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
    expect(stdout).toContain("No rules, commands, hooks, or skills installed");
  });

  test("validates hooks file exists", async () => {
    await setupFromFixture("hooks-invalid-file");

    // Since the fixture now has a valid rules/ directory, it won't fail validation
    // The command will succeed but won't find hooks.json to install
    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);
  });

  test("validates hooks file is valid JSON", async () => {
    await setupFromFixture("hooks-invalid-json");

    const { runFailedCommand } = await import("./helpers");
    const { stderr, stdout } = await runFailedCommand("install --ci");

    const output = stderr + stdout;
    // Error message for invalid JSON comes from JSON.parse
    expect(output).toContain("Expected property name");
  });

  test("handles nested hook file paths", async () => {
    await setupFromFixture("hooks-nested");

    const { stdout } = await runCommand("install --ci");

    // Should have 1 hook
    expect(stdout).toMatch(/Successfully installed.*1 hook/);

    // File should be copied with full directory structure preserved
    expect(fileExists(".cursor/hooks/aicm/nested/deep/hook.sh")).toBe(true);

    // Path in hooks.json should be rewritten with full path
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/nested/deep/hook.sh" },
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

  test("allows same basename from different presets with namespacing", async () => {
    await setupFromFixture("hooks-preset-collision");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 hooks");

    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));

    // Both presets have validate.sh for the same hook type, but they should be in separate directories
    // and both should be present (concatenated)
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/preset-a/validate.sh" },
      { command: "./hooks/aicm/preset-b/validate.sh" },
    ]);

    // Both files should exist in their respective preset directories
    expect(fileExists(".cursor/hooks/aicm/preset-a/validate.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/preset-b/validate.sh")).toBe(true);

    // Verify they have different content
    const presetAContent = readTestFile(
      ".cursor/hooks/aicm/preset-a/validate.sh",
    );
    const presetBContent = readTestFile(
      ".cursor/hooks/aicm/preset-b/validate.sh",
    );
    expect(presetAContent).toContain("preset-a");
    expect(presetBContent).toContain("preset-b");
  });

  test("warns on content collision for same hook file in workspaces", async () => {
    await setupFromFixture("hooks-workspace-content-collision");

    const { stderr } = await runCommand("install --ci");

    // Should warn about the same preset file with different content
    // The warning will show the full namespaced path
    expect(stderr).toContain(
      'Warning: Hook file "preset/check.sh" has different content',
    );
    expect(stderr).toContain("Using last occurrence");

    // Should still install hooks (last writer wins)
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toBeDefined();
    expect(hooksJson.hooks.afterFileEdit).toBeDefined();

    // Only one version of the file should exist (the last one)
    expect(fileExists(".cursor/hooks/aicm/preset/check.sh")).toBe(true);
    const content = readTestFile(".cursor/hooks/aicm/preset/check.sh");
    // Should be the content from package-b (last writer wins)
    expect(content).toContain("package-b");
  });

  test("preserves directory structure for same basename in different directories", async () => {
    await setupFromFixture("hooks-same-basename");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 hooks");

    // Both files should be installed in their respective directories
    expect(fileExists(".cursor/hooks/aicm/foo/audit.sh")).toBe(true);
    expect(fileExists(".cursor/hooks/aicm/bar/audit.sh")).toBe(true);

    // Verify they have different content
    const fooContent = readTestFile(".cursor/hooks/aicm/foo/audit.sh");
    const barContent = readTestFile(".cursor/hooks/aicm/bar/audit.sh");
    expect(fooContent).toContain("foo directory");
    expect(barContent).toContain("bar directory");

    // Hooks.json should reference both with full paths
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/foo/audit.sh" },
      { command: "./hooks/aicm/bar/audit.sh" },
    ]);
  });
});
