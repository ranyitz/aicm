import { execSync } from "child_process";
import path from "path";
import { loadConfig, ResolvedConfig } from "./config";

/**
 * Discover all packages with aicm configurations using git ls-files
 */
export function findAicmFiles(rootDir: string): string[] {
  try {
    const output = execSync(
      "git ls-files --cached --others --exclude-standard aicm.json **/aicm.json",
      {
        cwd: rootDir,
        encoding: "utf8",
      },
    );

    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file: string) => path.resolve(rootDir, file));
  } catch {
    // Fallback to manual search if git is not available
    return [];
  }
}

/**
 * Discover all packages with aicm configurations
 */
export async function discoverPackagesWithAicm(
  rootDir: string,
): Promise<
  Array<{ relativePath: string; absolutePath: string; config: ResolvedConfig }>
> {
  const aicmFiles = findAicmFiles(rootDir);
  const packages: Array<{
    relativePath: string;
    absolutePath: string;
    config: ResolvedConfig;
  }> = [];

  for (const aicmFile of aicmFiles) {
    const packageDir = path.dirname(aicmFile);
    const relativePath = path.relative(rootDir, packageDir);

    // Normalize to forward slashes for cross-platform compatibility
    const normalizedRelativePath = relativePath.replace(/\\/g, "/");

    const config = await loadConfig(packageDir);

    if (config) {
      packages.push({
        relativePath: normalizedRelativePath || ".",
        absolutePath: packageDir,
        config,
      });
    }
  }

  // Sort packages by relativePath for deterministic order
  return packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
