/* eslint-disable @typescript-eslint/no-floating-promises */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import { parse, walk } from "./parser.ts";

// Helper to load test fixtures
async function loadFixture(filename: string): Promise<string> {
  const path = join(import.meta.dirname, "..", "..", "..", "tests", "testdata", filename);
  return readFile(path, "utf-8");
}

describe("parseInfoString (via parse)", () => {
  it("should parse empty info string", () => {
    const source = "```\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lang,"");
    assert.deepEqual(blocks[0]?.meta, {});
  });

  it("should parse language only", () => {
    const source = "```js\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.lang,"js");
    assert.deepEqual(blocks[0]?.meta, {});
  });

  it("should parse language with simple key=value metadata", () => {
    const source = "```js file=foo.js region=main\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.lang,"js");
    assert.deepEqual(blocks[0]?.meta,{
      file: "foo.js",
      region: "main",
    });
  });

  it("should parse metadata with empty value", () => {
    const source = "```js file=foo.js answer=\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length,1);
    assert.deepEqual(blocks[0]?.meta,{
      file: "foo.js",
      answer: "",
    });
  });

  it("should skip metadata without equals sign", () => {
    const source = "```js file=foo.js standalone\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length,1);
    assert.deepEqual(blocks[0]?.meta,{
      file: "foo.js",
    });
  });
});

describe("parse", () => {
  it("should extract all code blocks", async () => {
    const source = await loadFixture("testdoc.md");
    const blocks = parse({ source });

    // Should find all visible code blocks (not HTML-commented ones)
    assert.ok(blocks.length > 0);
  });

  it("should extract entire file blocks", async () => {
    const source = await loadFixture("testdoc.md");
    const blocks = parse({ source, filter: { meta: { file: "entire.js" } } });

    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.meta.file,"entire.js");
    assert.equal(blocks[0]?.lang,"js");

    const expectedCode = await loadFixture("entire.js");
    assert.equal(blocks[0]?.code,expectedCode);
  });

  it("should extract partial file blocks with region", async () => {
    const source = await loadFixture("testdoc.md");
    const blocks = parse({ source, filter: { meta: { file: "partial.go" } } });

    assert.ok(blocks.length > 0);

    const regionBlock = blocks.find(b => b.meta.region === "function");
    assert.ok(typeof regionBlock !== "undefined");
    assert.equal(regionBlock?.lang,"go");
    assert.equal(regionBlock?.meta.file,"partial.go");
    assert.equal(regionBlock?.meta.region,"function");
  });

  it("should filter by language", () => {
    const source = "```js\njs code\n```\n\n```go\ngo code\n```";
    const blocks = parse({ source, filter: { lang: "js" } });

    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.lang,"js");
    assert.equal(blocks[0]?.code,"js code");
  });

  it("should filter by file metadata", () => {
    const source = "```js file=a.js\ncode a\n```\n\n```js file=b.js\ncode b\n```";
    const blocks = parse({ source, filter: { file: "a.js" } });

    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.meta.file,"a.js");
    assert.equal(blocks[0]?.code,"code a");
  });

  it("should filter by custom metadata", () => {
    const source = "```js region=main\ncode\n```\n\n```js region=test\ntest\n```";
    const blocks = parse({ source, filter: { meta: { region: "main" } } });

    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.meta.region,"main");
  });
});

describe("walk", () => {
  it("should not modify when walker returns same block", async () => {
    const source = "```js\noriginal\n```";
    const result = await walk({
      source,
      walker: block => block,
    });

    assert.equal(result.modified,false);
    assert.equal(result.source,source);
    assert.equal(result.blocks.length,1);
  });

  it("should modify code blocks", async () => {
    const source = "```js\noriginal\n```";
    const result = await walk({
      source,
      walker: block => ({
        ...block,
        code: "modified",
      }),
    });

    assert.equal(result.modified,true);
    assert.ok(result.source.includes("modified"));
      assert.ok(!result.source.includes("original"));
  });

  it("should wrap code blocks with comments", async () => {
    const source = await loadFixture("testdoc.md");
    const result = await walk({
      source,
      walker: block => {
        if (block.meta.file?.startsWith("entire")) {
          return {
            ...block,
            code: `/*\n${block.code}*/\n`,
          };
        }
        return block;
      },
    });

    assert.equal(result.modified,true);

    // Verify the modifications
    const modifiedBlocks = parse({ source: result.source });
    const entireBlock = modifiedBlocks.find(b => b.meta.file === "entire.js");

      assert.ok(typeof entireBlock !== "undefined");
    assert.ok(entireBlock?.code.includes("/*"));
    assert.ok(entireBlock?.code.includes("*/"));
  });

  it("should handle async walker functions", async () => {
    const source = "```js\noriginal\n```";
    const result = await walk({
      source,
      walker: async block => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1));
        return {
          ...block,
          code: "async modified",
        };
      },
    });

    assert.equal(result.modified,true);
      assert.ok(result.source.includes("async modified"));
  });

  it("should apply filter before walking", async () => {
    const source = "```js file=a.js\ncode a\n```\n\n```js file=b.js\ncode b\n```";
    const result = await walk({
      source,
      filter: { file: "a.js" },
      walker: block => ({
        ...block,
        code: "modified",
      }),
    });

    assert.equal(result.modified,true);

    // Only a.js should be modified
    const blocks = parse({ source: result.source });
    const blockA = blocks.find(b => b.meta.file === "a.js");
    const blockB = blocks.find(b => b.meta.file === "b.js");

    assert.equal(blockA?.code,"modified");
    assert.equal(blockB?.code,"code b"); // Unchanged
  });

  it("should handle empty code when walker returns null", async () => {
    const source = "```js\noriginal\n```";
    const result = await walk({
      source,
      walker: () => null,
    });

    assert.equal(result.modified,true);
      assert.ok(result.source.includes("```js\n\n```")); // Empty code block with preserved newline
  });

  it("should preserve block positions", async () => {
    const source = "# Header\n\n```js\ncode\n```\n\nMore text";
    const result = await walk({
      source,
      walker: block => {
        assert.ok(typeof block.position !== "undefined");
        assert.ok(typeof block.position?.start !== "undefined");
        assert.ok(typeof block.position?.end !== "undefined");
        return block;
      },
    });

    assert.equal(result.blocks.length,1);
  });
});

describe("matchesFilter", () => {
  it("should match all blocks when no filter provided", () => {
    const source = "```js\ncode\n```\n\n```go\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length,2);
  });

  it("should match language filter", () => {
    const source = "```js\ncode\n```\n\n```go\ncode\n```";
    const blocks = parse({ source, filter: { lang: "js" } });
    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.lang,"js");
  });

  it("should match file filter", () => {
    const source = "```js file=a.js\ncode\n```\n\n```js file=b.js\ncode\n```";
    const blocks = parse({ source, filter: { file: "a.js" } });
    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.meta.file,"a.js");
  });

  it("should match multiple metadata filters", () => {
    const source = "```js file=a.js region=main\ncode\n```\n\n```js file=a.js region=test\ncode\n```";
    const blocks = parse({ source, filter: { meta: { file: "a.js", region: "main" } } });
    assert.equal(blocks.length,1);
    assert.equal(blocks[0]?.meta.region,"main");
  });

  it("should not match when any filter fails", () => {
    const source = "```js file=a.js region=main\ncode\n```";
    const blocks = parse({ source, filter: { lang: "go" } });
    assert.equal(blocks.length,0);
  });
});
