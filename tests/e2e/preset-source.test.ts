import {
  parsePresetSource,
  parseGitHubUrl,
  isGitHubPreset,
} from "../../src/utils/preset-source";

describe("parsePresetSource", () => {
  describe("github URLs", () => {
    test("detects simple GitHub repo URL", () => {
      const result = parsePresetSource("https://github.com/owner/repo");
      expect(result.type).toBe("github");
      expect(result.raw).toBe("https://github.com/owner/repo");
      if (result.type === "github") {
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBeUndefined();
        expect(result.subpath).toBeUndefined();
        expect(result.cloneUrl).toBe("https://github.com/owner/repo.git");
      }
    });

    test("detects GitHub tree URL with ref", () => {
      const result = parsePresetSource(
        "https://github.com/owner/repo/tree/main",
      );
      expect(result.type).toBe("github");
      if (result.type === "github") {
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBe("main");
        expect(result.subpath).toBeUndefined();
      }
    });

    test("detects GitHub tree URL with ref and subpath", () => {
      const result = parsePresetSource(
        "https://github.com/owner/repo/tree/main/packages/preset",
      );
      expect(result.type).toBe("github");
      if (result.type === "github") {
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBe("main");
        expect(result.subpath).toBe("packages/preset");
      }
    });

    test("detects GitHub tree URL with tag ref", () => {
      const result = parsePresetSource(
        "https://github.com/owner/repo/tree/v1.0.0/config",
      );
      expect(result.type).toBe("github");
      if (result.type === "github") {
        expect(result.ref).toBe("v1.0.0");
        expect(result.subpath).toBe("config");
      }
    });

    test("handles trailing slash in GitHub URL", () => {
      const result = parsePresetSource("https://github.com/owner/repo/");
      expect(result.type).toBe("github");
      if (result.type === "github") {
        expect(result.owner).toBe("owner");
        expect(result.repo).toBe("repo");
        expect(result.ref).toBeUndefined();
      }
    });
  });

  describe("local paths", () => {
    test("detects relative path starting with ./", () => {
      const result = parsePresetSource("./presets/my-preset");
      expect(result.type).toBe("local");
      expect(result.raw).toBe("./presets/my-preset");
    });

    test("detects relative path starting with ../", () => {
      const result = parsePresetSource("../shared/preset");
      expect(result.type).toBe("local");
    });

    test("detects absolute Unix path", () => {
      const result = parsePresetSource("/home/user/presets/my-preset");
      expect(result.type).toBe("local");
    });

    test("detects Windows drive path", () => {
      const result = parsePresetSource("C:\\Users\\user\\presets\\my-preset");
      expect(result.type).toBe("local");
    });

    test("detects Windows drive path with forward slash", () => {
      const result = parsePresetSource("D:/presets/my-preset");
      expect(result.type).toBe("local");
    });

    test("detects path starting with .", () => {
      const result = parsePresetSource(".hidden-preset");
      expect(result.type).toBe("local");
    });
  });

  describe("npm packages", () => {
    test("detects scoped npm package", () => {
      const result = parsePresetSource("@company/ai-preset");
      expect(result.type).toBe("npm");
      expect(result.raw).toBe("@company/ai-preset");
    });

    test("detects unscoped npm package", () => {
      const result = parsePresetSource("my-aicm-preset");
      expect(result.type).toBe("npm");
    });

    test("detects npm package with subpath", () => {
      const result = parsePresetSource("@company/preset/aicm.json");
      expect(result.type).toBe("npm");
    });
  });
});

describe("parseGitHubUrl", () => {
  test("parses simple repo URL", () => {
    const result = parseGitHubUrl("https://github.com/ranyitz/aicm");
    expect(result.owner).toBe("ranyitz");
    expect(result.repo).toBe("aicm");
    expect(result.ref).toBeUndefined();
    expect(result.subpath).toBeUndefined();
    expect(result.cloneUrl).toBe("https://github.com/ranyitz/aicm.git");
  });

  test("parses tree URL with branch", () => {
    const result = parseGitHubUrl(
      "https://github.com/ranyitz/aicm/tree/develop",
    );
    expect(result.owner).toBe("ranyitz");
    expect(result.repo).toBe("aicm");
    expect(result.ref).toBe("develop");
    expect(result.subpath).toBeUndefined();
  });

  test("parses tree URL with ref and deep subpath", () => {
    const result = parseGitHubUrl(
      "https://github.com/org/monorepo/tree/main/packages/ai/preset",
    );
    expect(result.owner).toBe("org");
    expect(result.repo).toBe("monorepo");
    expect(result.ref).toBe("main");
    expect(result.subpath).toBe("packages/ai/preset");
  });

  test("throws on non-GitHub URL", () => {
    expect(() => parseGitHubUrl("https://gitlab.com/owner/repo")).toThrow(
      "Not a GitHub URL",
    );
  });

  test("throws on URL with only owner", () => {
    expect(() => parseGitHubUrl("https://github.com/owner")).toThrow(
      "Expected format",
    );
  });

  test("throws on non-tree path segment", () => {
    expect(() =>
      parseGitHubUrl("https://github.com/owner/repo/blob/main/file.ts"),
    ).toThrow("Only /tree/ URLs are supported");
  });

  test("throws on tree URL without ref", () => {
    expect(() => parseGitHubUrl("https://github.com/owner/repo/tree")).toThrow(
      "Missing branch/tag after /tree/",
    );
  });
});

describe("isGitHubPreset", () => {
  test("returns true for GitHub URLs", () => {
    expect(isGitHubPreset("https://github.com/owner/repo")).toBe(true);
    expect(isGitHubPreset("https://github.com/o/r/tree/main/path")).toBe(true);
  });

  test("returns false for non-GitHub inputs", () => {
    expect(isGitHubPreset("@company/preset")).toBe(false);
    expect(isGitHubPreset("./local/path")).toBe(false);
    expect(isGitHubPreset("https://gitlab.com/owner/repo")).toBe(false);
  });
});
