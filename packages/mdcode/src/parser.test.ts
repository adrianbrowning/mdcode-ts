/* eslint-disable @typescript-eslint/no-floating-promises */
import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { MetadataError } from "./metadata.ts";
import { parse, updateInfoStrings, walk } from "./parser.ts";

/** Assert that parsing `source` fails, and return the reported problems. */
function problemsOf(source: string): MetadataError["problems"] {
  let caught: unknown;

  try {
    parse({ source });
  }
  catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof MetadataError, "parse should throw MetadataError");
  return caught.problems;
}

// Helper to load test fixtures
async function loadFixture(filename: string): Promise<string> {
  const path = join(import.meta.dirname, "..", "tests", "testdata", filename);
  return readFile(path, "utf-8");
}

describe("parseInfoString (via parse)", () => {
  it("should parse empty info string", () => {
    const source = "```\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lang, "");
    assert.deepEqual(blocks[0]?.meta, {});
  });

  it("should parse language only", () => {
    const source = "```js\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lang, "js");
    assert.deepEqual(blocks[0]?.meta, {});
  });

  it("should parse language with simple key=value metadata", () => {
    const source = "```js file=foo.js region=main\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lang, "js");
    assert.deepEqual(blocks[0]?.meta, {
      file: "foo.js",
      region: "main",
    });
  });

  it("should parse metadata with empty value", () => {
    const source = "```js file=foo.js answer=\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0]?.meta, {
      file: "foo.js",
      answer: "",
    });
  });

  it("should skip metadata without equals sign", () => {
    const source = "```js file=foo.js standalone\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0]?.meta, {
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

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.meta.file, "entire.js");
    assert.equal(blocks[0]?.lang, "js");

    const expectedCode = await loadFixture("entire.js");
    assert.equal(blocks[0]?.code, expectedCode);
  });

  it("should extract partial file blocks with region", async () => {
    const source = await loadFixture("testdoc.md");
    const blocks = parse({ source, filter: { meta: { file: "partial.go" } } });

    assert.ok(blocks.length > 0);

    const regionBlock = blocks.find(b => b.meta.region === "function");
    assert.ok(typeof regionBlock !== "undefined");
    assert.equal(regionBlock?.lang, "go");
    assert.equal(regionBlock?.meta.file, "partial.go");
    assert.equal(regionBlock?.meta.region, "function");
  });

  it("should filter by language", () => {
    const source = "```js\njs code\n```\n\n```go\ngo code\n```";
    const blocks = parse({ source, filter: { lang: "js" } });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lang, "js");
    assert.equal(blocks[0]?.code, "js code");
  });

  it("should filter by file metadata", () => {
    const source = "```js file=a.js\ncode a\n```\n\n```js file=b.js\ncode b\n```";
    const blocks = parse({ source, filter: { file: "a.js" } });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.meta.file, "a.js");
    assert.equal(blocks[0]?.code, "code a");
  });

  it("should filter by custom metadata", () => {
    const source = "```js region=main\ncode\n```\n\n```js region=test\ntest\n```";
    const blocks = parse({ source, filter: { meta: { region: "main" } } });

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.meta.region, "main");
  });
});

describe("fenced code blocks", () => {
  const blocksOf = (source: string): Array<[ string, string ]> => parse({ source }).map(block => [ block.lang, block.code ]);

  it("parses backtick and tilde fences of any length from three up", () => {
    for (const char of [ "`", "~" ]) {
      for (const length of [ 3, 4, 5, 8 ]) {
        const fence = char.repeat(length);

        assert.deepEqual(blocksOf(`${fence}js\ncode\n${fence}\n`), [[ "js", "code" ]], `${fence} fence`);
      }
    }
  });

  it("closes only on the same character, at least as long as the opener", () => {
    const source = [ "````md", "```", "~~~~", "~~~```", "````" ].join("\n");

    assert.deepEqual(blocksOf(source), [[ "md", "```\n~~~~\n~~~```" ]]);
    assert.deepEqual(blocksOf("~~~\n~~~```\n~~~\n"), [[ "", "~~~```" ]], "a mixed run is content");
  });

  it("closes on up to three extra columns of indent and trailing whitespace only", () => {
    assert.deepEqual(blocksOf("```js\na\n   ``` \t\n"), [[ "js", "a" ]]);
    assert.deepEqual(blocksOf("```js\n    ```\n``` x\nb\n```\n"), [[ "js", "    ```\n``` x\nb" ]]);
  });

  it("finds fences nested in list items and keeps their code verbatim", () => {
    const source = [ "1. step", "    - sub", "      ```sh", "      echo hi", "      ```", "" ].join("\n");

    assert.deepEqual(blocksOf(source), [[ "sh", "      echo hi" ]]);
  });

  it("rejects a backtick info string containing a backtick, but not a tilde one", () => {
    assert.deepEqual(blocksOf("``` js `x`\ncode\n```\n"), [], "the opener is inline code; the later ``` never closes");
    assert.deepEqual(blocksOf("~~~ js `x`\ncode\n~~~\n"), [[ "js", "code" ]]);
    // commonmark.js 0.31 renders this the same way: the bare ``` after the
    // inline-code line opens a fence, and the ```sh block below is its content.
    assert.deepEqual(blocksOf("``` js `x`\ncode\n```\n\n```sh\nls\n```\n"), [[ "", "\n```sh\nls" ]]);
  });

  it("yields no block for an unclosed fence and leaves the markdown around it alone", async () => {
    const source = "```a\n1\n```\n\n````b\n2\n```\n\ntail\n";

    assert.deepEqual(blocksOf(source), [[ "a", "1" ]]);

    const result = await walk({ source, walker: block => ({ ...block, code: "X" }) });

    assert.equal(result.source, "```a\nX\n```\n\n````b\n2\n```\n\ntail\n");
  });

  it("keeps CRLF line endings out of the code", () => {
    assert.deepEqual(blocksOf("~~~sh\r\nls\r\n~~~\r\n"), [[ "sh", "ls" ]]);
  });
});

