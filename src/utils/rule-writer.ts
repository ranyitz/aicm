import fs from "fs-extra";
import path from "node:path";
import { getIdePaths } from "./rule-status";
import { RuleCollection, RuleContent } from "../types";
import {
  writeWindsurfRules,
  generateWindsurfRulesContent,
} from "./windsurf-writer";

/**
 * Write all collected rules to their respective IDE targets
 * @param collection The collection of rules to write
 */
export function writeRulesToTargets(collection: RuleCollection): void {
  const idePaths = getIdePaths();

  // Write Cursor rules
  if (collection.cursor.length > 0) {
    writeCursorRules(collection.cursor, idePaths.cursor);
  }

  // Write Windsurf rules
  if (collection.windsurf.length > 0) {
    writeWindsurfRulesFromCollection(collection.windsurf, idePaths.windsurf);
  }
}

/**
 * Write rules to Cursor's rules directory
 * @param rules The rules to write
 * @param cursorRulesDir The path to Cursor's rules directory
 */
function writeCursorRules(rules: RuleContent[], cursorRulesDir: string): void {
  fs.emptyDirSync(cursorRulesDir);

  for (const rule of rules) {
    const ruleFile =
      path.join(cursorRulesDir, ...rule.name.split("/")) + ".mdc";
    fs.ensureDirSync(path.dirname(ruleFile));
    if (fs.existsSync(rule.sourcePath)) {
      fs.copyFileSync(rule.sourcePath, ruleFile);
    } else {
      const mdcContent = `---\n${JSON.stringify(rule.metadata, null, 2)}\n---\n\n${rule.content}`;
      fs.writeFileSync(ruleFile, mdcContent);
    }
  }
}

/**
 * Write rules to Windsurf's rules directory and update .windsurfrules file
 * @param rules The rules to write
 */
function writeWindsurfRulesFromCollection(
  rules: RuleContent[],
  ruleDir: string,
): void {
  fs.emptyDirSync(ruleDir);

  const ruleFiles = rules.map((rule) => {
    const physicalRulePath =
      path.join(ruleDir, ...rule.name.split("/")) + ".md";
    fs.ensureDirSync(path.dirname(physicalRulePath));
    fs.writeFileSync(physicalRulePath, rule.content);

    const relativeRuleDir = path.basename(ruleDir); // Gets '.rules'
    const windsurfPath =
      path.join(relativeRuleDir, ...rule.name.split("/")) + ".md";

    return {
      name: rule.name,
      path: windsurfPath,
      metadata: rule.metadata,
    };
  });
  const windsurfRulesContent = generateWindsurfRulesContent(ruleFiles);
  writeWindsurfRules(windsurfRulesContent);
}
