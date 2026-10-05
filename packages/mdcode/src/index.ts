import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { update } from "./commands/update.ts";
import type { FilterOptions, TransformerFunction } from "./types.ts";

// Public API exports
export * from "./types.ts";
export * from "./parser.ts";
export type { MetadataProblem } from "./metadata.ts";
export { MetadataError } from "./metadata.ts";
export * from "./cli.ts";

// The JSON contract printed by --json
export type { BlockRef, CommandName, Envelope, ErrorCode, ResultError } from "./result.ts";
export { CONTRACT_VERSION } from "./result.ts";

// Export commands for programmatic use
export type { ExtractOptions, ExtractResult, ExtractTarget } from "./commands/extract.ts";
export { extract } from "./commands/extract.ts";
export type { UpdatedBlock, UpdateOptions, UpdateResult } from "./commands/update.ts";
export { update } from "./commands/update.ts";
export type { SourceRead, ValidatedBlock, ValidateOperation, ValidateOptions, ValidateResult } from "./commands/validate.ts";
export { validate } from "./commands/validate.ts";
export type { ListedBlock, ListOptions, ListResult } from "./commands/list.ts";
export { list } from "./commands/list.ts";
export type { RunBlockResult, RunOptions, RunResult } from "./commands/run.ts";
export { run } from "./commands/run.ts";
export type { DumpedFile, DumpOptions, DumpResult } from "./commands/dump.ts";
export { dump } from "./commands/dump.ts";
export { transform, transformWithFunction } from "./commands/transform.ts";

/**
 * Default export - Simple API for transforming markdown files
 *
 * file= paths resolve against, and must stay inside, the markdown file's
 * directory. The first failed read or transform rejects; use update() with
 * continueOnError to collect failures instead.
 *
 * @param filePath - Path to the markdown file
 * @param transformer - Function to transform code blocks
 * @param filter - Optional filter to apply to blocks
 * @returns Promise of transformed markdown string
 *
 * @example
 * ```typescript
 * import mdcode from 'mdcode-ts';
 *
 * const result = await mdcode('/path/to/file.md', ({ tag, code }) => {
 *   if (tag === 'sql') return code.toUpperCase();
 *   return code;
 * });
 * ```
 */
async function mdcode(
  filePath: string,
  transformer: TransformerFunction,
  filter?: FilterOptions
): Promise<string> {
  const source = await readFile(filePath, "utf-8");
  return (await update({ source, transformer, filter, basePath: dirname(resolve(filePath)) })).source;
}

export default mdcode;
