/**
 * The mapping rules between code blocks and files, checked before anything is
 * written. extract and update apply them themselves; validate() reports every
 * break of them without writing anything.
 */
import { lstat, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { outline } from "../outline.ts";
import { parse } from "../parser.ts";
import { canonicalPath, isMissing, resolveContained, UnsafePathError } from "../paths.ts";
import type { RegionSpliceResult } from "../region.ts";
import { hasRegionMarker, isValidRegionName, read as readRegion, regionMarker, spliceRegions } from "../region.ts";
import type { BlockRef, ErrorCode, ResultError } from "../result.ts";
import { blockError, blockRef } from "../result.ts";
import type { Block, FilterOptions } from "../types.ts";

/** The command a document is validated for: extract writes file= targets, update reads file= sources. */
export type ValidateOperation = "extract" | "update";

export interface ValidateOptions {
  source: string;
  operation: ValidateOperation;
  filter?: FilterOptions;
  /**
   * Directory file= paths resolve against and must stay inside: extract's
   * outputDir, or update's basePath (default: the current directory).
   */
  base?: string;
  /** Require file= on every selected block. */
  strict?: boolean;
  /** extract only: leave out blocks without file=, as extract does with ignoreAnonymous. */
  ignoreAnonymous?: boolean;
}

export interface ValidatedBlock extends BlockRef {
  lang: string;
  /**
   * The file the block maps to: for extract, the target joined onto the base,
   * generated for a block without file=; for update, its file= as written.
   * null when the block maps to no file.
   */
  path: string | null;
  region?: string;
  /** Whether no error concerns this block. */
  valid: boolean;
}

export interface ValidateResult {
  /** One entry per selected block, in document order. */
  blocks: Array<ValidatedBlock>;
  /** Every rule a selected block breaks, in document order. */
  errors: Array<ResultError>;
}

/**
 * Check how the selected blocks map onto files for one operation, reading but
 * never writing.
 * @throws {MetadataError} when the document's metadata is invalid
 */
export async function validate(options: ValidateOptions): Promise<ValidateResult> {
  const { source, operation, filter, base = ".", strict = false, ignoreAnonymous = false } = options;
  let blocks = parse({ source, filter });

  if (operation === "extract" && ignoreAnonymous) {
    blocks = blocks.filter(block => block.meta.file !== undefined);
  }

  const errors: Array<ResultError> = [];
  const paths = new Map<Block, string>();

  if (strict) {
    for (const block of blocks.filter(block => block.meta.file === undefined)) {
      errors.push(blockError(block, { code: "missing_file_metadata", message: "has no file=; --strict needs every selected block to name its file" }));
    }
  }

  if (operation === "extract") {
    const plan = await planExtract(source, blocks, base);

    for (const { display, items } of plan.groups) {
      for (const { block } of items) paths.set(block, display);
    }
    errors.push(...plan.errors);
  }
  else {
    for (const block of blocks.filter(block => block.meta.file !== undefined)) {
      paths.set(block, block.meta.file!);

      try {
        await readSource(block, base);
      }
      catch (error: unknown) {
        errors.push(sourceError(block, error));
      }
    }
  }

  errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));

  return {
    blocks: blocks.map(block => {
      const ref = blockRef(block);
      const region = block.meta.region;

      return {
        ...ref,
        lang: block.lang,
        path: paths.get(block) ?? null,
        ...(region === undefined ? {} : { region }),
        valid: !errors.some(error => error.line === ref.line),
      };
    }),
    errors,
  };
}

/** A file= that update cannot read, or cannot read unambiguously; `code` names the rule. */
export class SourceError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "SourceError";
    this.code = code;
  }
}

/** Where update read a block's code from. */
export type SourceRead = {
  file: string;
  /** Set when only this region of the file was read. */
  region?: string;
  /** Set when the file was outlined (region bodies removed). */
  outline?: true;
};

/**
 * Read the code a block's file= gives it: the whole file, one region of it, or
 * its outline. The region must be opened exactly once, in the block's language,
 * and closed.
 * @throws {SourceError} for every failure, whatever its cause
 */
export async function readSource(block: Block, basePath: string): Promise<{ content: string; read: SourceRead; }> {
  const file = block.meta.file!;
  let content: string;

  try {
    // Checked before anything is read: untrusted markdown must not pull in arbitrary files.
    content = await readFile(await resolveContained(file, basePath), "utf-8");
  }
  catch (error: unknown) {
    if (error instanceof UnsafePathError) {
      throw new SourceError("unsafe_path", error.message);
    }

    throw new SourceError("read_failed", isMissing(error) ? `${file} does not exist in ${resolve(basePath)}; create it or correct file=` : messageOf(error));
  }

  if (block.meta.outline === "true") {
    let outlined: ReturnType<typeof outline>;

    try {
      outlined = outline(content);
    }
    catch (error: unknown) {
      throw new SourceError("malformed_region", `${messageOf(error)} in ${file}`);
    }

    if (!outlined.found) {
      throw new SourceError("missing_region", `outline=true specified but no region markers found in ${file}`);
    }

    return { content: outlined.content, read: { file, outline: true } };
  }

  const region = block.meta.region;

  if (region === undefined) {
    return { content, read: { file } };
  }

  if (!isValidRegionName(region)) {
    throw new SourceError("malformed_region", invalidRegionName(region));
  }

  // A dry-run splice locates the region exactly as extract's splice would.
  const located = spliceRegions(content, new Map([[ region, { code: "", lang: block.lang }]]));
  const problem = regionProblem(located, content, region, block.lang, file)
    ?? (located.unmatched.length > 0 ? { code: "missing_region" as const, message: `region ${region} not found in ${file}` } : undefined);

  if (problem) {
    throw new SourceError(problem.code, problem.message);
  }

  return { content: readRegion(content, region, block.lang).content, read: { file, region } };
}

