import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
  getDirectoryStructure,
} from "./helpers";

describe("skills installation", () => {
  test("installs local skills to .cursor/skills/", async () => {
    await setupFromFixture("skills-basic");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 2 skills");

    // Verify skills are installed
    expect(fileExists(".cursor/skills/pdf-processing/SKILL.md")).toBe(true);
    expect(fileExists(".cursor/skills/pdf-processing/scripts/extract.py")).toBe(
      true,
    );
    expect(fileExists(".cursor/skills/code-review/SKILL.md")).toBe(true);

    // Verify SKILL.md content is preserved
    const skillContent = readTestFile(".cursor/skills/pdf-processing/SKILL.md");
    expect(skillContent).toContain("name: pdf-processing");
    expect(skillContent).toContain("Extract text and tables from PDF files");

    // Verify .aicm.json metadata is created (presence indicates aicm management)
    expect(fileExists(".cursor/skills/pdf-processing/.aicm.json")).toBe(true);
    const metadata = JSON.parse(
      readTestFile(".cursor/skills/pdf-processing/.aicm.json"),
    );
    expect(metadata.source).toBe("local");
  });

  test("installs preset skills with .aicm.json tracking", async () => {
    await setupFromFixture("skills-preset");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 skill");

    // Verify skill is installed
    expect(fileExists(".cursor/skills/data-analysis/SKILL.md")).toBe(true);

    // Verify .aicm.json metadata includes preset info
    const metadata = JSON.parse(
      readTestFile(".cursor/skills/data-analysis/.aicm.json"),
    );
    expect(metadata.source).toBe("preset");
    expect(metadata.presetName).toBe("./preset");
  });

  test("warns when presets provide the same skill", async () => {
    await setupFromFixture("skills-collision");

    const { stdout, stderr } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 skill");
    expect(stderr).toContain(
      'Warning: multiple presets provide the "shared-skill" skill',
    );
    expect(stderr).toContain("Using definition from ./preset-b");

    // Should use the last preset's version
    const skillContent = readTestFile(".cursor/skills/shared-skill/SKILL.md");
    expect(skillContent).toContain("Preset B version");
  });

  test("installs skills for each workspace package and root", async () => {
    await setupFromFixture("skills-workspace");

    const { stdout } = await runCommand("install --ci --verbose");

    expect(stdout).toContain(
      "Successfully installed 2 skills across 2 packages",
    );

    // Verify root has all skills merged
    const rootStructure = getDirectoryStructure(".cursor/skills");
    expect(rootStructure).toContain(".cursor/skills/skill-a/");
    expect(rootStructure).toContain(".cursor/skills/skill-b/");

    // Verify each package has its own skills
    expect(fileExists("package-a/.cursor/skills/skill-a/SKILL.md")).toBe(true);
    expect(fileExists("package-b/.cursor/skills/skill-b/SKILL.md")).toBe(true);
  });

  test("installs skills to multiple targets", async () => {
    await setupFromFixture("skills-multitarget");

    const { stdout } = await runCommand("install --ci");

    expect(stdout).toContain("Successfully installed 1 skill");

    // Verify skill is installed to all targets
    expect(fileExists(".cursor/skills/multi-skill/SKILL.md")).toBe(true);
    expect(fileExists(".claude/skills/multi-skill/SKILL.md")).toBe(true);
    expect(fileExists(".codex/skills/multi-skill/SKILL.md")).toBe(true);

    // Verify each target has .aicm.json
    expect(fileExists(".cursor/skills/multi-skill/.aicm.json")).toBe(true);
    expect(fileExists(".claude/skills/multi-skill/.aicm.json")).toBe(true);
    expect(fileExists(".codex/skills/multi-skill/.aicm.json")).toBe(true);
  });

  test("clean removes aicm-managed skills", async () => {
    await setupFromFixture("skills-basic");

    // First install
    await runCommand("install --ci");
    expect(fileExists(".cursor/skills/pdf-processing/SKILL.md")).toBe(true);

    // Then clean
    const { stdout } = await runCommand("clean --verbose");
    expect(stdout).toContain("Successfully cleaned");

    // Skills should be removed
    expect(fileExists(".cursor/skills/pdf-processing")).toBe(false);
    expect(fileExists(".cursor/skills/code-review")).toBe(false);
  });

  test("clean preserves non-aicm skills", async () => {
    await setupFromFixture("skills-basic");

    // Install aicm skills
    await runCommand("install --ci");

    // Manually create a non-aicm skill (no .aicm.json)
    const fs = await import("fs-extra");
    const path = await import("path");
    const { testDir } = await import("./helpers");
    const manualSkillPath = path.join(testDir, ".cursor/skills/manual-skill");
    fs.ensureDirSync(manualSkillPath);
    fs.writeFileSync(
      path.join(manualSkillPath, "SKILL.md"),
      "---\nname: manual-skill\ndescription: Manual skill\n---\n# Manual",
    );

    // Clean
    await runCommand("clean --verbose");

    // aicm skills should be removed
    expect(fileExists(".cursor/skills/pdf-processing")).toBe(false);

    // Manual skill should be preserved
    expect(fileExists(".cursor/skills/manual-skill/SKILL.md")).toBe(true);
  });
});
