---
description: E2E testing best practices and fixture management guidelines
inline: false
---

## E2E Testing Best Practices

- Store initial test state in fixtures
- Reference documentation: [E2E_TESTS.md](tests/E2E_TESTS.md)
- Include .gitkeep file in empty fixture directories
- **Never** create test files on-the-fly with `fs.writeFileSync()` or similar methods

## Example Usage

DO: Good practice

```typescript
test("should do something with files", async () => {
  await setupFromFixture("my-test-fixture", expect.getState().currentTestName);

  // Test logic here
});
```

DON'T: Bad practice (avoid this)

```typescript
test("should not create files directly", async () => {
  await setupTestDir(expect.getState().currentTestName);

  // DON'T DO THIS - violates test standards
  fs.writeFileSync(path.join(testDir, "some-file.txt"), "content");

  // Test logic here
});
```
