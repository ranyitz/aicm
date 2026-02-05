import { setupFromFixture, runCommand, runCommandRaw } from "./helpers";

test("should list all instructions in the config", async () => {
  await setupFromFixture("list-multiple-rules");

  const { stdout } = await runCommand("list");

  expect(stdout).toContain("instruction1");
  expect(stdout).toContain("instruction2");
  expect(stdout).toContain("instruction3");
});

test("should show message when no instructions exist", async () => {
  await setupFromFixture("list-no-rules");

  const { stdout, stderr } = await runCommandRaw("list");

  expect(stdout + stderr).toMatch(/no instructions|empty|not found/i);
});
