import path from "path";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
  writeTestFile,
} from "./helpers";

describe("jules integration", () => {
  test("should install rules and update AGENTS.md", async () => {
    await setupFromFixture("jules-basic");

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 3 rules");

    // Check that rules were installed
    expect(fileExists(path.join(".aicm", "always-rule.md"))).toBe(true);
    expect(fileExists(path.join(".aicm", "opt-in-rule.md"))).toBe(true);
    expect(fileExists(path.join(".aicm", "file-pattern-rule.md"))).toBe(true);

    // Check that AGENTS.md was created/updated
    expect(fileExists("AGENTS.md")).toBe(true);
    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("<!-- AICM:BEGIN -->");
    expect(agentsContent).toContain("<!-- AICM:END -->");
    expect(agentsContent).toContain(
      "The following rules always apply to all files in the project:",
    );
    expect(agentsContent).toContain(
      "The following rules can be loaded when relevant. Check each file's description:",
    );
    expect(agentsContent).toContain(
      "The following rules are only included when explicitly referenced:",
    );
    expect(agentsContent).toContain("- .aicm/always-rule.md");
    expect(agentsContent).toContain("- .aicm/file-pattern-rule.md");
    expect(agentsContent).toContain("- .aicm/opt-in-rule.md");
  });

  test("should append markers to existing file without markers", async () => {
    await setupFromFixture("jules-no-markers");

    // Create existing AGENTS.md file without markers
    const existingContent =
      "# Existing Jules Rules\n\nThese are some existing rules.";
    writeTestFile("AGENTS.md", existingContent);

    const { stdout, code } = await runCommand("install --ci");

    expect(code).toBe(0);
    expect(stdout).toContain("Successfully installed 1 rule");

    // Check that rule was installed
    expect(fileExists(path.join(".aicm", "no-marker-rule.md"))).toBe(true);

    // Check that AGENTS.md was updated with markers
    const agentsContent = readTestFile("AGENTS.md");
    expect(agentsContent).toContain("# Existing Jules Rules");
    expect(agentsContent).toContain("These are some existing rules.");
    expect(agentsContent).toContain("<!-- AICM:BEGIN -->");
    expect(agentsContent).toContain("<!-- AICM:END -->");
    expect(agentsContent).toContain(
      "The following rules are only included when explicitly referenced:",
    );
    expect(agentsContent).toContain("- .aicm/no-marker-rule.md");

    // Verify that existing content comes before AICM markers
    const beginMarkerIndex = agentsContent.indexOf("<!-- AICM:BEGIN -->");
    const existingContentIndex = agentsContent.indexOf(
      "# Existing Jules Rules",
    );
    expect(existingContentIndex).toBeLessThan(beginMarkerIndex);
  });
});
