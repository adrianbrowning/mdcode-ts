/* eslint-disable @typescript-eslint/no-floating-promises */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {parse} from "../../src/parser.ts";
import * as assert from "node:assert/strict";

// import { parse } from "../../packages/mdcode/src/parser.ts";
import { read as readRegion } from "../../src/region.ts";

// Helper to load example files
async function loadExample(name: string, filename: string): Promise<string> {
  const path = join(import.meta.dirname, name, filename);
  return readFile(path, "utf-8");
}

describe("factorial example", () => {
  it("should extract factorial function from README", async () => {
    const readme = await loadExample("factorial", "README.md");
    const blocks = parse({ source: readme });

    // Find the block with the factorial function
    const functionBlock = blocks.find(
      (b) => b.meta.file === "factorial.test.js" && b.meta.region === "function"
    );

    assert.ok(typeof functionBlock !== "undefined");
    assert.ok(functionBlock?.code.includes("function factorial"));
    assert.ok(functionBlock?.code.includes("if (n > 1)"));
  });

  it("should extract function region from factorial.test.js", async () => {
    const source = await loadExample("factorial", "factorial.test.js");
    const result = readRegion(source, "function");

    assert.equal(result.found,true);
    assert.ok(result.content.includes("function factorial"));
    assert.ok(result.content.includes("if (n > 1)"));
  });

  it("should have matching content between README and source file", async () => {
    const readme = await loadExample("factorial", "README.md");
    const source = await loadExample("factorial", "factorial.test.js");

    const blocks = parse({ source: readme });
    const functionBlock = blocks.find(
      (b) => b.meta.file === "factorial.test.js" && b.meta.region === "function"
    );

    const regionContent = readRegion(source, "function");

    assert.equal(functionBlock?.code.trim(),regionContent.content.trim());
  });
});

describe("fibonacci example", () => {
  it("should extract all fibonacci regions from README", async () => {
    const readme = await loadExample("fibonacci", "README.md");
    const blocks = parse({ source: readme, filter: { file: "fibonacci.js" } });

      assert.ok(blocks.length >= 4);

    const regions = ["signature", "zero", "one", "regular"];
    for (const regionName of regions) {
      const block = blocks.find((b) => b.meta.region === regionName);
      assert.ok(typeof block !== "undefined");
      assert.equal(block?.meta.file,"fibonacci.js");
    }
  });

  it("should extract all regions from fibonacci.js source", async () => {
    const source = await loadExample("fibonacci", "fibonacci.js");

    const signature = readRegion(source, "signature");
    assert.equal(signature.found,true);
    assert.ok(signature.content.includes("function fibonacci"));

    const zero = readRegion(source, "zero");
    assert.equal(zero.found,true);
    assert.ok(zero.content.includes("if (n < 1)"));

    const one = readRegion(source, "one");
    assert.equal(one.found,true);
    assert.ok(one.content.includes("if (n == 1)"));

    const regular = readRegion(source, "regular");
    assert.equal(regular.found,true);
    assert.ok(regular.content.includes("fibonacci(n - 1)"));
  });

  it("should have matching content between README and source file", async () => {
    const readme = await loadExample("fibonacci", "README.md");
    const source = await loadExample("fibonacci", "fibonacci.js");

    const blocks = parse({ source: readme, filter: { file: "fibonacci.js" } });

    for (const block of blocks) {
      if (block.meta.region) {
        const regionContent = readRegion(source, block.meta.region);
        assert.equal(regionContent.found,true);
        assert.equal(block.code.trim(),regionContent.content.trim());
      }
    }
  });
});

describe("region assembly", () => {
  it("should be able to assemble complete fibonacci.js from regions", async () => {
    const readme = await loadExample("fibonacci", "README.md");
    // const expected = await loadExample("fibonacci", "fibonacci.js");

    const blocks = parse({ source: readme, filter: { file: "fibonacci.js" } });

    // Sort blocks by the order they appear in the README
    const orderedRegions = ["signature", "zero", "one", "regular"];
    const orderedBlocks = orderedRegions
      .map((region) => blocks.find((b) => b.meta.region === region))
      .filter((b): b is NonNullable<typeof b> => b !== undefined);

    assert.ok(orderedBlocks.length >= 4);

    // Verify we can reconstruct the essential parts
    const assembled = orderedBlocks.map((b) => b.code).join("");
    assert.ok(assembled.includes("function fibonacci"));
    assert.ok(assembled.includes("if (n < 1)"));
    assert.ok(assembled.includes("if (n == 1)"));
    assert.ok(assembled.includes("fibonacci(n - 1)"));

    // assert.equal(assembled,expected);
  });
});
