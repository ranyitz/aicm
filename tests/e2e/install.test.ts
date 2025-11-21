import path from "path";
import {
  setupFromFixture,
  runCommand,
  runFailedCommand,
  fileExists,
  readTestFile,
} from "./helpers";

test("single rule", async () => {
  await setupFromFixture("single-rule");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Check that rule was installed
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "test-rule.mdc")),
  ).toBe(true);

  const ruleContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "test-rule.mdc"),
  );
  expect(ruleContent).toContain("Test Rule");

  // Check that MCP config was installed
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

test("show error when no config file exists", async () => {
  await setupFromFixture("no-config");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toMatch(/config|configuration|not found/i);
});

test("no rules prints message", async () => {
  await setupFromFixture("empty-rules");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("No rules, commands, or hooks installed");
});

test("unknown config keys throw error", async () => {
  await setupFromFixture("unknown-config");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toMatch(/Invalid configuration/);
});

test("handle missing rule files", async () => {
  await setupFromFixture("missing-rules");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 rules");

  // Check that existing rule was installed
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "existing-rule.mdc")),
  ).toBe(true);
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "broken-reference.mdc")),
  ).toBe(true);
});

test("multiple rules from rootDir", async () => {
  await setupFromFixture("multiple-rules");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 3 rules");

  // Check that all rules were installed
  expect(fileExists(path.join(".cursor", "rules", "aicm", "rule1.mdc"))).toBe(
    true,
  );
  expect(fileExists(path.join(".cursor", "rules", "aicm", "rule2.mdc"))).toBe(
    true,
  );
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "subdir", "rule3.mdc")),
  ).toBe(true);

  // Verify content
  const rule1Content = readTestFile(
    path.join(".cursor", "rules", "aicm", "rule1.mdc"),
  );
  expect(rule1Content).toContain("Rule 1");

  const rule3Content = readTestFile(
    path.join(".cursor", "rules", "aicm", "subdir", "rule3.mdc"),
  );
  expect(rule3Content).toContain("Rule 3");
});

test("multiple targets", async () => {
  await setupFromFixture("multiple-targets");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 rules");

  // Check Cursor installation
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "multi-target-rule.mdc")),
  ).toBe(true);

  // Check Windsurf installation
  expect(fileExists(path.join(".aicm", "multi-target-rule.md"))).toBe(true);

  // Check .windsurfrules file
  const windsurfRulesContent = readTestFile(".windsurfrules");
  expect(windsurfRulesContent).toContain(".aicm/multi-target-rule.md");
});

test("clean stale Cursor rules", async () => {
  await setupFromFixture("cursor-cleanup");

  const staleRulePath = path.join(".cursor", "rules", "aicm", "stale-rule.mdc");
  const newRulePath = path.join(".cursor", "rules", "aicm", "fresh-rule.mdc");

  // Verify stale rule exists before installation
  expect(fileExists(staleRulePath)).toBe(true);

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Stale rule should be removed, new rule should exist
  expect(fileExists(staleRulePath)).toBe(false);
  expect(fileExists(newRulePath)).toBe(true);
});

test("clean stale Windsurf rules", async () => {
  await setupFromFixture("windsurf-cleanup");

  // Verify initial state
  expect(fileExists(path.join(".aicm", "stale-windsurf-rule.md"))).toBe(true);
  const oldFreshContent = readTestFile(
    path.join(".aicm", "fresh-windsurf-rule.md"),
  );
  expect(oldFreshContent).toContain("This is OLD fresh Windsurf content");

  let windsurfRulesContent = readTestFile(".windsurfrules");
  expect(windsurfRulesContent).toContain("- .aicm/stale-windsurf-rule.md");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Stale rule should be removed
  expect(fileExists(path.join(".aicm", "stale-windsurf-rule.md"))).toBe(false);

  // Fresh rule should be updated
  expect(fileExists(path.join(".aicm", "fresh-windsurf-rule.md"))).toBe(true);
  const freshRuleContent = readTestFile(
    path.join(".aicm", "fresh-windsurf-rule.md"),
  );
  expect(freshRuleContent).toContain("This is fresh Windsurf content.");
  expect(freshRuleContent).not.toContain("This is OLD fresh Windsurf content");

  // .windsurfrules should be updated
  windsurfRulesContent = readTestFile(".windsurfrules");
  expect(windsurfRulesContent).not.toContain("- .aicm/stale-windsurf-rule.md");
  expect(windsurfRulesContent).toContain("- .aicm/fresh-windsurf-rule.md");
});

