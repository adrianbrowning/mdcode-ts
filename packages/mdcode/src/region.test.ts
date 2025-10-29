/* eslint-disable @typescript-eslint/no-floating-promises */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, it } from "node:test";
import * as assert from "node:assert"

import { outline, read, replace } from "./region.ts";

// Helper to load test fixtures
async function loadFixture(filename: string): Promise<string> {
  const path = join(import.meta.dirname, "..", "..", "..", "tests", "testdata", "region", filename);
  return readFile(path, "utf-8");
}

describe("region.read", () => {
  it("should read empty region", async () => {
    const source = await loadFixture("testdoc.js");
    const result = read(source, "empty");

      assert.equal(result.found,true);
    assert.equal(result.content,"");
  });

  it("should read non-empty region", async () => {
    const source = await loadFixture("testdoc.js");
    const expected = await loadFixture("nonempty.js");

    const result = read(source, "nonempty");

    assert.equal(result.found,true);
    assert.equal(result.content,expected);
  });

  it("should read block comment region", async () => {
    const source = await loadFixture("testdoc.js");
    const expected = await loadFixture("block.js");

    const result = read(source, "block");

    assert.equal(result.found,true);
    assert.equal(result.content,expected);
  });

  it("should return not found for missing region", async () => {
    const source = await loadFixture("testdoc.js");
    const result = read(source, "nonexistent");

    assert.equal(result.found,false);
    assert.equal(result.content,"");
  });

  it("should handle regions with special characters in name", () => {
    const source = `
// #region test-region-123
content here
// #endregion
    `.trim();

    const result = read(source, "test-region-123");

    assert.equal(result.found,true);
    assert.equal(result.content,"content here");
  });
});

describe("region.outline", () => {
  it("should generate outline showing only region markers", async () => {
    const source = await loadFixture("testdoc.js");
    const expected = await loadFixture("testdocoutline.js");

    const result = outline(source);

    assert.equal(result.hasRegions,true);
    assert.equal(result.content,expected);
  });

  it("should return original content when no regions", () => {
    const source = `
function simple() {
  return true;
}
    `.trim();

    const result = outline(source);

    assert.equal(result.hasRegions,false);
    assert.equal(result.content,source);
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

    assert.equal(result.hasRegions,true);
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

    assert.ok(result.content.includes("  // #region inner"))
    assert.ok(result.content.includes("  // #endregion"));
    assert.ok(!result.content.includes("const x"));
  });
});

describe("region.replace", () => {
  it("should replace content in regions", async () => {
    const source = await loadFixture("testdoc.js");

    // Test replacing empty region
    let result = replace(source, "empty", "/* begin */\n/* end */\n");
    assert.equal(result.found,true);

    // Now replace nonempty region
    const nonemptyContent = read(result.content, "nonempty");
    result = replace(result.content, "nonempty", `/* begin */\n${nonemptyContent.content}\n/* end */\n`);
    assert.equal(result.found,true);

    // Finally replace block region
    const blockContent = read(result.content, "block");
    result = replace(result.content, "block", `/* begin */\n${blockContent.content}\n/* end */\n`);
    assert.equal(result.found,true);

    const expected = await loadFixture("testdocmod.js");
    assert.equal(result.content,expected);
  });

  it("should return not found for missing region", () => {
    const source = `
// #region test
content
// #endregion
    `.trim();

    const result = replace(source, "nonexistent", "new content");

    assert.equal(result.found,false);
    assert.equal(result.content,source); // Unchanged
  });

  it("should handle empty replacement content", () => {
    const source = `
// #region test
old content
// #endregion
    `.trim();

    const result = replace(source, "test", "");

    assert.equal(result.found,true);
    assert.equal(result.content,`// #region test\n// #endregion`);
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

    assert.equal(result.found,true);
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

    assert.equal(result.found,true);
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

    assert.equal(result.found,true);
    assert.ok(result.content.includes("new content"));
    assert.ok(!result.content.includes("old content"));
  });
});

describe("region edge cases", () => {
  it("should handle CRLF line endings", () => {
    const source = "// #region test\r\ncontent\r\n// #endregion";
    const result = read(source, "test");

    assert.equal(result.found,true);
    assert.ok(result.content.includes("content"));
  });

  it("should handle mixed line endings", () => {
    const source = "// #region test\ncontent\r\n// #endregion";
    const result = read(source, "test");

    assert.equal(result.found,true);
  });

  it("should handle whitespace around region markers", () => {
    const source = `
  // #region test
content
  // #endregion
    `.trim();

    const result = read(source, "test");

    assert.equal(result.found,true);
    assert.equal(result.content,"content");
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

    assert.equal(result.found,true);
    assert.equal(result.content,"content 2");
    assert.ok(!result.content.includes("content 1"));
  });
});
