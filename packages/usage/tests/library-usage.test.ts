import assert from "node:assert/strict";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import mdcode, {
    defineTransform,
    parse,
    transformWithFunction,
    update,
    walk,
} from "mdcode";

import type {TransformerMeta, Block, TransformerFunction} from "mdcode"

describe("Library Usage - Programmatic API", () => {
  describe("default export - Simple file-based API", () => {
    const testDir = join(tmpdir(), "mdcode-test-default-export");

    it("should transform a markdown file using default export", async () => {
      const testFile = join(testDir, "test.md");
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
      await writeFile(testFile, markdown, "utf-8");

      // Transform using default export
      const result = await mdcode(testFile, ({ tag, code }) => {
        if (tag === "sql") return code.toUpperCase();
        return code;
      });

      assert.ok(result.includes("SELECT * FROM USERS;"));
      assert.ok(result.includes("const x = 1;"));

      // Cleanup
      await unlink(testFile);
    });

    it("should work with filters in default export", async () => {
      const testFile = join(testDir, "test-filter.md");
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, "utf-8");

      // Transform only JS blocks
      const result = await mdcode(
        testFile,
        ({ code }) => code.toUpperCase(),
        { lang: "js" }
      );

      assert.ok(result.includes("CONST X = 1;"));
      assert.ok(result.includes("y = 2")); // Python unchanged

      // Cleanup
      await unlink(testFile);
    });

    it("should handle async transformers with default export", async () => {
      const testFile = join(testDir, "test-async.md");
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, "utf-8");

      const result = await mdcode(testFile, async ({ code }) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return code.toUpperCase();
      });

      assert.ok(result.includes("CONST X = 1;"));

      // Cleanup
      await unlink(testFile);
    });

    it("should pass metadata in default export", async () => {
      const testFile = join(testDir, "test-meta.md");
      const markdown = `
\`\`\`js file=app.js region=main
const app = {};
\`\`\`
      `.trim();

      await mkdir(testDir, { recursive: true });
      await writeFile(testFile, markdown, "utf-8");

      let receivedMeta: TransformerMeta;
      const result = await mdcode(testFile, ({ meta, code }) => {
        receivedMeta = meta;
        return code;
      });

      assert.ok(result.includes("const app = {};"));

      assert.deepStrictEqual(receivedMeta!, {
        file: "app.js",
        region: "main",
      });

      // Cleanup
      await unlink(testFile);
    });
  });

  describe("parse() - Extract code blocks", () => {
    it("should parse and extract code blocks from markdown", () => {
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

      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0]?.lang, "js");
      assert.strictEqual(blocks[0]?.code, "const x = 1;");
      assert.strictEqual(blocks[1]?.lang, "python");
      assert.strictEqual(blocks[1]?.code, "y = 2");
    });

    it("should parse blocks with metadata", () => {
      const markdown = `
\`\`\`js file=app.js region=main
console.log('hello');
\`\`\`
      `.trim();

      const blocks = parse({ source: markdown });

      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0]?.meta.file, "app.js");
      assert.strictEqual(blocks[0]?.meta.region, "main");
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
      assert.strictEqual(blocks.every(b => b.lang === "js"), true);
    });
  });

  describe("walk() - Transform blocks", () => {
    it("should walk and transform blocks", async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const result = await walk({
        source: markdown,
        walker: async block => ({ ...block, code: block.code.toUpperCase() }),
      });

      assert.strictEqual(result.modified, true);
      assert.ok(result.source.includes("CONST X = 1;"));
      assert.strictEqual(result.blocks.length, 1);
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
        walker: async block => {
          // Remove python blocks
          if (block.lang === "python") return null;
          return block;
        },
      });

      assert.strictEqual(result.modified, true);
      assert.ok(result.source.includes("const x = 1;"));
      assert.ok(!result.source.includes("y = 2"));
    });

    it("should work with filters", async () => {
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
        filter: { lang: "js" },
        walker: async block => {
          processedCount++;
          return block;
        },
      });

      // Only JS blocks should be processed
      assert.strictEqual(processedCount, 1);
    });
  });

  describe("update() - Update with transformer functions", () => {
    it("should update blocks using inline transformer", async () => {
      const markdown = `
\`\`\`sql
select * from users;
\`\`\`
      `.trim();

      const transformer: TransformerFunction = ({ tag, code }) => {
        if (tag === "sql") return code.toUpperCase();
        return code;
      };

      const result = await update({ source: markdown, transformer });

      assert.ok(result.includes("SELECT * FROM USERS;"));
    });

    it("should pass metadata to transformer", async () => {
      const markdown = `
\`\`\`js file=test.spec.js
test('example');
\`\`\`
      `.trim();

      const transformer = defineTransform(({ meta, code }) => {
        if (meta.file?.includes(".spec.")) {
          return `// AUTO-GENERATED\n${code}`;
        }
        return code;
      });

      const result = await update({ source: markdown, transformer });

      assert.ok(result.includes("// AUTO-GENERATED"));
      assert.ok(result.includes("test('example')"));
    });

    it("should handle async transformers", async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const transformer = defineTransform(async ({ code }) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return code.toUpperCase();
      });

      const result = await update({ source: markdown, transformer });

      assert.ok(result.includes("CONST X = 1;"));
    });

    it("should handle transformation errors gracefully", async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const transformer = defineTransform(() => {
        throw new Error("Transformation failed");
      });

      // Should not throw, just log error and return original
      const result = await update({ source: markdown, transformer });

      // Original code should be preserved
      assert.ok(result.includes("const x = 1;"));
    });
  });

  describe("transformWithFunction() - Direct transformation", () => {
    it("should transform blocks directly", async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`
      `.trim();

      const transformer = defineTransform(({ code }) => `// Transformed\n${code}`);

      const result = await transformWithFunction(markdown, transformer);

      assert.ok(result.includes("// Transformed"));
      assert.ok(result.includes("const x = 1;"));
    });

    it("should work with filters", async () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      const transformer = defineTransform(({ code }) => code.toUpperCase());

      const result = await transformWithFunction(
        markdown,
        transformer,
        { lang: "js" }
      );

      // Only JS should be transformed
      assert.ok(result.includes("CONST X = 1;"));
      assert.ok(result.includes("y = 2")); // Python unchanged
    });
  });

  describe("defineTransform() - Type-safe transformers", () => {
    it("should create type-safe transformer functions", () => {
        let _tag: string = "";
        let _file: string | undefined = "";
        let _region: string | undefined = "";
        let _code: string = "";

      const transformer = defineTransform(({ tag, meta, code }) => {
        // All parameters should be properly typed
        _tag = tag;
        _file  = meta.file;
        _region  = meta.region;
        _code = code;

        return code;
      });

      assert.strictEqual(typeof transformer, "function");

      // Call transformer to populate variables
      const result = transformer({ tag: "js", meta: {}, code: "test code" });

      // Verify the transformer received the correct parameters
      assert.strictEqual(_tag, "js");
      assert.strictEqual(_file, undefined);
      assert.strictEqual(_region, undefined);
      assert.strictEqual(_code, "test code");
      assert.strictEqual(result, "test code");
    });

    it("should support async transformers", async () => {
      const transformer = defineTransform(async ({ code }) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return code.toUpperCase();
      });

      const result = await transformer({tag: "js", meta:{}, code:"const x = 1;"});
      assert.strictEqual(result, "CONST X = 1;");
    });
  });

  describe("Complex Usage Scenarios", () => {
    it("should handle multi-step transformation pipeline", async () => {
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
      assert.strictEqual(blocks.length, 2);

      // Then transform with custom logic
      const transformer = defineTransform(({ tag, meta, code }) => {
        if (tag === "sql") return code.toUpperCase();
        if (meta.file?.endsWith(".js")) return `'use strict';\n\n${code}`;
        return code;
      });

      const result = await update({ source: markdown, transformer });

      assert.ok(result.includes("'use strict';"));
      assert.ok(result.includes("const x = 1;"));
      assert.ok(result.includes("SELECT * FROM USERS;"));
    });

    it("should support conditional transformation based on metadata", async () => {
      const markdown = `
\`\`\`js file=production.js
const config = {};
\`\`\`

\`\`\`js file=example.js
const demo = {};
\`\`\`
      `.trim();

      const transformer = defineTransform(({ meta, code }) => {
        if (meta.file?.includes("production")) {
          // Add strict mode to production files
          return `'use strict';\n\n${code}`;
        }
        if (meta.file?.includes("example")) {
          // Add comment to example files
          return `// Example code\n${code}`;
        }
        return code;
      });

      const result = await update({ source: markdown, transformer });

      assert.ok(result.includes("'use strict'"));
      assert.ok(result.includes("const config = {}"));
      assert.ok(result.includes("// Example code"));
      assert.ok(result.includes("const demo = {}"));
    });

    it("should allow extracting and analyzing blocks without modification", () => {
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
      const jsBlocks = blocks.filter(b => b.lang === "js");
      const filesWithCode = blocks.filter(b => b.meta.file).map(b => b.meta.file);

      assert.strictEqual(jsBlocks.length, 2);
      assert.deepStrictEqual(filesWithCode, [ "app.js", "test.js", "script.py" ]);
    });

    it("should support custom walker for complex transformations", async () => {
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
          if (block.meta.region === "example") {
            return {
              ...block,
              code: `/* EXAMPLE */\n${block.code}`,
            };
          }
          if (block.meta.region === "production") {
            return {
              ...block,
              code: `/* PRODUCTION */\n${block.code}`,
            };
          }
          return block;
        },
      });

      assert.ok(result.source.includes("/* EXAMPLE */"));
      assert.ok(result.source.includes("/* PRODUCTION */"));
    });
  });
});
