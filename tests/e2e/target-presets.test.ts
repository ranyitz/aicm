import path from "path";
import {
  setupFromFixture,
  runCommand,
  runFailedCommand,
  fileExists,
  readTestFile,
  getDirectoryStructure,
} from "./helpers";

describe("target presets", () => {
  test("cursor preset installs to cursor-specific paths", async () => {
    await setupFromFixture("target-presets-cursor");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");

    // Instructions should go to AGENTS.md (cursor preset)
    expect(fileExists("AGENTS.md")).toBe(true);
    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("<!-- AICM:BEGIN -->");
    expect(agentsContent).toContain("General Instructions");

    // Should NOT create CLAUDE.md (not using claude-code preset)
    expect(fileExists("CLAUDE.md")).toBe(false);
  });

  test("both presets: AGENTS.md gets full content, CLAUDE.md gets pointer", async () => {
    await setupFromFixture("target-presets-both");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");

    // Instructions should go to AGENTS.md with full content
    expect(fileExists("AGENTS.md")).toBe(true);
    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("<!-- AICM:BEGIN -->");
    expect(agentsContent).toContain("General Instructions");

    // CLAUDE.md should be created with @AGENTS.md pointer
    expect(fileExists("CLAUDE.md")).toBe(true);
    const claudeContent = readTestFile("CLAUDE.md");
    expect(claudeContent.trim()).toBe("@AGENTS.md");
  });

  test("invalid preset name throws error", async () => {
    await setupFromFixture("target-presets-invalid");

    const { stderr, code } = await runFailedCommand("install --ci");

    expect(code).not.toBe(0);
    expect(stderr).toContain("Unknown target preset");
    expect(stderr).toContain("nonexistent-preset");
  });

  test("claude-code preset installs hooks to .claude/settings.json", async () => {
    await setupFromFixture("target-presets-hooks-claude");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 3 hooks");

    // Check .claude/settings.json was created
    const settingsPath = path.join(".claude", "settings.json");
    expect(fileExists(settingsPath)).toBe(true);

    const settings = JSON.parse(readTestFile(settingsPath));
    expect(settings.hooks).toBeDefined();

    // beforeShellExecution -> PreToolUse with Bash matcher
    expect(settings.hooks.PreToolUse).toBeDefined();
    const preToolUseGroups = settings.hooks.PreToolUse;
    const bashGroup = preToolUseGroups.find(
      (g: { matcher?: string }) => g.matcher === "Bash",
    );
    expect(bashGroup).toBeDefined();
    expect(bashGroup.hooks).toEqual([
      { type: "command", command: "./hooks/aicm/audit.sh" },
    ]);

    // afterFileEdit -> PostToolUse with Edit|Write matcher
    expect(settings.hooks.PostToolUse).toBeDefined();
    const postToolUseGroups = settings.hooks.PostToolUse;
    const editGroup = postToolUseGroups.find(
      (g: { matcher?: string }) => g.matcher === "Edit|Write",
    );
    expect(editGroup).toBeDefined();
    expect(editGroup.hooks).toEqual([
      { type: "command", command: "./hooks/aicm/format.js" },
    ]);

    // stop -> Stop (no matcher)
    expect(settings.hooks.Stop).toBeDefined();
    const stopGroups = settings.hooks.Stop;
    const stopGroup = stopGroups.find((g: { matcher?: string }) => !g.matcher);
    expect(stopGroup).toBeDefined();
    expect(stopGroup.hooks).toEqual([
      { type: "command", command: "./hooks/aicm/cleanup.sh" },
    ]);

    // Check hook files were copied
    const structure = getDirectoryStructure(path.join(".claude", "hooks"));
    expect(structure).toContain(".claude/hooks/aicm/audit.sh");
    expect(structure).toContain(".claude/hooks/aicm/format.js");
    expect(structure).toContain(".claude/hooks/aicm/cleanup.sh");
  });

  test("both presets install hooks to both cursor and claude-code", async () => {
    await setupFromFixture("target-presets-hooks-both");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 2 hooks");

    // Check Cursor hooks.json was created
    expect(fileExists(".cursor/hooks.json")).toBe(true);
    const hooksJson = JSON.parse(readTestFile(".cursor/hooks.json"));
    expect(hooksJson.hooks.beforeShellExecution).toEqual([
      { command: "./hooks/aicm/audit.sh" },
    ]);

    // Check Claude Code settings.json was created
    const settingsPath = path.join(".claude", "settings.json");
    expect(fileExists(settingsPath)).toBe(true);
    const settings = JSON.parse(readTestFile(settingsPath));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();

    // Both should have hook files
    expect(fileExists(".cursor/hooks/aicm/audit.sh")).toBe(true);
    expect(fileExists(".claude/hooks/aicm/audit.sh")).toBe(true);
  });
});
