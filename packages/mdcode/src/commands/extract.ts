import { lstat, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { styleText } from "node:util";

import { parse, updateInfoStrings } from "../parser.ts";
import { isMissing } from "../paths.ts";
import type { RegionEdit } from "../region.ts";
import { read as readRegion, spliceRegions, wrapRegion } from "../region.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { blockError, BlockFailure, blockRef, CommandError } from "../result.ts";
import type { Block, FilterOptions } from "../types.ts";
import { writeAtomic } from "../write.ts";
import type { ExtractGroup, ExtractItem } from "./validate.ts";
import { planExtract } from "./validate.ts";

export type ExtractOptions = {
  source: string;
  filter?: FilterOptions;
  /** Directory file= paths resolve against and must stay inside (default: the current directory). */
  outputDir?: string;
  /**
   * Also extract blocks without file=: each is written as `block-<N>.<ext>` and
   * gets that file= in `updatedSource`. Without it, those blocks are skipped.
   */
  updateSource?: boolean;
  force?: boolean;
  /**
   * Write nothing; compare each target with what extract would write instead.
   * Every block whose target would change gets an out_of_sync error.
   */
  check?: boolean;
};

/** What extract did, or with `check` would do, with one target file. */
export type ExtractTarget = {
  /** The file= path joined onto outputDir. */
  path: string;
  /**
   * `written`: created or overwritten whole. `spliced`: regions replaced or appended
   * in an existing file. `skipped`: left untouched; `reason` says why.
   * `unchanged`: with `check` only, the file already holds what extract would write.
   * With `check`, nothing is written: the other actions say what extract would do.
   */
  action: "written" | "spliced" | "skipped" | "unchanged";
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
  /**
   * One extract_skipped error per skipped target. With `check`, one
   * out_of_sync error per block whose target would change.
   */
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
    force = false,
    check = false,
  } = options;

  if (check && updateSource) {
    throw new CommandError("invalid_usage", "Cannot use --check and --update-source together: --check writes nothing");
  }

  // A block without file= is written only when --update-source names it in
  // the markdown, so no extracted file is left linked to nothing.
  const blocks = parse({ source, filter }).filter(block => updateSource || block.meta.file !== undefined);

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
  for (const group of groups) {
    const { display, items } = group;
    // With check, the same plan is made and compared instead of written.
    const planned = await planTarget(group, force);

    if ("refusal" in planned) {
      record(display, "skipped", items, planned.refusal);
      continue;
    }

    if (check) {
      const drift = driftErrors(group, planned);

      record(display, drift.length === 0 ? "unchanged" : planned.action, items);
      errors.push(...drift);
      continue;
    }

    await mkdir(dirname(display), { recursive: true });
    await writeAtomic(display, planned.content, planned.mode);
    record(display, planned.action, items);
  }

  const result: ExtractResult = { targets, errors };

  if (updateSource && metadataUpdates.size > 0) {
    result.updatedSource = updateInfoStrings(source, metadataUpdates);
  }

  return result;
}

