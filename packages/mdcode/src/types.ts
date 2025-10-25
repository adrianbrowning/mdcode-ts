/**
 * Represents a code block extracted from markdown
 */
export interface Block {
  /** Programming language of the code block */
  lang: string;
  /** Metadata extracted from the info string (e.g., file=foo.js, region=main) */
  meta: Record<string, string>;
  /** The actual code content */
  code: string;
  /** Optional position information in the source markdown */
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

/**
 * Function that processes a block and optionally transforms it.
 * Return null to remove the block, or a modified block to replace it.
 */
export type WalkerFunction = (block: Block) => Block | null | Promise<Block | null>;

/**
 * Options for filtering code blocks
 */
export interface FilterOptions {
  /** Filter by programming language */
  lang?: string;
  /** Filter by file metadata (supports glob patterns) */
  file?: string;
  /** Filter by custom metadata key-value pairs */
  meta?: Record<string, string>;
}

/**
 * Options for parsing markdown
 */
export interface ParseOptions {
  /** The markdown source to parse */
  source: string;
  /** Optional filter to apply during parsing */
  filter?: FilterOptions;
}

/**
 * Options for walking/transforming blocks
 */
export interface WalkOptions {
  /** The markdown source to walk */
  source: string;
  /** Function to call for each block */
  walker: WalkerFunction;
  /** Optional filter to apply before calling walker */
  filter?: FilterOptions;
}

/**
 * Result of walking and potentially modifying blocks
 */
export interface WalkResult {
  /** The modified markdown source */
  source: string;
  /** All blocks that were processed */
  blocks: Block[];
  /** Whether any modifications were made */
  modified: boolean;
}

/**
 * Metadata for transformer functions
 * Contains only the supported metadata fields: file and region
 */
export interface TransformerMeta {
  /** Optional file path from metadata */
  file?: string;
  /** Optional region name from metadata */
  region?: string;
}

/**
 * Function that transforms a code block
 * @param tag - The language tag (e.g., 'js', 'sql', 'python')
 * @param meta - Metadata containing file and region if present
 * @param code - The code block content
 * @returns The transformed code (or Promise of transformed code)
 */
export type TransformerFunction = (
  tag: string,
  meta: TransformerMeta,
  code: string
) => string | Promise<string>;

/**
 * Helper function to define a transformer with proper type checking
 * @param fn - The transformer function
 * @returns The same function with proper typing
 *
 * @example
 * ```typescript
 * import { defineTransform } from 'mdcode';
 *
 * export default defineTransform((tag, meta, code) => {
 *   if (tag === 'sql') {
 *     return code.toUpperCase();
 *   }
 *   return code;
 * });
 * ```
 */
export function defineTransform(fn: TransformerFunction): TransformerFunction {
  return fn;
}
