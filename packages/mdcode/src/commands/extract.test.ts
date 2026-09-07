/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, mock, test } from "node:test";

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

describe("extract: refuses unsafe targets", () => {
  test("refuses a file= that escapes the output directory", async () => {
    const dir = await tempDir();
    const outside = await writeSource(dir, "outside.txt", "PRECIOUS\n");
    const out = join(dir, "out");
    await mkdir(out, { recursive: true });

    const source = [
      "```text file=../outside.txt region=alpha",
      "pwned",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: out, quiet: true, force: true });

    assert.equal(await readFile(outside, "utf-8"), "PRECIOUS\n", "a path outside --dir must not be written");
    assert.deepEqual(result.extractedFiles, []);
    assert.equal(result.skippedFiles.length, 1);
  });

  test("refuses an absolute file=", async () => {
    const dir = await tempDir();
    const outside = await writeSource(dir, "abs.txt", "PRECIOUS\n");

    const source = [
      `\`\`\`text file=${outside}`,
      "pwned",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: join(dir, "out"), quiet: true, force: true });

    assert.equal(await readFile(outside, "utf-8"), "PRECIOUS\n");
    assert.deepEqual(result.extractedFiles, []);
  });

  test("refuses to splice through a symlinked target, leaving the link and its target intact", async () => {
    const dir = await tempDir();
    const real = await writeSource(dir, "real.ts", [
      "// #region alpha",
      "const alpha = 1;",
      "// #endregion alpha",
      "",
    ].join("\n"));
    await symlink(real, join(dir, "link.ts"));

    const source = [
      "```typescript file=link.ts region=alpha",
      "const alpha = 99;",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: dir, quiet: true });

    assert.ok(!(await readFile(real, "utf-8")).includes("99"), "the link target must not be rewritten");
    assert.ok((await lstat(join(dir, "link.ts"))).isSymbolicLink(), "the link must still be a link");
    assert.equal(await readlink(join(dir, "link.ts")), real);
    assert.deepEqual(result.skippedFiles, [ join(dir, "link.ts") ]);
  });

  test("refuses a target that is not valid UTF-8, byte for byte", async () => {
    const dir = await tempDir();
    const target = join(dir, "bin.ts");
    const bytes = Buffer.concat([
      Buffer.from("// #region alpha\n"),
      Buffer.from([ 0xff, 0xfe ]),
      Buffer.from("\n// #endregion alpha\n"),
    ]);
    await writeFile(target, bytes);

    const source = [
      "```typescript file=bin.ts region=alpha",
      "const alpha = 1;",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: dir, quiet: true });

    assert.ok(bytes.equals(await readFile(target)), "invalid bytes must survive untouched");
    assert.deepEqual(result.skippedFiles, [ target ]);
  });

  test("refuses a group mixing region and whole-file blocks, even with force", async () => {
    const dir = await tempDir();
    const original = [
      "// #region alpha",
      "const alpha = 1;",
      "// #endregion alpha",
      "const keep = 2;",
      "",
    ].join("\n");
    const target = await writeSource(dir, "m.ts", original);

    const source = [
      "```typescript file=m.ts region=alpha",
      "const alpha = 42;",
      "```",
      "",
      "```typescript file=m.ts",
      "whole file",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: dir, quiet: true, force: true });

    assert.equal(await readFile(target, "utf-8"), original, "a mixed group has no coherent result");
    assert.deepEqual(result.skippedFiles, [ target ]);
  });

  test("refuses to splice a region the target never closes", async () => {
    const dir = await tempDir();
    const original = [
      "const keep = 1;",
      "// #region alpha",
      "const old = 1;",
      "export function important() { return 42; }",
      "",
    ].join("\n");
    const target = await writeSource(dir, "u.ts", original);

    const source = [
      "```typescript file=u.ts region=alpha",
      "const alpha = 42;",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: dir, quiet: true });

    assert.equal(await readFile(target, "utf-8"), original, "an unclosed region must never be written");
    assert.deepEqual(result.skippedFiles, [ target ]);
  });
});

describe("extract: write fidelity", () => {
  test("preserves the target's permission bits across a splice", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "run.sh", [
      "#!/bin/sh",
      "# #region body",
      "echo old",
      "# #endregion body",
      "",
    ].join("\n"));
    await chmod(target, 0o755);

    const source = [
      "```bash file=run.sh region=body",
      "echo new",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    assert.match(await readFile(target, "utf-8"), /echo new/);
    assert.equal((await stat(target)).mode & 0o777, 0o755, "an executable target must stay executable");
  });

  test("skips outline=true blocks instead of splicing a marker skeleton over real code", async () => {
    const dir = await tempDir();
    const original = [
      "// #region alpha",
      "const realImplementation = 1;",
      "// #endregion alpha",
      "",
    ].join("\n");
    const target = await writeSource(dir, "o.ts", original);

    const source = [
      "```typescript file=o.ts region=alpha outline=true",
      "// #region alpha",
      "// #endregion alpha",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: dir, quiet: true });

    assert.equal(await readFile(target, "utf-8"), original, "an outline block describes shape, not content");
    assert.deepEqual(result.extractedFiles, []);
  });

  test("leaves no temp file behind after an atomic write", async () => {
    const dir = await tempDir();
    await writeSource(dir, "a.ts", "// #region alpha\nold\n// #endregion alpha\n");

    const source = [
      "```typescript file=a.ts region=alpha",
      "fresh",
      "```",
      "",
    ].join("\n");

    await extract({ source, outputDir: dir, quiet: true });

    const entries = await readdir(dir);

    assert.deepEqual(entries, [ "a.ts" ], "the sibling temp file must be renamed away");
  });
});

describe("extract: reporting", () => {
  test("aliased non-region blocks resolve to one file, one write, and no false skip", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "real"), { recursive: true });
    await symlink(join(dir, "real"), join(dir, "link"), "dir");

    const source = [
      "```typescript file=./real/demo.ts",
      "const first = 1;",
      "```",
      "",
      "```typescript file=./link/demo.ts",
      "const second = 2;",
      "```",
      "",
    ].join("\n");

    const result = await extract({ source, outputDir: dir, quiet: true });

    assert.equal(result.extractedFiles.length, 1, "one physical file must be reported once");
    assert.deepEqual(result.skippedFiles, [], "a file this run just created must not report as pre-existing");
    assert.deepEqual(await readdir(join(dir, "real")), [ "demo.ts" ]);
  });

  test("names the file and the reason when it refuses to write", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "s.ts", "const original = true;\n");
    const lines: Array<string> = [];
    mock.method(console, "error", (...args: Array<unknown>) => {
      lines.push(args.map(String).join(" "));
    });

    try {
      const result = await extract({
        source: "```typescript file=s.ts\nconst replaced = true;\n```\n",
        outputDir: dir,
      });

      const stderr = lines.join("\n");

      assert.match(stderr, /Skipped/);
      assert.match(stderr, /s\.ts/, "the warning must name the file");
      assert.match(stderr, /--force/, "the warning must name the way forward");
      assert.deepEqual(result.skippedFiles, [ target ]);
    }
    finally {
      mock.restoreAll();
    }
  });
});
