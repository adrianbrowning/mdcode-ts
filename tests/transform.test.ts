import { describe, it, expect } from 'vitest';
import { update } from '../packages/mdcode/src/commands/update.js';
import { defineTransform } from '../packages/mdcode/src/types.js';

describe('update with transformer', () => {
  it('should transform code blocks using custom function', async () => {
    const markdown = `
# Test

\`\`\`js
const x = 1;
\`\`\`

\`\`\`sql
select * from users;
\`\`\`
    `.trim();

    const transformer = defineTransform((tag, meta, code) => {
      if (tag === 'sql') {
        return code.toUpperCase();
      }
      return code;
    });

    const result = await update({ source: markdown, transformer });

    expect(result).toContain('SELECT * FROM USERS;');
    expect(result).toContain('const x = 1;');
  });

  it('should pass metadata to transformer', async () => {
    const markdown = `
\`\`\`js file=test.js region=main
console.log('hello');
\`\`\`
    `.trim();

    let receivedMeta: any;

    const transformer = defineTransform((tag, meta, code) => {
      receivedMeta = meta;
      return code;
    });

    await update({ source: markdown, transformer });

    expect(receivedMeta).toEqual({
      file: 'test.js',
      region: 'main',
    });
  });

  it('should handle async transformers', async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`
    `.trim();

    const transformer = defineTransform(async (tag, meta, code) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return code.toUpperCase();
    });

    const result = await update({ source: markdown, transformer });

    expect(result).toContain('CONST X = 1;');
  });

  it('should pass undefined for missing metadata', async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`
    `.trim();

    let receivedMeta: any;

    const transformer = defineTransform((tag, meta, code) => {
      receivedMeta = meta;
      return code;
    });

    await update({ source: markdown, transformer });

    expect(receivedMeta).toEqual({
      file: undefined,
      region: undefined,
    });
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

    const result = await update({ source: markdown, transformer, filter: { lang: 'js' } });

    // Only JS should be transformed
    expect(result).toContain('CONST X = 1;');
    expect(result).toContain('y = 2'); // Python unchanged
  });

  it('should handle transformation based on metadata', async () => {
    const markdown = `
\`\`\`js file=test.spec.js
test('something', () => {});
\`\`\`

\`\`\`js file=app.js
const app = {};
\`\`\`
    `.trim();

    const transformer = defineTransform((tag, meta, code) => {
      if (meta.file?.includes('.spec.') || meta.file?.includes('.test.')) {
        return `// AUTO-GENERATED TEST\n${code}`;
      }
      return code;
    });

    const result = await update({ source: markdown, transformer });

    expect(result).toContain('// AUTO-GENERATED TEST');
    expect(result).toContain("test('something'");
    expect(result).toContain('const app = {}');
    // Count occurrences - only test file should have the comment
    const matches = result.match(/AUTO-GENERATED TEST/g);
    expect(matches).toHaveLength(1);
  });

  it('should handle regions in metadata', async () => {
    const markdown = `
\`\`\`js region=example
const example = true;
\`\`\`

\`\`\`js region=production
const prod = true;
\`\`\`
    `.trim();

    const transformer = defineTransform((tag, meta, code) => {
      if (meta.region === 'example') {
        return `/* EXAMPLE */\n${code}`;
      }
      return code;
    });

    const result = await update({ source: markdown, transformer });

    expect(result).toContain('/* EXAMPLE */');
    expect(result).toContain('const example = true');
    expect(result).toContain('const prod = true');
    // Only one example comment
    const matches = result.match(/EXAMPLE/g);
    expect(matches).toHaveLength(1);
  });

  it('should preserve unchanged blocks', async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`

\`\`\`sql
SELECT * FROM users;
\`\`\`
    `.trim();

    const transformer = defineTransform((tag, meta, code) => {
      if (tag === 'sql') {
        return code.toUpperCase();
      }
      // Return unchanged for other languages
      return code;
    });

    const result = await update({ source: markdown, transformer });

    // SQL should be uppercase
    expect(result).toContain('SELECT * FROM USERS;');
    // Others should be unchanged
    expect(result).toContain('const x = 1;');
    expect(result).toContain('y = 2');
  });
});