/** The contract error for a failed readSource(). */
function sourceError(block: Block, error: unknown): ResultError {
  const code = error instanceof SourceError ? error.code : "read_failed";
  return blockError(block, { code, message: messageOf(error), path: block.meta.file! });
}

/** One block extract would write. */
export type ExtractItem = {
  block: Block;
  /** The block's index among all blocks in the document. */
  index: number;
  /** The block-N name extract made up, when the block has no file=. */
  generated?: string;
};

/** The blocks extract would write to one file. */
export type ExtractGroup = {
  /** The file= path joined onto outputDir, for messages and writing. */
  display: string;
  items: Array<ExtractItem>;
};

/**
 * Group the blocks extract would write by the file they resolve to, and check
 * every group against the mapping rules. Keying on the resolved path means two
 * spellings of one file (`./src/a.ts` and a symlinked `./link/a.ts`) form one
 * group. outline=true blocks describe shape, not content, so they write nothing.
 */
export async function planExtract(source: string, blocks: Array<Block>, outputDir: string): Promise<{ groups: Array<ExtractGroup>; errors: Array<ResultError>; }> {
  const allBlocks = parse({ source });
  const groups = new Map<string, ExtractGroup>();
  const errors: Array<ResultError> = [];

  for (const block of blocks) {
    if (block.meta.outline === "true") {
      continue;
    }

    const index = allBlocks.findIndex(b => b.position?.start === block.position?.start);
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
      errors.push(blockError(block, { code: "unsafe_path", message: error.message, path: declared }));
      continue;
    }

    const display = join(outputDir, declared);
    const region = block.meta.region;

    if (region !== undefined && !isValidRegionName(region)) {
      errors.push(blockError(block, { code: "malformed_region", message: invalidRegionName(region), path: display }));
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

  for (const group of groups.values()) {
    errors.push(...await checkTarget(group));
  }

  return { groups: [ ...groups.values() ], errors };
}

/**
 * Check one extract target. Blocks may share a target only when each declares a
 * distinct region= and all are in one language; any other sharing has no single
 * right result. Region blocks for an existing file must find their regions
 * well formed there.
 */
async function checkTarget({ display, items }: ExtractGroup): Promise<Array<ResultError>> {
  const conflict = targetConflict(items);

  if (conflict !== undefined) {
    return items.map(({ block }) => blockError(block, { code: "ambiguous_target", message: conflict, path: display }));
  }

  if (items[0]!.block.meta.region === undefined) {
    return [];
  }

  const existing = await readExisting(display);

  if (existing === undefined) {
    return [];
  }

  const located = spliceRegions(existing, new Map(items.map(({ block }) => [ block.meta.region!, { code: block.code, lang: block.lang }])));

  return items.flatMap(({ block }) => {
    // A region the file lacks is appended, so only a marker in the wrong syntax is a problem.
    const problem = regionProblem(located, existing, block.meta.region!, block.lang, display);
    return problem ? [ blockError(block, { ...problem, path: display }) ] : [];
  });
}

/** Why several blocks cannot share one target, or undefined when they can. */
function targetConflict(items: Array<ExtractItem>): string | undefined {
  if (items.length < 2) {
    return undefined;
  }

  const lines = `blocks on lines ${items.map(({ block }) => block.position?.line ?? 0).join(", ")} all write this file`;
  const regions = items.map(({ block }) => block.meta.region);
  const langs = [ ...new Set(items.map(({ block }) => block.lang.toLowerCase())) ];

  if (regions.includes(undefined)) {
    return `${lines}, but not every one declares region=; give each block a region= of its own, or a file of its own`;
  }

  if (new Set(regions).size !== regions.length) {
    return `${lines} and repeat a region=; give each block a region= of its own`;
  }

  if (langs.length > 1) {
    return `${lines} in different languages (${langs.map(lang => lang || "none").join(", ")}); blocks that share a file must share its language`;
  }

  return undefined;
}

/**
 * The text of an existing target whose regions extract would splice, or
 * undefined when there is none to check: the file does not exist yet, or is a
 * symlink or not UTF-8, which extract refuses to splice anyway.
 */
async function readExisting(path: string): Promise<string | undefined> {
  const stats = await lstat(path).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });

  if (stats === undefined || stats.isSymbolicLink()) {
    return undefined;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  }
  catch (error: unknown) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

/** How the file breaks the region rule for one region name, if it does. A merely missing region is left to the caller. */
function regionProblem(located: RegionSpliceResult, source: string, name: string, lang: string, file: string): { code: ErrorCode; message: string; } | undefined {
  if (located.unclosed.includes(name)) {
    return { code: "malformed_region", message: `region ${name} is never closed in ${file}, or a region inside it is not` };
  }

  if (located.duplicated.includes(name)) {
    return { code: "duplicate_region", message: `region ${name} appears more than once in ${file}; a region name must be used once per file` };
  }

  if (located.overlapping.includes(name)) {
    return { code: "malformed_region", message: `region ${name} overlaps another selected region in ${file}` };
  }

  if (located.unmatched.includes(name) && hasRegionMarker(source, name)) {
    return {
      code: "region_language_mismatch",
      message: `region ${name} in ${file} is marked in another language's comment syntax; a ${lang || "untagged"} block expects \`${regionMarker(lang, "region", name)}\``,
    };
  }

  return undefined;
}

function invalidRegionName(name: string): string {
  return `invalid region name ${JSON.stringify(name)}; use only letters, digits, _ . : or -`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