test("preserve existing mcp configuration", async () => {
  await setupFromFixture("mcp-preserve-existing");

  const mcpPath = path.join(".cursor", "mcp.json");

  // Verify existing MCP config
  expect(fileExists(mcpPath)).toBe(true);
  const existingMcpConfig = JSON.parse(readTestFile(mcpPath));
  expect(existingMcpConfig.mcpServers["user-defined-server"]).toBeDefined();
  expect(existingMcpConfig.mcpServers["another-user-server"]).toBeDefined();

  const { code } = await runCommand("install --ci");
  expect(code).toBe(0);

  // Check that rule was installed
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "test-rule.mdc")),
  ).toBe(true);

  // Verify MCP config preservation and addition
  const finalMcpConfig = JSON.parse(readTestFile(mcpPath));

  // User servers should be preserved
  expect(finalMcpConfig.mcpServers["user-defined-server"]).toMatchObject({
    command: "./user-scripts/user-server.sh",
    args: ["--user"],
    env: { USER_TOKEN: "user123" },
  });
  expect(finalMcpConfig.mcpServers["another-user-server"]).toMatchObject({
    env: { USER_API_KEY: "user456" },
  });

  // AICM server should be added
  expect(finalMcpConfig.mcpServers["aicm-managed-server"]).toMatchObject({
    command: "./scripts/aicm-server.sh",
    args: ["--aicm"],
    env: { AICM_TOKEN: "aicm123" },
    aicm: true,
  });
});

test("override existing mcp servers with same key", async () => {
  await setupFromFixture("mcp-override-same-key");

  const mcpPath = path.join(".cursor", "mcp.json");

  // Verify initial state
  expect(fileExists(mcpPath)).toBe(true);
  const existingMcpConfig = JSON.parse(readTestFile(mcpPath));
  expect(existingMcpConfig.mcpServers["shared-server"]).toMatchObject({
    command: "./old-scripts/old-server.sh",
    args: ["--old"],
    env: { OLD_TOKEN: "old123" },
  });
  expect(existingMcpConfig.mcpServers["user-only-server"]).toBeDefined();
  expect(existingMcpConfig.userSettings).toMatchObject({
    editor: "vim",
    fontSize: 14,
  });

  const { code } = await runCommand("install --ci");
  expect(code).toBe(0);

  // Verify final state
  const finalMcpConfig = JSON.parse(readTestFile(mcpPath));

  // Shared server should be overridden
  expect(finalMcpConfig.mcpServers["shared-server"]).toMatchObject({
    command: "./scripts/aicm-updated-server.sh",
    args: ["--aicm-updated"],
    env: { AICM_TOKEN: "aicm-new-token" },
    aicm: true,
  });

  // New AICM server should be added
  expect(finalMcpConfig.mcpServers["aicm-only-server"]).toMatchObject({
    command: "./scripts/aicm-only.sh",
    env: { AICM_ONLY: "true" },
    aicm: true,
  });

  // User server should be preserved
  expect(finalMcpConfig.mcpServers["user-only-server"]).toMatchObject({
    env: { USER_ONLY_TOKEN: "useronly456" },
  });

  // User settings should be preserved
  expect(finalMcpConfig.userSettings).toMatchObject({
    editor: "vim",
    fontSize: 14,
  });
});

