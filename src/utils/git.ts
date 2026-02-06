/**
 * Git clone operations (shallow clone and sparse checkout).
 *
 * Uses child_process.execFile for safety (no shell injection).
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

/**
 * Default timeout for git operations in milliseconds.
 */
const GIT_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Perform a shallow clone (--depth 1) of a git repository.
 *
 * Downloads all blobs for the latest commit. Suitable for small repos.
 */
export async function shallowClone(
  url: string,
  destPath: string,
  ref?: string,
): Promise<void> {
  const args = ["clone", "--depth", "1"];

  if (ref) {
    args.push("--branch", ref);
  }

  args.push(url, destPath);

  try {
    await execFile("git", args, { timeout: GIT_TIMEOUT_MS });
  } catch (error) {
    throw wrapGitError(error, url);
  }
}

/**
 * Perform a sparse checkout clone.
 *
 * Uses --filter=blob:none and --sparse to download only tree/commit objects
 * during clone, then materializes only the specified paths.
 *
 * @param url       Git clone URL
 * @param destPath  Destination directory (must not exist yet)
 * @param paths     Paths within the repo to materialize
 * @param ref       Optional branch or tag
 */
export async function sparseClone(
  url: string,
  destPath: string,
  paths: string[],
  ref?: string,
): Promise<void> {
  // Step 1: Clone with blob filter and sparse mode
  const cloneArgs = ["clone", "--filter=blob:none", "--sparse", "--depth", "1"];

  if (ref) {
    cloneArgs.push("--branch", ref);
  }

  cloneArgs.push(url, destPath);

  try {
    await execFile("git", cloneArgs, { timeout: GIT_TIMEOUT_MS });
  } catch (error) {
    throw wrapGitError(error, url);
  }

  // Step 2: Set sparse-checkout paths to materialize only what we need
  const sparseArgs = ["sparse-checkout", "set", ...paths];

  try {
    await execFile("git", sparseArgs, {
      cwd: destPath,
      timeout: GIT_TIMEOUT_MS,
    });
  } catch (error) {
    throw wrapGitError(error, url, true);
  }
}

/**
 * Wrap a git error with a user-friendly message.
 */
function wrapGitError(
  error: unknown,
  url: string,
  isSparseCheckout?: boolean,
): Error {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lowerMessage = message.toLowerCase();

  // Timeout detection
  if (lowerMessage.includes("timed out") || lowerMessage.includes("timeout")) {
    return new Error(
      `Git operation timed out for "${url}". The repository may be too large or the network is slow.`,
    );
  }

  // Authentication errors
  if (
    lowerMessage.includes("authentication failed") ||
    lowerMessage.includes("could not read username") ||
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("repository not found")
  ) {
    return new Error(
      `Git authentication failed for "${url}". For private repositories, set GITHUB_TOKEN or run "gh auth login".`,
    );
  }

  // Git not installed
  if (lowerMessage.includes("enoent")) {
    return new Error(
      `Git is not installed or not found in PATH. Please install git to use GitHub presets.`,
    );
  }

  // Sparse checkout specific
  if (isSparseCheckout && lowerMessage.includes("sparse-checkout")) {
    return new Error(
      `Sparse checkout failed for "${url}". Your git version may not support sparse checkout (requires git 2.25+). ` +
        `Try updating git or use a smaller repository.`,
    );
  }

  return new Error(`Git operation failed for "${url}": ${message}`);
}
