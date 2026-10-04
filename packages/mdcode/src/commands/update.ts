import { readFile } from "node:fs/promises";
import { styleText } from "node:util";

import { outline } from "../outline.ts";
import { walk } from "../parser.ts";
import { resolveContained, UnsafePathError } from "../paths.ts";
import { read as readRegion } from "../region.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { BlockFailure, blockError, blockRef } from "../result.ts";
import type { Block, FilterOptions, TransformerFunction } from "../types.ts";

export interface UpdateOptions {
  source: string;
  filter?: FilterOptions;
  transformer?: TransformerFunction;
  /** Directory file= paths resolve against and must stay inside (default: the current directory). */
  basePath?: string;
  /**
   * Collect read, transform and unsafe-path failures in `errors` and keep going.
   * Without it, the first failure throws a BlockFailure.
   */
  continueOnError?: boolean;
}

export interface UpdatedBlock extends BlockRef {
  lang: string;
  /** Whether the block's code is different in the returned markdown. */
  changed: boolean;
  /** The block's code in the returned markdown. */
  code: string;
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
   * Only filled with continueOnError: read_failed, unsafe_path and
   * transform_failed errors. A block whose file= cannot be read keeps its
   * original code, which the transformer still receives; a block whose
   * transformer throws keeps the code it had before the transform.
   */
  errors: Array<ResultError>;
}

/**
 * Update markdown code blocks from source files or via transformer
 * @throws {MetadataError} when the document's metadata is invalid
 * @throws {BlockFailure} on the first failed read, unsafe file= or failed transform, unless continueOnError
 */
export async function update(options: UpdateOptions): Promise<UpdateResult> {
  const { source, filter, transformer, basePath = ".", continueOnError = false } = options;
  const blocks: Array<UpdatedBlock> = [];
  const errors: Array<ResultError> = [];
  const fail = (error: ResultError): void => {
    if (!continueOnError) {
      throw new BlockFailure([ error ]);
    }
    errors.push(error);
  };

  const result = await walk({
    source,
    filter,
    walker: async (block: Block) => {
      const entry: UpdatedBlock = { ...blockRef(block), lang: block.lang, changed: false, code: block.code, transformed: false };
      let currentCode = block.code;

      blocks.push(entry);

      // Step 1: Read from file if file metadata exists
      if (block.meta.file) {
        const filePath = block.meta.file;

        try {
          // Checked before anything is read: untrusted markdown must not pull in arbitrary files.
          let fileContent = await readFile(await resolveContained(filePath, basePath), "utf-8");

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
          const code = error instanceof UnsafePathError ? "unsafe_path" : "read_failed";
          fail(blockError(block, { code, message: error instanceof Error ? error.message : String(error), path: filePath }));
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
          fail(blockError(block, { code: "transform_failed", message: error instanceof Error ? error.message : String(error) }));
        }
      }

      // Step 3: Collapse trailing newlines, so a file's last newline is not a blank line in the block
      if (currentCode) {
        currentCode = currentCode.replace(/\n+$/, "\n");
      }

      // Step 4: Update the block if its code differs. Like parse(), drop the newline that
      // ends the last line before the closing fence: it is not code, and walk() restores it.
      // Code the walker left alone is compared as is, so a block ending in a blank line
      // stays unchanged.
      const code = currentCode === block.code ? block.code : currentCode.replace(/\r?\n$/, "");

      if (code !== block.code) {
        entry.changed = true;
        entry.code = code;
        return { ...block, code };
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
  const failure = (block: UpdatedBlock, ...codes: Array<ResultError["code"]>): ResultError | undefined =>
    errors.find(error => error.line === block.line && codes.includes(error.code));

  for (const block of blocks) {
    const readFailure = failure(block, "read_failed", "unsafe_path");
    const transformFailure = failure(block, "transform_failed");

    if (readFailure) {
      lines.push(styleText("red", `✗ ${readFailure.code === "unsafe_path" ? "Refused" : "Failed"} to read ${readFailure.path}: ${readFailure.message}`));
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

  return lines;
}

/** Where a changed block's new code comes from, e.g. `line 3 (greet): js from greet.js region=main`. */
export function describeChange(block: UpdatedBlock): string {
  const sources: Array<string> = [];

  if (block.read) {
    const how = block.read.outline ? " outline" : block.read.region === undefined ? "" : ` region=${block.read.region}`;
    sources.push(`from ${block.read.file}${how}`);
  }

  if (block.transformed) {
    sources.push("transformed");
  }

  const label = block.name === null ? `line ${block.line}` : `line ${block.line} (${block.name})`;
  return `${label}: ${[ block.lang || "block", ...sources ].join(" ")}`;
}
