import path from "path";
import {
  setupFromFixture,
  runCommand,
  fileExists,
  readTestFile,
} from "./helpers";

describe("asset copying and referencing", () => {
  test("should copy assets and rewrite links correctly for Cursor", async () => {
    await setupFromFixture("assets-linking");

    // Run install targeting cursor
    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Check assets are copied to .cursor/rules/aicm/
    expect(
      fileExists(path.join(".cursor", "rules", "aicm", "example.ts")),
    ).toBe(true);
    expect(
      fileExists(
        path.join(".cursor", "rules", "aicm", "subdir", "helper.json"),
      ),
    ).toBe(true);

    // Check links in Cursor rules
    const myRuleContent = readTestFile(
      path.join(".cursor", "rules", "aicm", "my-rule.mdc"),
    );
    expect(myRuleContent).toContain("[Example](./example.ts)");

    const nestedRuleContent = readTestFile(
      path.join(".cursor", "rules", "aicm", "subdir", "nested-rule.mdc"),
    );
    expect(nestedRuleContent).toContain("[Helper](./helper.json)");
    // This link should be relative to the rule file location
    expect(nestedRuleContent).toContain("[Root Example](../example.ts)");
  });

  test("should copy assets and rewrite links correctly for Codex (AGENTS.md)", async () => {
    await setupFromFixture("assets-linking");

    // Run install targeting codex
    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Check assets are copied to .aicm/
    expect(fileExists(path.join(".aicm", "example.ts"))).toBe(true);
    expect(fileExists(path.join(".aicm", "subdir", "helper.json"))).toBe(true);

    const nestedRuleContent = readTestFile(
      path.join(".aicm", "subdir", "nested-rule.md"),
    );
    // This link should be relative to the rule file location (.aicm/subdir/)
    expect(nestedRuleContent).toContain("[Root Example](../example.ts)");
  });

  test("should copy assets and rewrite links correctly for Presets in Cursor", async () => {
    await setupFromFixture("assets-preset");

    // Run install targeting cursor
    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Note: The preset name is "my-preset" (derived from folder name in aicm.json reference)
    // Path will be: .cursor/rules/aicm/my-preset/preset-rule.mdc
    const presetBaseDir = path.join(".cursor", "rules", "aicm", "my-preset");

    // Check assets are copied
    expect(fileExists(path.join(presetBaseDir, "preset-asset.txt"))).toBe(true);
    expect(
      fileExists(path.join(presetBaseDir, "subdir", "nested-asset.json")),
    ).toBe(true);

    // Check links in root preset rule
    const presetRuleContent = readTestFile(
      path.join(presetBaseDir, "preset-rule.mdc"),
    );
    expect(presetRuleContent).toContain("[Asset](./preset-asset.txt)");

    // Check links in nested preset rule
    const nestedPresetRuleContent = readTestFile(
      path.join(presetBaseDir, "subdir", "nested-preset-rule.mdc"),
    );
    expect(nestedPresetRuleContent).toContain(
      "[Nested Asset](./nested-asset.json)",
    );
    // Should be relative from my-preset/subdir to my-preset/preset-asset.txt
    expect(nestedPresetRuleContent).toContain(
      "[Root Asset](../preset-asset.txt)",
    );
  });

  test("should rewrite links in commands to point to assets in rules directory", async () => {
    await setupFromFixture("assets-commands");

    // Run install targeting cursor
    const { code } = await runCommand("install --ci");
    expect(code).toBe(0);

    // Check asset is copied to .cursor/rules/aicm/
    expect(
      fileExists(path.join(".cursor", "rules", "aicm", "schema.json")),
    ).toBe(true);

    // Check command is copied to .cursor/commands/aicm/
    const commandPath = path.join(
      ".cursor",
      "commands",
      "aicm",
      "generate-schema.md",
    );
    expect(fileExists(commandPath)).toBe(true);

    const commandContent = readTestFile(commandPath);
    expect(commandContent).toContain(
      "[Schema Template](../../rules/aicm/schema.json)",
    );
  });
});
