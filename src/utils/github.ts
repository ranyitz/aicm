/**
 * GitHub API helpers for preflight checks and sparse checkout preparation.
 */

import { execSync } from "child_process";

/**
 * Size threshold in KB. Repos larger than this use sparse checkout.
 */
export const SPARSE_CHECKOUT_THRESHOLD_KB = 50 * 1024; // 50 MB

/**
 * Resolve a GitHub personal access token.
 *
 * Checks (in order):
 *   1. GITHUB_TOKEN env var
 *   2. GH_TOKEN env var
 *   3. `gh auth token` CLI output
 *
 * Returns null if none found.
 */
export function getGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }

  try {
    const token = execSync("gh auth token", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Build common headers for GitHub API requests.
 */
function buildHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "aicm-cli",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Fetch the size of a GitHub repository in KB.
 *
 * Uses the repos API: GET /repos/{owner}/{repo}
 * The `size` field is in KB.
 *
 * Returns the size in KB, or null if the request fails.
 */
export async function fetchRepoSize(
  owner: string,
  repo: string,
  token?: string | null,
): Promise<number | null> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const response = await fetch(url, { headers: buildHeaders(token) });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { size?: number };
    return typeof data.size === "number" ? data.size : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the content of a single file from a GitHub repository.
 *
 * Uses the contents API: GET /repos/{owner}/{repo}/contents/{path}?ref={ref}
 * The response includes base64-encoded content for files < 1 MB.
 *
 * Returns the decoded file content as a string, or null if not found.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
  token?: string | null,
): Promise<string | null> {
  const encodedPath = filePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  let url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;

  if (ref) {
    url += `?ref=${encodeURIComponent(ref)}`;
  }

  try {
    const response = await fetch(url, { headers: buildHeaders(token) });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      type?: string;
      content?: string;
      encoding?: string;
    };

    if (data.type !== "file" || !data.content) {
      return null;
    }

    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf8");
    }

    return data.content;
  } catch {
    return null;
  }
}
