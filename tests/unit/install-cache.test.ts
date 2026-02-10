import fs from "fs-extra";
import path from "path";
import os from "os";
import {
  readInstallCache,
  writeInstallCache,
  getCacheEntry,
  setCacheEntry,
  isCacheValid,
  getRepoCachePath,
  buildCacheKey,
  getInstallCachePath,
  InstallCache,
  InstallCacheEntry,
} from "../../src/utils/install-cache";

// We override the home directory to isolate tests from the real ~/.aicm/
let originalHomedir: () => string;
let tempHome: string;

beforeEach(async () => {
  tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "aicm-cache-test-"));
  originalHomedir = os.homedir;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = () => tempHome;
});

afterEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).homedir = originalHomedir;
  await fs.remove(tempHome);
});

describe("install-cache paths", () => {
  test("getInstallCachePath returns correct path", () => {
    const cachePath = getInstallCachePath();
    expect(cachePath).toBe(path.join(tempHome, ".aicm", "install-cache.json"));
  });

  test("getRepoCachePath returns correct path", () => {
    const repoPath = getRepoCachePath("owner", "repo");
    expect(repoPath).toBe(
      path.join(tempHome, ".aicm", "repos", "owner", "repo"),
    );
  });

  test("buildCacheKey creates canonical URL", () => {
    expect(buildCacheKey("ranyitz", "aicm")).toBe(
      "https://github.com/ranyitz/aicm",
    );
  });
});

describe("readInstallCache", () => {
  test("returns empty cache when file does not exist", async () => {
    const cache = await readInstallCache();
    expect(cache).toEqual({ version: 1, entries: {} });
  });

  test("returns empty cache when file is invalid JSON", async () => {
    const cachePath = getInstallCachePath();
    await fs.ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, "not json");

    const cache = await readInstallCache();
    expect(cache).toEqual({ version: 1, entries: {} });
  });

  test("returns empty cache when version mismatches", async () => {
    const cachePath = getInstallCachePath();
    await fs.ensureDir(path.dirname(cachePath));
    await fs.writeFile(
      cachePath,
      JSON.stringify({ version: 999, entries: { old: {} } }),
    );

    const cache = await readInstallCache();
    expect(cache).toEqual({ version: 1, entries: {} });
  });

  test("reads valid cache", async () => {
    const expected: InstallCache = {
      version: 1,
      entries: {
        "https://github.com/owner/repo": {
          url: "https://github.com/owner/repo",
          cachedAt: "2026-01-01T00:00:00.000Z",
          cachePath: "/some/path",
        },
      },
    };

    const cachePath = getInstallCachePath();
    await fs.ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, JSON.stringify(expected));

    const cache = await readInstallCache();
    expect(cache).toEqual(expected);
  });
});

describe("writeInstallCache", () => {
  test("creates directory and writes cache", async () => {
    const cache: InstallCache = {
      version: 1,
      entries: {
        "https://github.com/owner/repo": {
          url: "https://github.com/owner/repo",
          cachedAt: "2026-01-01T00:00:00.000Z",
          cachePath: "/some/path",
        },
      },
    };

    await writeInstallCache(cache);

    const cachePath = getInstallCachePath();
    expect(fs.existsSync(cachePath)).toBe(true);

    const written = JSON.parse(await fs.readFile(cachePath, "utf8"));
    expect(written).toEqual(cache);
  });
});

describe("getCacheEntry / setCacheEntry", () => {
  test("returns null for missing entry", async () => {
    const entry = await getCacheEntry("https://github.com/owner/repo");
    expect(entry).toBeNull();
  });

  test("sets and gets an entry", async () => {
    const entry: InstallCacheEntry = {
      url: "https://github.com/owner/repo",
      ref: "main",
      subpath: "packages/preset",
      cachedAt: "2026-01-01T00:00:00.000Z",
      cachePath: "/some/path",
    };

    await setCacheEntry("https://github.com/owner/repo", entry);
    const result = await getCacheEntry("https://github.com/owner/repo");
    expect(result).toEqual(entry);
  });

  test("overwrites existing entry", async () => {
    const entry1: InstallCacheEntry = {
      url: "https://github.com/owner/repo",
      cachedAt: "2026-01-01T00:00:00.000Z",
      cachePath: "/old/path",
    };

    const entry2: InstallCacheEntry = {
      url: "https://github.com/owner/repo",
      cachedAt: "2026-02-01T00:00:00.000Z",
      cachePath: "/new/path",
    };

    await setCacheEntry("https://github.com/owner/repo", entry1);
    await setCacheEntry("https://github.com/owner/repo", entry2);

    const result = await getCacheEntry("https://github.com/owner/repo");
    expect(result).toEqual(entry2);
  });
});

describe("isCacheValid", () => {
  test("returns true when cachePath exists", async () => {
    const dir = path.join(tempHome, "test-repo");
    await fs.ensureDir(dir);

    const entry: InstallCacheEntry = {
      url: "https://github.com/owner/repo",
      cachedAt: "2026-01-01T00:00:00.000Z",
      cachePath: dir,
    };

    expect(isCacheValid(entry)).toBe(true);
  });

  test("returns false when cachePath does not exist", () => {
    const entry: InstallCacheEntry = {
      url: "https://github.com/owner/repo",
      cachedAt: "2026-01-01T00:00:00.000Z",
      cachePath: "/nonexistent/path",
    };

    expect(isCacheValid(entry)).toBe(false);
  });
});
