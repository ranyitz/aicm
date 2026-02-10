import path from "path";
import {
  setupFromFixture,
  runCommand,
  runFailedCommand,
  fileExists,
  readTestFile,
} from "./helpers";

test("discover and install instructions from multiple packages", async () => {
  await setupFromFixture("workspaces-npm-basic");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- packages/backend");
  expect(stdout).toContain("- packages/frontend");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ packages/backend (1 instruction)");
  expect(stdout).toContain("✅ packages/frontend (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed in both packages
  expect(fileExists(path.join("packages", "frontend", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("packages", "backend", "AGENTS.md"))).toBe(true);

  // Verify instruction content
  const frontendAgents = readTestFile(
    path.join("packages", "frontend", "AGENTS.md"),
  );
  expect(frontendAgents).toContain("Frontend Development Instructions");

  const backendAgents = readTestFile(
    path.join("packages", "backend", "AGENTS.md"),
  );
  expect(backendAgents).toContain("Backend Development Instructions");

  // Workspace mode should not merge package instructions to root
  expect(fileExists("AGENTS.md")).toBe(false);
});

test("show error when no packages found in workspaces", async () => {
  await setupFromFixture("workspaces-no-packages");

  const { stderr, code } = await runFailedCommand("install --ci");

  expect(code).not.toBe(0);
  expect(stderr).toContain("No packages with aicm configurations found");
});

test("install normally when workspaces is enabled on single package", async () => {
  await setupFromFixture("workspaces-single-package");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("Found 1 packages with aicm configurations:");
  expect(stdout).toContain("- .");
  expect(stdout).toContain("Successfully installed 1 instruction");

  expect(fileExists(path.join("AGENTS.md"))).toBe(true);
});

test("handle partial configurations (some packages with configs, some without)", async () => {
  await setupFromFixture("workspaces-partial-configs");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- packages/with-config");
  expect(stdout).toContain("- packages/also-with-config");
  expect(stdout).not.toContain("- packages/without-config");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ packages/with-config (1 instruction)");
  expect(stdout).toContain("✅ packages/also-with-config (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed only in packages with configs
  expect(fileExists(path.join("packages", "with-config", "AGENTS.md"))).toBe(
    true,
  );
  expect(
    fileExists(path.join("packages", "also-with-config", "AGENTS.md")),
  ).toBe(true);

  // Verify no instructions were installed in the package without config
  expect(fileExists(path.join("packages", "without-config", "AGENTS.md"))).toBe(
    false,
  );
});

test("discover and install instructions from deeply nested workspaces structure", async () => {
  await setupFromFixture("workspaces-npm-nested");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 3 packages with aicm configurations:");
  expect(stdout).toContain("- apps/web");
  expect(stdout).toContain("- packages/ui");
  expect(stdout).toContain("- tools/build");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ apps/web (1 instruction)");
  expect(stdout).toContain("✅ packages/ui (1 instruction)");
  expect(stdout).toContain("✅ tools/build (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 3 instructions across 3 packages",
  );

  // Check that instructions were installed in all nested packages
  expect(fileExists(path.join("apps", "web", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("packages", "ui", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("tools", "build", "AGENTS.md"))).toBe(true);
});

test("discover and install instructions from Bazel workspaces", async () => {
  await setupFromFixture("workspaces-bazel-basic");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- services/api");
  expect(stdout).toContain("- services/worker");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ services/api (1 instruction)");
  expect(stdout).toContain("✅ services/worker (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed in both Bazel services
  expect(fileExists(path.join("services", "api", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("services", "worker", "AGENTS.md"))).toBe(true);
});

test("discover and install instructions from mixed workspaces + Bazel structure", async () => {
  await setupFromFixture("workspaces-mixed");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- frontend");
  expect(stdout).toContain("- backend-service");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ frontend (1 instruction)");
  expect(stdout).toContain("✅ backend-service (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed in both mixed package types
  expect(fileExists(path.join("frontend", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("backend-service", "AGENTS.md"))).toBe(true);
});

test("handle package missing instructions gracefully", async () => {
  await setupFromFixture("workspaces-error-scenarios");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- valid-package");
  expect(stdout).toContain("- missing-rule");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ valid-package (1 instruction)");
  expect(stdout).toContain("✅ missing-rule (0 instructions)");

  // Check that the valid package still installed successfully
  expect(fileExists(path.join("valid-package", "AGENTS.md"))).toBe(true);

  // Check that the error package did not install anything
  expect(fileExists(path.join("missing-rule", "AGENTS.md"))).toBe(false);
});

test("work quietly by default without verbose flag", async () => {
  await setupFromFixture("workspaces-npm-basic");

  const { stdout, code } = await runCommand("install --ci");

  expect(code).toBe(0);
  expect(stdout).not.toContain("🔍 Discovering packages...");
  expect(stdout).not.toContain("Found 2 packages with aicm configurations:");
  expect(stdout).not.toContain("📦 Installing configurations...");
  expect(stdout).not.toContain("✅ packages/backend (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );
});

test("automatically detect workspaces from package.json", async () => {
  await setupFromFixture("workspaces-auto-detect");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- packages/backend");
  expect(stdout).toContain("- packages/frontend");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ packages/backend (1 instruction)");
  expect(stdout).toContain("✅ packages/frontend (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed in both packages
  expect(fileExists(path.join("packages", "frontend", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("packages", "backend", "AGENTS.md"))).toBe(true);

  // Verify instruction content
  const frontendAgents = readTestFile(
    path.join("packages", "frontend", "AGENTS.md"),
  );
  expect(frontendAgents).toContain(
    "Frontend Development Instructions (Auto-detected)",
  );

  const backendAgents = readTestFile(
    path.join("packages", "backend", "AGENTS.md"),
  );
  expect(backendAgents).toContain(
    "Backend Development Instructions (Auto-detected)",
  );
});

test("explicit workspaces: false overrides auto-detection from package.json", async () => {
  await setupFromFixture("workspaces-explicit-false");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).not.toContain("🔍 Discovering packages...");
  expect(stdout).not.toContain("Found");
  expect(stdout).not.toContain("📦 Installing configurations...");
  expect(stdout).toContain("Successfully installed 1 instruction");

  // Check that instruction was installed in root directory, not as workspace
  expect(fileExists(path.join("AGENTS.md"))).toBe(true);

  // Check that no workspace packages were processed
  expect(fileExists(path.join("packages", "frontend", ".cursor"))).toBe(false);

  // Verify rule content
  const rootAgents = readTestFile("AGENTS.md");
  expect(rootAgents).toContain("Main Instruction (Explicit False)");
});

test("automatically detect workspaces when no root config file exists", async () => {
  await setupFromFixture("workspaces-no-config");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- packages/backend");
  expect(stdout).toContain("- packages/frontend");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ packages/backend (1 instruction)");
  expect(stdout).toContain("✅ packages/frontend (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed in both packages
  expect(fileExists(path.join("packages", "frontend", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("packages", "backend", "AGENTS.md"))).toBe(true);

  // Verify instruction content
  const frontendAgents = readTestFile(
    path.join("packages", "frontend", "AGENTS.md"),
  );
  expect(frontendAgents).toContain(
    "Frontend Development Instructions (No Config)",
  );

  const backendAgents = readTestFile(
    path.join("packages", "backend", "AGENTS.md"),
  );
  expect(backendAgents).toContain(
    "Backend Development Instructions (No Config)",
  );

  // Verify that no root config file exists
  expect(fileExists("aicm.json")).toBe(false);
});

test("allow empty root config in workspace mode", async () => {
  await setupFromFixture("workspaces-empty-root-config");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 2 packages with aicm configurations:");
  expect(stdout).toContain("- packages/backend");
  expect(stdout).toContain("- packages/frontend");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ packages/backend (1 instruction)");
  expect(stdout).toContain("✅ packages/frontend (1 instruction)");
  expect(stdout).toContain(
    "Successfully installed 2 instructions across 2 packages",
  );

  // Check that instructions were installed in both packages
  expect(fileExists(path.join("packages", "frontend", "AGENTS.md"))).toBe(true);
  expect(fileExists(path.join("packages", "backend", "AGENTS.md"))).toBe(true);

  // Verify instruction content
  const frontendAgents = readTestFile(
    path.join("packages", "frontend", "AGENTS.md"),
  );
  expect(frontendAgents).toContain(
    "Frontend Development Instructions (Empty Root Config)",
  );

  const backendAgents = readTestFile(
    path.join("packages", "backend", "AGENTS.md"),
  );
  expect(backendAgents).toContain(
    "Backend Development Instructions (Empty Root Config)",
  );

  // Verify that root config file exists but has no rootDir or presets
  expect(fileExists("aicm.json")).toBe(true);
  const rootConfig = JSON.parse(readTestFile("aicm.json"));
  expect(rootConfig.rootDir).toBeUndefined();
  expect(rootConfig.presets).toBeUndefined();
  expect(rootConfig.workspaces).toBe(true);
});

test("merge mcp servers from workspaces into root", async () => {
  await setupFromFixture("workspaces-mcp-merge");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("📦 Installing configurations...");

  const rootMcpPath = path.join(".cursor", "mcp.json");
  expect(fileExists(rootMcpPath)).toBe(true);
  const rootMcp = JSON.parse(readTestFile(rootMcpPath));
  expect(rootMcp.mcpServers["frontend-mcp"]).toBeDefined();
  expect(rootMcp.mcpServers["backend-mcp"]).toBeDefined();

  const pkgMcp = JSON.parse(
    readTestFile(path.join("packages", "frontend", ".cursor", "mcp.json")),
  );
  expect(pkgMcp.mcpServers["frontend-mcp"]).toBeDefined();
});

test("warn on conflicting workspace mcp servers", async () => {
  await setupFromFixture("workspaces-mcp-conflict");

  const { stderr, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stderr).toContain("Warning: MCP configuration conflict detected");
  expect(stderr).toContain('Key: "shared-mcp"');

  const rootMcpPath = path.join(".cursor", "mcp.json");
  const rootMcp = JSON.parse(readTestFile(rootMcpPath));
  expect(rootMcp.mcpServers["shared-mcp"]).toMatchObject({
    command: "./scripts/frontend.sh",
    aicm: true,
  });
});

test("skip root mcp file when no cursor target", async () => {
  await setupFromFixture("workspaces-mcp-no-cursor");

  const { code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(fileExists(path.join(".cursor", "mcp.json"))).toBe(false);
});

test("skip installation for packages with skipInstall: true", async () => {
  await setupFromFixture("workspaces-skip-install");

  const { stdout, code } = await runCommand("install --ci --verbose");

  expect(code).toBe(0);
  expect(stdout).toContain("🔍 Discovering packages...");
  expect(stdout).toContain("Found 1 packages with aicm configurations:");
  expect(stdout).toContain("- packages/regular-package");
  expect(stdout).not.toContain("- packages/preset-package");
  expect(stdout).toContain("📦 Installing configurations...");
  expect(stdout).toContain("✅ packages/regular-package (1 instruction)");
  expect(stdout).not.toContain("✅ packages/preset-package");
  expect(stdout).toContain("Successfully installed 1 instruction");

  // Check that instructions were installed only in the regular package
  expect(
    fileExists(path.join("packages", "regular-package", "AGENTS.md")),
  ).toBe(true);

  // Check that no instructions were installed in the preset package
  expect(fileExists(path.join("packages", "preset-package", "AGENTS.md"))).toBe(
    false,
  );

  // Verify instruction content in regular package
  const regularAgents = readTestFile(
    path.join("packages", "regular-package", "AGENTS.md"),
  );
  expect(regularAgents).toContain("Regular Package Instruction");
});
