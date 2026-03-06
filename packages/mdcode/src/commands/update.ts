import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";

import { outline } from "../outline.ts";
import { walk } from "../parser.ts";
import { read as readRegion } from "../region.ts";
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
      let currentCode = block.code;

      // Step 1: Read from file if file metadata exists
      if (block.meta.file) {
        const filePath = block.meta.file;
        const resolvedPath = join(basePath, filePath);

        try {
          // Read the source file
          let fileContent = await readFile(resolvedPath, "utf-8");

          // Check if outline mode is requested
          const shouldOutline = block.meta.outline === "true";

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
            fileContent = readRegion(fileContent, block.meta.region, block.lang).content/*.trim()*/;
          }

          currentCode = fileContent;

          if (!quiet) {
            console.error(styleText("green", `✓ Read from ${filePath}`));
            if (shouldOutline) {
              console.error(styleText("gray", `  Mode: outline`));
            }
            else if (block.meta.region) {
              console.error(styleText("gray", `  Region: ${block.meta.region}`));
            }
          }
        }
        catch (error: any) {// eslint-disable-line @typescript-eslint/no-explicit-any
          // Error messages should always be shown
          console.error(styleText("red", `✗ Failed to read ${filePath}: ${error.message}`));
          // Continue with original code if file read fails
        }
      }

      // Step 2: Apply transformer if provided
      if (transformer) {
        try {
          const transformedCode = await transformer({
            tag: block.lang,
            meta: {
              file: block.meta.file,
              region: block.meta.region,
            },
            code: currentCode,
          });

          if (transformedCode !== currentCode) {
            currentCode = transformedCode;

            if (!quiet) {
              console.error(styleText("green", `✓ Transformed ${block.lang} block`));
            }
          }
        }
        catch (error: unknown) {
          // Error messages should always be shown
          if(error instanceof Error)console.error(styleText("red", `✗ Transform failed: ${error.message}`));
          else console.error(styleText("red", `✗ Transform failed`), error);
          // Continue with current code if transform fails
        }
      }

      // Step 3: Normalize trailing newlines for proper markdown formatting
      // Ensure code ends with EXACTLY one newline (remove any existing trailing newlines first)
      if (currentCode) {
        currentCode = currentCode.replace(/\n+$/, "\n");
      }

      // Step 4: Update block if changed
      if (currentCode !== block.code) {
        updatedCount++;
        return { ...block, code: currentCode };
      }

      return block;
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

