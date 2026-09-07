/* eslint-disable @typescript-eslint/no-floating-promises */
import * as assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { getCommentStyle, outline, read, replace, spliceRegions, wrapRegion } from "./region.ts";

// Helper to load test fixtures
async function loadFixture(filename: string): Promise<string> {
  const path = join(import.meta.dirname, "..", "tests", "testdata", "region", filename);
  return readFile(path, "utf-8");
}

describe("region.read", () => {
  it("should read empty region", async () => {
    const source = await loadFixture("testdoc.js");
    const result = read(source, "empty");

    assert.equal(result.found, true);
    assert.equal(result.content, "");
  });

  it("should read non-empty region", async () => {
    const source = await loadFixture("testdoc.js");
    const expected = await loadFixture("nonempty.js");

    const result = read(source, "nonempty");

    assert.equal(result.found, true);
    assert.equal(result.content, expected);
  });

  it("should read block comment region", async () => {
    const source = await loadFixture("testdoc.js");
    const expected = await loadFixture("block.js");

    const result = read(source, "block");

    assert.equal(result.found, true);
    assert.equal(result.content, expected);
  });

  it("should return not found for missing region", async () => {
    const source = await loadFixture("testdoc.js");
    const result = read(source, "nonexistent");

    assert.equal(result.found, false);
    assert.equal(result.content, "");
  });

  it("should handle regions with special characters in name", () => {
    const source = `
// #region test-region-123
content here
// #endregion
    `.trim();

    const result = read(source, "test-region-123");

    assert.equal(result.found, true);
    assert.equal(result.content, "content here");
  });

  it("reads a block-comment region when given a C-family lang", () => {
    const source = "/* #region body */\nx();\n/* #endregion body */";

    const result = read(source, "body", "ts");

    assert.equal(result.found, true, "C-family langs accept /* as well as //");
    assert.equal(result.content, "x();");
  });

  it("does not read a region whose marker uses another language's syntax", () => {
    const source = "# #region body\nx()\n# #endregion body";

    assert.equal(read(source, "body", "ts").found, false, "# is not a TypeScript comment");
    assert.equal(read(source, "body", "python").found, true);
  });
});

describe("region.outline", () => {
  it("should generate outline showing only region markers", async () => {
    const source = await loadFixture("testdoc.js");
    const expected = await loadFixture("testdocoutline.js");

    const result = outline(source);

    assert.equal(result.hasRegions, true);
    assert.equal(result.content, expected);
  });

  it("should return original content when no regions", () => {
    const source = `
function simple() {
  return true;
}
    `.trim();

    const result = outline(source);

    assert.equal(result.hasRegions, false);
    assert.equal(result.content, source);
  });

  it("should handle nested-looking regions (not truly nested)", () => {
    const source = `
// #region outer
function outer() {
  // This looks like a region but isn't at line start
  // #region inner
  return true;
}
// #endregion
    `.trim();

    const result = outline(source);

    assert.equal(result.hasRegions, true);
    assert.ok(!result.content.includes("function outer"));
  });

  it("should preserve indentation of region markers", () => {
    const source = `
function test() {
  // #region inner
  const x = 1;
  // #endregion
}
    `.trim();

    const result = outline(source);

    assert.ok(result.content.includes("  // #region inner"));
    assert.ok(result.content.includes("  // #endregion"));
    assert.ok(!result.content.includes("const x"));
  });
});

