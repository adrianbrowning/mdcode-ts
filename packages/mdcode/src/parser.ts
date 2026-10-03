import type { Block, FilterOptions, ParseOptions, WalkOptions, WalkResult } from "./types.ts";

/**
 * Parse metadata from the info string of a code block
 * Format: language key=value key2=value2
 * Example: "js file=foo.js region=main"
 */
function parseInfoString(info: string | null | undefined): { lang: string; meta: Record<string, string>; } {
  if (!info) {
    return { lang: "", meta: {} };
  }

  const parts = info.trim().split(/\s+/);
  const lang = parts[0] || "";
  const meta: Record<string, string> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const equalIndex = part.indexOf("=");
    if (equalIndex > 0) {
      const key = part.substring(0, equalIndex);
      const value = part.substring(equalIndex + 1);
      meta[key] = value;
    }
  }

  return { lang, meta };
}

/**
 * Check if a block matches the filter criteria
 */
function matchesFilter(block: Block, filter?: FilterOptions): boolean {
  if (!filter) {
    return true;
  }

  // Filter by language
  if (filter.lang && block.lang !== filter.lang) {
    return false;
  }

  // Filter by file (exact match for now, glob support can be added later)
  if (filter.file && block.meta.file !== filter.file) {
    return false;
  }

  // Filter by region
  if (filter.region && block.meta.region !== filter.region) {
    return false;
  }

  // Filter by custom metadata (nested format for backwards compatibility)
  if (filter.meta) {
    for (const [ key, value ] of Object.entries(filter.meta)) {
      if (block.meta[key] !== value) {
        return false;
      }
    }
  }

  return true;
}

/** A complete fenced code block, located by offsets into the markdown source. */
interface FencedBlock {
  /** Start of the opening fence line. */
  openStart: number;
  /** End of the opening fence line, before its line ending. */
  openEnd: number;
  /** The opening line's indentation and fence characters, as written. */
  opener: string;
  info: string;
  /** Code runs from after the opening line's ending to the start of the closing fence line. */
  codeStart: number;
  codeEnd: number;
}

const OPENING_FENCE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const CLOSING_FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/;

/**
 * Find every complete fenced code block, following CommonMark's fence rules
 * except that an opening fence may have any indentation, since mdcode does not
 * track list containers and fences nested in list items must still be found.
 *
 * - Opening fence: three or more backticks or tildes. A backtick fence's info
 *   string may not contain a backtick (CommonMark reads that line as inline code).
 * - Closing fence: the same character, at least as long as the opener, indented
 *   at most three columns more than the opener, followed only by spaces or tabs.
 * - An opening fence that is never closed yields no block, and the rest of the
 *   document is treated as its content, as Markdown renderers show it.
 */
function scanFences(source: string): Array<FencedBlock> {
  const blocks: Array<FencedBlock> = [];
  // Capturing split alternates line text and line ending: [text, eol, text, ...].
  const lines = source.split(/(\r?\n)/);
  let open: (Omit<FencedBlock, "codeEnd"> & { char: string; length: number; indent: number; }) | undefined;
  let offset = 0;

  for (let i = 0; i < lines.length; i += 2) {
    const text = lines[i]!;
    const lineStart = offset;

    offset += text.length + (lines[i + 1]?.length ?? 0);

    if (open === undefined) {
      const [ , indent = "", fence = "", info = "" ] = OPENING_FENCE.exec(text) ?? [];

      if (fence === "" || (fence.startsWith("`") && info.includes("`"))) {
        continue;
      }

      open = {
        openStart: lineStart,
        openEnd: lineStart + text.length,
        opener: indent + fence,
        info,
        codeStart: offset,
        char: fence[0]!,
        length: fence.length,
        indent: indent.length,
      };
      continue;
    }

    const [ , indent = "", fence = "" ] = CLOSING_FENCE.exec(text) ?? [];

    if (fence.startsWith(open.char) && fence.length >= open.length && indent.length <= open.indent + 3) {
      const { openStart, openEnd, opener, info, codeStart } = open;

      blocks.push({ openStart, openEnd, opener, info, codeStart, codeEnd: lineStart });
      open = undefined;
    }
  }

  return blocks;
}

