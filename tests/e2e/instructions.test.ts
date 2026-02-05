import path from "path";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
} from "./helpers";

describe("instructions installation", () => {
  test("auto-detects instructions directory", async () => {
    await setupFromFixture("instructions-basic");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 2 instructions");

    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("General Instructions");
    expect(agentsContent).toContain("Testing Instructions");
  });

  test("auto-detects instructions single file", async () => {
    await setupFromFixture("instructions-single-file");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");

    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("Single File Instructions");
  });

  test("progressive disclosure writes links and files", async () => {
    await setupFromFixture("instructions-progressive");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 2 instructions");

    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain(
      "The following instructions are available:",
    );
    expect(agentsContent).toContain(
      "- [Testing Instructions](.agents/aicm/testing.md): How to run tests",
    );

    const referencedPath = path.join(".agents", "aicm", "testing.md");
    expect(fileExists(referencedPath)).toBe(true);
    expect(readTestFile(referencedPath)).toContain("Testing Instructions");
  });

  test("writes instructions to multiple targets", async () => {
    await setupFromFixture("instructions-multitarget");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 instruction");

    expect(fileExists("AGENTS.md")).toBe(true);
    expect(fileExists("CLAUDE.md")).toBe(true);
  });

  test("merges instructions from multiple presets with separators", async () => {
    await setupFromFixture("instructions-preset");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 2 instructions");

    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("<!-- From: preset-a -->");
    expect(agentsContent).toContain("<!-- From: preset-b -->");
    expect(agentsContent).toContain("Preset A Instructions");
    expect(agentsContent).toContain("Preset B Instructions");
  });
});