describe("region.replace", () => {
  it("should replace hash-comment regions when given a lang", () => {
    const source = [
      "import sys",
      "",
      "# #region greet",
      "print('old')",
      "# #endregion greet",
      "",
      "sys.exit(0)",
    ].join("\n");

    const result = replace(source, "greet", "print('new')", "python");

    assert.equal(result.found, true);
    assert.match(result.content, /# #region greet\nprint\('new'\)\n# #endregion greet/);
    assert.ok(!result.content.includes("print('old')"));
    assert.match(result.content, /^import sys/);
    assert.match(result.content, /sys\.exit\(0\)$/);
  });

  it("should replace content in regions", async () => {
    const source = await loadFixture("testdoc.js");

    // Test replacing empty region
    let result = replace(source, "empty", "/* begin */\n/* end */\n");
    assert.equal(result.found, true);

    // Now replace nonempty region
    const nonemptyContent = read(result.content, "nonempty");
    result = replace(result.content, "nonempty", `/* begin */\n${nonemptyContent.content}\n/* end */\n`);
    assert.equal(result.found, true);

    // Finally replace block region
    const blockContent = read(result.content, "block");
    result = replace(result.content, "block", `/* begin */\n${blockContent.content}\n/* end */\n`);
    assert.equal(result.found, true);

    const expected = await loadFixture("testdocmod.js");
    assert.equal(result.content, expected);
  });

  it("should return not found for missing region", () => {
    const source = `
// #region test
content
// #endregion
    `.trim();

    const result = replace(source, "nonexistent", "new content");

    assert.equal(result.found, false);
    assert.equal(result.content, source); // Unchanged
  });

  it("should handle empty replacement content", () => {
    const source = `
// #region test
old content
// #endregion
    `.trim();

    const result = replace(source, "test", "");

    assert.equal(result.found, true);
    assert.equal(result.content, `// #region test\n// #endregion`);
  });

  it("should preserve surrounding code", () => {
    const source = `
function before() {
  return 1;
}

// #region test
old content
// #endregion

function after() {
  return 2;
}
    `.trim();

    const result = replace(source, "test", "new content");

    assert.equal(result.found, true);
    assert.ok(result.content.includes("function before"));
    assert.ok(result.content.includes("function after"));
    assert.ok(result.content.includes("new content"));
    assert.ok(!result.content.includes("old content"));
  });

  it("should handle multiple regions", () => {
    const source = `
// #region first
content 1
// #endregion

// #region second
content 2
// #endregion
    `.trim();

    // Replace only the second region
    const result = replace(source, "second", "updated");

    assert.equal(result.found, true);
    assert.ok(result.content.includes("content 1")); // First region unchanged
    assert.ok(result.content.includes("updated"));
    assert.ok(!result.content.includes("content 2"));
  });

  it("should work with block comment style regions", () => {
    const source = `
/* #region test */
old content
/* #endregion */
    `.trim();

    const result = replace(source, "test", "new content");

    assert.equal(result.found, true);
    assert.ok(result.content.includes("new content"));
    assert.ok(!result.content.includes("old content"));
  });
});

describe("region edge cases", () => {
  it("should handle CRLF line endings", () => {
    const source = "// #region test\r\ncontent\r\n// #endregion";
    const result = read(source, "test");

    assert.equal(result.found, true);
    assert.ok(result.content.includes("content"));
  });

  it("should handle mixed line endings", () => {
    const source = "// #region test\ncontent\r\n// #endregion";
    const result = read(source, "test");

    assert.equal(result.found, true);
  });

  it("should handle whitespace around region markers", () => {
    const source = `
  // #region test
content
  // #endregion
    `.trim();

    const result = read(source, "test");

    assert.equal(result.found, true);
    assert.equal(result.content, "content");
  });

  it("should join duplicate regions with same name", () => {
    const source = `
// #region test
content 1
// #endregion

// #region test
content 2
// #endregion
    `.trim();

    const result = read(source, "test");

    assert.equal(result.found, true);
    assert.ok(result.content.includes("content 1"));
    assert.ok(result.content.includes("content 2"));
  });

  it("should not match region name as prefix of another (lang mode)", () => {
    const source = `
// #region join
content A
// #endregion

// #region join-sql
content B
// #endregion
    `.trim();

    const result = read(source, "join", "js");

    assert.equal(result.found, true);
    assert.ok(result.content.includes("content A"));
    assert.ok(!result.content.includes("content B"));
  });

  it("should not match region names partially", () => {
    const source = `
// #region testing
content 1
// #endregion

// #region test
content 2
// #endregion
    `.trim();

    const result = read(source, "test");

    assert.equal(result.found, true);
    assert.equal(result.content, "content 2");
    assert.ok(!result.content.includes("content 1"));
  });
});

describe("region.replace refuses to destroy", () => {
  it("leaves an unterminated region untouched instead of truncating to EOF", () => {
    const source = [
      "const keep = 1;",
      "// #region alpha",
      "const old = 1;",
      "export function important() { return 42; }",
      "const tail = 3;",
      "",
    ].join("\n");

    const result = replace(source, "alpha", "fresh", "ts");

    assert.equal(result.closed, false, "an unclosed region must be reported");
    assert.equal(result.content, source, "source must be returned byte-identical");
  });

  it("closes on a JSDoc-style end marker", () => {
    const source = "head\n// #region alpha\nold\n/** #endregion alpha */\nconst tail = 3;\n";

    const result = replace(source, "alpha", "fresh", "ts");

    assert.equal(result.closed, true);
    assert.ok(result.content.includes("const tail = 3;"), "content after the region must survive");
    assert.ok(!result.content.includes("old"));
  });

  it("closes on a trailing-position end marker", () => {
    const source = "function f() {\n// #region alpha\nold\n} // #endregion alpha\nconst tail = 3;\n";

    const result = replace(source, "alpha", "fresh", "ts");

    assert.equal(result.closed, true);
    assert.ok(result.content.includes("const tail = 3;"), "content after the region must survive");
    assert.ok(result.content.includes("} // #endregion alpha"), "the closing line must be kept verbatim");
  });

  it("is not closed by an end marker naming a different region", () => {
    const source = [
      "const keep = 1;",
      "// #region alpha",
      "const old = 1;",
      "// #endregion beta",
      "export function important() { return 42; }",
      "",
    ].join("\n");

    const result = replace(source, "alpha", "fresh", "ts");

    assert.equal(result.closed, false, "#endregion beta must not close #region alpha");
    assert.equal(result.content, source, "source must be returned byte-identical");
  });

  it("refuses a duplicated region name rather than doubling both bodies", () => {
    const source = "// #region a\none\n// #endregion\n// #region a\ntwo\n// #endregion\n";

    const result = spliceRegions(source, new Map([ [ "a", { code: "X", lang: "ts" } ] ]));

    assert.equal(result.ok, false);
    assert.deepEqual(result.duplicated, [ "a" ]);
    assert.equal(result.content, source, "an ambiguous target must not be written");
  });

  it("refuses a region nested inside one of the same name", () => {
    const source = "// #region a\nouter\n// #region a\ninner\n// #endregion a\n// #endregion a\n";

    const result = spliceRegions(source, new Map([ [ "a", { code: "X", lang: "ts" } ] ]));

    assert.equal(result.ok, false);
    assert.deepEqual(result.duplicated, [ "a" ]);
    assert.equal(result.content, source, "ambiguous nesting must not be written");
  });

  it("refuses to close a region while a region opened inside it is still open", () => {
    const source = [
      "// #region outer",
      "const a = 1;",
      "// #region inner",
      "const b = 2;",
      "// #endregion outer",
      "const tail = 3;",
      "",
    ].join("\n");

    const result = replace(source, "outer", "NEW", "ts");

    assert.equal(result.closed, false, "outer must not close while inner is open");
    assert.equal(result.content, source, "malformed nesting must not be written");
  });

  it("replaces a nested region wholesale without orphaning inner markers", () => {
    const source = [
      "// #region outer",
      "const a = 1;",
      "// #region inner",
      "const b = 2;",
      "// #endregion inner",
      "const c = 3;",
      "// #endregion outer",
      "",
    ].join("\n");

    const result = replace(source, "outer", "NEW", "ts");

    assert.equal(result.closed, true);
    assert.equal(result.content, "// #region outer\nNEW\n// #endregion outer\n");
    assert.ok(!result.content.includes("#endregion inner"), "inner marker must not be orphaned");
    assert.ok(!result.content.includes("const c = 3;"), "old body must not leak past the region");
  });

  it("splices hash-comment regions in shell languages", () => {
    const source = "#!/bin/zsh\n# #region init\nold\n# #endregion init\n";

    const result = replace(source, "init", "new", "zsh");

    assert.equal(result.found, true, "a zsh marker must be recognised, not appended to");
    assert.ok(result.content.includes("# #region init\nnew\n"));
  });

  it("re-indents the inserted body to its start marker", () => {
    const source = "def f():\n    # #region body\n    return 1\n    # #endregion body\n";

    const result = replace(source, "body", "return 2", "python");

    assert.equal(result.content, "def f():\n    # #region body\n    return 2\n    # #endregion body\n");
  });

  it("keeps a CRLF file free of mixed line endings", () => {
    const source = "const keep = 1;\r\n// #region a\r\nold\r\n// #endregion a\r\nconst tail = 2;\r\n";

    const result = replace(source, "a", "fresh", "ts");

    assert.equal(result.content, "const keep = 1;\r\n// #region a\r\nfresh\r\n// #endregion a\r\nconst tail = 2;\r\n");
    assert.ok(!/[^\r]\n/.test(result.content), "no lone LF may be introduced");
  });
});

describe("region.spliceRegions", () => {
  it("splices every region in one pass and reports the ones it could not find", () => {
    const source = [
      "head",
      "// #region a",
      "old a",
      "// #endregion a",
      "middle",
      "// #region b",
      "old b",
      "// #endregion b",
      "tail",
      "",
    ].join("\n");

    const result = spliceRegions(source, new Map([
      [ "a", { code: "new a", lang: "ts" } ],
      [ "b", { code: "new b", lang: "ts" } ],
      [ "c", { code: "new c", lang: "ts" } ],
    ]));

    assert.equal(result.ok, true);
    assert.deepEqual(result.spliced, [ "a", "b" ]);
    assert.deepEqual(result.unmatched, [ "c" ]);
    assert.ok(result.content.includes("new a") && result.content.includes("new b"));
    assert.ok(result.content.includes("head") && result.content.includes("middle") && result.content.includes("tail"));
    assert.ok(!result.content.includes("old a") && !result.content.includes("old b"));
  });

  it("locates each region with its own block's comment syntax", () => {
    const source = [
      "# #region a",
      "old a",
      "# #endregion a",
      "// #region b",
      "old b",
      "// #endregion b",
      "",
    ].join("\n");

    const result = spliceRegions(source, new Map([
      [ "a", { code: "new a", lang: "python" } ],
      [ "b", { code: "new b", lang: "ts" } ],
    ]));

    assert.equal(result.ok, true);
    assert.deepEqual(result.spliced, [ "a", "b" ]);
    assert.ok(result.content.includes("new a") && result.content.includes("new b"));
  });

  it("refuses when two requested regions are nested in each other", () => {
    const source = [
      "// #region outer",
      "a",
      "// #region inner",
      "b",
      "// #endregion inner",
      "c",
      "// #endregion outer",
      "",
    ].join("\n");

    const result = spliceRegions(source, new Map([
      [ "outer", { code: "NEW OUTER", lang: "ts" } ],
      [ "inner", { code: "NEW INNER", lang: "ts" } ],
    ]));

    assert.equal(result.ok, false, "nested requested regions have no well-defined result");
    assert.deepEqual([ ...result.overlapping ].sort(), [ "inner", "outer" ]);
    assert.deepEqual(result.unmatched, [], "both regions were located, neither is missing");
    assert.equal(result.content, source);
  });

  it("preserves a target that has no final newline", () => {
    const source = "head\n// #region a\nold\n// #endregion a";

    const result = spliceRegions(source, new Map([ [ "a", { code: "new", lang: "ts" } ] ]));

    assert.equal(result.ok, true);
    assert.equal(result.content, "head\n// #region a\nnew\n// #endregion a");
  });

  it("empties a region without collapsing its markers", () => {
    const source = "head\n// #region a\nold\nmore old\n// #endregion a\ntail\n";

    const result = spliceRegions(source, new Map([ [ "a", { code: "", lang: "ts" } ] ]));

    assert.equal(result.ok, true);
    assert.equal(result.content, "head\n// #region a\n// #endregion a\ntail\n");
  });

  it("does not match a marker written in another language's syntax", () => {
    const source = "-- #region a\nold\n-- #endregion a\n";

    const result = spliceRegions(source, new Map([ [ "a", { code: "new", lang: "ts" } ] ]));

    assert.deepEqual(result.unmatched, [ "a" ], "a SQL marker must not open a TypeScript region");
    assert.equal(result.content, source);
  });
});

describe("region markers", () => {
  it("writes markers in the target language's own comment syntax", () => {
    assert.equal(wrapRegion("zsh", "q", "echo hi"), "# #region q\necho hi\n# #endregion q\n");
    assert.equal(wrapRegion("sql", "q", "SELECT 1"), "-- #region q\nSELECT 1\n-- #endregion q\n");
    assert.equal(wrapRegion("css", "q", "a{}"), "/* #region q */\na{}\n/* #endregion q */\n");
    assert.equal(wrapRegion("html", "q", "<p>"), "<!-- #region q -->\n<p>\n<!-- #endregion q -->\n");
    assert.deepEqual(getCommentStyle("nosuchlang"), getCommentStyle("ts"), "unknown languages fall back to the C family");
  });

  it("rejects a region name that would close the comment early", () => {
    assert.throws(() => wrapRegion("ts", "evil */ code", "x"), /Invalid region name/);
    assert.throws(() => wrapRegion("html", "evil --> code", "x"), /Invalid region name/);
  });
});
