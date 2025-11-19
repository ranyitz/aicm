import fs from "fs-extra";
import path from "path";

export type RuleMetadata = Record<string, string | boolean | string[]>;

/**
 * Parse YAML frontmatter blocks from a rule file and return a flat metadata object
 */
export function parseRuleFrontmatter(content: string): RuleMetadata {
  const metadata: RuleMetadata = {};
  // Support both LF and CRLF line endings
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/gm;
  let match: RegExpExecArray | null;

  while ((match = frontmatterRegex.exec(content)) !== null) {
    const lines = match[1].split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [key, ...rest] = trimmed.split(":");
      if (!key) continue;
      const raw = rest.join(":").trim();

      if (raw === "") {
        metadata[key] = "";
      } else if (raw === "true" || raw === "false") {
        metadata[key] = raw === "true";
      } else if (raw.startsWith("[") && raw.endsWith("]")) {
        try {
          const parsed = JSON.parse(raw.replace(/'/g, '"'));
          metadata[key] = parsed;
        } catch {
          metadata[key] = raw;
        }
      } else if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        metadata[key] = raw.slice(1, -1);
      } else {
        metadata[key] = raw;
      }
    }
  }

  return metadata;
}

const RULES_BEGIN = "<!-- AICM:BEGIN -->";
const RULES_END = "<!-- AICM:END -->";
const WARNING =
  "<!-- WARNING: Everything between these markers will be overwritten during installation -->";

/**
 * Remove the rules block from the content
 */
export function removeRulesBlock(content: string): string {
  // Check if our markers exist
  if (content.includes(RULES_BEGIN) && content.includes(RULES_END)) {
    const parts = content.split(RULES_BEGIN);
    const beforeMarker = parts[0];
    const afterParts = parts[1].split(RULES_END);
    const afterMarker = afterParts.slice(1).join(RULES_END); // In case RULES_END appears multiple times (unlikely but safe)

    return (beforeMarker + afterMarker).trim();
  }

  return content;
}

/**
 * Create a formatted block of content with rules markers
 */
function createRulesBlock(rulesContent: string): string {
  return `${RULES_BEGIN}
${WARNING}

${rulesContent}

${RULES_END}`;
}

/**
 * Write rules to the .windsurfrules file
 * This will update the content between the RULES_BEGIN and RULES_END markers
 * If the file doesn't exist, it will create it
 * If the markers don't exist, it will append them to the existing content
 */
export function writeRulesFile(
  rulesContent: string,
  rulesFilePath: string = path.join(process.cwd(), ".windsurfrules"),
): void {
  let fileContent: string;
  const formattedRulesBlock = createRulesBlock(rulesContent);

  // Check if file exists
  if (fs.existsSync(rulesFilePath)) {
    const existingContent = fs.readFileSync(rulesFilePath, "utf8");

    // Check if our markers exist
    if (
      existingContent.includes(RULES_BEGIN) &&
      existingContent.includes(RULES_END)
    ) {
      // Replace content between markers
      const beforeMarker = existingContent.split(RULES_BEGIN)[0];
      const afterMarker = existingContent.split(RULES_END)[1];
      fileContent = beforeMarker + formattedRulesBlock + afterMarker;
    } else {
      // Preserve the existing content and append markers
      // Ensure there's proper spacing between existing content and markers
      let separator = "";
      if (!existingContent.endsWith("\n")) {
        separator += "\n";
      }

      // Add an extra line if the file doesn't already end with multiple newlines
      if (!existingContent.endsWith("\n\n")) {
        separator += "\n";
      }

      // Create the new file content with preserved original content
      fileContent = existingContent + separator + formattedRulesBlock;
    }
  } else {
    // Create new file with markers and content
    fileContent = formattedRulesBlock;
  }

  fs.writeFileSync(rulesFilePath, fileContent);
}

/**
 * Generate the rules file content based on rule files
 */
export function generateRulesFileContent(
  ruleFiles: {
    name: string;
    path: string;
    metadata: Record<string, string | boolean | string[]>;
  }[],
): string {
  const alwaysRules: string[] = [];
  const autoAttachedRules: Array<{ path: string; glob: string }> = [];
  const agentRequestedRules: string[] = [];
  const manualRules: string[] = [];

  ruleFiles.forEach(({ path, metadata }) => {
    // Determine rule type based on metadata
    if (
      metadata.type === "always" ||
      metadata.alwaysApply === true ||
      metadata.alwaysApply === "true"
    ) {
      alwaysRules.push(path);
    } else if (metadata.type === "auto-attached" || metadata.globs) {
      const globPattern: string | undefined =
        typeof metadata.globs === "string" || Array.isArray(metadata.globs)
          ? Array.isArray(metadata.globs)
            ? metadata.globs.join(", ")
            : metadata.globs
          : undefined;
      if (globPattern !== undefined) {
        autoAttachedRules.push({ path, glob: globPattern });
      }
    } else if (metadata.type === "agent-requested" || metadata.description) {
      agentRequestedRules.push(path);
    } else {
      // Default to manual inclusion
      manualRules.push(path);
    }
  });

  // Generate the content
  let content = "";

  // Always rules
  if (alwaysRules.length > 0) {
    content +=
      "The following rules always apply to all files in the project:\n";
    alwaysRules.forEach((rule) => {
      content += `- ${rule}\n`;
    });
    content += "\n";
  }

  // Auto Attached rules
  if (autoAttachedRules.length > 0) {
    content +=
      "The following rules are automatically attached to matching glob patterns:\n";
    autoAttachedRules.forEach((rule) => {
      content += `- [${rule.glob}] ${rule.path}\n`;
    });
    content += "\n";
  }

  // Agent Requested rules
  if (agentRequestedRules.length > 0) {
    content +=
      "The following rules can be loaded when relevant. Check each file's description:\n";
    agentRequestedRules.forEach((rule) => {
      content += `- ${rule}\n`;
    });
    content += "\n";
  }

  // Manual rules
  if (manualRules.length > 0) {
    content +=
      "The following rules are only included when explicitly referenced:\n";
    manualRules.forEach((rule) => {
      content += `- ${rule}\n`;
    });
    content += "\n";
  }

  return content.trim();
}
