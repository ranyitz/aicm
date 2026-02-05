import fs from "fs-extra";
import path from "node:path";
import fg from "fast-glob";

export interface InstructionMetadata {
  description: string;
  inline: boolean;
}

export interface InstructionFile {
  name: string;
  content: string;
  sourcePath: string;
  source: "local" | "preset";
  presetName?: string;
  description: string;
  inline: boolean;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseInstructionFrontmatter(content: string): {
  metadata: InstructionMetadata;
  body: string;
} {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match) {
    throw new Error("Instruction file missing frontmatter");
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

export function extractInstructionTitle(content: string): string | null {
  const match = content.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

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

  const instructions: InstructionFile[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const { metadata, body } = parseInstructionFrontmatter(content);
    const baseDir = stats.isFile()
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
