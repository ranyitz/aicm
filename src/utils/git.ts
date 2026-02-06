/**
 * Git clone operations (shallow clone and sparse checkout).
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";

const execFile = promisify(execFileCb);

/** 60 seconds -- generous to handle slow networks and large repos. */
const GIT_TIMEOUT_MS = 60_000;

/**
 * Shallow clone (--depth 1) of a git repo. Downloads all blobs for the
 * latest commit -- suitable for small repos.
 */
export async function shallowClone(
  url: string,
  destPath: string,
  ref?: string,
): Promise<void> {
  const args = ["clone", "--depth", "1"];
  if (ref) args.push("--branch", ref);
  args.push(url, destPath);

  try {
    await execFile("git", args, { timeout: GIT_TIMEOUT_MS });
  } catch (error) {
    throw wrapGitError(error, url);
  }
}

/**
 * Sparse checkout clone. Uses --filter=blob:none so only tree/commit objects
 * are fetched initially, then materializes only the specified `paths`.
 * Requires git 2.25+.
 */
export async function sparseClone(
  url: string,
  destPath: string,
  paths: string[],
  ref?: string,
): Promise<void> {
  const cloneArgs = ["clone", "--filter=blob:none", "--sparse", "--depth", "1"];
  if (ref) cloneArgs.push("--branch", ref);
  cloneArgs.push(url, destPath);

  try {
    await execFile("git", cloneArgs, { timeout: GIT_TIMEOUT_MS });
  } catch (error) {
    throw wrapGitError(error, url);
  }

  try {
    await execFile("git", ["sparse-checkout", "set", ...paths], {
      cwd: destPath,
      timeout: GIT_TIMEOUT_MS,
    });
  } catch (error) {
    throw wrapGitError(error, url, true);
  }
}

function wrapGitError(
  error: unknown,
  url: string,
  isSparseCheckout?: boolean,
): Error {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("timed out") || lowerMessage.includes("timeout")) {
    return new Error(
      `Git operation timed out for "${url}". The repository may be too large or the network is slow.`,
    );
  }

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

  if (lowerMessage.includes("enoent")) {
    return new Error(
      `Git is not installed or not found in PATH. Please install git to use GitHub presets.`,
    );
  }

  if (isSparseCheckout && lowerMessage.includes("sparse-checkout")) {
    return new Error(
      `Sparse checkout failed for "${url}". Your git version may not support sparse checkout (requires git 2.25+). ` +
        `Try updating git or use a smaller repository.`,
    );
  }

  return new Error(`Git operation failed for "${url}": ${message}`);
}
