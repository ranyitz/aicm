# E2E Tests

The e2e tests basically test the CLI by running it with different configurations and asserting the output. To create the initial state of each test, we use fixtures.

## Using Fixtures in Tests

All E2E test fixtures are located in the `tests/fixtures` directory.
To use a fixture in your test, use the `setupFromFixture` function from the helpers:

```typescript
import { setupFromFixture, runCommand } from "./helpers";

test("basic command execution", async () => {
  // Setup the test directory using a fixture
  await setupFromFixture("fixture-name");

  // Run your test...
  const { stdout, stderr, code } = await runCommand("some-command");

  // Assert results...
  expect(code).toBe(0);
});
```

## Fixture Structure

Each fixture directory should contain the complete file structure needed for the test.
For example, a fixture for testing the list command might contain:

```
tests/fixtures/e2e/list-with-multiple-rules/
├── aicm.json  # Config with multiple rules
└── rules/
    ├── rule1.mdc
    └── rule3.mdc
```

# E2E Testing Guidelines

## Key Principles

1. **Always use fixtures for test state**
   - Store initial test state in the `tests/fixtures` directory
   - Create a dedicated fixture directory for each test scenario
   - Include `.gitkeep` files in empty fixture directories
   - **Never** create test files on-the-fly with `fs.writeFileSync()` or similar methods

2. **Fixture Directory Structure**
   - Name fixtures descriptively based on test scenario
   - Follow the established pattern in existing fixtures
   - Each fixture should be self-contained and independent

3. **Using Fixtures in Tests**
   - Use `setupFromFixture(fixtureName)` to initialize test state
   - Verify fixture content exists before running tests
   - For empty starting states, use the `init-empty` fixture

4. **Test Structure**
   - Use `test("minimal explanation")` format directly without `describe` blocks
   - Avoid "should" prefix in test names - keep descriptions concise and direct
   - Each test should be self-contained and independent

## Anti-patterns to Avoid

### 1. Creating Files Dynamically in Tests

Creating files dynamically with fs operations during testing is a major anti-pattern:

```typescript
// BAD PRACTICE - NEVER DO THIS
test("wrong way to test", async () => {
  await setupTestDir(expect.getState().currentTestName);

  // Anti-pattern: Creating files on-the-fly
  fs.writeJsonSync("aicm.json", { presets: ["@my-preset"] });
  fs.ensureDirSync("node_modules/@my-preset");
  fs.writeFileSync("node_modules/@my-preset/rule.mdc", "Content");

  // Test logic...
});
```

Problems with this approach:

- Makes tests harder to review and maintain
- Creates non-deterministic test environments
- Makes it difficult to inspect test inputs
- Can lead to flaky tests and unexpected behavior
- Violates test setup principles

### 2. Modifying Fixture Files During Tests

Modifying files after fixture setup should be limited to specific test requirements:

```typescript
// Only modify files when testing file modification functionality
test("configuration updates", async () => {
  await setupFromFixture("config-basic");

  // Modifying only when testing specific behavior
  // Use helpers like readTestFile and carefully document the purpose
  const config = JSON.parse(readTestFile("aicm.json"));
  config.rules["test-rule"] = false; // Testing rule cancellation
  fs.writeFileSync(
    path.join(testDir, "aicm.json"),
    JSON.stringify(config, null, 2),
  );

  // Test logic...
});
```

## Recommended Pattern

```typescript
// GOOD PRACTICE
test("install command with CI flag", async () => {
  // Start with a complete fixture containing all needed files
  await setupFromFixture("my-complete-fixture");

  // Run command
  const { code } = await runCommand("install --ci");

  // Assert results
  expect(code).toBe(0);
  expect(fileExists(".cursor/rules/aicm/my-rule.mdc")).toBe(true);
});
```

For tests requiring complex setups, create multiple fixtures rather than modifying files during the test.
