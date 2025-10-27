import type { Code, Root } from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import type { Block, FilterOptions, ParseOptions, WalkOptions, WalkResult } from "./types.js";

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

  // Filter by custom metadata
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
 * Parse markdown and extract all code blocks
 */
export function parse(options: ParseOptions): Array<Block> {
  const { source, filter } = options;
  const blocks: Array<Block> = [];

  const tree = unified()
    .use(remarkParse)
    .parse(source);

  visit(tree, "code", (node: Code) => {
    // Combine lang and meta to form the full info string
    const infoString = node.meta ? `${node.lang || ""} ${node.meta}` : (node.lang || "");
    const { lang, meta } = parseInfoString(infoString);

    const block: Block = {
      lang,
      meta,
      code: node.value,
      position: node.position,
    };

    if (matchesFilter(block, filter)) {
      blocks.push(block);
    }
  });

  return blocks;
}

/**
 * Walk through code blocks and optionally transform them
 */
export async function walk(options: WalkOptions): Promise<WalkResult> {
  const { source, walker, filter } = options;
  let modified = false;
  const blocks: Array<Block> = [];

  const tree = unified()
    .use(remarkParse)
    .parse(source);

  // Visit all code blocks and apply the walker function
  await visitAsync(tree, "code", async (node: Code, index, parent) => {
    // Combine lang and meta to form the full info string
    const infoString = node.meta ? `${node.lang || ""} ${node.meta}` : (node.lang || "");
    const { lang, meta } = parseInfoString(infoString);

    const block: Block = {
      lang,
      meta,
      code: node.value,
      position: node.position,
    };

    // Only process blocks that match the filter
    if (!matchesFilter(block, filter)) {
      return;
    }

    blocks.push(block);

    // Apply the walker function
    const result = await walker(block);

    // If walker returns null, remove the block
    if (result === null) {
      if (parent && typeof index === "number") {
        parent.children.splice(index, 1);
        modified = true;
      }
      return;
    }

    // If the block was modified, update the node
    if (result.code !== block.code || result.lang !== block.lang) {
      node.value = result.code;

      // Reconstruct the info string with the new language and metadata
      const metaString = Object.entries(result.meta)
        .map(([ key, value ]) => `${key}=${value}`)
        .join(" ");

      // Set lang and meta separately (remark separates them)
      node.lang = result.lang;
      node.meta = metaString || null;

      modified = true;
    }
  });

  // Convert the tree back to markdown
  const newSource = unified()
    .use(remarkStringify, {
      fences: true,
      fence: "`",
      listItemIndent: "one",
      bullet: "-", // Use dash for unordered lists
      bulletOrdered: ".",
      emphasis: "*",
      strong: "*",
      rule: "-",
    })
    .stringify(tree);

  return {
    source: newSource,
    blocks,
    modified,
  };
}

/**
 * Async version of unist-util-visit's visit function
 * This allows us to use async walker functions
 */
async function visitAsync(
  tree: Root,
  type: string,
  visitor: (node: any, index: number | undefined, parent: any) => Promise<void> // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  const visit = async (node: any, index?: number, parent?: any): Promise<void> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (node.type === type) {
      await visitor(node, index, parent);
    }

    if (node.children) {
      // Iterate backwards to handle splicing correctly
      // This way, splicing doesn't affect the indices of unvisited children
      for (let i = node.children.length - 1; i >= 0; i--) {
        await visit(node.children[i], i, node);
      }
    }
  };

  await visit(tree);
}
