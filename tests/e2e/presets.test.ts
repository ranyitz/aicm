import path from "path";
import {
  setupFromFixture,
  runCommand,
  runFailedCommand,
  fileExists,
  readTestFile,
  testDir,
} from "./helpers";

test("install instructions from a preset file", async () => {
  await setupFromFixture("presets-from-file");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 instructions");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("TypeScript Best Practices");
  expect(agentsContent).toContain("React Best Practices");
});

test("merge instructions from presets with main configuration", async () => {
  await setupFromFixture("presets-merged");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 3 instructions");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("Preset Instruction");
  expect(agentsContent).toContain("Local Instruction");

  // Check that MCP config was installed
  const mcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(mcpPath)).toBe(true);
  const mcpConfig = JSON.parse(readTestFile(mcpPath));
  expect(mcpConfig).toHaveProperty("mcpServers");
  expect(mcpConfig.mcpServers["preset-mcp"]).toMatchObject({
    command: "./scripts/preset-mcp.sh",
    env: { MCP_TOKEN: "preset" },
    aicm: true,
  });
});

test("handle npm package presets", async () => {
  await setupFromFixture("presets-npm");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 instruction");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("NPM Package Instruction");
});

test("install instructions from sibling preset using ../ path", async () => {
  await setupFromFixture("presets-sibling");

  // Run from the project/ subdirectory which has the main config
  const projectDir = path.join(testDir, "project");
  const { stdout, code } = await runCommand("install --ci", projectDir);

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 instruction");

  const agentsContent = readTestFile("AGENTS.md", projectDir);
  expect(agentsContent).toContain("Sibling Preset Instruction");
});

test("handle errors with missing preset files", async () => {
  await setupFromFixture("presets-missing-preset");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toContain("Preset not found");
});

test("install instructions from preset only (no rootDir)", async () => {
  await setupFromFixture("presets-only");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 instruction");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("TypeScript Best Practices (Preset Only)");
});

test("install instructions from preset only without picking up user's app directories", async () => {
  await setupFromFixture("presets-only-with-app-commands");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 instruction");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("TypeScript Best Practices (Preset)");

  // Check that user's app directories were NOT picked up
  expect(fileExists(path.join(".agents", "skills"))).toBe(false);
  expect(fileExists(path.join(".agents", "agents"))).toBe(false);
});

test("install instructions from recursively inherited presets", async () => {
  await setupFromFixture("presets-recursive");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 2 instructions");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("Instruction A");
  expect(agentsContent).toContain("Instruction B");
});

test("install instructions from inherits-only preset (no own content)", async () => {
  await setupFromFixture("presets-inherits-only");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).toContain("Successfully installed 1 instruction");

  const agentsContent = readTestFile("AGENTS.md");
  expect(agentsContent).toContain("Inherited Instruction");
});

test("detect circular preset dependencies", async () => {
  await setupFromFixture("presets-circular");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toContain("Circular preset dependency detected");
});

test("error on empty preset without content or nested presets", async () => {
  await setupFromFixture("presets-empty-chain");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toContain("must have at least one of");
});
