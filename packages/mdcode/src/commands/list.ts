import { styleText } from "node:util";

import { parse } from "../parser.ts";
import type { Block, FilterOptions } from "../types.ts";

export interface ListOptions {
  source: string;
  filter?: FilterOptions;
  json?: boolean;
}

/**
 * List all code blocks with their metadata
 */
export function list(options: ListOptions): string {
  const { source, filter, json } = options;
  const blocks = parse({ source, filter });

  if (json) {
    // JSON output: one object per line
    return blocks
      .map((block) => {
        const obj: Record<string, string> = { lang: block.lang };
        // Spread metadata at top level
        for (const [ key, value ] of Object.entries(block.meta)) {
          obj[key] = value;
        }
        return JSON.stringify(obj);
      })
      .join("\n");
  }

  // Default text output
  if (blocks.length === 0) {
    return styleText("yellow", "No code blocks found.");
  }

  const output: Array<string> = [];

  output.push(styleText([ "bold", "cyan" ], `Found ${blocks.length} code block(s):\n`));

  blocks.forEach((block, index) => {
    output.push(styleText("bold", `[${index + 1}] ${block.lang || "(no language)"}`));

    // Display metadata
    if (Object.keys(block.meta).length > 0) {
      const metaStr = Object.entries(block.meta)
        .map(([ key, value ]) => `${styleText("green", key)}=${value}`)
        .join(" ");
      output.push(`  Metadata: ${metaStr}`);
    }

    // Display code preview (first 3 lines)
    const lines = block.code.split("\n");
    const preview = lines.slice(0, 3).join("\n");
    const hasMore = lines.length > 3;

    output.push(styleText("gray", "  Preview:"));
    output.push(styleText("gray", "  " + preview.split("\n").join("\n  ")));

    if (hasMore) {
      output.push(styleText("gray", `  ... (${lines.length - 3} more lines)`));
    }

    output.push(""); // Empty line between blocks
  });

  return output.join("\n");
}

/**
 * Format a single block for display
 */
export function formatBlock(block: Block): string {
  const output: Array<string> = [];

  // Header
  output.push(styleText([ "bold", "cyan" ], `Language: ${block.lang || "(none)"}`));

  // Metadata
  if (Object.keys(block.meta).length > 0) {
    output.push(styleText("bold", "Metadata:"));
    for (const [ key, value ] of Object.entries(block.meta)) {
      output.push(`  ${styleText("green", key)}: ${value}`);
    }
  }

  // Code
  output.push(styleText("bold", "Code:"));
  output.push(styleText("gray", block.code));

  return output.join("\n");
}
