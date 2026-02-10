/**
 * Writing instruction content to target files (AGENTS.md, CLAUDE.md, etc.)
 * with marker-based sections that can be updated on reinstall.
 */

import fs from "fs-extra";
import path from "node:path";

const BEGIN_MARKER = "<!-- AICM:BEGIN -->";
const END_MARKER = "<!-- AICM:END -->";
const WARNING =
  "<!-- WARNING: Everything between these markers will be overwritten during installation -->";

function createInstructionsBlock(content: string): string {
  return `${BEGIN_MARKER}\n${WARNING}\n\n${content}\n\n${END_MARKER}`;
}

/**
 * Write instructions content to a target file, preserving any
 * user content outside the AICM markers.
 */
export function writeInstructionsFile(
  instructionsContent: string,
  filePath: string,
): void {
  const block = createInstructionsBlock(instructionsContent);
  let fileContent: string;

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");

    if (existing.includes(BEGIN_MARKER) && existing.includes(END_MARKER)) {
      const before = existing.split(BEGIN_MARKER)[0];
      const after = existing.split(END_MARKER)[1];
      fileContent = before + block + after;
    } else if (existing.trim() === "") {
      fileContent = block;
    } else {
      let separator = "";
      if (!existing.endsWith("\n")) separator += "\n";
      if (!existing.endsWith("\n\n")) separator += "\n";
      fileContent = existing + separator + block;
    }
  } else {
    fileContent = block;
  }

  fs.ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, fileContent);
}

/**
 * Remove the AICM instructions block from file content.
 */
export function removeInstructionsBlock(content: string): string {
  if (content.includes(BEGIN_MARKER) && content.includes(END_MARKER)) {
    const before = content.split(BEGIN_MARKER)[0];
    const afterParts = content.split(END_MARKER);
    const after = afterParts.slice(1).join(END_MARKER);
    return (before + after).trim();
  }
  return content;
}
