/**
 * Workspace package discovery using git ls-files.
 */

import { execSync } from "child_process";
import path from "node:path";
import { loadConfig, ResolvedConfig } from "./config";

export interface DiscoveredPackage {
  relativePath: string;
  absolutePath: string;
  config: ResolvedConfig;
}

function findAicmFiles(rootDir: string): string[] {
  try {
    const output = execSync(
      "git ls-files --cached --others --exclude-standard aicm.json **/aicm.json",
      { cwd: rootDir, encoding: "utf8" },
    );
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file: string) => path.resolve(rootDir, file));
  } catch {
    return [];
  }
}

export async function discoverPackagesWithAicm(
  rootDir: string,
): Promise<DiscoveredPackage[]> {
  const aicmFiles = findAicmFiles(rootDir);
  const packages: DiscoveredPackage[] = [];

  for (const aicmFile of aicmFiles) {
    const packageDir = path.dirname(aicmFile);
    const relativePath = path.relative(rootDir, packageDir).replace(/\\/g, "/");

    const config = await loadConfig(packageDir);
    if (config) {
      packages.push({
        relativePath: relativePath || ".",
        absolutePath: packageDir,
        config,
      });
    }
  }

  return packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
