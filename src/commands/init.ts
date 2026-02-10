import fs from "fs-extra";
import path from "node:path";
import chalk from "chalk";
import { log } from "../utils/log";

const DEFAULT_CONFIG = {
  rootDir: "./",
  targets: ["cursor", "claude-code"],
};

export function initCommand(): void {
  const configPath = path.join(process.cwd(), "aicm.json");

  if (fs.existsSync(configPath)) {
    log.info(chalk.yellow("Configuration file already exists!"));
    return;
  }

  // Create optional directories
  const dirs = ["skills", "agents", "hooks"];
  for (const dir of dirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Create placeholder AGENTS.src.md
  const srcPath = path.join(process.cwd(), "AGENTS.src.md");
  if (!fs.existsSync(srcPath)) {
    fs.writeFileSync(
      srcPath,
      "## Project Instructions\n\n- Add your instructions here.\n",
    );
  }

  fs.writeJsonSync(configPath, DEFAULT_CONFIG, { spaces: 2 });
  log.info(`Configuration file location: ${chalk.blue(configPath)}`);
  log.info(`\nCreated files:`);
  log.info(
    `  - ${chalk.blue("AGENTS.src.md")} — your project instructions (source)`,
  );
  log.info(`  - ${chalk.blue("skills/")} for skill directories`);
  log.info(`  - ${chalk.blue("agents/")} for agent definitions`);
  log.info(`  - ${chalk.blue("hooks/")} for hook scripts`);
  log.info(`\nNext steps:`);
  log.info(
    `  1. Edit ${chalk.blue("AGENTS.src.md")} with your project's conventions`,
  );
  log.info(
    `  2. Edit ${chalk.blue("aicm.json")} to configure presets if needed`,
  );
  log.info(
    `  3. Run ${chalk.blue("npx aicm install")} to generate AGENTS.md & CLAUDE.md`,
  );
}
