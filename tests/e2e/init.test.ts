import path from "path";
import fs from "fs-extra";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
  testDir,
} from "./helpers";

test("should create default config file", async () => {
  await setupFromFixture("no-config");

  const { stdout, code } = await runCommand("init");

  expect(code).toBe(0);
  expect(stdout).toContain("Configuration file location:");

  expect(fileExists("aicm.json")).toBe(true);

  const config = JSON.parse(readTestFile("aicm.json"));
  expect(config).toEqual({
    rootDir: "./",
    instructions: "instructions/",
    targets: ["cursor", "claude-code"],
  });
});

test("should not overwrite existing config", async () => {
  await setupFromFixture("no-config");

  const customConfig = {
    rootDir: "./",
    targets: {
      skills: [".agents/skills"],
      agents: [".agents/agents"],
      instructions: ["CLAUDE.md"],
      mcp: [".mcp.json"],
      hooks: [".cursor"],
    },
  };
  fs.writeJsonSync(path.join(testDir, "aicm.json"), customConfig);

  const { stdout, code } = await runCommand("init");

  expect(code).toBe(0);
  expect(stdout).toContain("Configuration file already exists!");

  expect(fileExists("aicm.json")).toBe(true);

  const config = JSON.parse(readTestFile("aicm.json"));
  expect(config).toEqual(customConfig);
});
