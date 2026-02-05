import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

const defaultConfig = {
  rootDir: "./",
  instructions: "instructions/",
  targets: ["cursor", "claude-code"],
};

export function initCommand(): void {
  const configPath = path.join(process.cwd(), "aicm.json");

  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow("Configuration file already exists!"));
    return;
  }

  try {
    // Create standard directory structure
    const dirs = ["instructions", "skills", "agents", "hooks"];
    for (const dir of dirs) {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // Create placeholder file in instructions directory
    const instructionsReadmePath = path.join(
      process.cwd(),
      "instructions",
      "general.md",
    );
    if (!fs.existsSync(instructionsReadmePath)) {
      fs.writeFileSync(
        instructionsReadmePath,
        "---\ndescription: General instructions\ninline: true\n---\n\n## General Instructions\n\n- Add your instructions here.\n",
      );
    }

    fs.writeJsonSync(configPath, defaultConfig, { spaces: 2 });
    console.log(`Configuration file location: ${chalk.blue(configPath)}`);
    console.log(`\nCreated directory structure:`);
    console.log(
      `  - ${chalk.blue("instructions/")} for instruction files (.md)`,
    );
    console.log(`  - ${chalk.blue("skills/")} for skill directories`);
    console.log(`  - ${chalk.blue("agents/")} for agent definitions`);
    console.log(`  - ${chalk.blue("hooks/")} for hook scripts`);
    console.log(`\nNext steps:`);
    console.log(
      `  1. Add your instruction files to ${chalk.blue("instructions/")} directory`,
    );
    console.log(
      `  2. Edit ${chalk.blue("aicm.json")} to configure presets if needed`,
    );
    console.log(
      `  3. Run ${chalk.blue("npx aicm install")} to install instructions & mcps`,
    );
  } catch (error) {
    console.error(chalk.red("Error creating configuration file:"), error);
  }
}
