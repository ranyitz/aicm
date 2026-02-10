import path from "path";
import fs from "fs-extra";
import { install } from "../../src/api";
import { setupFromFixture } from "./helpers";

test("install instructions", async () => {
  const testDir = await setupFromFixture("single-rule");

  const result = await install({
    cwd: testDir,
    installOnCI: true,
  });

  expect(result.success).toBe(true);
  expect(result.installedInstructionCount).toBe(1);
  expect(result.installedSkillCount).toBe(0);
  expect(result.installedAgentCount).toBe(0);
  expect(result.installedHookCount).toBe(0);
  expect(result.packagesCount).toBe(1);

  // Check that instruction was installed
  const agentsFile = path.join(testDir, "AGENTS.md");
  expect(fs.existsSync(agentsFile)).toBe(true);

  const agentsContent = fs.readFileSync(agentsFile, "utf8");
  expect(agentsContent).toContain("Test Instruction");

  // Check that MCP config was installed
  const mcpFile = path.join(testDir, ".cursor", "mcp.json");
  expect(fs.existsSync(mcpFile)).toBe(true);

  const mcpConfig = fs.readJsonSync(mcpFile);
  expect(mcpConfig.mcpServers["test-mcp"]).toMatchObject({
    command: "./scripts/test-mcp.sh",
    args: ["--test"],
    env: { TEST_TOKEN: "test123" },
    aicm: true,
  });
});

test("handle missing config", async () => {
  const testDir = await setupFromFixture("no-config");

  const result = await install({
    cwd: testDir,
    installOnCI: true,
  });

  expect(result.success).toBe(false);
  expect(result.error).toBeInstanceOf(Error);
  expect(result.error?.message).toBe("Configuration file not found");
  expect(result.installedInstructionCount).toBe(0);
  expect(result.installedSkillCount).toBe(0);
  expect(result.installedAgentCount).toBe(0);
  expect(result.installedHookCount).toBe(0);
  expect(result.packagesCount).toBe(0);
});

test("dry run API", async () => {
  const testDir = await setupFromFixture("single-rule-clean");

  const result = await install({
    cwd: testDir,
    installOnCI: true,
    dryRun: true,
  });

  expect(result.success).toBe(true);
  expect(result.installedInstructionCount).toBe(1);
  expect(result.installedSkillCount).toBe(0);
  expect(result.installedAgentCount).toBe(0);
  expect(result.installedHookCount).toBe(0);
  expect(result.packagesCount).toBe(1);

  const agentsFile = path.join(testDir, "AGENTS.md");
  expect(fs.existsSync(agentsFile)).toBe(false);
});
