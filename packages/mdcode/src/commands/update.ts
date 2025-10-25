import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { styleText } from 'node:util';
import { walk } from '../parser.js';
import type { Block, FilterOptions, TransformerFunction } from '../types.js';

export interface UpdateOptions {
  source: string;
  filter?: FilterOptions;
  transformer?: TransformerFunction;
  basePath?: string;  // Base path for resolving file paths
}

/**
 * Update markdown code blocks from source files or via transformer
 */
export async function update(options: UpdateOptions): Promise<string> {
  const { source, filter, transformer, basePath = '.' } = options;

  let updatedCount = 0;

  const result = await walk({
    source,
    filter,
    walker: async (block: Block) => {
      // If transformer is provided, use it to transform the block
      if (transformer) {
        try {
          const transformedCode = await transformer(
            block.lang,
            { file: block.meta.file, region: block.meta.region },
            block.code
          );

          // Only update if content changed
          if (transformedCode !== block.code) {
            console.log(styleText('green', `✓ Transformed ${block.lang} block`));
            if (block.meta.file) {
              console.log(styleText('gray', `  File: ${block.meta.file}`));
            }
            updatedCount++;
            return { ...block, code: transformedCode };
          }

          return block;
        } catch (error: any) {
          console.log(styleText('red', `✗ Transform failed: ${error.message}`));
          return block;
        }
      }

      // Otherwise, update from source files (original behavior)
      // Only update blocks that have a file metadata
      if (!block.meta.file) {
        return block;
      }

      const filePath = block.meta.file;
      const resolvedPath = join(basePath, filePath);

      try {
        // Read the source file
        let fileContent = await readFile(resolvedPath, 'utf-8');

        // If a region is specified, extract only that region
        if (block.meta.region) {
          fileContent = extractRegion(fileContent, block.meta.region, block.lang);
        }

        // Only update if content changed
        if (fileContent !== block.code) {
          console.log(styleText('green', `✓ Updated block from ${filePath}`));
          if (block.meta.region) {
            console.log(styleText('gray', `  Region: ${block.meta.region}`));
          }
          updatedCount++;
          return { ...block, code: fileContent };
        }

        return block;
      } catch (error: any) {
        console.log(styleText('red', `✗ Failed to read ${filePath}: ${error.message}`));
        return block; // Keep original block if file read fails
      }
    },
  });

  if (updatedCount === 0) {
    console.log(styleText('yellow', 'No blocks were updated.'));
  } else {
    console.log(styleText(['bold', 'green'], `\nUpdated ${updatedCount} block(s).`));
  }

  return result.source;
}

/**
 * Extract a region from source code using special comments
 * Supports various comment styles based on language
 */
function extractRegion(content: string, regionName: string, lang: string): string {
  const commentStyles = getCommentStyle(lang);
  const lines = content.split('\n');
  const extracted: string[] = [];
  let inRegion = false;

  for (const line of lines) {
    let isMarkerLine = false;

    // Check for region start/end markers
    for (const style of commentStyles) {
      const startPattern = new RegExp(`${escapeRegex(style)}\\s*#region\\s+${escapeRegex(regionName)}`);
      const endPattern = new RegExp(`${escapeRegex(style)}\\s*#endregion\\s+${escapeRegex(regionName)}`);

      if (startPattern.test(line)) {
        inRegion = true;
        isMarkerLine = true;
        break;
      }

      if (endPattern.test(line)) {
        inRegion = false;
        isMarkerLine = true;
        break;
      }
    }

    // Collect lines inside the region (but not the marker lines themselves)
    if (inRegion && !isMarkerLine) {
      extracted.push(line);
    }
  }

  return extracted.join('\n').trim();
}

/**
 * Get comment styles for a given language
 */
function getCommentStyle(lang: string): string[] {
  const styles: Record<string, string[]> = {
    js: ['//'],
    javascript: ['//'],
    ts: ['//'],
    typescript: ['//'],
    java: ['//'],
    c: ['//'],
    cpp: ['//'],
    'c++': ['//'],
    cs: ['//'],
    'c#': ['//'],
    go: ['//'],
    rust: ['//'],
    swift: ['//'],
    kotlin: ['//'],
    php: ['//'],
    py: ['#'],
    python: ['#'],
    rb: ['#'],
    ruby: ['#'],
    sh: ['#'],
    bash: ['#'],
    yaml: ['#'],
    yml: ['#'],
    html: ['<!--'],
    xml: ['<!--'],
  };

  return styles[lang.toLowerCase()] || ['//'];
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
