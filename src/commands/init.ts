import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

const defaultConfig = {
  rootDir: "./",
  targets: ["cursor"],
};

export function initCommand(): void {
  const configPath = path.join(process.cwd(), "aicm.json");

  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow("Configuration file already exists!"));
    return;
  }

  try {
    // Create standard directory structure
    const dirs = ["rules", "commands", "assets", "hooks"];
    for (const dir of dirs) {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // Create placeholder file in rules directory
    const rulesReadmePath = path.join(process.cwd(), "rules", ".gitkeep");
    if (!fs.existsSync(rulesReadmePath)) {
      fs.writeFileSync(rulesReadmePath, "# Place your .mdc rule files here\n");
    }

    fs.writeJsonSync(configPath, defaultConfig, { spaces: 2 });
    console.log(`Configuration file location: ${chalk.blue(configPath)}`);
    console.log(`\nCreated directory structure:`);
    console.log(`  - ${chalk.blue("rules/")} for rule files (.mdc)`);
    console.log(`  - ${chalk.blue("commands/")} for command files (.md)`);
    console.log(`  - ${chalk.blue("assets/")} for auxiliary files`);
    console.log(`  - ${chalk.blue("hooks/")} for hook scripts`);
    console.log(`\nNext steps:`);
    console.log(
      `  1. Add your rule files to ${chalk.blue("rules/")} directory`,
    );
    console.log(
      `  2. Edit ${chalk.blue("aicm.json")} to configure presets if needed`,
    );
    console.log(
      `  3. Run ${chalk.blue("npx aicm install")} to install rules & mcps`,
    );
  } catch (error) {
    console.error(chalk.red("Error creating configuration file:"), error);
  }
}
