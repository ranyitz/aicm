/**
 * Preset source detection and GitHub URL parsing.
 *
 * Classifies a preset string into one of three source types:
 *   - "github"  – full GitHub URL (https://github.com/…)
 *   - "local"   – filesystem path (relative or absolute)
 *   - "npm"     – npm package name (everything else)
 */

type PresetSourceType = "github" | "local" | "npm";

interface PresetSource {
  type: PresetSourceType;
  /** The raw preset string exactly as it appeared in aicm.json */
  raw: string;
}

export interface GitHubPresetSource extends PresetSource {
  type: "github";
  owner: string;
  repo: string;
  /** Branch or tag (from /tree/<ref>/…). undefined = default branch. */
  ref?: string;
  /** Sub-directory within the repo (from /tree/<ref>/<subpath>). */
  subpath?: string;
  /** Clone URL: https://github.com/<owner>/<repo>.git */
  cloneUrl: string;
}

export interface LocalPresetSource extends PresetSource {
  type: "local";
}

export interface NpmPresetSource extends PresetSource {
  type: "npm";
}

const GITHUB_URL_PREFIX = "https://github.com/";

/**
 * Windows drive-letter pattern: C:\ or D:/
 */
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[/\\]/;

/**
 * Classify a preset string into a source type.
 */
export function parsePresetSource(
  input: string,
): GitHubPresetSource | LocalPresetSource | NpmPresetSource {
  // 1. GitHub full URL
  if (input.startsWith(GITHUB_URL_PREFIX)) {
    return parseGitHubUrl(input);
  }

  // 2. Local path (relative or absolute)
  if (
    input.startsWith(".") ||
    input.startsWith("/") ||
    WINDOWS_DRIVE_RE.test(input)
  ) {
    return { type: "local", raw: input };
  }

  // 3. Everything else is npm
  return { type: "npm", raw: input };
}

/**
 * Parse a full GitHub URL into its components.
 *
 * Supported formats:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/ref
 *   https://github.com/owner/repo/tree/ref/sub/path
 *
 * Throws on invalid GitHub URLs.
 */
export function parseGitHubUrl(input: string): GitHubPresetSource {
  if (!input.startsWith(GITHUB_URL_PREFIX)) {
    throw new Error(`Not a GitHub URL: "${input}"`);
  }

  // Strip the prefix and any trailing slash
  const rest = input.slice(GITHUB_URL_PREFIX.length).replace(/\/+$/, "");

  // Split into segments: owner, repo, [tree, ref, ...subpath]
  const segments = rest.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new Error(
      `Invalid GitHub URL: "${input}". Expected format: https://github.com/owner/repo`,
    );
  }

  const owner = segments[0];
  const repo = segments[1];
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  // Simple form: https://github.com/owner/repo
  if (segments.length === 2) {
    return { type: "github", raw: input, owner, repo, cloneUrl };
  }

  // Must have /tree/<ref>[/subpath…]
  if (segments[2] !== "tree") {
    throw new Error(
      `Invalid GitHub URL: "${input}". Only /tree/ URLs are supported (e.g. https://github.com/owner/repo/tree/main/path).`,
    );
  }

  if (segments.length < 4) {
    throw new Error(
      `Invalid GitHub URL: "${input}". Missing branch/tag after /tree/.`,
    );
  }

  const ref = segments[3];
  const subpath = segments.length > 4 ? segments.slice(4).join("/") : undefined;

  return { type: "github", raw: input, owner, repo, ref, subpath, cloneUrl };
}

/**
 * Check whether a preset string is a GitHub URL.
 */
export function isGitHubPreset(input: string): boolean {
  return input.startsWith(GITHUB_URL_PREFIX);
}
