import { styleText } from "node:util";

import { pack } from "tar-stream";

import { parse } from "../parser.ts";
import { escapesArchiveRoot } from "../paths.ts";
import type { BlockRef, ResultError } from "../result.ts";
import { blockError, BlockFailure, blockRef } from "../result.ts";
import type { FilterOptions } from "../types.ts";

export interface DumpOptions {
  source: string;
  filter?: FilterOptions;
}

export interface DumpedFile extends BlockRef {
  /** The entry's path inside the archive: the block's file=, or a generated block-N name. */
  path: string;
  /** Size of the entry in bytes. */
  size: number;
}

export interface DumpResult {
  /** One entry per selected block, in document order. */
  files: Array<DumpedFile>;
  /** The tar archive; empty (zero bytes) when no block was selected. */
  archive: Uint8Array;
}

/**
 * Create a tar archive of code blocks
 * @throws {MetadataError} when the document's metadata is invalid
 * @throws {BlockFailure} with an unsafe_path error per file= that would unpack outside the archive's directory
 */
export async function dump(options: DumpOptions): Promise<DumpResult> {
  const blocks = parse(options);

  if (blocks.length === 0) {
    return { files: [], archive: new Uint8Array(0) };
  }

  // An entry such as ../../.bashrc would be written wherever the archive is
  // unpacked, by whoever unpacks it.
  const unsafe: Array<ResultError> = blocks.flatMap(block => block.meta.file !== undefined && escapesArchiveRoot(block.meta.file)
    ? [ blockError(block, { code: "unsafe_path", message: `${block.meta.file} is absolute or leads outside the archive`, path: block.meta.file }) ]
    : []);

  if (unsafe.length > 0) {
    throw new BlockFailure(unsafe);
  }

  const packStream = pack();
  const chunks: Array<Buffer> = [];
  const files: Array<DumpedFile> = [];

  packStream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  for (const [ index, block ] of blocks.entries()) {
    const path = block.meta.file || `block-${index + 1}${getExtension(block.lang)}`;
    const content = Buffer.from(block.code, "utf-8");

    packStream.entry({ name: path }, content);
    files.push({ ...blockRef(block), path, size: content.length });
  }

  packStream.finalize();

  await new Promise<void>(resolve => {
    packStream.on("end", resolve);
  });

  return { files, archive: Buffer.concat(chunks) };
}

/** Human-readable progress lines for a dump result, as the CLI prints them on stderr. */
export function formatDump({ files }: DumpResult): Array<string> {
  if (files.length === 0) {
    return [ styleText("yellow", "No code blocks found to dump.") ];
  }

  return [
    ...files.map(file => styleText("green", `✓ Added ${file.path} to archive`)),
    styleText([ "bold", "green" ], `\nCreated tar archive with ${files.length} file(s).`),
  ];
}

/**
 * Get file extension for a language
 */
function getExtension(lang: string): string {
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
