import chalk from "chalk";
import { loadConfig } from "../utils/config";

export async function listCommand(): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    console.log(chalk.red("Configuration file not found!"));
    console.log(`Run ${chalk.blue("npx aicm init")} to create one.`);
    return;
  }

  const hasRules = config.rules && config.rules.length > 0;
  const hasCommands = config.commands && config.commands.length > 0;

  if (!hasRules && !hasCommands) {
    console.log(chalk.yellow("No rules or commands defined in configuration."));
    console.log(
      `Edit your ${chalk.blue("aicm.json")} file to add rules or commands.`,
    );
    return;
  }

  if (hasRules) {
    console.log(chalk.blue("Configured Rules:"));
    console.log(chalk.dim("─".repeat(50)));

    for (const rule of config.rules) {
      console.log(
        `${chalk.bold(rule.name)} - ${rule.sourcePath} ${
          rule.presetName ? `[${rule.presetName}]` : ""
        }`,
      );
    }
  }

  if (hasCommands) {
    if (hasRules) {
      console.log();
    }

    console.log(chalk.blue("Configured Commands:"));
    console.log(chalk.dim("─".repeat(50)));

    for (const command of config.commands) {
      console.log(
        `${chalk.bold(command.name)} - ${command.sourcePath} ${
          command.presetName ? `[${command.presetName}]` : ""
        }`,
      );
    }
  }
}
