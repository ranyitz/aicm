import chalk from "chalk";
import { loadConfig } from "../utils/config";
import { log } from "../utils/log";

export async function listCommand(): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    log.info(chalk.red("Configuration file not found!"));
    log.info(`Run ${chalk.blue("npx aicm init")} to create one.`);
    return;
  }

  if (!config.instructions || config.instructions.length === 0) {
    log.info(chalk.yellow("No instructions defined in configuration."));
    log.info(`Edit your ${chalk.blue("aicm.json")} file to add instructions.`);
    return;
  }

  log.info(chalk.blue("Configured Instructions:"));
  log.info(chalk.dim("─".repeat(50)));

  for (const instruction of config.instructions) {
    log.info(
      `${chalk.bold(instruction.name)} - ${instruction.sourcePath} ${
        instruction.presetName ? `[${instruction.presetName}]` : ""
      }`,
    );
  }
}
