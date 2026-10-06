import { styleText } from "node:util";

import { walk } from "../parser.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { blockError, BlockFailure, blockRef } from "../result.ts";
import type { Block, FilterOptions, TransformerFunction } from "../types.ts";
import type { SourceRead } from "./validate.ts";
import { readSource, SourceError } from "./validate.ts";

export interface UpdateOptions {
  source: string;
  filter?: FilterOptions;
  transformer?: TransformerFunction;
  /** Directory file= paths resolve against and must stay inside (default: the current directory). */
  basePath?: string;
  /**
   * Collect file= read, mapping-rule and transform failures in `errors` and
   * keep going. Without it, the first failure throws a BlockFailure.
   */
  continueOnError?: boolean;
  /**
   * Called as each selected block finishes, before the next one starts, with
   * the errors it added to `errors` (always empty without continueOnError).
   * Not called for a block whose failure throws.
   */
  onBlock?: (block: UpdatedBlock, errors: Array<ResultError>) => void;
}

export interface UpdatedBlock extends BlockRef {
  lang: string;
  /** Whether the block's code is different in the returned markdown. */
  changed: boolean;
  /** The block's code in the returned markdown. */
  code: string;
  /** Set when the block's code was read from its file=. */
  read?: SourceRead;
  /** Whether the transformer changed the code. */
  transformed: boolean;
}

export interface UpdateResult {
  /** The updated markdown. */
  source: string;
  /** One entry per selected block, in document order. */
  blocks: Array<UpdatedBlock>;
  /**
   * Only filled with continueOnError: a transform_failed error per block whose
   * transformer threw, and for each block whose file= could not be read, the
   * rule it broke (read_failed, unsafe_path, missing_region, duplicate_region,
   * malformed_region or region_language_mismatch). A block whose file= cannot
   * be read keeps its original code, which the transformer still receives; a
   * block whose transformer throws keeps the code it had before the transform.
   */
  errors: Array<ResultError>;
}

/**
 * Update markdown code blocks from source files or via transformer. A file=
 * read follows the same rules validate() checks.
 * @throws {MetadataError} when the document's metadata is invalid
 * @throws {BlockFailure} on the first failed read, broken rule or failed transform, unless continueOnError
 */
export async function update(options: UpdateOptions): Promise<UpdateResult> {
  const { source, filter, transformer, basePath = ".", continueOnError = false, onBlock } = options;
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
      const firstError = errors.length;
      let currentCode = block.code;

      blocks.push(entry);

      // Step 1: Read from file if file metadata exists
      if (block.meta.file !== undefined) {
        try {
          const { content, read } = await readSource(block, basePath);

          currentCode = content;
          entry.read = read;
        }
        catch (error: unknown) {
          const code = error instanceof SourceError ? error.code : "read_failed";
          fail(blockError(block, { code, message: error instanceof Error ? error.message : String(error), path: block.meta.file }));
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
      }

      onBlock?.(entry, errors.slice(firstError));
      return entry.changed ? { ...block, code } : block;
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
  const failure = (block: UpdatedBlock, transform: boolean): ResultError | undefined =>
    errors.find(error => error.line === block.line && (error.code === "transform_failed") === transform);

  for (const block of blocks) {
    const readFailure = failure(block, false);
    const transformFailure = failure(block, true);

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
