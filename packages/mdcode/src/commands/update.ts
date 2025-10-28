import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";

import { outline } from "../outline.ts";
import { walk } from "../parser.ts";
import type { Block, FilterOptions, TransformerFunction } from "../types.ts";

export interface UpdateOptions {
  source: string;
  filter?: FilterOptions;
  transformer?: TransformerFunction;
  basePath?: string; // Base path for resolving file paths
  quiet?: boolean;
}

/**
 * Update markdown code blocks from source files or via transformer
 */
export async function update(options: UpdateOptions): Promise<string> {
  const { source, filter, transformer, basePath = ".", quiet = false } = options;

  let updatedCount = 0;

  const result = await walk({
    source,
    filter,
    walker: async (block: Block) => {
      // If transformer is provided, use it to transform the block
      if (transformer) {
        try {
          const transformedCode = await transformer({
            tag: block.lang,
            meta: {
              file: block.meta.file,
              region: block.meta.region
            },
            code: block.code
          });

          // Only update if content changed
          if (transformedCode !== block.code) {
            if (!quiet) {
              console.error(styleText("green", `✓ Transformed ${block.lang} block`));
              if (block.meta.file) {
                console.error(styleText("gray", `  File: ${block.meta.file}`));
              }
            }
            updatedCount++;
            return { ...block, code: transformedCode };
          }

          return block;
        }
        catch (error: any) {
          // Error messages should always be shown
          console.error(styleText("red", `✗ Transform failed: ${error.message}`));
          return block;
        }
      }

      // Otherwise, update from source files (original behavior)
      // Only update blocks that have a file metadata
      if (!block.meta.file) {
        return block;
      }

      const filePath = block.meta.file;
      const resolvedPath = join(basePath, filePath);

      try {
        // Read the source file
        let fileContent = await readFile(resolvedPath, "utf-8");

        // Check if outline mode is requested
        const shouldOutline = block.meta.outline === "true" || block.meta.outline === true;

        if (shouldOutline) {
          // Use outline to remove content between region markers
          const result = outline(fileContent);

          if (!result.found) {
            throw new Error(`outline=true specified but no region markers found in ${filePath}`);
          }

          fileContent = result.content;
        }
        // If a region is specified (and not using outline), extract only that region
        else if (block.meta.region) {
          fileContent = extractRegion(fileContent, block.meta.region, block.lang);
        }

        // Only update if content changed
        if (fileContent !== block.code) {
          if (!quiet) {
            console.error(styleText("green", `✓ Updated block from ${filePath}`));
            if (shouldOutline) {
              console.error(styleText("gray", `  Mode: outline`));
            }
            else if (block.meta.region) {
              console.error(styleText("gray", `  Region: ${block.meta.region}`));
            }
          }
          updatedCount++;
          return { ...block, code: fileContent };
        }

        return block;
      }
      catch (error: any) {
        // Error messages should always be shown
        console.error(styleText("red", `✗ Failed to read ${filePath}: ${error.message}`));
        return block; // Keep original block if file read fails
      }
    },
  });

  if (!quiet) {
    if (updatedCount === 0) {
      console.error(styleText("yellow", "No blocks were updated."));
    }
    else {
      console.error(styleText([ "bold", "green" ], `\nUpdated ${updatedCount} block(s).`));
    }
  }

  return result.source;
}

/**
 * Extract a region from source code using special comments
 * Supports various comment styles based on language
 */
function extractRegion(content: string, regionName: string, lang: string): string {
  const commentStyles = getCommentStyle(lang);
  const lines = content.split("\n");
  const extracted: Array<string> = [];
  let inRegion = false;

  for (const line of lines) {
    let isMarkerLine = false;

    // Check for region start/end markers
    for (const style of commentStyles) {
      const startPattern = new RegExp(`${escapeRegex(style)}\\s*#region\\s+${escapeRegex(regionName)}`);
      const endPattern = new RegExp(`${escapeRegex(style)}\\s*#endregion\\s+${escapeRegex(regionName)}`);

      if (startPattern.test(line)) {
        inRegion = true;
        isMarkerLine = true;
        break;
      }

      if (endPattern.test(line)) {
        inRegion = false;
        isMarkerLine = true;
        break;
      }
    }

    // Collect lines inside the region (but not the marker lines themselves)
    if (inRegion && !isMarkerLine) {
      extracted.push(line);
    }
  }

  return extracted.join("\n").trim();
}

/**
 * Get comment styles for a given language
 */
function getCommentStyle(lang: string): Array<string> {
  const styles: Record<string, Array<string>> = {
    js: [ "//" ],
    javascript: [ "//" ],
    ts: [ "//" ],
    typescript: [ "//" ],
    java: [ "//" ],
    c: [ "//" ],
    cpp: [ "//" ],
    "c++": [ "//" ],
    cs: [ "//" ],
    "c#": [ "//" ],
    go: [ "//" ],
    rust: [ "//" ],
    swift: [ "//" ],
    kotlin: [ "//" ],
    php: [ "//" ],
    py: [ "#" ],
    python: [ "#" ],
    rb: [ "#" ],
    ruby: [ "#" ],
    sh: [ "#" ],
    bash: [ "#" ],
    yaml: [ "#" ],
    yml: [ "#" ],
    html: [ "<!--" ],
    xml: [ "<!--" ],
  };

  return styles[lang.toLowerCase()] || [ "//" ];
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
