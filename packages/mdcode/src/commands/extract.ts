import { chmod, lstat, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { styleText } from "node:util";

import { parse, updateInfoStrings } from "../parser.ts";
import { canonicalPath, resolveContained, UnsafePathError } from "../paths.ts";
import type { RegionEdit } from "../region.ts";
import { isValidRegionName, spliceRegions, wrapRegion } from "../region.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { BlockFailure, blockError, blockRef } from "../result.ts";
import type { Block, FilterOptions } from "../types.ts";

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

type Item = {
  block: Block;
  index: number;
  /** The block-N name extract made up, when the block has no file=. */
  generated?: string;
};

type TargetGroup = {
  /** Path as written in the markdown, for messages. */
  display: string;
  items: Array<Item>;
};

/**
 * Extract code blocks to files based on their metadata
 * @throws {MetadataError} when the document's metadata is invalid
 * @throws {BlockFailure} with an unsafe_path error per file= that is absolute or leads outside outputDir; nothing is written
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

  // Parse all blocks (without filter for tracking indices)
  const allBlocks = parse({ source });

  // Apply filter if provided
  let blocks = filter ? parse({ source, filter }) : allBlocks;

  // Filter anonymous blocks if requested
  if (ignoreAnonymous) {
    blocks = blocks.filter(b => b.meta.file);
  }

  // Generated filenames for anonymous blocks whose file was written (for --update-source)
  const metadataUpdates = new Map<number, Record<string, string>>();

  const targets: Array<ExtractTarget> = [];
  const errors: Array<ResultError> = [];

  const record = (path: string, action: ExtractTarget["action"], items: Array<Item>, reason?: string): void => {
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

  // Group blocks by the file they resolve to. Keying on the resolved path means
  // two spellings of one file (`./src/a.ts` and a symlinked `./link/a.ts`) form
  // a single group and produce a single write, rather than racing each other.
  const groups = new Map<string, TargetGroup>();
  // Every target is checked before anything is written, so one hostile file=
  // cannot ride along with a batch of legitimate ones.
  const unsafe: Array<ResultError> = [];

  for (const block of blocks) {
    const index = allBlocks.findIndex(b => b.position?.start === block.position?.start);

    // extract writes files; a block asking for a marker-only skeleton has no
    // file content to contribute, so it is not an extraction target.
    if (block.meta.outline === "true") {
      continue;
    }

    let declared = block.meta.file;
    let generated: string | undefined;

    if (declared === undefined) {
      generated = `block-${index + 1}${getExtensionForLang(block.lang)}`;
      declared = generated;
    }

    try {
      // Even a generated name, which has no directory part, can be an existing symlink that leads out.
      await resolveContained(declared, outputDir);
    }
    catch (error: unknown) {
      if (!(error instanceof UnsafePathError)) {
        throw error;
      }
      unsafe.push(blockError(block, { code: "unsafe_path", message: error.message, path: declared }));
      continue;
    }

    const display = join(outputDir, declared);

    if (block.meta.region !== undefined && !isValidRegionName(block.meta.region)) {
      record(display, "skipped", [{ block, index, generated }], `invalid region name ${JSON.stringify(block.meta.region)}`);
      continue;
    }

    const key = await resolveTarget(display);

    const group = groups.get(key);

    if (group) {
      group.items.push({ block, index, generated });
    }
    else {
      groups.set(key, { display, items: [{ block, index, generated }] });
    }
  }

  if (unsafe.length > 0) {
    throw new BlockFailure(unsafe);
  }

  for (const [ , { display, items }] of groups) {
    const withRegion = items.filter(item => item.block.meta.region !== undefined);
    const existing = await stat(display).catch(rethrowUnlessMissing);

    // A group mixing whole-file and region blocks has no coherent result: the
    // whole-file block would erase the very region the other block splices.
    if (withRegion.length > 0 && withRegion.length !== items.length) {
      record(display, "skipped", items, "blocks for this file mix region= with whole-file blocks");
      continue;
    }

    // Several blocks each claiming to be the whole file only agree if they are
    // byte-identical; otherwise picking one would silently discard the others.
    if (withRegion.length === 0 && new Set(items.map(item => item.block.code)).size > 1) {
      record(display, "skipped", items, `${items.length} whole-file blocks disagree about its contents`);
      continue;
    }

    // Two blocks naming one region cannot both land: a splice would keep only
    // the last body, and a fresh file would get two markers that every later
    // splice refuses as duplicated.
    const regionNames = withRegion.map(item => item.block.meta.region!);

    if (new Set(regionNames).size !== regionNames.length) {
      record(display, "skipped", items, "two blocks for this file declare the same region=");
      continue;
    }

    if (existing !== undefined && withRegion.length === items.length) {
      const refusal = await spliceInPlace(display, items);

      record(display, refusal === undefined ? "spliced" : "skipped", items, refusal);
      continue;
    }

    if (existing !== undefined && !force) {
      record(display, "skipped", items, "exists and has block(s) without region=. Use --force to overwrite.");
      continue;
    }

    const content = withRegion.length === items.length
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
async function spliceInPlace(target: string, items: Array<Item>): Promise<string | undefined> {
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

/** Explain, in one clause, why a splice was refused. */
function spliceRefusal(result: { unclosed: Array<string>; duplicated: Array<string>; overlapping: Array<string>; }): string {
  if (result.unclosed.length > 0) {
    return `region ${result.unclosed.join(", ")} is never closed`;
  }
  if (result.duplicated.length > 0) {
    return `region ${result.duplicated.join(", ")} appears more than once`;
  }

  return `regions ${result.overlapping.join(", ")} overlap`;
}

/**
 * Write via a sibling temp file and rename, so an interrupted or out-of-space
 * write cannot leave a hand-written source file truncated. rename() drops the
 * destination's permissions, so they are copied over first.
 *
 * Tradeoff: rename() replaces the file rather than rewriting it, so the target
 * gets a new inode. Hard links to the old file keep the old contents, and
 * extended attributes and ACLs are not carried over. Both are accepted because
 * the alternative — truncate and rewrite in place — can leave a source file
 * half-written, which is worse. It also means a symlinked target would be
 * replaced rather than followed, which is why the splice path refuses symlinks
 * outright instead of relying on this.
 */
async function writeAtomic(target: string, content: string, mode?: number): Promise<void> {
  const temp = join(dirname(target), `.${basename(target)}.mdcode-${process.pid}`);

  await writeFile(temp, content, "utf-8");

  if (mode !== undefined) {
    await chmod(temp, mode & 0o7777);
  }

  await rename(temp, target);
}

/** ENOENT means "not there yet"; anything else is a real failure to surface. */
function rethrowUnlessMissing(error: unknown): undefined {
  if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    return undefined;
  }
  throw error;
}

