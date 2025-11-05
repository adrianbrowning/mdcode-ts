import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { styleText } from "node:util";

import {parse, updateInfoStrings} from "../parser.ts";
import type { FilterOptions } from "../types.ts";

export type ExtractOptions = {
  source: string;
  filter?: FilterOptions;
  outputDir?: string;
  quiet?: boolean;
  updateSource?: boolean;
  ignoreAnonymous?: boolean;
  sourcePath?: string;
};

type ExtractResult = {
  extractedFiles: Array<string>;
  updatedSource?: string;
};

/**
 * Extract code blocks to files based on their metadata
 */
export async function extract(options: ExtractOptions): Promise<ExtractResult> {
  const {
    source,
    filter,
    outputDir = ".",
    quiet = false,
    updateSource = false,
    ignoreAnonymous = false,
  } = options;

  // Validate mutual exclusivity
  if (updateSource && ignoreAnonymous) {
    throw new Error("Cannot use --update-source and --ignore-anonymous together");
  }

  // Parse all blocks (without filter for tracking indices)
  const allBlocks = parse({ source });

  // Apply filter if provided
  let blocks = filter ? parse({ source, filter }) : allBlocks;

  // Filter anonymous blocks if requested
  if (ignoreAnonymous) {
    blocks = blocks.filter(b => b.meta.file);
    if (blocks.length === 0) {
      if (!quiet) {
        console.error(styleText("yellow", "No code blocks with file metadata found."));
      }
      return { extractedFiles: [] };
    }
  }

  if (blocks.length === 0) {
    if (!quiet) {
      console.error(styleText("yellow", "No code blocks found to extract."));
    }
    return { extractedFiles: [] };
  }

  // Track generated filenames for anonymous blocks (for --update-source)
  const metadataUpdates = new Map<number, Record<string, string>>();

  // Group blocks by file path
  const fileMap = new Map<string, Array<{ block: { meta: Record<string, string>; lang: string; code: string; }; index: number; }>>();

  for (const block of blocks) {
    // Find the original index of this block in allBlocks
    const index = allBlocks.findIndex(b => b.position?.start === block.position?.start);

    let filePath: string;
    let generatedFilename: string | undefined;

    if (block.meta.file) {
      filePath = join(outputDir, block.meta.file);
    }
    else {
      // Generate a filename if not specified
      const ext = getExtensionForLang(block.lang);
      generatedFilename = `block-${index + 1}${ext}`;
      filePath = join(outputDir, generatedFilename);

      // Track for --update-source
      if (updateSource && index >= 0) {
        metadataUpdates.set(index, { file: generatedFilename });
      }
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
      if (!quiet) {
        console.error(styleText("green", `✓ Extracted ${items.length} region(s) to ${filePath}`));
      }
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
      if (!quiet) {
        console.error(styleText("green", `✓ Extracted to ${filePath}`));
      }
    }
    else {
      // No regions or mixed - write the first block's code
      await writeFile(filePath, items[0]?.block.code || "", "utf-8");
      if (!quiet) {
        console.error(styleText("green", `✓ Extracted to ${filePath}`));
      }
    }

    extractedFiles.push(filePath);
  }

  // Update source if requested
  let updatedSourceContent: string | undefined;
  if (updateSource && metadataUpdates.size > 0) {
    updatedSourceContent = updateInfoStrings(source, metadataUpdates);
  }

  return { extractedFiles, updatedSource: updatedSourceContent };
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
