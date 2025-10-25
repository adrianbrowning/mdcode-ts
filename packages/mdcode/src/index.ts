import { readFile } from 'node:fs/promises';
import { update } from './commands/update.js';
import type { TransformerFunction, FilterOptions } from './types.js';

// Public API exports
export * from './types.js';
export * from './parser.js';
export * from './cli.js';

// Export commands for programmatic use
export { extract } from './commands/extract.js';
export { update } from './commands/update.js';
export { list } from './commands/list.js';
export { run } from './commands/run.js';
export { dump } from './commands/dump.js';
export { transform, transformWithFunction } from './commands/transform.js';

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
  const source = await readFile(filePath, 'utf-8');
  return update({ source, transformer, filter });
}

export default mdcode;
