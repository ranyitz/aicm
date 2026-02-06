import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { shallowClone, sparseClone } from "../../src/utils/git";

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

describe("git clone operations", () => {
  let tempDest: string;

  beforeEach(async () => {
    tempDest = await fs.mkdtemp(path.join(os.tmpdir(), "aicm-clone-dest-"));
  });

  afterEach(async () => {
    await fs.remove(tempDest);
  });

  describe("shallowClone", () => {
    test("clones a repository with aicm.json at root", async () => {
      const { bareUrl, cleanup } = await createBareGitRepo({
        "aicm.json": JSON.stringify({
          rootDir: "./",
          instructions: "instructions/",
        }),
        "instructions/general.md":
          "---\ndescription: General rules\ninline: true\n---\nBe helpful.",
      });

      try {
        const cloneDest = path.join(tempDest, "repo");
        await shallowClone(bareUrl, cloneDest);

        expect(fs.existsSync(path.join(cloneDest, "aicm.json"))).toBe(true);
        expect(
          fs.existsSync(path.join(cloneDest, "instructions", "general.md")),
        ).toBe(true);

        const config = JSON.parse(
          fs.readFileSync(path.join(cloneDest, "aicm.json"), "utf8"),
        );
        expect(config.rootDir).toBe("./");
      } finally {
        await cleanup();
      }
    });

    test("clones a specific branch", async () => {
      const tempBase = await fs.mkdtemp(
        path.join(os.tmpdir(), "aicm-branch-test-"),
      );
      const workDir = path.join(tempBase, "work");
      const bareDir = path.join(tempBase, "bare.git");

      try {
        await fs.ensureDir(workDir);

        // Create initial commit on main
        execSync("git init -b main", { cwd: workDir, stdio: "pipe" });
        fs.writeFileSync(
          path.join(workDir, "aicm.json"),
          JSON.stringify({ rootDir: "./" }),
        );
        fs.ensureDirSync(path.join(workDir, "instructions"));
        fs.writeFileSync(
          path.join(workDir, "instructions", "main.md"),
          "---\ndescription: Main branch rule\ninline: true\n---\nMain branch content",
        );
        execSync("git add -A", { cwd: workDir, stdio: "pipe" });
        execSync(
          'git -c user.email="test@test.com" -c user.name="Test" commit -m "main"',
          { cwd: workDir, stdio: "pipe" },
        );

        // Create a feature branch with different content
        execSync("git checkout -b feature", { cwd: workDir, stdio: "pipe" });
        fs.writeFileSync(
          path.join(workDir, "instructions", "feature.md"),
          "---\ndescription: Feature branch rule\ninline: true\n---\nFeature branch content",
        );
        execSync("git add -A", { cwd: workDir, stdio: "pipe" });
        execSync(
          'git -c user.email="test@test.com" -c user.name="Test" commit -m "feature"',
          { cwd: workDir, stdio: "pipe" },
        );

        // Create bare repo
        execSync(`git clone --bare "${workDir}" "${bareDir}"`, {
          stdio: "pipe",
        });

        // Clone the feature branch
        const cloneDest = path.join(tempDest, "feature-repo");
        await shallowClone(`file://${bareDir}`, cloneDest, "feature");

        expect(
          fs.existsSync(path.join(cloneDest, "instructions", "feature.md")),
        ).toBe(true);
        expect(
          fs.existsSync(path.join(cloneDest, "instructions", "main.md")),
        ).toBe(true);
      } finally {
        await fs.remove(tempBase);
      }
    });

    test("throws on invalid URL", async () => {
      const cloneDest = path.join(tempDest, "bad-repo");
      await expect(
        shallowClone("file:///nonexistent/repo.git", cloneDest),
      ).rejects.toThrow("Git operation failed");
    });
  });

  describe("sparseClone", () => {
    test("clones only specified paths", async () => {
      const { bareUrl, cleanup } = await createBareGitRepo({
        "packages/preset-a/aicm.json": JSON.stringify({
          rootDir: "./",
          instructions: "instructions/",
        }),
        "packages/preset-a/instructions/rule-a.md":
          "---\ndescription: Rule A\ninline: true\n---\nRule A content",
        "packages/preset-b/aicm.json": JSON.stringify({
          rootDir: "./",
          instructions: "instructions/",
        }),
        "packages/preset-b/instructions/rule-b.md":
          "---\ndescription: Rule B\ninline: true\n---\nRule B content",
        "other/large-file.txt": "This should not be downloaded",
      });

      try {
        const cloneDest = path.join(tempDest, "sparse-repo");
        await sparseClone(bareUrl, cloneDest, ["packages/preset-a"]);

        // The sparse-checkout should include preset-a
        expect(
          fs.existsSync(
            path.join(cloneDest, "packages", "preset-a", "aicm.json"),
          ),
        ).toBe(true);
        expect(
          fs.existsSync(
            path.join(
              cloneDest,
              "packages",
              "preset-a",
              "instructions",
              "rule-a.md",
            ),
          ),
        ).toBe(true);

        // preset-b and other/ should NOT be materialized
        expect(
          fs.existsSync(
            path.join(cloneDest, "packages", "preset-b", "aicm.json"),
          ),
        ).toBe(false);
        expect(
          fs.existsSync(path.join(cloneDest, "other", "large-file.txt")),
        ).toBe(false);
      } finally {
        await cleanup();
      }
    });

    test("clones multiple sparse paths", async () => {
      const { bareUrl, cleanup } = await createBareGitRepo({
        "config/aicm.json": JSON.stringify({ rootDir: "../src" }),
        "src/instructions/rule.md":
          "---\ndescription: Src rule\ninline: true\n---\nSrc content",
        "unrelated/stuff.txt": "Should not appear",
      });

      try {
        const cloneDest = path.join(tempDest, "multi-sparse");
        await sparseClone(bareUrl, cloneDest, ["config", "src"]);

        expect(fs.existsSync(path.join(cloneDest, "config", "aicm.json"))).toBe(
          true,
        );
        expect(
          fs.existsSync(path.join(cloneDest, "src", "instructions", "rule.md")),
        ).toBe(true);
        expect(
          fs.existsSync(path.join(cloneDest, "unrelated", "stuff.txt")),
        ).toBe(false);
      } finally {
        await cleanup();
      }
    });
  });
});