test("clean up stale mcp servers", async () => {
  await setupFromFixture("mcp-stale-cleanup");

  const mcpPath = path.join(".cursor", "mcp.json");

  // Verify initial state
  expect(fileExists(mcpPath)).toBe(true);
  const existingMcpConfig = JSON.parse(readTestFile(mcpPath));
  expect(existingMcpConfig.mcpServers["user-server"]).toBeDefined();
  expect(existingMcpConfig.mcpServers["existing-aicm-server"]).toMatchObject({
    aicm: true,
  });
  expect(existingMcpConfig.mcpServers["stale-aicm-server"]).toMatchObject({
    aicm: true,
  });

  const { code } = await runCommand("install --ci");
  expect(code).toBe(0);

  // Verify final state
  const finalMcpConfig = JSON.parse(readTestFile(mcpPath));

  // User server should be preserved (without aicm flag)
  expect(finalMcpConfig.mcpServers["user-server"]).toMatchObject({
    command: "./user-scripts/user-server.sh",
    env: { USER_TOKEN: "user789" },
  });
  expect(finalMcpConfig.mcpServers["user-server"].aicm).toBeUndefined();

  // Existing AICM server should be updated
  expect(finalMcpConfig.mcpServers["existing-aicm-server"]).toMatchObject({
    command: "./scripts/updated-existing-server.sh",
    args: ["--updated"],
    env: { UPDATED_TOKEN: "updated456" },
    aicm: true,
  });

  // New AICM server should be added
  expect(finalMcpConfig.mcpServers["new-aicm-server"]).toMatchObject({
    command: "./scripts/new-aicm-server.sh",
    args: ["--new"],
    env: { NEW_TOKEN: "new123" },
    aicm: true,
  });

  // Stale AICM server should be removed
  expect(finalMcpConfig.mcpServers["stale-aicm-server"]).toBeUndefined();
});

test("do not install canceled mcp servers", async () => {
  await setupFromFixture("mcp-canceled-servers");

  const mcpPath = path.join(".cursor", "mcp.json");

  // Verify initial state
  expect(fileExists(mcpPath)).toBe(true);
  const existingMcpConfig = JSON.parse(readTestFile(mcpPath));
  expect(existingMcpConfig.mcpServers["user-server"]).toBeDefined();
  expect(existingMcpConfig.mcpServers["canceled-server"]).toMatchObject({
    aicm: true,
  });

  const { code } = await runCommand("install --ci");
  expect(code).toBe(0);

  // Verify final state
  const finalMcpConfig = JSON.parse(readTestFile(mcpPath));

  // User server should be preserved
  expect(finalMcpConfig.mcpServers["user-server"]).toMatchObject({
    command: "./user-scripts/user-server.sh",
    env: { USER_TOKEN: "user123" },
  });

  // Active server should be added
  expect(finalMcpConfig.mcpServers["active-server"]).toMatchObject({
    command: "./scripts/active-server.sh",
    env: { ACTIVE_TOKEN: "active123" },
    aicm: true,
  });

  // Canceled server should be removed
  expect(finalMcpConfig.mcpServers["canceled-server"]).toBeUndefined();
});

test("rootDir with subdirectories", async () => {
  await setupFromFixture("rule-subdirs");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 rule");

  // Check that rule was installed in subdirectory
  expect(
    fileExists(
      path.join(".cursor", "rules", "aicm", "subdir", "nested-rule.mdc"),
    ),
  ).toBe(true);

  const installedContent = readTestFile(
    path.join(".cursor", "rules", "aicm", "subdir", "nested-rule.mdc"),
  );
  expect(installedContent).toContain("Nested Rule Content");

  // Check that directory structure is preserved
  expect(fileExists(path.join(".cursor", "rules", "aicm", "subdir"))).toBe(
    true,
  );
});

test("no mcp servers", async () => {
  await setupFromFixture("no-mcp");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 rules");

  // Check that rule was installed
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "no-mcp-rule.mdc")),
  ).toBe(true);

  // Check that no MCP config was created
  const mcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(mcpPath)).toBe(false);
});

test("dry run does not write files", async () => {
  await setupFromFixture("single-rule-clean");

  const { stdout, code } = await runCommand("install --ci --dry-run");

  expect(code).toBe(0);
  expect(stdout).toContain("Dry run");

  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "test-rule.mdc")),
  ).toBe(false);

  const mcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(mcpPath)).toBe(false);
});

test("override deleting last rule does not error", async () => {
  await setupFromFixture("override-delete-rule");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("No rules, commands, or hooks installed");

  // Rule should not be installed
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "test-rule.mdc")),
  ).toBe(false);

  // MCP server should still be installed
  const mcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(mcpPath)).toBe(true);
});

test("skip installation when skipInstall is true", async () => {
  await setupFromFixture("skip-install-regular");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("No rules, commands, or hooks installed");

  // Check that no rules were installed
  expect(fileExists(path.join(".cursor", "rules", "aicm"))).toBe(false);
  expect(fileExists(path.join(".cursor"))).toBe(false);

  // Check that no MCP config was created
  const mcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(mcpPath)).toBe(false);
});
