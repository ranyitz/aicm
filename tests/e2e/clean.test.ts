import path from "path";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
} from "./helpers";

test("clean removes installed artifacts", async () => {
  await setupFromFixture("single-rule");

  // Install first
  await runCommand("install --ci");

  // Verify installed
  expect(
    fileExists(path.join(".cursor", "rules", "aicm", "test-rule.mdc")),
  ).toBe(true);

  // Run clean
  const { stdout, code } = await runCommand("clean");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully cleaned");

  // Verify removed
  expect(fileExists(path.join(".cursor", "rules", "aicm"))).toBe(false);
  expect(fileExists(path.join(".cursor", "commands", "aicm"))).toBe(false);
  expect(fileExists(path.join(".aicm"))).toBe(false);

  // Verify MCP cleaned
  const mcpPath = path.join(".cursor", "mcp.json");
  // If only aicm servers were there, the file might be kept but empty servers or just cleaned.
  // cleanMcpServers writes back.
  if (fileExists(mcpPath)) {
    const mcpConfig = JSON.parse(readTestFile(mcpPath));
    expect(mcpConfig.mcpServers["test-mcp"]).toBeUndefined();
  }
});

test("clean removes workspace artifacts", async () => {
  await setupFromFixture("workspaces-mcp-merge");

  // Install
  await runCommand("install --ci");

  // Check artifacts in packages (based on fixture structure)
  expect(
    fileExists(path.join("packages", "backend", ".cursor", "rules", "aicm")),
  ).toBe(true);
  expect(fileExists(path.join(".cursor", "mcp.json"))).toBe(true);

  // Clean
  const { code } = await runCommand("clean");

  expect(code).toBe(0);

  // Verify removed in packages
  expect(
    fileExists(path.join("packages", "backend", ".cursor", "rules", "aicm")),
  ).toBe(false);

  // Verify root MCP cleaned
  const mcpPath = path.join(".cursor", "mcp.json");
  if (fileExists(mcpPath)) {
    const mcpConfig = JSON.parse(readTestFile(mcpPath));
    // In this fixture, we expect some aicm servers.
    expect(mcpConfig.mcpServers).toBeDefined();
    // Verify no aicm: true servers remain
    Object.values(mcpConfig.mcpServers).forEach((server) => {
      if (typeof server === "object" && server !== null) {
        expect("aicm" in server ? server.aicm : undefined).toBeUndefined();
      }
    });
  }
});

test("clean with nothing to clean", async () => {
  await setupFromFixture("no-config");

  // Run clean without installing anything first
  const { stdout, code } = await runCommand("clean");

  expect(code).toBe(0);
  expect(stdout).toContain("Nothing to clean");
});
