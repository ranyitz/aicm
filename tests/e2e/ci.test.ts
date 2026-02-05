import path from "path";
import {
  setupFromFixture,
  runCommand,
  runCommandRaw,
  fileExists,
  readTestFile,
} from "./helpers";

describe("CI", () => {
  const agentsPath = "AGENTS.md";

  test("should skip install on CI by default", async () => {
    await setupFromFixture("single-rule-clean");

    const { stdout } = await runCommandRaw("install", undefined, {
      env: { CI: "true" },
    });

    expect(stdout).toContain("Detected CI environment, skipping install");
    expect(fileExists(agentsPath)).toBe(false);
  });

  test("should install when --ci flag is used in CI", async () => {
    await setupFromFixture("single-rule");

    const { stdout, code } = await runCommand("install --ci", undefined, {
      env: { CI: "true" },
    });

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");
    expect(fileExists(agentsPath)).toBe(true);

    // Verify instruction content
    const agentsContent = readTestFile(agentsPath);
    expect(agentsContent).toContain("Test Instruction");

    // Verify MCP config was installed
    const mcpPath = path.join(".cursor", "mcp.json");
    expect(fileExists(mcpPath)).toBe(true);

    const mcpConfig = JSON.parse(readTestFile(mcpPath));
    expect(mcpConfig).toHaveProperty("mcpServers");
    expect(mcpConfig.mcpServers["test-mcp"]).toMatchObject({
      command: "./scripts/test-mcp.sh",
      args: ["--test"],
      env: { TEST_TOKEN: "test123" },
      aicm: true,
    });
  });

  test("should install normally when not in CI environment", async () => {
    await setupFromFixture("single-rule");

    const { stdout, code } = await runCommand("install", undefined, {
      env: { CI: "false" },
    });

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");
    expect(fileExists(agentsPath)).toBe(true);

    // Verify instruction content
    const agentsContent = readTestFile(agentsPath);
    expect(agentsContent).toContain("Test Instruction");
  });

  test("should install normally when not in CI environment with --ci flag", async () => {
    await setupFromFixture("single-rule");

    const { stdout, code } = await runCommand("install --ci", undefined, {
      env: { CI: "false" },
    });

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");
    expect(fileExists(agentsPath)).toBe(true);

    // Verify instruction content
    const agentsContent = readTestFile(agentsPath);
    expect(agentsContent).toContain("Test Instruction");
  });
});
