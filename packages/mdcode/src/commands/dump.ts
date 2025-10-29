import { styleText } from "node:util";

import { pack } from "tar-stream";

import { parse } from "../parser.ts";
import type { FilterOptions } from "../types.ts";

export interface DumpOptions {
  source: string;
  filter?: FilterOptions;
  quiet?: boolean;
}

/**
 * Create a tar archive of code blocks
 */
export async function dump(options: DumpOptions): Promise<Uint8Array> {
  const { source, filter, quiet = false } = options;
  const blocks = parse({ source, filter });

  if (blocks.length === 0) {
    if (!quiet) {
      console.error(styleText("yellow", "No code blocks found to dump."));
    }
    return new Uint8Array(0);
  }

  // Create tar archive using tar-stream
  const packStream = pack();
  const chunks: Array<Buffer> = [];

  // Collect chunks
  packStream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  // Add files to tar archive
  for (const [ index, block ] of blocks.entries()) {
    // Determine filename
    let filename: string;
    if (block.meta.file) {
      filename = block.meta.file;
    }
    else {
      const ext = getExtension(block.lang);
      filename = `block-${index + 1}${ext}`;
    }

    const content = Buffer.from(block.code, "utf-8");

    // Create entry in tar
    packStream.entry({ name: filename }, content);

    if (!quiet) {
      console.error(styleText("green", `✓ Added ${filename} to archive`));
    }
  }

  // Finalize the archive
  packStream.finalize();

  // Wait for stream to finish
  await new Promise<void>(resolve => {
    packStream.on("end", resolve);
  });

  if (!quiet) {
    console.error(styleText([ "bold", "green" ], `\nCreated tar archive with ${blocks.length} file(s).`));
  }

  // Combine all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
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
