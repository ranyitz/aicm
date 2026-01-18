import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
  getDirectoryStructure,
} from "./helpers";

describe("agents installation", () => {
  test("installs local agents to .cursor/agents/", async () => {
    await setupFromFixture("agents-basic");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 agents");

    // Verify agents are installed
    expect(fileExists(".cursor/agents/code-reviewer.md")).toBe(true);
    expect(fileExists(".cursor/agents/debugger.md")).toBe(true);

    // Verify metadata file exists
    expect(fileExists(".cursor/agents/.aicm.json")).toBe(true);

    // Verify agent content is preserved
    const agentContent = readTestFile(".cursor/agents/code-reviewer.md");
    expect(agentContent).toContain("name: code-reviewer");
    expect(agentContent).toContain(
      "Reviews code for quality and best practices",
    );
    expect(agentContent).toContain("model: inherit");
  });

  test("installs preset agents", async () => {
    await setupFromFixture("agents-preset");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 agent");

    // Verify agent is installed
    expect(fileExists(".cursor/agents/data-analyst.md")).toBe(true);

    // Verify content
    const agentContent = readTestFile(".cursor/agents/data-analyst.md");
    expect(agentContent).toContain("name: data-analyst");
    expect(agentContent).toContain("Data analysis expert");
  });

  test("warns when presets provide the same agent", async () => {
    await setupFromFixture("agents-collision");

    const { stdout, stderr } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 agent");
    expect(stderr).toContain(
      'Warning: multiple presets provide the "shared-agent" agent',
    );
    expect(stderr).toContain("Using definition from ./preset-b");

    // Should use the last preset's version
    const agentContent = readTestFile(".cursor/agents/shared-agent.md");
    expect(agentContent).toContain("Preset B version");
  });

  test("installs agents for each workspace package and root", async () => {
    await setupFromFixture("agents-workspace");

    const { stdout } = await runCommand("install --ci --verbose");

    expect(stdout).toContain(
      "Successfully installed 2 agents across 2 packages",
    );

    // Verify root has all agents merged
    const rootStructure = getDirectoryStructure(".cursor/agents");
    expect(rootStructure).toContain(".cursor/agents/agent-a.md");
    expect(rootStructure).toContain(".cursor/agents/agent-b.md");

    // Verify each package has its own agents
    expect(fileExists("package-a/.cursor/agents/agent-a.md")).toBe(true);
    expect(fileExists("package-b/.cursor/agents/agent-b.md")).toBe(true);
  });

  test("installs agents to multiple targets", async () => {
    await setupFromFixture("agents-multitarget");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 agent");

    // Verify agent is installed to both targets
    expect(fileExists(".cursor/agents/multi-agent.md")).toBe(true);
    expect(fileExists(".claude/agents/multi-agent.md")).toBe(true);
  });

  test("clean removes aicm-managed agents", async () => {
    await setupFromFixture("agents-basic");

    // First install
    await runCommand("install --ci");
    expect(fileExists(".cursor/agents/code-reviewer.md")).toBe(true);

    // Then clean
    const { stdout } = await runCommand("clean --verbose");
    expect(stdout).toContain("Successfully cleaned");

    // Agents should be removed
    expect(fileExists(".cursor/agents/code-reviewer.md")).toBe(false);
    expect(fileExists(".cursor/agents/debugger.md")).toBe(false);
    expect(fileExists(".cursor/agents/.aicm.json")).toBe(false);
  });

  test("clean preserves non-aicm agents", async () => {
    await setupFromFixture("agents-basic");

    // Install aicm agents
    await runCommand("install --ci");

    // Manually create a non-aicm agent (not tracked in .aicm.json)
    const fs = await import("fs-extra");
    const path = await import("path");
    const { testDir } = await import("./helpers");
    const manualAgentPath = path.join(
      testDir,
      ".cursor/agents/manual-agent.md",
    );
    fs.ensureDirSync(path.dirname(manualAgentPath));
    fs.writeFileSync(
      manualAgentPath,
      "---\nname: manual-agent\ndescription: Manual agent\n---\n# Manual",
    );

    // Clean
    await runCommand("clean --verbose");

    // aicm agents should be removed
    expect(fileExists(".cursor/agents/code-reviewer.md")).toBe(false);
    expect(fileExists(".cursor/agents/debugger.md")).toBe(false);

    // Manual agent should be preserved (not tracked in metadata)
    expect(fileExists(".cursor/agents/manual-agent.md")).toBe(true);
  });
});
