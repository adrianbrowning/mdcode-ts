import { describe, it, expect } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import mdcode, {
  parse,
  walk,
  update,
  transform,
  transformWithFunction,
  defineTransform,
  type Block,
  type TransformerFunction,
} from '../packages/mdcode/src/index.js';

describe('Library Usage - Programmatic API', () => {
  describe('default export - Simple file-based API', () => {
    const testDir = join(tmpdir(), 'mdcode-test-default-export');

    it('should transform a markdown file using default export', async () => {
      const testFile = join(testDir, 'test.md');
      const markdown = `
# Test

\`\`\`sql
select * from users;
\`\`\`

\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      // Create test file
      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, 'utf-8');

      // Transform using default export
      const result = await mdcode(testFile, (tag, meta, code) => {
        if (tag === 'sql') return code.toUpperCase();
        return code;
      });

      expect(result).toContain('SELECT * FROM USERS;');
      expect(result).toContain('const x = 1;');

      // Cleanup
      await unlink(testFile);
    });

    it('should work with filters in default export', async () => {
      const testFile = join(testDir, 'test-filter.md');
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, 'utf-8');

      // Transform only JS blocks
      const result = await mdcode(
        testFile,
        (tag, meta, code) => code.toUpperCase(),
        { lang: 'js' }
      );

      expect(result).toContain('CONST X = 1;');
      expect(result).toContain('y = 2'); // Python unchanged

      // Cleanup
      await unlink(testFile);
    });

    it('should handle async transformers with default export', async () => {
      const testFile = join(testDir, 'test-async.md');
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, 'utf-8');

      const result = await mdcode(testFile, async (tag, meta, code) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return code.toUpperCase();
      });

      expect(result).toContain('CONST X = 1;');

      // Cleanup
      await unlink(testFile);
    });

    it('should pass metadata in default export', async () => {
      const testFile = join(testDir, 'test-meta.md');
      const markdown = `
\`\`\`js file=app.js region=main
const app = {};
\`\`\`
      `.trim();

      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, 'utf-8');

      let receivedMeta: any;
      const result = await mdcode(testFile, (tag, meta, code) => {
        receivedMeta = meta;
        return code;
      });

      expect(receivedMeta).toEqual({
        file: 'app.js',
        region: 'main',
      });

      // Cleanup
      await unlink(testFile);
    });
  });

  describe('parse() - Extract code blocks', () => {
    it('should parse and extract code blocks from markdown', () => {
      const markdown = `
# Example

\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      const blocks = parse({ source: markdown });

      expect(blocks).toHaveLength(2);
      expect(blocks[0].lang).toBe('js');
      expect(blocks[0].code).toBe('const x = 1;');
      expect(blocks[1].lang).toBe('python');
      expect(blocks[1].code).toBe('y = 2');
    });

    it('should parse blocks with metadata', () => {
      const markdown = `
\`\`\`js file=app.js region=main
console.log('hello');
\`\`\`
      `.trim();

      const blocks = parse({ source: markdown });

      expect(blocks).toHaveLength(1);
      expect(blocks[0].meta.file).toBe('app.js');
      expect(blocks[0].meta.region).toBe('main');
    });

    it('should filter blocks by language', () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`

\`\`\`js
const z = 3;
\`\`\`
      `.trim();

      const blocks = parse({ source: markdown, filter: { lang: 'js' } });

      expect(blocks).toHaveLength(2);
      expect(blocks.every(b => b.lang === 'js')).toBe(true);
    });
  });

  describe('walk() - Transform blocks', () => {
    it('should walk and transform blocks', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const result = await walk({
        source: markdown,
        walker: async (block) => {
          return { ...block, code: block.code.toUpperCase() };
        },
      });

      expect(result.modified).toBe(true);
      expect(result.source).toContain('CONST X = 1;');
      expect(result.blocks).toHaveLength(1);
    });

    it('should remove blocks when walker returns null', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      const result = await walk({
        source: markdown,
        walker: async (block) => {
          // Remove python blocks
          if (block.lang === 'python') return null;
          return block;
        },
      });

      expect(result.modified).toBe(true);
      expect(result.source).toContain('const x = 1;');
      expect(result.source).not.toContain('y = 2');
    });

    it('should work with filters', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      let processedCount = 0;

      await walk({
        source: markdown,
        filter: { lang: 'js' },
        walker: async (block) => {
          processedCount++;
          return block;
        },
      });

      // Only JS blocks should be processed
      expect(processedCount).toBe(1);
    });
  });

  describe('update() - Update with transformer functions', () => {
    it('should update blocks using inline transformer', async () => {
      const markdown = `
\`\`\`sql
select * from users;
\`\`\`
      `.trim();

      const transformer: TransformerFunction = (tag, meta, code) => {
        if (tag === 'sql') return code.toUpperCase();
        return code;
      };

      const result = await update({ source: markdown, transformer });

      expect(result).toContain('SELECT * FROM USERS;');
    });

    it('should pass metadata to transformer', async () => {
      const markdown = `
\`\`\`js file=test.spec.js
test('example');
\`\`\`
      `.trim();

      const transformer = defineTransform((tag, meta, code) => {
        if (meta.file?.includes('.spec.')) {
          return `// AUTO-GENERATED\n${code}`;
        }
        return code;
      });

      const result = await update({ source: markdown, transformer });

      expect(result).toContain('// AUTO-GENERATED');
      expect(result).toContain("test('example')");
    });

    it('should handle async transformers', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const transformer = defineTransform(async (tag, meta, code) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return code.toUpperCase();
      });

      const result = await update({ source: markdown, transformer });

      expect(result).toContain('CONST X = 1;');
    });

    it('should handle transformation errors gracefully', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const transformer = defineTransform((tag, meta, code) => {
        throw new Error('Transformation failed');
      });

      // Should not throw, just log error and return original
      const result = await update({ source: markdown, transformer });

      // Original code should be preserved
      expect(result).toContain('const x = 1;');
    });
  });

  describe('transformWithFunction() - Direct transformation', () => {
    it('should transform blocks directly', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const transformer = defineTransform((tag, meta, code) => {
        return `// Transformed\n${code}`;
      });

      const result = await transformWithFunction(markdown, transformer);

      expect(result).toContain('// Transformed');
      expect(result).toContain('const x = 1;');
    });

    it('should work with filters', async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      const transformer = defineTransform((tag, meta, code) => {
        return code.toUpperCase();
      });

      const result = await transformWithFunction(
        markdown,
        transformer,
        { lang: 'js' }
      );

      // Only JS should be transformed
      expect(result).toContain('CONST X = 1;');
      expect(result).toContain('y = 2'); // Python unchanged
    });
  });

  describe('defineTransform() - Type-safe transformers', () => {
    it('should create type-safe transformer functions', () => {
      const transformer = defineTransform((tag, meta, code) => {
        // All parameters should be properly typed
        const _tag: string = tag;
        const _file: string | undefined = meta.file;
        const _region: string | undefined = meta.region;
        const _code: string = code;

        return code;
      });

      expect(typeof transformer).toBe('function');
    });

    it('should support async transformers', async () => {
      const transformer = defineTransform(async (tag, meta, code) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return code.toUpperCase();
      });

      const result = await transformer('js', {}, 'const x = 1;');
      expect(result).toBe('CONST X = 1;');
    });
  });

  describe('Complex Usage Scenarios', () => {
    it('should handle multi-step transformation pipeline', async () => {
      const markdown = `
\`\`\`js file=app.js
const x = 1;
\`\`\`

\`\`\`sql
select * from users;
\`\`\`
      `.trim();

      // First, parse to inspect blocks
      const blocks = parse({ source: markdown });
      expect(blocks).toHaveLength(2);

      // Then transform with custom logic
      const transformer = defineTransform((tag, meta, code) => {
        if (tag === 'sql') return code.toUpperCase();
        if (meta.file?.endsWith('.js')) return `'use strict';\n\n${code}`;
        return code;
      });

      const result = await update({ source: markdown, transformer });

      expect(result).toContain("'use strict';");
      expect(result).toContain('const x = 1;');
      expect(result).toContain('SELECT * FROM USERS;');
    });

    it('should support conditional transformation based on metadata', async () => {
      const markdown = `
\`\`\`js file=production.js
const config = {};
\`\`\`

\`\`\`js file=example.js
const demo = {};
\`\`\`
      `.trim();

      const transformer = defineTransform((tag, meta, code) => {
        if (meta.file?.includes('production')) {
          // Add strict mode to production files
          return `'use strict';\n\n${code}`;
        }
        if (meta.file?.includes('example')) {
          // Add comment to example files
          return `// Example code\n${code}`;
        }
        return code;
      });

      const result = await update({ source: markdown, transformer });

      expect(result).toContain("'use strict'");
      expect(result).toContain('const config = {}');
      expect(result).toContain('// Example code');
      expect(result).toContain('const demo = {}');
    });

    it('should allow extracting and analyzing blocks without modification', () => {
      const markdown = `
\`\`\`js file=app.js
const x = 1;
\`\`\`

\`\`\`js file=test.js
const y = 2;
\`\`\`

\`\`\`python file=script.py
z = 3
\`\`\`
      `.trim();

      const blocks = parse({ source: markdown });

      // Analyze blocks
      const jsBlocks = blocks.filter(b => b.lang === 'js');
      const filesWithCode = blocks.filter(b => b.meta.file).map(b => b.meta.file);

      expect(jsBlocks).toHaveLength(2);
      expect(filesWithCode).toEqual(['app.js', 'test.js', 'script.py']);
    });

    it('should support custom walker for complex transformations', async () => {
      const markdown = `
\`\`\`js region=example
const x = 1;
\`\`\`

\`\`\`js region=production
const y = 2;
\`\`\`
      `.trim();

      const result = await walk({
        source: markdown,
        walker: async (block: Block) => {
          // Custom transformation logic
          if (block.meta.region === 'example') {
            return {
              ...block,
              code: `/* EXAMPLE */\n${block.code}`,
            };
          }
          if (block.meta.region === 'production') {
            return {
              ...block,
              code: `/* PRODUCTION */\n${block.code}`,
            };
          }
          return block;
        },
      });

      expect(result.source).toContain('/* EXAMPLE */');
      expect(result.source).toContain('/* PRODUCTION */');
    });
  });
});