/**
 * Canonical identity for a target: the realpath of its directory plus its own
 * name, so aliased spellings collapse to one key without the file, or
 * directories still to be created, having to exist. The file itself is not
 * followed: a symlinked target is its own key.
 */
async function resolveTarget(path: string): Promise<string> {
  const absolute = resolve(path);
  return join(await canonicalPath(dirname(absolute)), basename(absolute));
}

/**
 * Get file extension based on language
 */
function getExtensionForLang(lang: string): string {
  const extensions: Record<string, string> = {
    js: ".js",
    javascript: ".js",
    ts: ".ts",
    typescript: ".ts",
    py: ".py",
    python: ".py",
    go: ".go",
    rust: ".rs",
    rs: ".rs",
    java: ".java",
    c: ".c",
    cpp: ".cpp",
    "c++": ".cpp",
    cs: ".cs",
    "c#": ".cs",
    rb: ".rb",
    ruby: ".rb",
    php: ".php",
    swift: ".swift",
    kt: ".kt",
    kotlin: ".kt",
    sh: ".sh",
    bash: ".sh",
    zsh: ".sh",
    fish: ".fish",
    html: ".html",
    css: ".css",
    scss: ".scss",
    sass: ".sass",
    json: ".json",
    yaml: ".yaml",
    yml: ".yml",
    xml: ".xml",
    sql: ".sql",
    md: ".md",
    markdown: ".md",
    txt: ".txt",
  };

  return extensions[lang.toLowerCase()] || ".txt";
}