/** Human-readable progress lines for an extract result, as the CLI prints them on stderr. */
export function formatExtract({ targets }: Pick<ExtractResult, "targets">, options: { updateSource?: boolean; }): Array<string> {
  if (targets.length === 0) {
    return [ styleText("yellow", options.updateSource ? "No code blocks found to extract." : "No code blocks with file metadata found.") ];
  }

  return targets.map(({ path, action, blocks, regions, reason }) => {
    if (action === "unchanged") {
      return styleText("green", `✓ In sync: ${path}`);
    }

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

const WHOLE_FILE_EXISTS = "exists and has block(s) without region=. Use --force to overwrite.";

/** What extract would write to one target, or why it would leave the target alone. */
type PlannedTarget =
  | { refusal: string; }
  | {
    action: "written" | "spliced";
    content: string;
    /** The target's text before extract, or undefined when it does not exist yet. */
    before: string | undefined;
    /** Whether the target already holds exactly these bytes, so extract would change nothing. */
    unchanged: boolean;
    /** The existing file's mode, kept when it is replaced. */
    mode: number | undefined;
  };

/**
 * Work out what extract would write to one target, without writing it. An
 * existing whole-file target is only replaced with `overwrite` (--force).
 */
async function planTarget({ display, items }: ExtractGroup, overwrite: boolean): Promise<PlannedTarget> {
  const regions = items[0]!.block.meta.region !== undefined;
  const existing = await stat(display).catch(rethrowUnlessMissing);

  if (existing !== undefined && regions) {
    return planSplice(display, items, existing.mode);
  }

  if (existing !== undefined && !overwrite) {
    return { refusal: WHOLE_FILE_EXISTS };
  }

  // writeAtomic() would replace the link with a regular file; never change what a link means.
  if (existing !== undefined && (await lstat(display)).isSymbolicLink()) {
    return { refusal: "target is a symlink; refusing to overwrite it" };
  }

  let before: string | undefined;

  if (existing !== undefined) {
    try {
      // As for a splice: a target that is not UTF-8 is refused, not silently re-encoded.
      before = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(display));
    }
    catch {
      return { refusal: "not valid UTF-8" };
    }
  }

  const content = regions
    ? items.map(({ block }) => wrapRegion(block.lang, block.meta.region!, block.code)).join("\n")
    : keepFinalNewline(items[0]!.block.code, before);

  // before was decoded strictly, so equal text is equal bytes.
  return { action: "written", content, before, unchanged: before === content, mode: existing?.mode };
}

/**
 * A whole-file block's code as the new content of a file that held `before`.
 * A block's code never ends with the newline that ends its last line, so an
 * overwritten file keeps the final newline (LF or CRLF) it had; a new file is
 * written as the code stands.
 */
function keepFinalNewline(code: string, before: string | undefined): string {
  const eol = before === undefined ? "" : /\r?\n$/.exec(before)?.[0] ?? "";
  return code === "" || code.endsWith("\n") ? code : code + eol;
}

/**
 * One out_of_sync error per block whose part of the target would change. For
 * region targets, that is each region whose body differs or is missing.
 */
function driftErrors({ display, items }: ExtractGroup, planned: Exclude<PlannedTarget, { refusal: string; }>): Array<ResultError> {
  const { before, content } = planned;

  if (planned.unchanged) {
    return [];
  }

  const drift = (block: Block, message: string): ResultError => blockError(block, { code: "out_of_sync", message, path: display });

  if (before === undefined) {
    return items.map(({ block }) => drift(block, `${display} does not exist; extract would create it`));
  }

  // Text that differs only after its last line is the commonest drift, and the hardest to see.
  const newlinesOnly = before.replace(/\n+$/, "") === content.replace(/\n+$/, "") ? " (only trailing newlines differ)" : "";

  if (items[0]!.block.meta.region === undefined) {
    return [ drift(items[0]!.block, `${display} differs from this block${newlinesOnly}; extract would overwrite it`) ];
  }

  const changed = items.flatMap(({ block }) => {
    const name = block.meta.region!;
    const was = readRegion(before, name, block.lang);

    if (!was.found) {
      return [ drift(block, `region ${name} is not in ${display}; extract would append it`) ];
    }

    return was.content === readRegion(content, name, block.lang).content
      ? []
      : [ drift(block, `region ${name} in ${display} differs from this block; extract would replace it`) ];
  });

  // The regions match, so the splice changes the text around them, such as the file's last newline.
  return changed.length > 0
    ? changed
    : items.map(({ block }) => drift(block, `${display} would change around region ${block.meta.region!}${newlinesOnly}; extract would rewrite it`));
}

/**
 * Splice every region block for one existing file in a single pass, appending
 * any region the file does not already declare. Returns the new text, or why
 * extract would leave the file untouched.
 */
async function planSplice(target: string, items: Array<ExtractItem>, mode: number): Promise<PlannedTarget> {
  // rename() would replace a symlink with a regular file rather than write
  // through it; refuse outright so the link's meaning is never silently changed.
  if ((await lstat(target)).isSymbolicLink()) {
    return { refusal: "target is a symlink; refusing to splice through it" };
  }

  const raw = await readFile(target);
  let existing: string;

  try {
    // A lossy decode would rewrite every invalid byte in the file as U+FFFD,
    // even though only one region was asked for.
    existing = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  }
  catch {
    return { refusal: "not valid UTF-8" };
  }

  const edits = new Map<string, RegionEdit>(
    items.map(({ block }) => [ block.meta.region!, { code: block.code, lang: block.lang }])
  );
  const result = spliceRegions(existing, edits);

  if (!result.ok) {
    return { refusal: spliceRefusal(result) };
  }

  let content = result.content;

  // A region the markdown declares but the file lacks is appended rather than
  // dropped, so the block is not silently lost.
  for (const name of result.unmatched) {
    const { block } = items.find(item => item.block.meta.region === name)!;
    const separator = content.trim() === "" ? "" : "\n";
    content = `${content.replace(/\n*$/, content.trim() === "" ? "" : "\n")}${separator}${wrapRegion(block.lang, name, block.code)}`;
  }

  // existing was decoded strictly, so equal text is equal bytes.
  return { action: "spliced", content, before: existing, unchanged: existing === content, mode };
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
