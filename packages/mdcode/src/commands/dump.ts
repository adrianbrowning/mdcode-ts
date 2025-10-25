import { TarStream, type TarStreamInput } from '@std/tar';
import { styleText } from 'node:util';
import { parse } from '../parser.js';
import type { FilterOptions } from '../types.js';

export interface DumpOptions {
  source: string;
  filter?: FilterOptions;
}

/**
 * Create a tar archive of code blocks
 */
export async function dump(options: DumpOptions): Promise<Uint8Array> {
  const { source, filter } = options;
  const blocks = parse({ source, filter });

  if (blocks.length === 0) {
    console.error(styleText('yellow', 'No code blocks found to dump.'));
    return new Uint8Array(0);
  }

  // Create tar stream inputs
  const inputs: TarStreamInput[] = [];

  for (const [index, block] of blocks.entries()) {
    // Determine filename
    let filename: string;
    if (block.meta.file) {
      filename = block.meta.file;
    } else {
      const ext = getExtension(block.lang);
      filename = `block-${index + 1}${ext}`;
    }

    // Create file input for tar stream
    const content = new TextEncoder().encode(block.code);
    inputs.push({
      type: 'file',
      path: filename,
      size: content.length,
      readable: new ReadableStream({
        start(controller) {
          controller.enqueue(content);
          controller.close();
        },
      }),
    });

    console.error(styleText('green', `✓ Added ${filename} to archive`));
  }

  // Create tar archive
  const chunks: Uint8Array[] = [];
  await ReadableStream.from(inputs)
    .pipeThrough(new TarStream())
    .pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          chunks.push(chunk);
        },
      })
    );

  console.error(styleText(['bold', 'green'], `\nCreated tar archive with ${blocks.length} file(s).`));

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
    js: '.js',
    javascript: '.js',
    ts: '.ts',
    typescript: '.ts',
    py: '.py',
    python: '.py',
    go: '.go',
    rust: '.rs',
    rs: '.rs',
    java: '.java',
    c: '.c',
    cpp: '.cpp',
    'c++': '.cpp',
    cs: '.cs',
    'c#': '.cs',
    rb: '.rb',
    ruby: '.rb',
    php: '.php',
    swift: '.swift',
    kt: '.kt',
    kotlin: '.kt',
    sh: '.sh',
    bash: '.sh',
    zsh: '.sh',
    fish: '.fish',
    html: '.html',
    css: '.css',
    scss: '.scss',
    sass: '.sass',
    json: '.json',
    yaml: '.yaml',
    yml: '.yml',
    xml: '.xml',
    sql: '.sql',
    md: '.md',
    markdown: '.md',
    txt: '.txt',
  };

  return extensions[lang.toLowerCase()] || '.txt';
}
