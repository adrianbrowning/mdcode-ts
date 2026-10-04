import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";

import { outline } from "../outline.ts";
import { walk } from "../parser.ts";
import { read as readRegion } from "../region.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { blockError, blockRef } from "../result.ts";
import type { Block, FilterOptions, TransformerFunction } from "../types.ts";

export interface UpdateOptions {
  source: string;
  filter?: FilterOptions;
  transformer?: TransformerFunction;
  basePath?: string; // Base path for resolving file paths
}

export interface UpdatedBlock extends BlockRef {
  lang: string;
  /** Whether the block's code is different in the returned markdown. */
  changed: boolean;
  /** Set when the block's code was read from its file=. */
  read?: {
    file: string;
    /** Set when only this region of the file was read. */
    region?: string;
    /** Set when the file was outlined (region bodies removed). */
    outline?: true;
  };
  /** Whether the transformer changed the code. */
  transformed: boolean;
}

export interface UpdateResult {
  /** The updated markdown. */
  source: string;
  /** One entry per selected block, in document order. */
  blocks: Array<UpdatedBlock>;
  /**
   * read_failed and transform_failed errors. A block whose file= cannot be read
   * keeps its original code, which the transformer still receives; a block whose
   * transformer throws keeps the code it had before the transform.
   */
  errors: Array<ResultError>;
}

/**
 * Update markdown code blocks from source files or via transformer
 * @throws {MetadataError} when the document's metadata is invalid
 */
export async function update(options: UpdateOptions): Promise<UpdateResult> {
  const { source, filter, transformer, basePath = "." } = options;
  const blocks: Array<UpdatedBlock> = [];
  const errors: Array<ResultError> = [];

  const result = await walk({
    source,
    filter,
    walker: async (block: Block) => {
      const entry: UpdatedBlock = { ...blockRef(block), lang: block.lang, changed: false, transformed: false };
      let currentCode = block.code;

      blocks.push(entry);

      // Step 1: Read from file if file metadata exists
      if (block.meta.file) {
        const filePath = block.meta.file;

        try {
          let fileContent = await readFile(join(basePath, filePath), "utf-8");

          if (block.meta.outline === "true") {
            // Use outline to remove content between region markers
            const outlined = outline(fileContent);

            if (!outlined.found) {
              throw new Error(`outline=true specified but no region markers found in ${filePath}`);
            }

            fileContent = outlined.content;
            entry.read = { file: filePath, outline: true };
          }
          // If a region is specified (and not using outline), extract only that region
          else if (block.meta.region) {
            const region = readRegion(fileContent, block.meta.region, block.lang);

            if (!region.found) {
              throw new Error(`region ${block.meta.region} not found or not closed in ${filePath}`);
            }

            fileContent = region.content;
            entry.read = { file: filePath, region: block.meta.region };
          }
          else {
            entry.read = { file: filePath };
          }

          currentCode = fileContent;
        }
        catch (error: unknown) {
          // Continue with the original code if the file cannot be read
          errors.push(blockError(block, { code: "read_failed", message: error instanceof Error ? error.message : String(error), path: filePath }));
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
            entry.transformed = true;
          }
        }
        catch (error: unknown) {
          // Continue with the current code if the transform fails
          errors.push(blockError(block, { code: "transform_failed", message: error instanceof Error ? error.message : String(error) }));
        }
      }

      // Step 3: Normalize trailing newlines for proper markdown formatting
      // Ensure code ends with EXACTLY one newline (remove any existing trailing newlines first)
      if (currentCode) {
        currentCode = currentCode.replace(/\n+$/, "\n");
      }

      // Step 4: Update block if changed
      if (currentCode !== block.code) {
        entry.changed = true;
        return { ...block, code: currentCode };
      }

      return block;
    },
  });

  return { source: result.source, blocks, errors };
}

/**
 * Human-readable progress lines for an update result, as the CLI prints them on
 * stderr. Failures are always included; quiet drops everything else.
 */
export function formatUpdate({ blocks, errors }: UpdateResult, options: { quiet?: boolean; }): Array<string> {
  const lines: Array<string> = [];
  const failure = (block: UpdatedBlock, code: ResultError["code"]): ResultError | undefined =>
    errors.find(error => error.line === block.line && error.code === code);

  for (const block of blocks) {
    const readFailure = failure(block, "read_failed");
    const transformFailure = failure(block, "transform_failed");

    if (readFailure) {
      lines.push(styleText("red", `✗ Failed to read ${readFailure.path}: ${readFailure.message}`));
    }
    else if (block.read && !options.quiet) {
      lines.push(styleText("green", `✓ Read from ${block.read.file}`));

      if (block.read.outline) {
        lines.push(styleText("gray", "  Mode: outline"));
      }
      else if (block.read.region !== undefined) {
        lines.push(styleText("gray", `  Region: ${block.read.region}`));
      }
    }

    if (transformFailure) {
      lines.push(styleText("red", `✗ Transform failed: ${transformFailure.message}`));
    }
    else if (block.transformed && !options.quiet) {
      lines.push(styleText("green", `✓ Transformed ${block.lang} block`));
    }
  }

  if (!options.quiet) {
    const updated = blocks.filter(block => block.changed).length;
    lines.push(updated === 0
      ? styleText("yellow", "No blocks were updated.")
      : styleText([ "bold", "green" ], `\nUpdated ${updated} block(s).`));
  }

  return lines;
}
