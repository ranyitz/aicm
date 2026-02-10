/**
 * Install cache for GitHub presets.
 *
 * Stores metadata at ~/.aicm/install-cache.json and cloned repos under
 * ~/.aicm/repos/{owner}/{repo}/ to avoid re-downloading on every install.
 */

import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

const CURRENT_CACHE_VERSION = 1;

export interface InstallCache {
  version: number;
  entries: Record<string, InstallCacheEntry>;
}

export interface InstallCacheEntry {
  /** Full GitHub URL as specified in presets */
  url: string;
  /** Branch or tag, if specified */
  ref?: string;
  /** Commit SHA at time of clone */
  sha?: string;
  /** Sub-path within repo where aicm.json lives */
  subpath?: string;
  /** ISO 8601 timestamp */
  cachedAt: string;
  /** Absolute path to the cached repo on disk */
  cachePath: string;
}

function getAicmCacheDir(): string {
  return path.join(os.homedir(), ".aicm");
}

export function getInstallCachePath(): string {
  return path.join(getAicmCacheDir(), "install-cache.json");
}

export function getRepoCachePath(owner: string, repo: string): string {
  return path.join(getAicmCacheDir(), "repos", owner, repo);
}

function createEmptyCache(): InstallCache {
  return { version: CURRENT_CACHE_VERSION, entries: {} };
}

export async function readInstallCache(): Promise<InstallCache> {
  const cachePath = getInstallCachePath();

  try {
    if (!fs.existsSync(cachePath)) {
      return createEmptyCache();
    }

    const content = await fs.readFile(cachePath, "utf8");
    const data = JSON.parse(content) as InstallCache;

    if (data.version !== CURRENT_CACHE_VERSION) {
      return createEmptyCache();
    }

    return data;
  } catch {
    return createEmptyCache();
  }
}

export async function writeInstallCache(cache: InstallCache): Promise<void> {
  const cachePath = getInstallCachePath();
  await fs.ensureDir(path.dirname(cachePath));
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

export async function getCacheEntry(
  key: string,
): Promise<InstallCacheEntry | null> {
  const cache = await readInstallCache();
  return cache.entries[key] ?? null;
}

export async function setCacheEntry(
  key: string,
  entry: InstallCacheEntry,
): Promise<void> {
  const cache = await readInstallCache();
  cache.entries[key] = entry;
  await writeInstallCache(cache);
}

export function isCacheValid(entry: InstallCacheEntry): boolean {
  return fs.existsSync(entry.cachePath);
}

export function buildCacheKey(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}
