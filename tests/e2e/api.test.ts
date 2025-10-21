import path from "path";
import fs from "fs-extra";
import { install } from "../../src/api";
import { setupFromFixture } from "./helpers";

test("install rules", async () => {
  const testDir = await setupFromFixture("single-rule");

  const result = await install({
    cwd: testDir,
    installOnCI: true,
  });

  expect(result.success).toBe(true);
  expect(result.installedRuleCount).toBe(1);
  expect(result.installedCommandCount).toBe(0);
  expect(result.packagesCount).toBe(1);

  // Check that rule was installed
  const ruleFile = path.join(
    testDir,
    ".cursor",
    "rules",
    "aicm",
    "test-rule.mdc",
  );
  expect(fs.existsSync(ruleFile)).toBe(true);

  const ruleContent = fs.readFileSync(ruleFile, "utf8");
  expect(ruleContent).toContain("Test Rule");

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
  expect(result.installedRuleCount).toBe(0);
  expect(result.installedCommandCount).toBe(0);
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
  expect(result.installedRuleCount).toBe(1);
  expect(result.installedCommandCount).toBe(0);
  expect(result.packagesCount).toBe(1);

  const ruleFile = path.join(
    testDir,
    ".cursor",
    "rules",
    "aicm",
    "test-rule.mdc",
  );
  expect(fs.existsSync(ruleFile)).toBe(false);
});
