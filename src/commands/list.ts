import chalk from "chalk";
import { loadConfig } from "../utils/config";

export async function listCommand(): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    console.log(chalk.red("Configuration file not found!"));
    console.log(`Run ${chalk.blue("npx aicm init")} to create one.`);
    return;
  }

  const hasInstructions = config.instructions && config.instructions.length > 0;

  if (!hasInstructions) {
    console.log(chalk.yellow("No instructions defined in configuration."));
    console.log(
      `Edit your ${chalk.blue("aicm.json")} file to add instructions.`,
    );
    return;
  }

  console.log(chalk.blue("Configured Instructions:"));
  console.log(chalk.dim("─".repeat(50)));

  for (const instruction of config.instructions) {
    console.log(
      `${chalk.bold(instruction.name)} - ${instruction.sourcePath} ${
        instruction.presetName ? `[${instruction.presetName}]` : ""
      }`,
    );
  }
}
