/**
 * Integration tests that hit real GitHub infrastructure.
 *
 * These two tests verify the actual git clone and sparse checkout
 * operations work against a real public repository (ranyitz/aicm).
 */

import fs from "fs-extra";
import path from "path";
import os from "os";
import { shallowClone, sparseClone } from "../../src/utils/git";

describe("GitHub clone integration", () => {
  let tempDest: string;

  beforeEach(async () => {
    tempDest = await fs.mkdtemp(
      path.join(os.tmpdir(), "aicm-integration-dest-"),
    );
  });

  afterEach(async () => {
    await fs.remove(tempDest);
  });

  test("shallow clone of a real GitHub repository", async () => {
    const cloneDest = path.join(tempDest, "aicm");
    await shallowClone("https://github.com/ranyitz/aicm.git", cloneDest);

    expect(fs.existsSync(path.join(cloneDest, "aicm.json"))).toBe(true);
    expect(fs.existsSync(path.join(cloneDest, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(cloneDest, "src"))).toBe(true);
  });

  test("sparse clone of a real GitHub repository", async () => {
    const cloneDest = path.join(tempDest, "aicm-sparse");
    await sparseClone("https://github.com/ranyitz/aicm.git", cloneDest, [
      "src/utils",
    ]);

    // Sparse path is materialized
    expect(fs.existsSync(path.join(cloneDest, "src", "utils"))).toBe(true);

    // Directories outside the sparse set are NOT materialized
    expect(fs.existsSync(path.join(cloneDest, "tests"))).toBe(false);
  });
});
