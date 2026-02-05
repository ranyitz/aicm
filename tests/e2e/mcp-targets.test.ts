import path from "path";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
} from "./helpers";

test("installs MCP servers to multiple targets", async () => {
  await setupFromFixture("targets-mcp-multi");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 instruction");

  const cursorMcpPath = path.join(".cursor", "mcp.json");
  const claudeMcpPath = ".mcp.json";

  expect(fileExists(cursorMcpPath)).toBe(true);
  expect(fileExists(claudeMcpPath)).toBe(true);

  const cursorMcp = JSON.parse(readTestFile(cursorMcpPath));
  const claudeMcp = JSON.parse(readTestFile(claudeMcpPath));

  expect(cursorMcp.mcpServers["multi-target-mcp"]).toBeDefined();
  expect(claudeMcp.mcpServers["multi-target-mcp"]).toBeDefined();
});
