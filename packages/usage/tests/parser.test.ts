import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parse, walk } from "mdcode";
import type { Block } from "mdcode";

describe("parse", () => {
  it("should extract code blocks from markdown", () => {
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

    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0]?.lang, "js");
    assert.strictEqual(blocks[0].code, "console.log('hello');");
    assert.strictEqual(blocks[1]?.lang, "python");
    assert.strictEqual(blocks[1].code, "print('world')");
  });

  it("should parse metadata from info string", () => {
    const markdown = `
\`\`\`js file=test.js region=main
console.log('test');
\`\`\`
    `.trim();

    const blocks = parse({ source: markdown });

    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0]?.lang, "js");
    assert.deepStrictEqual(blocks[0].meta, {
      file: "test.js",
      region: "main",
    });
  });

  it("should filter blocks by language", () => {
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

    const blocks = parse({ source: markdown, filter: { lang: "js" } });

    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0]?.code, "const x = 1;");
    assert.strictEqual(blocks[1]?.code, "const z = 3;");
  });

  it("should filter blocks by file metadata", () => {
    const markdown = `
\`\`\`js file=foo.js
const foo = 1;
\`\`\`

\`\`\`js file=bar.js
const bar = 2;
\`\`\`
    `.trim();

    const blocks = parse({ source: markdown, filter: { file: "foo.js" } });

    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0]?.code, "const foo = 1;");
  });

  it("should handle code blocks without language", () => {
    const markdown = "```\nplain text\n```";

    const blocks = parse({ source: markdown });

    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0]?.lang, "");
    assert.strictEqual(blocks[0].code, "plain text");
  });
});

describe("walk", () => {
  it("should transform code blocks", async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`
    `.trim();

    const result = await walk({
      source: markdown,
      walker: (block: Block) => ({ ...block, code: block.code.toUpperCase() }),
    });

    assert.strictEqual(result.modified, true);
    assert.strictEqual(result.blocks.length, 1);
    assert.ok(result.source.includes("CONST X = 1;"));
  });

  it("should remove blocks when walker returns null", async () => {
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
      walker: (block: Block) => block.lang === "js" ? null : block,
    });

    assert.strictEqual(result.blocks.length, 2); // Both blocks are processed
    assert.strictEqual(result.modified, true);
    assert.ok(!result.source.includes("const x = 1;"));
    assert.ok(result.source.includes("y = 2"));
  });

  it("should support async walker functions", async () => {
    const markdown = `
\`\`\`js
console.log('test');
\`\`\`
    `.trim();

    const result = await walk({
      source: markdown,
      walker: async (block: Block) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ...block, code: "async modified" };
      },
    });

    assert.strictEqual(result.modified, true);
    assert.ok(result.source.includes("async modified"));
  });
});
