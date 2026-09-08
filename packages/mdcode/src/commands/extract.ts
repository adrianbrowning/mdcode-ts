import { chmod, lstat, mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { styleText } from "node:util";

import { parse, updateInfoStrings } from "../parser.ts";
import type { RegionEdit } from "../region.ts";
import { isValidRegionName, spliceRegions, wrapRegion } from "../region.ts";
import type { FilterOptions } from "../types.ts";

export type ExtractOptions = {
  source: string;
  filter?: FilterOptions;
  outputDir?: string;
  quiet?: boolean;
  updateSource?: boolean;
  ignoreAnonymous?: boolean;
  force?: boolean;
};

export type ExtractResult = {
  extractedFiles: Array<string>;
  /** Targets deliberately left untouched; each one also produced a warning. */
  skippedFiles: Array<string>;
  updatedSource?: string;
};

type BlockRef = {
  block: { meta: Record<string, string>; lang: string; code: string; };
  index: number;
};

type TargetGroup = {
  /** Path as written in the markdown, for messages. */
  display: string;
  items: Array<BlockRef>;
};

/**
 * Extract code blocks to files based on their metadata
 */
export async function extract(options: ExtractOptions): Promise<ExtractResult> {
  const {
    source,
    filter,
    outputDir = ".",
    quiet = false,
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
    if (blocks.length === 0) {
      if (!quiet) {
        console.error(styleText("yellow", "No code blocks with file metadata found."));
      }
      return { extractedFiles: [], skippedFiles: [] };
    }
  }

  if (blocks.length === 0) {
    if (!quiet) {
      console.error(styleText("yellow", "No code blocks found to extract."));
    }
    return { extractedFiles: [], skippedFiles: [] };
  }

  // Track generated filenames for anonymous blocks (for --update-source)
  const metadataUpdates = new Map<number, Record<string, string>>();

  const extractedFiles: Array<string> = [];
  const skippedFiles: Array<string> = [];
  const root = resolve(outputDir);

  // The root must exist before it can be canonicalised: realpath on a missing
  // directory falls back to the lexical path, and on macOS comparing a lexical
  // /var/... root against a resolved /private/var/... target reads as an escape.
  await mkdir(root, { recursive: true });
  const canonicalRoot = await realpath(root).catch(() => root);

  const skip = (path: string, reason: string): void => {
    skippedFiles.push(path);
    if (!quiet) {
      console.error(styleText("yellow", `⚠ Skipped ${path}: ${reason}`));
    }
  };

  // Group blocks by the file they resolve to. Keying on the resolved path means
  // two spellings of one file (`./src/a.ts` and a symlinked `./link/a.ts`) form
  // a single group and produce a single write, rather than racing each other.
  const groups = new Map<string, TargetGroup>();

  for (const block of blocks) {
    const index = allBlocks.findIndex(b => b.position?.start === block.position?.start);

    // extract writes files; a block asking for a marker-only skeleton has no
    // file content to contribute, so it is not an extraction target.
    if (block.meta.outline === "true") {
      continue;
    }

    let declared = block.meta.file;

    if (declared === undefined) {
      const generated = `block-${index + 1}${getExtensionForLang(block.lang)}`;
      declared = generated;

      if (updateSource && index >= 0) {
        metadataUpdates.set(index, { file: generated });
      }
    }

    const display = join(outputDir, declared);

    // Reject an escape before creating any directory for it.
    if (isAbsolute(declared) || escapesRoot(root, display)) {
      skip(display, `file= must stay inside ${outputDir}`);
      continue;
    }

    if (block.meta.region !== undefined && !isValidRegionName(block.meta.region)) {
      skip(display, `invalid region name ${JSON.stringify(block.meta.region)}`);
      continue;
    }

    await mkdir(dirname(display), { recursive: true });

    const key = await resolveTarget(display);

    if (escapesRoot(canonicalRoot, key)) {
      skip(display, `file= resolves outside ${outputDir}`);
      continue;
    }

    const group = groups.get(key);

    if (group) {
      group.items.push({ block, index });
    }
    else {
      groups.set(key, { display, items: [{ block, index }] });
    }
  }

  for (const [ , { display, items }] of groups) {
    const withRegion = items.filter(item => item.block.meta.region !== undefined);
    const existing = await stat(display).catch(rethrowUnlessMissing);

    // A group mixing whole-file and region blocks has no coherent result: the
    // whole-file block would erase the very region the other block splices.
    if (withRegion.length > 0 && withRegion.length !== items.length) {
      skip(display, "blocks for this file mix region= with whole-file blocks");
      continue;
    }

    // Several blocks each claiming to be the whole file only agree if they are
    // byte-identical; otherwise picking one would silently discard the others.
    if (withRegion.length === 0 && new Set(items.map(item => item.block.code)).size > 1) {
      skip(display, `${items.length} whole-file blocks disagree about its contents`);
      continue;
    }

    if (existing !== undefined && withRegion.length === items.length) {
      const spliced = await spliceInPlace(display, items, { quiet, skip });

      if (spliced) {
        extractedFiles.push(display);
      }
      continue;
    }

    if (existing !== undefined && !force) {
      skip(display, "exists and has block(s) without region=. Use --force to overwrite.");
      continue;
    }

    const content = withRegion.length === items.length
      ? items.map(({ block }) => wrapRegion(block.lang, block.meta.region!, block.code)).join("\n")
      : items[0]!.block.code;

    await writeAtomic(display, content, existing?.mode);

    if (!quiet) {
      const what = withRegion.length === items.length && items.length > 1
        ? `${items.length} region(s) to`
        : "to";
      console.error(styleText("green", `✓ Extracted ${what} ${display}`));
    }
    extractedFiles.push(display);
  }

  // Update source if requested
  let updatedSourceContent: string | undefined;
  if (updateSource && metadataUpdates.size > 0) {
    updatedSourceContent = updateInfoStrings(source, metadataUpdates);
  }

  return { extractedFiles, skippedFiles, updatedSource: updatedSourceContent };
}

/**
 * Splice every region block for one existing file in a single pass, appending
 * any region the file does not already declare. Returns false when the file was
 * left untouched.
 */
async function spliceInPlace(
  target: string,
  items: Array<BlockRef>,
  reporters: { quiet: boolean; skip: (path: string, reason: string) => void; }
): Promise<boolean> {
  const { quiet, skip } = reporters;

  // rename() would replace a symlink with a regular file rather than write
  // through it; refuse outright so the link's meaning is never silently changed.
  if ((await lstat(target)).isSymbolicLink()) {
    skip(target, "target is a symlink; refusing to splice through it");
    return false;
  }

  const raw = await readFile(target);
  let existing: string;

  try {
    // A lossy decode would rewrite every invalid byte in the file as U+FFFD,
    // even though only one region was asked for.
    existing = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  }
  catch {
    skip(target, "not valid UTF-8");
    return false;
  }

  const edits = new Map<string, RegionEdit>(
    items.map(({ block }) => [ block.meta.region!, { code: block.code, lang: block.lang }])
  );
  const result = spliceRegions(existing, edits);

  if (!result.ok) {
    skip(target, spliceRefusal(result));
    return false;
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

  if (!quiet) {
    console.error(styleText("green", `✓ Updated ${items.length} region(s) in ${target}`));
  }

  return true;
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

/** True when `path` is not inside `root`. */
function escapesRoot(root: string, path: string): boolean {
  const rel = relative(root, resolve(path));

  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * Canonical identity for a target: the realpath of its parent (which exists by
 * now) plus its own name, so aliased spellings collapse to one key without
 * requiring the file itself to exist.
 */
async function resolveTarget(path: string): Promise<string> {
  const parent = await realpath(dirname(path)).catch(() => resolve(dirname(path)));

  return join(parent, basename(path));
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
