/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { extract } from "./extract.ts";

const tempDirs: Array<string> = [];

after(async () => {
  await Promise.all(tempDirs.map(async d => rm(d, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-extract-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSource(dir: string, relPath: string, content: string): Promise<string> {
  const full = join(dir, relPath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf-8");
  return full;
}

describe("extract: in-place region splice", () => {
  test("preserves surrounding code and regions absent from the markdown", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "src/demo.ts", [
      `import assert from "node:assert/strict";`,
      "",
      "// #region alpha",
      "const alpha = 1;",
      "// #endregion alpha",
      "",
      "// #region beta",
      "const beta = 2;",
      "// #endregion beta",
      "",
      "assert.equal(alpha + beta, 3);",
      "",
    ].join("\n"));

    const source = [
      "```typescript file=./src/demo.ts region=alpha",
      "const alpha = 42;",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    const result = await readFile(target, "utf-8");

    assert.match(result, /import assert from "node:assert\/strict";/, "import must survive");
    assert.match(result, /assert\.equal\(alpha \+ beta, 3\);/, "assertion must survive");
    assert.match(result, /#region beta[\s\S]*const beta = 2;[\s\S]*#endregion beta/, "undeclared region must survive");
    assert.match(result, /#region alpha\nconst alpha = 42;\n\/\/ #endregion alpha/, "declared region body must be replaced");
    assert.doesNotMatch(result, /const alpha = 1;/, "old region body must be gone");
  });

  test("appends a region declared in markdown but absent from the file", async () => {
    const dir = await tempDir();
    const original = [
      `import assert from "node:assert/strict";`,
      "",
      "// #region alpha",
      "const alpha = 1;",
      "// #endregion alpha",
      "",
    ].join("\n");
    const target = await writeSource(dir, "src/demo.ts", original);

    const source = [
      "```typescript file=./src/demo.ts region=gamma",
      "const gamma = 3;",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    const result = await readFile(target, "utf-8");

    assert.ok(result.startsWith(original), "existing content must be untouched");
    assert.match(result, /\/\/ #region gamma\nconst gamma = 3;\n\/\/ #endregion gamma/, "missing region must be appended");
  });

  test("aliased file= paths resolving to one file do not clobber each other", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "real/demo.ts", [
      "// #region alpha",
      "const alpha = 1;",
      "// #endregion alpha",
      "",
      "// #region beta",
      "const beta = 2;",
      "// #endregion beta",
      "",
    ].join("\n"));
    await symlink(join(dir, "real"), join(dir, "link"), "dir");

    const source = [
      "```typescript file=./real/demo.ts region=alpha",
      "const alpha = 42;",
      "```",
      "",
      "```typescript file=./link/demo.ts region=beta",
      "const beta = 99;",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    const result = await readFile(target, "utf-8");

    assert.match(result, /const alpha = 42;/, "region from first spelling must survive");
    assert.match(result, /const beta = 99;/, "region from aliased spelling must survive");
  });

  test("splices hash-comment regions instead of duplicating them", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "src/demo.py", [
      "import sys",
      "",
      "# #region greet",
      "print('old')",
      "# #endregion greet",
      "",
      "sys.exit(0)",
      "",
    ].join("\n"));

    const source = [
      "```python file=./src/demo.py region=greet",
      "print('new')",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    const result = await readFile(target, "utf-8");

    assert.equal(result.match(/#region greet/g)?.length, 1, "region must not be duplicated");
    assert.match(result, /# #region greet\nprint\('new'\)\n# #endregion greet/);
    assert.match(result, /sys\.exit\(0\)/, "surrounding code must survive");
  });

  test("splices regions whose markers use block comments", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "app.js", [
      "const keep = 1;",
      "/* #region body */",
      "old();",
      "/* #endregion body */",
      "const tail = 2;",
      "",
    ].join("\n"));

    const source = [
      "```js file=app.js region=body",
      "fresh();",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    const result = await readFile(target, "utf-8");

    assert.equal(result.match(/#region body/g)?.length, 1, "region must not be duplicated");
    assert.match(result, /\/\* #region body \*\/\nfresh\(\);\n\/\* #endregion body \*\//);
    assert.doesNotMatch(result, /old\(\);/, "old region body must be gone");
    assert.match(result, /const keep = 1;[\s\S]*const tail = 2;/, "surrounding code must survive");
  });

  test("re-matches markers it appended itself, so repeated runs are idempotent", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "page.html", "<h1>existing</h1>\n");

    const source = [
      "```html file=page.html region=body",
      "<p>fresh</p>",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });
    const first = await readFile(target, "utf-8");

    assert.match(first, /<!-- #region body -->\n<p>fresh<\/p>\n<!-- #endregion body -->/, "marker must use the language's comment syntax");

    await extract({ source, outputDir: dir, quiet: true });
    const second = await readFile(target, "utf-8");

    assert.equal(second, first, "a second run must splice, not append again");
    assert.equal(second.match(/#region body/g)?.length, 1, "region must not be duplicated");
  });
});

describe("extract: --force for non-region overwrites", () => {
  const source = [
    "```typescript file=./src/demo.ts",
    "const replaced = true;",
    "```",
    "",
  ].join("\n");

  test("leaves an existing file untouched without force", async () => {
    const dir = await tempDir();
    const original = "const original = true;\n";
    const target = await writeSource(dir, "src/demo.ts", original);

    await extract({ source, outputDir: dir, quiet: true });

    assert.equal(await readFile(target, "utf-8"), original, "file must not be overwritten");
  });

  test("overwrites an existing file with force", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "src/demo.ts", "const original = true;\n");

    await extract({ source, outputDir: dir, quiet: true, force: true });

    assert.equal(await readFile(target, "utf-8"), "const replaced = true;", "force must overwrite");
  });

  test("still creates a missing file without force", async () => {
    const dir = await tempDir();

    await extract({ source, outputDir: dir, quiet: true });

    assert.equal(await readFile(join(dir, "src/demo.ts"), "utf-8"), "const replaced = true;");
  });
});
