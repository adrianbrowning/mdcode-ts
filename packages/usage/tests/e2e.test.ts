import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  cleanupTempDir,
  copyFixtures,
  createTempDir,
  readFileContent,
  runDiff,
  runExtract,
  runUpdate,
  writeFileContent
} from "./test-utils.ts";

describe("End-to-End Extract and Update", () => {
  let tempDir: string;
  let testMdPath: string;
  let workingMdPath: string;
  const fixturesDir = new URL("../fixtures/", import.meta.url).pathname;

  beforeEach(async () => {
    // Create temp directory and copy fixtures
    tempDir = await createTempDir();
    await copyFixtures(tempDir);
    testMdPath = join(tempDir, "test.md");
    workingMdPath = join(tempDir, "working.md");
  });

  afterEach(async () => {
    // Clean up temp directory
    await cleanupTempDir(tempDir);
  });

  it("should extract code blocks to files and preserve regions", async () => {
    // Run extract command
    const extractedFiles = await runExtract(testMdPath, tempDir);

    // Verify files were created
    assert.ok(extractedFiles.length > 0);

    // Verify region files contain ONLY the region content, not full file
    const regionsJsContent = await readFileContent(join(tempDir, "regions.js"));
    const mathTsContent = await readFileContent(join(tempDir, "math.ts"));
    const stringsPyContent = await readFileContent(join(tempDir, "strings.py"));

    // For region-only blocks, the extracted file should contain only the function
    // and not include content outside the region
    assert.ok(regionsJsContent.includes("function factorial"));
    assert.ok(regionsJsContent.includes("function isPrime"));
    assert.ok(!regionsJsContent.includes("const PI"));
    assert.ok(!regionsJsContent.includes("export"));

    assert.ok(mathTsContent.includes("function fibonacci"));
    assert.ok(!mathTsContent.includes("GOLDEN_RATIO"));
    assert.ok(!mathTsContent.includes("function power"));

    assert.ok(stringsPyContent.includes("def reverse_string"));
    assert.ok(!stringsPyContent.includes("VOWELS"));
    assert.ok(!stringsPyContent.includes("def is_palindrome"));
  });

  it("should update markdown with no changes when source files match", async () => {
    // Extract files first (they should match the source files)
    await runExtract(testMdPath, tempDir);

    // Run update and save to working file
    const updatedMarkdown = await runUpdate(testMdPath);
    await writeFileContent(workingMdPath, updatedMarkdown);

    // Compare with expected (no changes)
    const expectedPath = join(fixturesDir, "expected-no-changes.md");
    const diff = await runDiff(workingMdPath, expectedPath);

    assert.strictEqual(diff, "");
  });

  it("should update markdown from modified source files", async () => {
    // Extract files first
    await runExtract(testMdPath, tempDir);

    // Modify simple.js (file-only block)
    await writeFileContent(
      join(tempDir, "simple.js"),
      `function greet(name) {
  return \`Hi there, \${name}!\`;
}

console.log(greet('Universe'));`
    );

    // Run update and save to working file
    const updatedMarkdown = await runUpdate(testMdPath);
    await writeFileContent(workingMdPath, updatedMarkdown);

    // Compare with expected (simple update)
    const expectedPath = join(fixturesDir, "expected-simple-update.md");
    const diff = await runDiff(workingMdPath, expectedPath);

    assert.strictEqual(diff, "");
  });

  it("should update markdown with region changes", async () => {
    // Extract files
    await runExtract(testMdPath, tempDir);

    // Update regions.js - modify factorial region
    const regionsJs = await readFileContent(join(tempDir, "regions.js"));
    const updatedRegionsJs = regionsJs.replace(
      /\/\/ #region factorial[\s\S]*?\/\/ #endregion factorial/,
      `// #region factorial
function factorial(n) {
  // Updated implementation with memoization
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}
// #endregion factorial`
    );
    await writeFileContent(join(tempDir, "regions.js"), updatedRegionsJs);

    // Update math.ts - modify fibonacci region
    const mathTs = await readFileContent(join(tempDir, "math.ts"));
    const updatedMathTs = mathTs.replace(
      /\/\/ #region fibonacci[\s\S]*?\/\/ #endregion fibonacci/,
      `// #region fibonacci
function fibonacci(n: number): number {
  // Updated with iterative approach
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}
// #endregion fibonacci`
    );
    await writeFileContent(join(tempDir, "math.ts"), updatedMathTs);

    // Run update and save to working file
    const updatedMarkdown = await runUpdate(testMdPath);
    await writeFileContent(workingMdPath, updatedMarkdown);

    // Compare with expected (region update)
    const expectedPath = join(fixturesDir, "expected-region-update.md");
    const diff = await runDiff(workingMdPath, expectedPath);

    assert.strictEqual(diff, "");
  });

  it("should correctly handle multiple regions in the same file", async () => {
    // Extract files
    await runExtract(testMdPath, tempDir);

    // Modify both regions in regions.js
    const regionsJs = await readFileContent(join(tempDir, "regions.js"));

    // Update factorial region
    let updatedRegionsJs = regionsJs.replace(
      /\/\/ #region factorial[\s\S]*?\/\/ #endregion factorial/,
      `// #region factorial
function factorial(n) {
  return n <= 1 ? 1 : n * factorial(n - 1);
}
// #endregion factorial`
    );

    // Update isPrime region
    updatedRegionsJs = updatedRegionsJs.replace(
      /\/\/ #region isPrime[\s\S]*?\/\/ #endregion isPrime/,
      `// #region isPrime
function isPrime(num) {
  if (num < 2) return false;
  if (num === 2) return true;
  if (num % 2 === 0) return false;
  for (let i = 3; i * i <= num; i += 2) {
    if (num % i === 0) return false;
  }
  return true;
}
// #endregion isPrime`
    );

    await writeFileContent(join(tempDir, "regions.js"), updatedRegionsJs);

    // Run update and save to working file
    const updatedMarkdown = await runUpdate(testMdPath);
    await writeFileContent(workingMdPath, updatedMarkdown);

    // Compare with expected (multi-region update)
    const expectedPath = join(fixturesDir, "expected-multi-region.md");
    const diff = await runDiff(workingMdPath, expectedPath);

    assert.strictEqual(diff, "");
  });

  it("should handle different comment styles for different languages", async () => {
    await runExtract(testMdPath, tempDir);

    // Verify Python uses # for regions
    const stringsPy = await readFileContent(join(tempDir, "strings.py"));
    assert.ok(stringsPy.includes("# #region reverse"));
    assert.ok(stringsPy.includes("# #endregion reverse"));

    // Verify JavaScript uses // for regions
    const regionsJs = await readFileContent(join(tempDir, "regions.js"));
    assert.ok(regionsJs.includes("// #region factorial"));
    assert.ok(regionsJs.includes("// #endregion factorial"));

    // Modify Python region
    const updatedStringsPy = stringsPy.replace(
      /# #region reverse[\s\S]*?# #endregion reverse/,
      `# #region reverse
def reverse_string(s):
    # Updated with explicit loop
    result = ""
    for char in reversed(s):
        result += char
    return result
# #endregion reverse`
    );
    await writeFileContent(join(tempDir, "strings.py"), updatedStringsPy);

    // Run update and save to working file
    const updatedMarkdown = await runUpdate(testMdPath);
    await writeFileContent(workingMdPath, updatedMarkdown);

    // Compare with expected (Python region update)
    const expectedPath = join(fixturesDir, "expected-python-region.md");
    const diff = await runDiff(workingMdPath, expectedPath);

    assert.strictEqual(diff, "");
  });
});
