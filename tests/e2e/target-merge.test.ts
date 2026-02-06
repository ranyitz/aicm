import path from "path";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
} from "./helpers";

describe("target merge scenarios", () => {
  test("cursor + claude-code: AGENTS.md full content, CLAUDE.md pointer", async () => {
    await setupFromFixture("target-merge-cursor-claude");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Instructions: AGENTS.md gets full content
    expect(fileExists("AGENTS.md")).toBe(true);
    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("<!-- AICM:BEGIN -->");
    expect(agentsContent).toContain("General Instructions");

    // CLAUDE.md gets @AGENTS.md pointer
    expect(fileExists("CLAUDE.md")).toBe(true);
    expect(readTestFile("CLAUDE.md").trim()).toBe("@AGENTS.md");

    // Skills in both
    expect(fileExists(".agents/skills/test-skill/SKILL.md")).toBe(true);
    expect(fileExists(".claude/skills/test-skill/SKILL.md")).toBe(true);

    // Agents in both
    expect(fileExists(".cursor/agents/test-agent.md")).toBe(true);
    expect(fileExists(".claude/agents/test-agent.md")).toBe(true);

    // MCP in both
    expect(fileExists(".cursor/mcp.json")).toBe(true);
    expect(fileExists(".mcp.json")).toBe(true);

    // Hooks in both
    expect(fileExists(".cursor/hooks.json")).toBe(true);
    expect(fileExists(path.join(".claude", "settings.json"))).toBe(true);
  });

  test("existing CLAUDE.md is left untouched", async () => {
    await setupFromFixture("target-merge-existing-claude");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    expect(fileExists("AGENTS.md")).toBe(true);
    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("General Instructions");

    // CLAUDE.md preserved with original user content
    const claudeContent = readTestFile("CLAUDE.md");
    expect(claudeContent).toContain("My Custom Claude Config");
    expect(claudeContent).not.toContain("@AGENTS.md");
  });

  test("cursor + opencode: deduplicates AGENTS.md, adds opencode paths", async () => {
    await setupFromFixture("target-merge-cursor-opencode");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Instructions: AGENTS.md only (deduplicated)
    expect(fileExists("AGENTS.md")).toBe(true);
    expect(fileExists("CLAUDE.md")).toBe(false);

    // Skills in both
    expect(fileExists(".agents/skills/test-skill/SKILL.md")).toBe(true);
    expect(fileExists(".opencode/skills/test-skill/SKILL.md")).toBe(true);

    // Agents in both
    expect(fileExists(".cursor/agents/test-agent.md")).toBe(true);
    expect(fileExists(".opencode/agents/test-agent.md")).toBe(true);

    // MCP: cursor + opencode format
    expect(fileExists(".cursor/mcp.json")).toBe(true);
    expect(fileExists("opencode.json")).toBe(true);
    const opencodeMcp = JSON.parse(readTestFile("opencode.json"));
    expect(opencodeMcp.mcp["test-mcp"].type).toBe("local");
    expect(opencodeMcp.mcp["test-mcp"].command).toEqual([
      "npx",
      "-y",
      "test-mcp-server",
    ]);
    expect(opencodeMcp.mcp["test-mcp"].enabled).toBe(true);
    expect(opencodeMcp.mcp["test-mcp"].environment).toEqual({
      TEST_KEY: "test-value",
    });

    // Hooks: cursor only (opencode has no hooks)
    expect(fileExists(".cursor/hooks.json")).toBe(true);
    expect(fileExists(path.join(".claude", "settings.json"))).toBe(false);
  });

  test("cursor + codex: writes .codex/config.toml and deduplicates paths", async () => {
    await setupFromFixture("target-merge-cursor-codex");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Instructions: AGENTS.md only (deduplicated, both use AGENTS.md)
    expect(fileExists("AGENTS.md")).toBe(true);
    expect(fileExists("CLAUDE.md")).toBe(false);

    // Skills: .agents/skills only (deduplicated, cursor and codex both use it)
    expect(fileExists(".agents/skills/test-skill/SKILL.md")).toBe(true);

    // Agents: .cursor/agents only (codex has no agents)
    expect(fileExists(".cursor/agents/test-agent.md")).toBe(true);

    // MCP: .cursor/mcp.json + .codex/config.toml
    expect(fileExists(".cursor/mcp.json")).toBe(true);

    const codexTomlPath = path.join(".codex", "config.toml");
    expect(fileExists(codexTomlPath)).toBe(true);

    // Validate TOML structure
    const codexToml = readTestFile(codexTomlPath);
    expect(codexToml).toContain("[mcp_servers.test-mcp]");
    expect(codexToml).toContain('command = "npx"');
    expect(codexToml).toContain('"-y"');
    expect(codexToml).toContain('"test-mcp-server"');
    expect(codexToml).toContain("# aicm:managed");
    expect(codexToml).not.toContain("aicm = true");
    expect(codexToml).toContain('TEST_KEY = "test-value"');

    // Hooks: .cursor only (codex has no hooks)
    expect(fileExists(".cursor/hooks.json")).toBe(true);

    // Should NOT have claude or opencode paths
    expect(fileExists(".mcp.json")).toBe(false);
    expect(fileExists("opencode.json")).toBe(false);
    expect(fileExists(path.join(".claude", "skills"))).toBe(false);
  });

  test("clean removes codex .codex/config.toml", async () => {
    await setupFromFixture("target-merge-cursor-codex");

    await runCommand("install --ci");
    expect(fileExists(path.join(".codex", "config.toml"))).toBe(true);

    await runCommand("clean --verbose");
    expect(fileExists(path.join(".codex", "config.toml"))).toBe(false);
  });

  test("all targets: merges everything correctly", async () => {
    await setupFromFixture("target-merge-all");

    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Instructions: AGENTS.md full content, CLAUDE.md pointer
    expect(fileExists("AGENTS.md")).toBe(true);
    expect(readTestFile("CLAUDE.md").trim()).toBe("@AGENTS.md");

    // Skills: .agents/skills, .claude/skills, .opencode/skills
    expect(fileExists(".agents/skills/test-skill/SKILL.md")).toBe(true);
    expect(fileExists(".claude/skills/test-skill/SKILL.md")).toBe(true);
    expect(fileExists(".opencode/skills/test-skill/SKILL.md")).toBe(true);

    // Agents: .cursor, .claude, .opencode
    expect(fileExists(".cursor/agents/test-agent.md")).toBe(true);
    expect(fileExists(".claude/agents/test-agent.md")).toBe(true);
    expect(fileExists(".opencode/agents/test-agent.md")).toBe(true);

    // MCP: all four formats
    expect(fileExists(".cursor/mcp.json")).toBe(true);
    expect(fileExists(".mcp.json")).toBe(true);
    expect(fileExists("opencode.json")).toBe(true);
    expect(fileExists(path.join(".codex", "config.toml"))).toBe(true);

    // Codex TOML format
    const codexToml = readTestFile(path.join(".codex", "config.toml"));
    expect(codexToml).toContain("test-mcp");
    expect(codexToml).toContain("npx");

    // Hooks: cursor and claude only
    expect(fileExists(".cursor/hooks.json")).toBe(true);
    expect(fileExists(path.join(".claude", "settings.json"))).toBe(true);
  });

  test("clean after all-targets install removes generated files", async () => {
    await setupFromFixture("target-merge-all");

    await runCommand("install --ci");

    // Verify files exist
    expect(fileExists("AGENTS.md")).toBe(true);
    expect(fileExists("CLAUDE.md")).toBe(true);
    expect(fileExists("opencode.json")).toBe(true);
    expect(fileExists(path.join(".codex", "config.toml"))).toBe(true);

    // Clean
    const { code } = await runCommand("clean --verbose");
    expect(code).toBe(0);

    // All generated files removed
    expect(fileExists("AGENTS.md")).toBe(false);
    expect(fileExists("CLAUDE.md")).toBe(false);
    expect(fileExists(".cursor/mcp.json")).toBe(false);
    expect(fileExists(".mcp.json")).toBe(false);
    expect(fileExists("opencode.json")).toBe(false);
    expect(fileExists(path.join(".codex", "config.toml"))).toBe(false);
    expect(fileExists(".agents/skills/test-skill")).toBe(false);
    expect(fileExists(".opencode/skills/test-skill")).toBe(false);
    expect(fileExists(".cursor/agents/test-agent.md")).toBe(false);
    expect(fileExists(".opencode/agents/test-agent.md")).toBe(false);
  });

  test("clean removes @AGENTS.md-only CLAUDE.md files", async () => {
    await setupFromFixture("target-merge-cursor-claude");

    await runCommand("install --ci");
    expect(readTestFile("CLAUDE.md").trim()).toBe("@AGENTS.md");

    await runCommand("clean --verbose");
    expect(fileExists("CLAUDE.md")).toBe(false);
  });
});
