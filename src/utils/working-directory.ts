/**
 * Execute an async function within a specific working directory,
 * restoring the original cwd when done.
 */
export async function withWorkingDirectory<T>(
  targetDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalCwd = process.cwd();
  if (targetDir !== originalCwd) {
    process.chdir(targetDir);
  }

  try {
    return await fn();
  } finally {
    if (targetDir !== originalCwd) {
      process.chdir(originalCwd);
    }
  }
}
