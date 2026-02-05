import fs from "fs-extra";
import path from "node:path";

const INSTRUCTIONS_BEGIN = "<!-- AICM:BEGIN -->";
const INSTRUCTIONS_END = "<!-- AICM:END -->";
const WARNING =
  "<!-- WARNING: Everything between these markers will be overwritten during installation -->";

export function removeInstructionsBlock(content: string): string {
  if (
    content.includes(INSTRUCTIONS_BEGIN) &&
    content.includes(INSTRUCTIONS_END)
  ) {
    const parts = content.split(INSTRUCTIONS_BEGIN);
    const beforeMarker = parts[0];
    const afterParts = parts[1].split(INSTRUCTIONS_END);
    const afterMarker = afterParts.slice(1).join(INSTRUCTIONS_END);
    return (beforeMarker + afterMarker).trim();
  }

  return content;
}

function createInstructionsBlock(instructionsContent: string): string {
  return `${INSTRUCTIONS_BEGIN}
${WARNING}

${instructionsContent}

${INSTRUCTIONS_END}`;
}

export function writeInstructionsFile(
  instructionsContent: string,
  instructionsFilePath: string,
): void {
  let fileContent: string;
  const formattedBlock = createInstructionsBlock(instructionsContent);

  if (fs.existsSync(instructionsFilePath)) {
    const existingContent = fs.readFileSync(instructionsFilePath, "utf8");

    if (
      existingContent.includes(INSTRUCTIONS_BEGIN) &&
      existingContent.includes(INSTRUCTIONS_END)
    ) {
      const beforeMarker = existingContent.split(INSTRUCTIONS_BEGIN)[0];
      const afterMarker = existingContent.split(INSTRUCTIONS_END)[1];
      fileContent = beforeMarker + formattedBlock + afterMarker;
    } else {
      let separator = "";
      if (!existingContent.endsWith("\n")) {
        separator += "\n";
      }
      if (!existingContent.endsWith("\n\n")) {
        separator += "\n";
      }
      fileContent = existingContent + separator + formattedBlock;
    }
  } else {
    fileContent = formattedBlock;
  }

  fs.ensureDirSync(path.dirname(instructionsFilePath));
  fs.writeFileSync(instructionsFilePath, fileContent);
}
