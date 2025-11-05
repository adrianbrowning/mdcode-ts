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

/**
 * State machine for parsing code blocks
 */
interface ParserState {
  inCodeBlock: boolean;
  fenceChar: string; // '`'
  fenceLength: number; // 3 or 4
  fenceIndent: string;
  blockStart: number; // offset where fence starts
  codeStart: number; // offset where code content starts
  currentBlock: Partial<Block>;
  codeLines: Array<string>;
}

/**
 * Parse markdown and extract all code blocks using line-by-line state machine
 */
export function parse(options: ParseOptions): Array<Block> {
  const { source, filter } = options;
  const blocks: Array<Block> = [];

  const state: ParserState = {
    inCodeBlock: false,
    fenceChar: "",
    fenceLength: 0,
    fenceIndent: "",
    blockStart: 0,
    codeStart: 0,
    currentBlock: {},
    codeLines: [],
  };

  let offset = 0;

  // Split source into lines while preserving line endings
  const lines = source.split(/(\r?\n)/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";

    // Skip newline-only entries from split
    if (line === "\n" || line === "\r\n") {
      offset += line.length;
      continue;
    }

    if (!state.inCodeBlock) {
      // Look for opening fence
      const match = line.match(/^(\s*)(```+)(.*)$/);

      if (match) {
        const indent = match[1] || "";
        const fence = match[2] || "";
        const info = match[3] || "";

        // Only support backtick fences (3 or 4)
        if (fence[0] === "`" && (fence.length === 3 || fence.length === 4)) {
          state.inCodeBlock = true;
          state.fenceChar = "`";
          state.fenceLength = fence.length;
          state.fenceIndent = indent;
          state.blockStart = offset;

          // Parse info string
          const { lang, meta } = parseInfoString(info);
          state.currentBlock = { lang, meta };
          state.codeLines = [];

          // Move past the opening fence line and newline
          offset += line.length;
          if (i + 1 < lines.length && (lines[i + 1] === "\n" || lines[i + 1] === "\r\n")) {
            offset += lines[i + 1]!.length;
            i++; // Skip the newline
          }
          state.codeStart = offset;
          continue;
        }
      }
    }
    else {
      // Look for closing fence
      const match = line.match(/^(\s*)(```+)\s*$/);

      if (match) {
        const indent = match[1] || "";
        const fence = match[2] || "";

        // Check if this is a matching closing fence
        if (
          fence[0] === state.fenceChar &&
          fence.length >= state.fenceLength &&
          indent.length <= state.fenceIndent.length
        ) {
          // Found closing fence - finalize the block
          let code = state.codeLines.join("");

          // Remove trailing newline to match remark-parse behavior
          if (code.endsWith("\r\n")) {
            code = code.slice(0, -2);
          }
          else if (code.endsWith("\n") || code.endsWith("\r")) {
            code = code.slice(0, -1);
          }

          const codeEnd = offset;

          const block: Block = {
            lang: state.currentBlock.lang || "",
            meta: state.currentBlock.meta || {},
            code,
            position: {
              start: state.codeStart,
              end: codeEnd,
            },
          };

          // Apply filter and add if matches
          if (matchesFilter(block, filter)) {
            blocks.push(block);
          }

          // Reset state
          state.inCodeBlock = false;
          state.fenceChar = "";
          state.fenceLength = 0;
          state.fenceIndent = "";
          state.currentBlock = {};
          state.codeLines = [];

          offset += line.length;
          if (i + 1 < lines.length && (lines[i + 1] === "\n" || lines[i + 1] === "\r\n")) {
            offset += lines[i + 1]!.length;
            i++; // Skip the newline
          }
          continue;
        }
      }

      // Inside code block - collect the line
      state.codeLines.push(line);
      offset += line.length;
      if (i + 1 < lines.length && (lines[i + 1] === "\n" || lines[i + 1] === "\r\n")) {
        state.codeLines.push(lines[i + 1]!);
        offset += lines[i + 1]!.length;
        i++; // Skip the newline
      }
      continue;
    }

    offset += line.length;
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

  // Parse to get all blocks (without filter)
  const blocks = parse({ source });

  // Track fence positions as we scan through the source
  const lines = source.split(/(\r?\n)/);
  let offset = 0;
  let blockIndex = 0;

  // Build list of replacements: { start, end, newLine }
  type Replacement = { start: number; end: number; newLine: string };
  const replacements: Array<Replacement> = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";

    // Skip newline-only entries
    if (line === "\n" || line === "\r\n") {
      offset += line.length;
      continue;
    }

    if (!inCodeBlock) {
      // Look for opening fence
      const match = line.match(/^(\s*)(```+)(.*)$/);

      if (match) {
        const indent = match[1] || "";
        const fence = match[2] || "";
        const info = match[3] || "";

        // Only backtick fences (3 or 4)
        if (fence[0] === "`" && (fence.length === 3 || fence.length === 4)) {
          inCodeBlock = true;

          // Check if this block needs updating
          const update = updates.get(blockIndex);

          if (update) {
            // Parse existing info string
            const { lang, meta } = parseInfoString(info);

            // Merge updates
            const newMeta = { ...meta, ...update };

            // Build new info string
            const metaParts = Object.entries(newMeta).map(([k, v]) => `${k}=${v}`);
            const newInfo = [lang, ...metaParts].filter(Boolean).join(" ");

            // Record replacement
            const lineStart = offset;
            const lineEnd = offset + line.length;
            const newLine = `${indent}${fence}${newInfo}`;

            replacements.push({ start: lineStart, end: lineEnd, newLine });
          }

          blockIndex++;
        }
      }
    }
    else {
      // Look for closing fence
      const match = line.match(/^(\s*)(```+)\s*$/);

      if (match) {
        inCodeBlock = false;
      }
    }

    offset += line.length;
    // Account for newline after this line
    if (i + 1 < lines.length && (lines[i + 1] === "\n" || lines[i + 1] === "\r\n")) {
      offset += lines[i + 1]!.length;
      i++; // Skip the newline
    }
  }

  // Apply replacements in reverse order to maintain correct offsets
  replacements.sort((a, b) => b.start - a.start);
  let result = source;

  for (const { start, end, newLine } of replacements) {
    result = result.substring(0, start) + newLine + result.substring(end);
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
