import chalk from "chalk";
import fs from "fs-extra";
import path from "node:path";
import { loadConfig, detectWorkspacesFromPackageJson } from "../utils/config";
import { withWorkingDirectory } from "../utils/working-directory";
import { removeRulesBlock } from "../utils/rules-file-writer";
import { discoverPackagesWithAicm } from "../utils/workspace-discovery";

export interface CleanOptions {
  /**
   * Base directory to use instead of process.cwd()
   */
  cwd?: string;
  /**
   * Show verbose output
   */
  verbose?: boolean;
}

export interface CleanResult {
  success: boolean;
  error?: Error;
  cleanedCount: number;
}

function cleanFile(filePath: string, verbose: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;

  try {
    fs.removeSync(filePath);
    if (verbose) console.log(chalk.gray(`  Removed ${filePath}`));
    return true;
  } catch {
    console.warn(chalk.yellow(`Warning: Failed to remove ${filePath}`));
    return false;
  }
}

function cleanRulesBlock(filePath: string, verbose: boolean): boolean {
  if (!fs.existsSync(filePath)) return false;

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const cleanedContent = removeRulesBlock(content);

    if (content === cleanedContent) return false;

    if (cleanedContent.trim() === "") {
      fs.removeSync(filePath);
      if (verbose) console.log(chalk.gray(`  Removed empty file ${filePath}`));
    } else {
      fs.writeFileSync(filePath, cleanedContent);
      if (verbose)
        console.log(chalk.gray(`  Cleaned rules block from ${filePath}`));
    }
    return true;
  } catch {
    console.warn(chalk.yellow(`Warning: Failed to clean ${filePath}`));
    return false;
  }
}

function cleanMcpServers(cwd: string, verbose: boolean): boolean {
  const mcpPath = path.join(cwd, ".cursor", "mcp.json");
  if (!fs.existsSync(mcpPath)) return false;

  try {
    const content = fs.readJsonSync(mcpPath);
    const mcpServers = content.mcpServers;

    if (!mcpServers) return false;

    let hasChanges = false;
    const newMcpServers: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(mcpServers)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "aicm" in value &&
        value.aicm === true
      ) {
        hasChanges = true;
      } else {
        newMcpServers[key] = value;
      }
    }

    if (!hasChanges) return false;

    // If no servers remain and no other properties, remove the file
    if (
      Object.keys(newMcpServers).length === 0 &&
      Object.keys(content).length === 1
    ) {
      fs.removeSync(mcpPath);
      if (verbose) console.log(chalk.gray(`  Removed empty ${mcpPath}`));
    } else {
      content.mcpServers = newMcpServers;
      fs.writeJsonSync(mcpPath, content, { spaces: 2 });
      if (verbose)
        console.log(chalk.gray(`  Cleaned aicm MCP servers from ${mcpPath}`));
    }
    return true;
  } catch {
    console.warn(chalk.yellow(`Warning: Failed to clean MCP servers`));
    return false;
  }
}

function cleanEmptyDirectories(cwd: string, verbose: boolean): number {
  let cleanedCount = 0;

  const dirsToCheck = [
    path.join(cwd, ".cursor", "rules"),
    path.join(cwd, ".cursor", "commands"),
    path.join(cwd, ".cursor"),
  ];

  for (const dir of dirsToCheck) {
    if (fs.existsSync(dir)) {
      try {
        const contents = fs.readdirSync(dir);
        if (contents.length === 0) {
          fs.removeSync(dir);
          if (verbose)
            console.log(chalk.gray(`  Removed empty directory ${dir}`));
          cleanedCount++;
        }
      } catch {
        // Ignore errors when checking/removing empty directories
      }
    }
  }

  return cleanedCount;
}

export async function cleanPackage(
  options: CleanOptions = {},
): Promise<CleanResult> {
  const cwd = options.cwd || process.cwd();
  const verbose = options.verbose || false;

  return withWorkingDirectory(cwd, async () => {
    let cleanedCount = 0;

    const filesToClean = [
      path.join(cwd, ".cursor", "rules", "aicm"),
      path.join(cwd, ".cursor", "commands", "aicm"),
      path.join(cwd, ".aicm"),
    ];

    const rulesFilesToClean = [
      path.join(cwd, ".windsurfrules"),
      path.join(cwd, "AGENTS.md"),
      path.join(cwd, "CLAUDE.md"),
    ];

    // Clean directories and files
    for (const file of filesToClean) {
      if (cleanFile(file, verbose)) cleanedCount++;
    }

    // Clean rules blocks from files
    for (const file of rulesFilesToClean) {
      if (cleanRulesBlock(file, verbose)) cleanedCount++;
    }

    // Clean MCP servers
    if (cleanMcpServers(cwd, verbose)) cleanedCount++;

    // Clean empty directories
    cleanedCount += cleanEmptyDirectories(cwd, verbose);

    return {
      success: true,
      cleanedCount,
    };
  });
}

export async function cleanWorkspaces(
  cwd: string,
  verbose: boolean = false,
): Promise<CleanResult> {
  if (verbose) console.log(chalk.blue("🔍 Discovering packages..."));

  const packages = await discoverPackagesWithAicm(cwd);

  if (verbose && packages.length > 0) {
    console.log(
      chalk.blue(`Found ${packages.length} packages with aicm configurations.`),
    );
  }

  let totalCleaned = 0;

  // Clean all discovered packages
  for (const pkg of packages) {
    if (verbose)
      console.log(chalk.blue(`Cleaning package: ${pkg.relativePath}`));

    const result = await cleanPackage({
      cwd: pkg.absolutePath,
      verbose,
    });

    totalCleaned += result.cleanedCount;
  }

  // Always clean root directory (for merged artifacts like mcp.json and commands)
  const rootPackage = packages.find((p) => p.absolutePath === cwd);
  if (!rootPackage) {
    if (verbose)
      console.log(chalk.blue(`Cleaning root workspace artifacts...`));
    const rootResult = await cleanPackage({ cwd, verbose });
    totalCleaned += rootResult.cleanedCount;
  }

  return {
    success: true,
    cleanedCount: totalCleaned,
  };
}

export async function clean(options: CleanOptions = {}): Promise<CleanResult> {
  const cwd = options.cwd || process.cwd();
  const verbose = options.verbose || false;

  const shouldUseWorkspaces =
    (await loadConfig(cwd))?.config.workspaces ||
    detectWorkspacesFromPackageJson(cwd);

  if (shouldUseWorkspaces) {
    return cleanWorkspaces(cwd, verbose);
  }

  return cleanPackage(options);
}

export async function cleanCommand(verbose?: boolean): Promise<void> {
  const result = await clean({ verbose });

  if (result.cleanedCount === 0) {
    console.log("Nothing to clean.");
  } else {
    console.log(
      chalk.green(
        `Successfully cleaned ${result.cleanedCount} file(s)/director(y/ies).`,
      ),
    );
  }
}
