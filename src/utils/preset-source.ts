/**
 * Preset source detection and GitHub URL parsing.
 *
 * Classifies a preset string into one of three source types:
 *   - "github" -- full GitHub URL (https://github.com/...)
 *   - "local"  -- filesystem path (relative or absolute)
 *   - "npm"    -- npm package name (everything else)
 */

export interface GitHubPresetSource {
  type: "github";
  raw: string;
  owner: string;
  repo: string;
  ref?: string;
  subpath?: string;
  cloneUrl: string;
}

interface LocalPresetSource {
  type: "local";
  raw: string;
}

interface NpmPresetSource {
  type: "npm";
  raw: string;
}

export type PresetSource =
  | GitHubPresetSource
  | LocalPresetSource
  | NpmPresetSource;

const GITHUB_URL_PREFIX = "https://github.com/";
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[/\\]/;

/**
 * Classify a preset string into a source type.
 */
export function parsePresetSource(input: string): PresetSource {
  if (input.startsWith(GITHUB_URL_PREFIX)) {
    return parseGitHubUrl(input);
  }

  if (
    input.startsWith(".") ||
    input.startsWith("/") ||
    WINDOWS_DRIVE_RE.test(input)
  ) {
    return { type: "local", raw: input };
  }

  return { type: "npm", raw: input };
}

/**
 * Parse a full GitHub URL into its components.
 *
 * Supported formats:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/ref
 *   https://github.com/owner/repo/tree/ref/sub/path
 */
export function parseGitHubUrl(input: string): GitHubPresetSource {
  if (!input.startsWith(GITHUB_URL_PREFIX)) {
    throw new Error(`Not a GitHub URL: "${input}"`);
  }

  const rest = input.slice(GITHUB_URL_PREFIX.length).replace(/\/+$/, "");
  const segments = rest.split("/").filter(Boolean);

  if (segments.length < 2) {
    throw new Error(
      `Invalid GitHub URL: "${input}". Expected format: https://github.com/owner/repo`,
    );
  }

  const owner = segments[0];
  const repo = segments[1];
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;

  if (segments.length === 2) {
    return { type: "github", raw: input, owner, repo, cloneUrl };
  }

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
