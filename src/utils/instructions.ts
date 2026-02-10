/**
 * Instruction file loading and frontmatter parsing.
 */

import fs from "fs-extra";
import path from "node:path";
import fg from "fast-glob";

export interface InstructionFile {
  name: string;
  content: string;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
  description: string;
  inline: boolean;
}

interface InstructionMetadata {
  description: string;
  inline: boolean;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse YAML-like frontmatter from an instruction file.
 * Returns null when no frontmatter is present.
 */
function parseFrontmatter(content: string): {
  metadata: InstructionMetadata;
  body: string;
} | null {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match) {
    return null;
  }

  const raw = match[1];
  const body = content.slice(match[0].length);
  const metadata: Partial<InstructionMetadata> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [key, ...rest] = trimmed.split(":");
    if (!key) continue;
    const value = rest.join(":").trim();
    if (key === "description") {
      metadata.description = value.replace(/^['"]|['"]$/g, "");
    } else if (key === "inline") {
      metadata.inline = value === "true";
    }
  }

  if (!metadata.description) {
    throw new Error("Instruction file frontmatter requires description");
  }

  return {
    metadata: {
      description: metadata.description,
      inline: metadata.inline ?? false,
    },
    body: body.trim(),
  };
}

/**
 * Extract the first markdown heading from content.
 */
export function extractInstructionTitle(content: string): string | null {
  const match = content.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Load instruction files from a path (file or directory).
 */
export async function loadInstructionsFromPath(
  instructionsPath: string,
  source: "local" | "preset",
  presetName?: string,
): Promise<InstructionFile[]> {
  if (!fs.existsSync(instructionsPath)) {
    return [];
  }

  const stats = fs.statSync(instructionsPath);
  const files: string[] = [];

  if (stats.isFile()) {
    files.push(instructionsPath);
  } else {
    const pattern = path.join(instructionsPath, "**/*.md").replace(/\\/g, "/");
    const matched = await fg(pattern, { onlyFiles: true, absolute: true });
    files.push(...matched);
  }

  files.sort();

  const isSingleFile = stats.isFile();
  const instructions: InstructionFile[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = parseFrontmatter(content);

    if (!parsed && !isSingleFile) {
      throw new Error(
        `Instruction file missing frontmatter: ${filePath}. ` +
          `Directory-based instructions require frontmatter with at least a "description" field.`,
      );
    }

    const body = parsed ? parsed.body : content.trim();
    const metadata = parsed
      ? parsed.metadata
      : { description: "", inline: true };

    const baseDir = isSingleFile
      ? path.dirname(instructionsPath)
      : instructionsPath;
    const relativePath = path.relative(baseDir, filePath).replace(/\\/g, "/");
    const name = relativePath.replace(/\.md$/, "");

    instructions.push({
      name,
      content: body,
      sourcePath: filePath,
      source,
      presetName,
      description: metadata.description,
      inline: metadata.inline,
    });
  }

  return instructions;
}
