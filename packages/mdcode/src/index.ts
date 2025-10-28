import { readFile } from "node:fs/promises";

import { update } from "./commands/update.ts";
import type { FilterOptions, TransformerFunction } from "./types.ts";

// Public API exports
export * from "./types.ts";
export * from "./parser.ts";
export * from "./cli.ts";

// Export commands for programmatic use
export { extract } from "./commands/extract.ts";
export { update } from "./commands/update.ts";
export { list } from "./commands/list.ts";
export { run } from "./commands/run.ts";
export { dump } from "./commands/dump.ts";
export { transform, transformWithFunction } from "./commands/transform.ts";

/**
 * Default export - Simple API for transforming markdown files
 *
 * @param filePath - Path to the markdown file
 * @param transformer - Function to transform code blocks
 * @param filter - Optional filter to apply to blocks
 * @returns Promise of transformed markdown string
 *
 * @example
 * ```typescript
 * import mdcode from '@gcm/mdcode';
 *
 * const result = await mdcode('/path/to/file.md', (tag, meta, code) => {
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
  return update({ source, transformer, filter });
}

export default mdcode;
