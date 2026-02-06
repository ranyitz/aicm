import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { shallowClone } from "../../src/utils/git";
import {
  setCacheEntry,
  getRepoCachePath,
  buildCacheKey,
} from "../../src/utils/install-cache";
import {
  setupTestDir,
  runCommand,
  readTestFile,
  fileExists,
  testDir,
} from "./helpers";

/**
 * Helper to create a local bare git repo with aicm preset content.
 * Returns the file:// URL to the bare repo.
 */
async function createBareGitRepo(
  content: Record<string, string>,
): Promise<{ bareUrl: string; cleanup: () => Promise<void> }> {
  const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), "aicm-git-test-"));
  const workDir = path.join(tempBase, "work");
  const bareDir = path.join(tempBase, "bare.git");

  // Create a work directory with content
  await fs.ensureDir(workDir);

  for (const [filePath, fileContent] of Object.entries(content)) {
    const fullPath = path.join(workDir, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, fileContent);
  }

  // Initialize git repo, add content, and create a bare clone
  execSync("git init", { cwd: workDir, stdio: "pipe" });
  execSync("git add -A", { cwd: workDir, stdio: "pipe" });
  execSync(
    'git -c user.email="test@test.com" -c user.name="Test" commit -m "init"',
    {
      cwd: workDir,
      stdio: "pipe",
    },
  );
  execSync(`git clone --bare "${workDir}" "${bareDir}"`, {
    stdio: "pipe",
  });

  const bareUrl = `file://${bareDir}`;

  return {
    bareUrl,
    cleanup: async () => {
      await fs.remove(tempBase);
    },
  };
}

describe("full e2e: aicm install with GitHub preset", () => {
  let tempHome: string;
  let originalHomedir: () => string;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "aicm-e2e-home-"));
    originalHomedir = os.homedir;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (os as any).homedir = () => tempHome;
  });

  afterEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (os as any).homedir = originalHomedir;
    await fs.remove(tempHome);
  });

  test("installs instructions from a GitHub preset via cache", async () => {
    await setupTestDir();

    // 1. Create a local bare git repo with valid preset content
    const { bareUrl, cleanup } = await createBareGitRepo({
      "aicm.json": JSON.stringify({
        rootDir: "./",
        instructions: "instructions/",
      }),
      "instructions/best-practices.md":
        "---\ndescription: Best practices from GitHub preset\ninline: true\n---\nAlways write tests.",
    });

    try {
      // 2. Clone it into the cache directory where resolveGitHubPreset would put it
      const owner = "testorg";
      const repo = "shared-preset";
      const cachePath = getRepoCachePath(owner, repo);
      await shallowClone(bareUrl, cachePath);

      // 3. Write the cache entry so resolveGitHubPreset finds it
      await setCacheEntry(buildCacheKey(owner, repo), {
        url: `https://github.com/${owner}/${repo}`,
        cachedAt: new Date().toISOString(),
        cachePath,
      });

      // 4. Create the project's aicm.json referencing the GitHub URL as a preset
      fs.writeFileSync(
        path.join(testDir, "aicm.json"),
        JSON.stringify({
          presets: [`https://github.com/${owner}/${repo}`],
        }),
      );

      // 5. Initialize git (required by workspace detection)
      execSync("git init", { cwd: testDir, stdio: "pipe" });

      // 6. Run aicm install, passing HOME so the child process finds our cache
      const { stdout } = await runCommand("install --ci", testDir, {
        env: { HOME: tempHome, USERPROFILE: tempHome },
      });

      expect(stdout).toContain("Successfully installed 1 instruction");

      // 7. Verify the instruction was written to the default target (AGENTS.md)
      expect(fileExists("AGENTS.md")).toBe(true);
      const content = readTestFile("AGENTS.md");
      expect(content).toContain("Always write tests.");
    } finally {
      await cleanup();
    }
  });
});
