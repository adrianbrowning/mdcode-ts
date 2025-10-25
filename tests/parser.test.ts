import { describe, it, expect } from 'vitest';
import { parse, walk } from '../packages/mdcode/src/parser.ts';
import type { Block } from '../packages/mdcode/src/types.ts';

describe('parse', () => {
  it('should extract code blocks from markdown', () => {
    const markdown = `
# Test

\`\`\`js
console.log('hello');
\`\`\`

\`\`\`python
print('world')
\`\`\`
    `.trim();

    const blocks = parse({ source: markdown });

    expect(blocks).toHaveLength(2);
    expect(blocks[0].lang).toBe('js');
    expect(blocks[0].code).toBe("console.log('hello');");
    expect(blocks[1].lang).toBe('python');
    expect(blocks[1].code).toBe("print('world')");
  });

  it('should parse metadata from info string', () => {
    const markdown = `
\`\`\`js file=test.js region=main
console.log('test');
\`\`\`
    `.trim();

    const blocks = parse({ source: markdown });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe('js');
    expect(blocks[0].meta).toEqual({
      file: 'test.js',
      region: 'main',
    });
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
    expect(blocks[0].code).toBe('const x = 1;');
    expect(blocks[1].code).toBe('const z = 3;');
  });

  it('should filter blocks by file metadata', () => {
    const markdown = `
\`\`\`js file=foo.js
const foo = 1;
\`\`\`

\`\`\`js file=bar.js
const bar = 2;
\`\`\`
    `.trim();

    const blocks = parse({ source: markdown, filter: { file: 'foo.js' } });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('const foo = 1;');
  });

  it('should handle code blocks without language', () => {
    const markdown = '```\nplain text\n```';

    const blocks = parse({ source: markdown });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].lang).toBe('');
    expect(blocks[0].code).toBe('plain text');
  });
});

describe('walk', () => {
  it('should transform code blocks', async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`
    `.trim();

    const result = await walk({
      source: markdown,
      walker: (block: Block) => {
        return { ...block, code: block.code.toUpperCase() };
      },
    });

    expect(result.modified).toBe(true);
    expect(result.blocks).toHaveLength(1);
    expect(result.source).toContain('CONST X = 1;');
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
      walker: (block: Block) => {
        return block.lang === 'js' ? null : block;
      },
    });

    expect(result.blocks).toHaveLength(2); // Both blocks are processed
    expect(result.modified).toBe(true);
    expect(result.source).not.toContain('const x = 1;');
    expect(result.source).toContain('y = 2');
  });

  it('should support async walker functions', async () => {
    const markdown = `
\`\`\`js
console.log('test');
\`\`\`
    `.trim();

    const result = await walk({
      source: markdown,
      walker: async (block: Block) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ...block, code: 'async modified' };
      },
    });

    expect(result.modified).toBe(true);
    expect(result.source).toContain('async modified');
  });
});