describe("quoted metadata values", () => {
  const metaOf = (info: string): Record<string, string> | undefined => parse({ source: `\`\`\`${info}\ncode\n\`\`\`` })[0]?.meta;

  it("reads a double-quoted value with spaces as one value", () => {
    assert.deepEqual(metaOf("ts file=\"examples/getting started.ts\" name=\"quick start\""), {
      file: "examples/getting started.ts",
      name: "quick start",
    });
  });

  it("unescapes \\\" and \\\\ inside quotes", () => {
    assert.deepEqual(metaOf(String.raw`txt label="say \"hi\"" path="C:\\tmp"`), { label: "say \"hi\"", path: "C:\\tmp" });
  });

  it("keeps unquoted values verbatim, backslashes and inner quotes included", () => {
    assert.deepEqual(metaOf(String.raw`txt path=C:\tmp label=a"b empty=`), { path: "C:\\tmp", label: "a\"b", empty: "" });
  });

  it("accepts an empty quoted value", () => {
    assert.deepEqual(metaOf("txt label=\"\""), { label: "" });
  });

  it("reports an unterminated quote with its fence line", () => {
    assert.deepEqual(problemsOf("text\n\n```ts file=\"a b.ts\ncode\n```"), [
      { line: 3, message: "unterminated quoted value for \"file\"; add the closing \"" },
    ]);
  });

  it("reports an escape other than \\\" or \\\\", () => {
    const [ problem ] = problemsOf(String.raw`~~~ts file="a\nb.ts"` + "\ncode\n~~~");

    assert.match(problem!.message, /invalid escape \\n in the value of "file"/);
  });

  it("reports text glued to a closing quote", () => {
    const [ problem ] = problemsOf("```ts file=\"a\"b.ts\ncode\n```");

    assert.match(problem!.message, /text after the closing quote of "file"/);
  });

  it("reports a key repeated in one fence", () => {
    const [ problem ] = problemsOf("```ts file=a.ts file=\"b.ts\"\ncode\n```");

    assert.match(problem!.message, /duplicate key "file"/);
  });

  it("reports every problem in the document, in line order", () => {
    const source = "```ts a=1 a=2\nx\n```\n\n```ts b=\"open\ny\n```\n";

    assert.deepEqual(problemsOf(source).map(problem => problem.line), [ 1, 5 ]);
  });

  it("ignores fences that are not complete blocks", () => {
    assert.deepEqual(parse({ source: "text\n```ts file=\"never closed\n" }), []);
  });
});

describe("block names", () => {
  it("exposes name= as the block's name, and leaves unnamed blocks without one", () => {
    const [ named, unnamed ] = parse({ source: "```ts name=\"quick start\"\na\n```\n\n```ts\nb\n```\n" });

    assert.equal(named?.name, "quick start");
    assert.ok(unnamed && !("name" in unnamed));
  });

  it("selects a block by name", () => {
    const source = "```ts name=setup\na\n```\n\n```ts name=\"quick start\"\nb\n```\n";

    assert.deepEqual(parse({ source, filter: { name: "quick start" } }).map(block => block.code), [ "b" ]);
    assert.deepEqual(parse({ source, filter: { name: "missing" } }), []);
  });

  it("rejects duplicate names, naming every line that uses them", () => {
    const source = "```ts name=a\n1\n```\n\n```ts name=b\n2\n```\n\n```js name=a\n3\n```\n";

    assert.deepEqual(problemsOf(source), [
      { line: 1, message: "duplicate name \"a\" on lines 1, 9; names must be unique within a document" },
    ]);
  });

  it("rejects duplicate names even when a filter excludes one of them", () => {
    const source = "```ts name=a\n1\n```\n\n```js name=a\n2\n```\n";

    assert.throws(() => parse({ source, filter: { lang: "ts" } }), { name: "MetadataError" });
  });

  it("rejects an empty name", () => {
    assert.match(problemsOf("```ts name=\n1\n```")[0]!.message, /name is empty/);
  });
});

