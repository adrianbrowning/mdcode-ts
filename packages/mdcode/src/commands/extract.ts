import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { styleText } from "node:util";

import { parse } from "../parser.js";
import type { FilterOptions } from "../types.js";

export interface ExtractOptions {
  source: string;
  filter?: FilterOptions;
  outputDir?: string;
}

/**
 * Extract code blocks to files based on their metadata
 */
export async function extract(options: ExtractOptions): Promise<Array<string>> {
  const { source, filter, outputDir = "." } = options;
  const blocks = parse({ source, filter });

  if (blocks.length === 0) {
    console.log(styleText("yellow", "No code blocks found to extract."));
    return [];
  }

  // Group blocks by file path
  const fileMap = new Map<string, Array<{ block: { meta: Record<string, string>; lang: string; code: string; }; index: number; }>>();

  for (const [ index, block ] of blocks.entries()) {
    let filePath: string;

    if (block.meta.file) {
      filePath = join(outputDir, block.meta.file);
    }
    else {
      // Generate a filename if not specified
      const ext = getExtensionForLang(block.lang);
      filePath = join(outputDir, `block-${index + 1}${ext}`);
    }

    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }
    fileMap.get(filePath)!.push({ block, index });
  }

  const extractedFiles: Array<string> = [];

  // Write files, handling multiple regions per file
  for (const [ filePath, items ] of fileMap.entries()) {
    // Create directory if needed
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // If all blocks for this file have regions, combine them with markers
    const allHaveRegions = items.every(item => item.block.meta.region);

    if (allHaveRegions && items.length > 1) {
      // Combine multiple regions into one file
      const lang = items?.[0]?.block.lang || "text";

      const commentStyle = getCommentStyle(lang);
      const parts: Array<string> = [];

      for (const { block } of items) {
        parts.push(`${commentStyle} #region ${block.meta.region}`);
        parts.push(block.code);
        parts.push(`${commentStyle} #endregion ${block.meta.region}`);
        parts.push(""); // Empty line between regions
      }

      await writeFile(filePath, parts.join("\n").trim() + "\n", "utf-8");
      console.log(styleText("green", `✓ Extracted ${items.length} region(s) to ${filePath}`));
    }
    else if (items.length === 1 && items[0]?.block.meta.region) {
      // Single region - wrap with markers
      const { block } = items[0];
      const commentStyle = getCommentStyle(block.lang);
      const content = [
        `${commentStyle} #region ${block.meta.region}`,
        block.code,
        `${commentStyle} #endregion ${block.meta.region}`,
      ].join("\n") + "\n";

      await writeFile(filePath, content, "utf-8");
      console.log(styleText("green", `✓ Extracted to ${filePath}`));
    }
    else {
      // No regions or mixed - write the first block's code
      await writeFile(filePath, items[0]?.block.code || "", "utf-8");
      console.log(styleText("green", `✓ Extracted to ${filePath}`));
    }

    extractedFiles.push(filePath);
  }

  return extractedFiles;
}

/**
 * Get file extension based on language
 */
function getExtensionForLang(lang: string): string {
  const extensions: Record<string, string> = {
    js: ".js",
    javascript: ".js",
    ts: ".ts",
    typescript: ".ts",
    py: ".py",
    python: ".py",
    go: ".go",
    rust: ".rs",
    rs: ".rs",
    java: ".java",
    c: ".c",
    cpp: ".cpp",
    "c++": ".cpp",
    cs: ".cs",
    "c#": ".cs",
    rb: ".rb",
    ruby: ".rb",
    php: ".php",
    swift: ".swift",
    kt: ".kt",
    kotlin: ".kt",
    sh: ".sh",
    bash: ".sh",
    zsh: ".sh",
    fish: ".fish",
    html: ".html",
    css: ".css",
    scss: ".scss",
    sass: ".sass",
    json: ".json",
    yaml: ".yaml",
    yml: ".yml",
    xml: ".xml",
    sql: ".sql",
    md: ".md",
    markdown: ".md",
    txt: ".txt",
  };

  return extensions[lang.toLowerCase()] || ".txt";
}

/**
 * Get comment style for a given language
 */
function getCommentStyle(lang: string): string {
  const styles: Record<string, string> = {
    js: "//",
    javascript: "//",
    ts: "//",
    typescript: "//",
    java: "//",
    c: "//",
    cpp: "//",
    "c++": "//",
    cs: "//",
    "c#": "//",
    go: "//",
    rust: "//",
    swift: "//",
    kotlin: "//",
    php: "//",
    py: "#",
    python: "#",
    rb: "#",
    ruby: "#",
    sh: "#",
    bash: "#",
    yaml: "#",
    yml: "#",
  };

  return styles[lang.toLowerCase()] || "//";
}
