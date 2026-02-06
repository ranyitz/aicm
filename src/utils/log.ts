import chalk from "chalk";

/**
 * Thin logging utility to centralize console output.
 * All user-facing output should go through this module.
 */
export const log = {
  info(message: string): void {
    console.log(message);
  },

  warn(message: string): void {
    console.warn(chalk.yellow(message));
  },

  error(message: string): void {
    console.error(chalk.red(message));
  },

  /** Print a message without any formatting */
  plain(message: string): void {
    console.log(message);
  },
};
