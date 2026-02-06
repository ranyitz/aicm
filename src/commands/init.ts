import fs from "fs-extra";
import path from "node:path";
import chalk from "chalk";
import { log } from "../utils/log";

const DEFAULT_CONFIG = {
  rootDir: "./",
  instructions: "instructions/",
  targets: ["cursor", "claude-code"],
};

export function initCommand(): void {
  const configPath = path.join(process.cwd(), "aicm.json");

  if (fs.existsSync(configPath)) {
    log.info(chalk.yellow("Configuration file already exists!"));
    return;
  }

  // Create standard directory structure
  const dirs = ["instructions", "skills", "agents", "hooks"];
  for (const dir of dirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Create placeholder instruction file
  const generalPath = path.join(process.cwd(), "instructions", "general.md");
  if (!fs.existsSync(generalPath)) {
    fs.writeFileSync(
      generalPath,
      "---\ndescription: General instructions\ninline: true\n---\n\n## General Instructions\n\n- Add your instructions here.\n",
    );
  }

  fs.writeJsonSync(configPath, DEFAULT_CONFIG, { spaces: 2 });
  log.info(`Configuration file location: ${chalk.blue(configPath)}`);
  log.info(`\nCreated directory structure:`);
  log.info(`  - ${chalk.blue("instructions/")} for instruction files (.md)`);
  log.info(`  - ${chalk.blue("skills/")} for skill directories`);
  log.info(`  - ${chalk.blue("agents/")} for agent definitions`);
  log.info(`  - ${chalk.blue("hooks/")} for hook scripts`);
  log.info(`\nNext steps:`);
  log.info(
    `  1. Add your instruction files to ${chalk.blue("instructions/")} directory`,
  );
  log.info(
    `  2. Edit ${chalk.blue("aicm.json")} to configure presets if needed`,
  );
  log.info(
    `  3. Run ${chalk.blue("npx aicm install")} to install instructions & mcps`,
  );
}