/**
 * Parse markdown and extract all fenced code blocks
 */
export function parse(options: ParseOptions): Array<Block> {
  const { source, filter } = options;
  const blocks: Array<Block> = [];

  for (const fenced of scanFences(source)) {
    const { lang, meta } = parseInfoString(fenced.info);
    // The newline before the closing fence ends the last line; it is not code.
    const code = source.slice(fenced.codeStart, fenced.codeEnd).replace(/\r?\n$/, "");
    const block: Block = {
      lang,
      meta,
      code,
      position: { start: fenced.codeStart, end: fenced.codeEnd },
    };

    if (matchesFilter(block, filter)) {
      blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Update info strings in markdown source with new metadata
 * @param source - Original markdown source
 * @param updates - Map of block index to metadata updates
 * @returns Updated markdown source with modified info strings
 */
export function updateInfoStrings(
  source: string,
  updates: Map<number, Record<string, string>>
): string {
  if (updates.size === 0) {
    return source;
  }

  const fences = scanFences(source);
  let result = source;

  // Back to front, so each edit leaves the offsets of earlier fences valid.
  for (let index = fences.length - 1; index >= 0; index--) {
    const update = updates.get(index);

    if (!update) {
      continue;
    }

    const { openStart, openEnd, opener, info } = fences[index]!;
    const { lang, meta } = parseInfoString(info);
    const metaParts = Object.entries({ ...meta, ...update }).map(([ k, v ]) => `${k}=${v}`);
    const newInfo = [ lang, ...metaParts ].filter(Boolean).join(" ");

    result = result.slice(0, openStart) + opener + newInfo + result.slice(openEnd);
  }

  return result;
}

/**
 * Walk through code blocks and optionally transform them
 */
export async function walk(options: WalkOptions): Promise<WalkResult> {
  const { source, walker, filter } = options;
  let modified = false;
  const blocks: Array<Block> = [];

  // List of replacements to apply: { start, end, newCode }
  interface Replacement {
    start: number;
    end: number;
    newCode: string;
  }
  const replacements: Array<Replacement> = [];

  // Parse all blocks
  const parsedBlocks = parse({ source, filter });

  // Apply walker function to each block
  for (const block of parsedBlocks) {
    blocks.push(block);

    // Apply the walker function
    const result = await walker(block);

    // If walker returns null, empty the block content (but keep newline for fence separation)
    if (result === null) {
      if (block.position) {
        replacements.push({
          start: block.position.start,
          end: block.position.end,
          newCode: "\n",
        });
        modified = true;
      }
      continue;
    }

    // If the block was modified, record the replacement
    if (result.code !== block.code) {
      if (block.position) {
        // Ensure code ends with newline for proper fence separation
        let newCode = result.code;
        if (newCode.length > 0 && !newCode.endsWith("\n") && !newCode.endsWith("\r\n")) {
          newCode += "\n";
        }
        replacements.push({
          start: block.position.start,
          end: block.position.end,
          newCode,
        });
        modified = true;
      }
    }
  }

  // If no modifications, return original source
  if (!modified) {
    return {
      source,
      blocks,
      modified: false,
    };
  }

  // Sort replacements in reverse order (by start position, descending)
  // This ensures that later replacements don't affect the offsets of earlier ones
  replacements.sort((a, b) => b.start - a.start);

  // Apply all replacements to the source string
  let newSource = source;
  for (const replacement of replacements) {
    newSource =
      newSource.substring(0, replacement.start) +
      replacement.newCode +
      newSource.substring(replacement.end);
  }

  return {
    source: newSource,
    blocks,
    modified,
  };
}
