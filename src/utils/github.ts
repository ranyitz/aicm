/**
 * GitHub API helpers for preflight checks and sparse checkout.
 */

import { execSync } from "child_process";

/** Repos larger than this (in KB) trigger sparse checkout instead of shallow clone. */
export const SPARSE_CHECKOUT_THRESHOLD_KB = 50 * 1024; // 50 MB

/**
 * Resolve a GitHub token. Checks GITHUB_TOKEN, GH_TOKEN, then `gh auth token`.
 */
export function getGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

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

function buildHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "aicm",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Fetch repo size in KB via the GitHub REST API. Returns null on failure. */
export async function fetchRepoSize(
  owner: string,
  repo: string,
  token?: string | null,
): Promise<number | null> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  try {
    const response = await fetch(url, { headers: buildHeaders(token) });
    if (!response.ok) return null;
    const data = (await response.json()) as { size?: number };
    return typeof data.size === "number" ? data.size : null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single file's content from GitHub via the contents API.
 * Only works for files under 1 MB (GitHub API limitation).
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
  if (ref) url += `?ref=${encodeURIComponent(ref)}`;

  try {
    const response = await fetch(url, { headers: buildHeaders(token) });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      type?: string;
      content?: string;
      encoding?: string;
    };
    if (data.type !== "file" || !data.content) return null;

    if (data.encoding === "base64") {
      return Buffer.from(data.content, "base64").toString("utf8");
    }
    return data.content;
  } catch {
    return null;
  }
}
