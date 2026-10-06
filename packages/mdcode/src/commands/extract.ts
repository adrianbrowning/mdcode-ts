import { lstat, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { styleText } from "node:util";

import { parse, updateInfoStrings } from "../parser.ts";
import { isMissing } from "../paths.ts";
import type { RegionEdit } from "../region.ts";
import { spliceRegions, wrapRegion } from "../region.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { BlockFailure, blockRef } from "../result.ts";
import type { FilterOptions } from "../types.ts";
import { writeAtomic } from "../write.ts";
import type { ExtractItem } from "./validate.ts";
import { planExtract } from "./validate.ts";

export type ExtractOptions = {
  source: string;
  filter?: FilterOptions;
  /** Directory file= paths resolve against and must stay inside (default: the current directory). */
  outputDir?: string;
  updateSource?: boolean;
  ignoreAnonymous?: boolean;
  force?: boolean;
};

/** What extract did with one target file. */
export type ExtractTarget = {
  /** The file= path joined onto outputDir. */
  path: string;
  /**
   * `written`: created or overwritten whole. `spliced`: regions replaced or appended
   * in an existing file. `skipped`: left untouched; `reason` says why.
   */
  action: "written" | "spliced" | "skipped";
  /** The blocks that target this file, in document order. */
  blocks: Array<BlockRef>;
  /** The region= names written, when the blocks are region blocks. */
  regions: Array<string>;
  reason?: string;
};

export type ExtractResult = {
  /** One entry per target file, in the order they were processed. */
  targets: Array<ExtractTarget>;
  /** The markdown with file= added to anonymous blocks; only with updateSource, and only when something was added. */
  updatedSource?: string;
  /** One extract_skipped error per skipped target. */
  errors: Array<ResultError>;
};

/**
 * Extract code blocks to files based on their metadata. Every target is
 * validated before any is written; see validate().
 * @throws {MetadataError} when the document's metadata is invalid
 * @throws {BlockFailure} with an error per block that breaks a mapping rule (unsafe_path, ambiguous_target, malformed_region, duplicate_region, region_language_mismatch); nothing is written
 */
export async function extract(options: ExtractOptions): Promise<ExtractResult> {
  const {
    source,
    filter,
    outputDir = ".",
    updateSource = false,
    ignoreAnonymous = false,
    force = false,
  } = options;

  // Validate mutual exclusivity
  if (updateSource && ignoreAnonymous) {
    throw new Error("Cannot use --update-source and --ignore-anonymous together");
  }

  let blocks = parse({ source, filter });

  if (ignoreAnonymous) {
    blocks = blocks.filter(b => b.meta.file);
  }

  // Every target is checked before anything is written, so one hostile or
  // ambiguous file= cannot ride along with a batch of legitimate ones.
  const { groups, errors: problems } = await planExtract(source, blocks, outputDir);

  if (problems.length > 0) {
    throw new BlockFailure(problems);
  }

  // Generated filenames for anonymous blocks whose file was written (for --update-source)
  const metadataUpdates = new Map<number, Record<string, string>>();

  const targets: Array<ExtractTarget> = [];
  const errors: Array<ResultError> = [];

  const record = (path: string, action: ExtractTarget["action"], items: Array<ExtractItem>, reason?: string): void => {
    const regions = items.flatMap(({ block }) => block.meta.region === undefined ? [] : [ block.meta.region ]);
    targets.push({ path, action, blocks: items.map(({ block }) => blockRef(block)), regions, ...(reason === undefined ? {} : { reason }) });

    if (reason !== undefined) {
      errors.push({ code: "extract_skipped", message: reason, path });
      return;
    }

    // A skipped block keeps its info string: a file= naming a file extract did
    // not write would make a later update read someone else's file into it.
    for (const { index, generated } of items) {
      if (updateSource && generated !== undefined && index >= 0) {
        metadataUpdates.set(index, { file: generated });
      }
    }
  };

  // Validation leaves two shapes: one whole-file block, or region blocks only.
  for (const { display, items } of groups) {
    const regions = items[0]!.block.meta.region !== undefined;
    const existing = await stat(display).catch(rethrowUnlessMissing);

    if (existing !== undefined && regions) {
      const refusal = await spliceInPlace(display, items);

      record(display, refusal === undefined ? "spliced" : "skipped", items, refusal);
      continue;
    }

    if (existing !== undefined && !force) {
      record(display, "skipped", items, "exists and has block(s) without region=. Use --force to overwrite.");
      continue;
    }

    const content = regions
      ? items.map(({ block }) => wrapRegion(block.lang, block.meta.region!, block.code)).join("\n")
      : items[0]!.block.code;

    await mkdir(dirname(display), { recursive: true });
    await writeAtomic(display, content, existing?.mode);
    record(display, "written", items);
  }

  const result: ExtractResult = { targets, errors };

  if (updateSource && metadataUpdates.size > 0) {
    result.updatedSource = updateInfoStrings(source, metadataUpdates);
  }

  return result;
}

/** Human-readable progress lines for an extract result, as the CLI prints them on stderr. */
export function formatExtract({ targets }: Pick<ExtractResult, "targets">, options: { ignoreAnonymous?: boolean; }): Array<string> {
  if (targets.length === 0) {
    return [ styleText("yellow", options.ignoreAnonymous ? "No code blocks with file metadata found." : "No code blocks found to extract.") ];
  }

  return targets.map(({ path, action, blocks, regions, reason }) => {
    if (action === "skipped") {
      return styleText("yellow", `⚠ Skipped ${path}: ${reason}`);
    }

    if (action === "spliced") {
      return styleText("green", `✓ Updated ${blocks.length} region(s) in ${path}`);
    }

    const what = regions.length > 1 ? `${regions.length} region(s) to` : "to";
    return styleText("green", `✓ Extracted ${what} ${path}`);
  });
}

/**
 * Splice every region block for one existing file in a single pass, appending
 * any region the file does not already declare. Returns why the file was left
 * untouched, or undefined when it was written.
 */
async function spliceInPlace(target: string, items: Array<ExtractItem>): Promise<string | undefined> {
  // rename() would replace a symlink with a regular file rather than write
  // through it; refuse outright so the link's meaning is never silently changed.
  if ((await lstat(target)).isSymbolicLink()) {
    return "target is a symlink; refusing to splice through it";
  }

  const raw = await readFile(target);
  let existing: string;

  try {
    // A lossy decode would rewrite every invalid byte in the file as U+FFFD,
    // even though only one region was asked for.
    existing = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  }
  catch {
    return "not valid UTF-8";
  }

  const edits = new Map<string, RegionEdit>(
    items.map(({ block }) => [ block.meta.region!, { code: block.code, lang: block.lang }])
  );
  const result = spliceRegions(existing, edits);

  if (!result.ok) {
    return spliceRefusal(result);
  }

  let content = result.content;

  // A region the markdown declares but the file lacks is appended rather than
  // dropped, so the block is not silently lost.
  for (const name of result.unmatched) {
    const { block } = items.find(item => item.block.meta.region === name)!;
    const separator = content.trim() === "" ? "" : "\n";
    content = `${content.replace(/\n*$/, content.trim() === "" ? "" : "\n")}${separator}${wrapRegion(block.lang, name, block.code)}`;
  }

  await writeAtomic(target, content, (await stat(target)).mode);
  return undefined;
}

/** Explain, in one clause, why a splice was refused: the file changed after validation. */
function spliceRefusal(result: { unclosed: Array<string>; duplicated: Array<string>; overlapping: Array<string>; }): string {
  if (result.unclosed.length > 0) {
    return `region ${result.unclosed.join(", ")} is never closed`;
  }
  if (result.duplicated.length > 0) {
    return `region ${result.duplicated.join(", ")} appears more than once`;
  }

  return `regions ${result.overlapping.join(", ")} overlap`;
}

/** "Not there yet" is undefined; anything else is a real failure to surface. */
function rethrowUnlessMissing(error: unknown): undefined {
  if (isMissing(error)) {
    return undefined;
  }
  throw error;
}
