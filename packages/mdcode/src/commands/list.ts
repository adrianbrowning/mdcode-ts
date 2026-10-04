import { styleText } from "node:util";

import { formatMetaValue } from "../metadata.ts";
import { parse } from "../parser.ts";
import type { BlockRef } from "../result.ts";
import { blockRef } from "../result.ts";
import type { FilterOptions } from "../types.ts";

export interface ListOptions {
  source: string;
  filter?: FilterOptions;
}

export interface ListedBlock extends BlockRef {
  /** 1-based line of the closing fence. */
  endLine: number;
  lang: string;
  meta: Record<string, string>;
  code: string;
}

export interface ListResult {
  blocks: Array<ListedBlock>;
}

/**
 * List code blocks with their metadata, code, and location
 * @throws {MetadataError} when the document's metadata is invalid
 */
export function list(options: ListOptions): ListResult {
  const blocks = parse(options).map(block => ({
    ...blockRef(block),
    endLine: block.position?.endLine ?? 0,
    lang: block.lang,
    meta: block.meta,
    code: block.code,
  }));

  return { blocks };
}

/** Human-readable listing, as `mdcode list` prints it without --json. */
export function formatList({ blocks }: ListResult): string {
  if (blocks.length === 0) {
    return styleText("yellow", "No code blocks found.");
  }

  const output: Array<string> = [];

  output.push(styleText([ "bold", "cyan" ], `Found ${blocks.length} code block(s):\n`));

  blocks.forEach((block, index) => {
    const lang = block.lang || "(no language)";
    output.push(styleText("bold", `[${index + 1}] ${block.name === null ? lang : `${block.name} (${lang})`}`));

    if (Object.keys(block.meta).length > 0) {
      const metaStr = Object.entries(block.meta)
        .map(([ key, value ]) => `${styleText("green", key)}=${formatMetaValue(value)}`)
        .join(" ");
      output.push(`  Metadata: ${metaStr}`);
    }

    // Code preview: the first 3 lines
    const lines = block.code.split("\n");
    const preview = lines.slice(0, 3).join("\n");

    output.push(styleText("gray", "  Preview:"));
    output.push(styleText("gray", "  " + preview.split("\n").join("\n  ")));

    if (lines.length > 3) {
      output.push(styleText("gray", `  ... (${lines.length - 3} more lines)`));
    }

    output.push("");
  });

  return output.join("\n");
}