describe("updateInfoStrings", () => {
  it("keeps each opener's indentation, character, and length", () => {
    const source = "  ~~~~~sh\nls\n  ~~~~~\n";

    assert.equal(updateInfoStrings(source, new Map([[ 0, { file: "a.sh" }]])), "  ~~~~~sh file=a.sh\nls\n  ~~~~~\n");
  });

  it("numbers blocks exactly as parse does when one fence contains another", () => {
    const source = "````markdown\n```bash\necho hi\n```\n````\n\n```sh\nls\n```\n";
    const updated = updateInfoStrings(source, new Map([[ 1, { file: "block-2.sh" }]]));

    assert.equal(updated, "````markdown\n```bash\necho hi\n```\n````\n\n```sh file=block-2.sh\nls\n```\n");
    assert.deepEqual(parse({ source: updated }).map(block => block.meta), [{}, { file: "block-2.sh" }]);
  });

  it("quotes values that need it, so the result parses back to the same metadata", () => {
    const source = "```ts name=\"quick start\" label=\"say \\\"hi\\\"\"\ncode\n```\n";
    const updated = updateInfoStrings(source, new Map([[ 0, { file: "my file.ts" }]]));

    assert.equal(updated, "```ts name=\"quick start\" label=\"say \\\"hi\\\"\" file=\"my file.ts\"\ncode\n```\n");
    assert.deepEqual(parse({ source: updated })[0]?.meta, { name: "quick start", label: "say \"hi\"", file: "my file.ts" });
  });

  it("rejects invalid metadata even with nothing to update", () => {
    assert.throws(() => updateInfoStrings("```ts name=a\n1\n```\n\n```ts name=a\n2\n```\n", new Map()), { name: "MetadataError" });
  });
});

describe("walk", () => {
  it("should not modify when walker returns same block", async () => {
    const source = "```js\noriginal\n```";
    const result = await walk({
      source,
      walker: block => block,
    });

    assert.equal(result.modified, false);
    assert.equal(result.source, source);
    assert.equal(result.blocks.length, 1);
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

    assert.equal(result.modified, true);
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

    assert.equal(result.modified, true);

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

    assert.equal(result.modified, true);
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

    assert.equal(result.modified, true);

    // Only a.js should be modified
    const blocks = parse({ source: result.source });
    const blockA = blocks.find(b => b.meta.file === "a.js");
    const blockB = blocks.find(b => b.meta.file === "b.js");

    assert.equal(blockA?.code, "modified");
    assert.equal(blockB?.code, "code b"); // Unchanged
  });

  it("should handle empty code when walker returns null", async () => {
    const source = "```js\noriginal\n```";
    const result = await walk({
      source,
      walker: () => null,
    });

    assert.equal(result.modified, true);
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

    assert.equal(result.blocks.length, 1);
  });
});

describe("matchesFilter", () => {
  it("should match all blocks when no filter provided", () => {
    const source = "```js\ncode\n```\n\n```go\ncode\n```";
    const blocks = parse({ source });
    assert.equal(blocks.length, 2);
  });

  it("should match language filter", () => {
    const source = "```js\ncode\n```\n\n```go\ncode\n```";
    const blocks = parse({ source, filter: { lang: "js" } });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.lang, "js");
  });

  it("should match file filter", () => {
    const source = "```js file=a.js\ncode\n```\n\n```js file=b.js\ncode\n```";
    const blocks = parse({ source, filter: { file: "a.js" } });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.meta.file, "a.js");
  });

  it("should match multiple metadata filters", () => {
    const source = "```js file=a.js region=main\ncode\n```\n\n```js file=a.js region=test\ncode\n```";
    const blocks = parse({ source, filter: { meta: { file: "a.js", region: "main" } } });
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.meta.region, "main");
  });

  it("should not match when any filter fails", () => {
    const source = "```js file=a.js region=main\ncode\n```";
    const blocks = parse({ source, filter: { lang: "go" } });
    assert.equal(blocks.length, 0);
  });
});
