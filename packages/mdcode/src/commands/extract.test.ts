/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { BlockFailure } from "../result.ts";
import type { ExtractResult } from "./extract.ts";
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

/** Paths extract wrote or spliced. */
function written(result: ExtractResult): Array<string> {
  return result.targets.filter(target => target.action !== "skipped").map(target => target.path);
}

/** Paths extract left untouched. */
function skipped(result: ExtractResult): Array<string> {
  return result.targets.filter(target => target.action === "skipped").map(target => target.path);
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

    await extract({ source, outputDir: dir });

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

    await extract({ source, outputDir: dir });

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

    await extract({ source, outputDir: dir });

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

    await extract({ source, outputDir: dir });

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

    await extract({ source, outputDir: dir });

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

    await extract({ source, outputDir: dir });
    const first = await readFile(target, "utf-8");

    assert.match(first, /<!-- #region body -->\n<p>fresh<\/p>\n<!-- #endregion body -->/, "marker must use the language's comment syntax");

    await extract({ source, outputDir: dir });
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

    await extract({ source, outputDir: dir });

    assert.equal(await readFile(target, "utf-8"), original, "file must not be overwritten");
  });

  test("overwrites an existing file with force", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "src/demo.ts", "const original = true;\n");

    await extract({ source, outputDir: dir, force: true });

    assert.equal(await readFile(target, "utf-8"), "const replaced = true;", "force must overwrite");
  });

  test("still creates a missing file without force", async () => {
    const dir = await tempDir();

    await extract({ source, outputDir: dir });

    assert.equal(await readFile(join(dir, "src/demo.ts"), "utf-8"), "const replaced = true;");
  });
});

describe("extract: block names", () => {
  test("--update-source keeps a quoted name intact when it adds file=", async () => {
    const dir = await tempDir();
    const source = "```sh name=\"quick start\"\nls\n```\n";

    const result = await extract({ source, outputDir: dir, updateSource: true });

    assert.equal(result.updatedSource, "```sh name=\"quick start\" file=block-1.sh\nls\n```\n");
  });

  test("writes nothing when two blocks share a name", async () => {
    const dir = await tempDir();
    const source = "```js name=a file=a.js\n1\n```\n\n```js name=a file=b.js\n2\n```\n";

    await assert.rejects(extract({ source, outputDir: dir }), { name: "MetadataError" });
    assert.deepEqual(await readdir(dir), []);
  });

  test("refuses updateSource with ignoreAnonymous as invalid_usage, and writes nothing", async () => {
    const dir = await tempDir();

    await assert.rejects(extract({ source: "```js\n1\n```\n", outputDir: dir, updateSource: true, ignoreAnonymous: true }), { code: "invalid_usage" });
    assert.deepEqual(await readdir(dir), []);
  });
});

/** The contract errors a rejected extract() call threw. */
async function refusal(promise: Promise<unknown>): Promise<Array<{ code: string; line?: number; path?: string; }>> {
  try {
    await promise;
  }
  catch (error: unknown) {
    assert.ok(error instanceof BlockFailure, `expected a BlockFailure, got ${String(error)}`);
    return error.errors.map(({ code, line, path }) => ({ code, line, path }));
  }
  assert.fail("extract() should have failed");
}

describe("extract: file= outside the output directory", () => {
  test("refuses a relative file= that leaves the output directory, and writes nothing at all", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "outside/target.ts", "// #region x\nconst old = 1;\n// #endregion x\n");
    const docs = join(dir, "docs");
    await mkdir(docs, { recursive: true });

    const source = [
      "```typescript file=safe.ts",
      "const safe = 1;",
      "```",
      "",
      "```typescript file=../outside/target.ts region=x",
      "const fresh = 2;",
      "```",
      "",
    ].join("\n");

    const errors = await refusal(extract({ source, outputDir: docs }));

    assert.deepEqual(errors, [{ code: "unsafe_path", line: 5, path: "../outside/target.ts" }]);
    assert.equal(await readFile(target, "utf-8"), "// #region x\nconst old = 1;\n// #endregion x\n");
    assert.deepEqual(await readdir(docs), [], "a safe block must not be written alongside a refused one");
  });

  test("writes a file= that wanders but stays inside the output directory", async () => {
    const dir = await tempDir();
    const result = await extract({ source: "```ts file=a/../b/c.ts\nconst c = 1;\n```\n", outputDir: dir });

    assert.deepEqual(written(result), [ join(dir, "b/c.ts") ]);
  });

  test("writes anonymous blocks inside the output directory, whatever their language tag", async () => {
    const dir = await tempDir();
    const out = join(dir, "out");

    // The generated name derives from the language tag; a path-like tag must not steer it.
    const source = "```sh\necho hi\n```\n\n```../../evil\npwned\n```\n";
    const result = await extract({ source, outputDir: out });

    assert.deepEqual(written(result), [ join(out, "block-1.sh"), join(out, "block-2.txt") ]);
    assert.deepEqual((await readdir(out)).sort(), [ "block-1.sh", "block-2.txt" ]);
    assert.deepEqual(await readdir(dir), [ "out" ], "nothing may be written beside the output directory");
  });
});

describe("extract: refuses unsafe targets", () => {
  test("refuses an absolute file=", async () => {
    const dir = await tempDir();
    const outside = await writeSource(dir, "abs.txt", "PRECIOUS\n");

    const source = [
      `\`\`\`text file=${outside}`,
      "pwned",
      "```",
      "",
    ].join("\n");

    const errors = await refusal(extract({ source, outputDir: join(dir, "out"), force: true }));

    assert.equal(await readFile(outside, "utf-8"), "PRECIOUS\n");
    assert.deepEqual(errors, [{ code: "unsafe_path", line: 1, path: outside }]);
  });

  test("refuses an empty file= before writing anything, even with force", async () => {
    const dir = await tempDir();
    const source = "```ts file=safe.ts\nok\n```\n\n```ts file=\"\"\npwned\n```\n";

    const errors = await refusal(extract({ source, outputDir: dir, force: true }));

    assert.deepEqual(errors, [{ code: "unsafe_path", line: 5, path: "" }]);
    assert.deepEqual(await readdir(dir), [], "the safe block must not be written either");
  });

  test("refuses a file= that leads out through a symlinked directory", async () => {
    const dir = await tempDir();
    const out = join(dir, "out");
    await mkdir(join(dir, "elsewhere"));
    await mkdir(out);
    await symlink(join(dir, "elsewhere"), join(out, "link"));

    const errors = await refusal(extract({ source: "```text file=link/new.txt\npwned\n```\n", outputDir: out }));

    assert.deepEqual(errors, [{ code: "unsafe_path", line: 1, path: "link/new.txt" }]);
    assert.deepEqual(await readdir(join(dir, "elsewhere")), []);
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

    const result = await extract({ source, outputDir: dir });

    assert.ok(!(await readFile(real, "utf-8")).includes("99"), "the link target must not be rewritten");
    assert.ok((await lstat(join(dir, "link.ts"))).isSymbolicLink(), "the link must still be a link");
    assert.equal(await readlink(join(dir, "link.ts")), real);
    assert.deepEqual(skipped(result), [ join(dir, "link.ts") ]);
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

    const result = await extract({ source, outputDir: dir });

    assert.ok(bytes.equals(await readFile(target)), "invalid bytes must survive untouched");
    assert.deepEqual(skipped(result), [ target ]);
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

    const errors = await refusal(extract({ source, outputDir: dir, force: true }));

    assert.equal(await readFile(target, "utf-8"), original, "a mixed group has no coherent result");
    assert.deepEqual(errors, [
      { code: "ambiguous_target", line: 1, path: target },
      { code: "ambiguous_target", line: 5, path: target },
    ]);
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

    const errors = await refusal(extract({ source, outputDir: dir }));

    assert.equal(await readFile(target, "utf-8"), original, "an unclosed region must never be written");
    assert.deepEqual(errors, [{ code: "malformed_region", line: 1, path: target }]);
  });

  test("refuses two blocks that declare the same region, for existing and new targets", async () => {
    const dir = await tempDir();
    const original = [
      "// #region alpha",
      "const alpha = 1;",
      "// #endregion alpha",
      "",
    ].join("\n");
    const existing = await writeSource(dir, "dup.ts", original);
    const block = (file: string, body: string): string => [ `\`\`\`typescript file=${file} region=alpha`, body, "```", "" ].join("\n");

    const splicing = await refusal(extract({ source: block("dup.ts", "const first = 1;") + block("dup.ts", "const second = 2;"), outputDir: dir }));

    assert.equal(await readFile(existing, "utf-8"), original, "a splice would silently keep only one body");
    assert.deepEqual(splicing.map(({ code }) => code), [ "ambiguous_target", "ambiguous_target" ]);

    const creating = await refusal(extract({ source: block("new.ts", "const first = 1;") + block("new.ts", "const second = 2;"), outputDir: dir }));

    assert.deepEqual(creating.map(({ code }) => code), [ "ambiguous_target", "ambiguous_target" ]);
    await assert.rejects(readFile(join(dir, "new.ts"), "utf-8"), { code: "ENOENT" });
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

    await extract({ source, outputDir: dir });

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

    const result = await extract({ source, outputDir: dir });

    assert.equal(await readFile(target, "utf-8"), original, "an outline block describes shape, not content");
    assert.deepEqual(written(result), []);
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

    await extract({ source, outputDir: dir });

    const entries = await readdir(dir);

    assert.deepEqual(entries, [ "a.ts" ], "the sibling temp file must be renamed away");
  });
});

describe("extract: reporting", () => {
  test("treats two spellings of one file as one target, so their blocks conflict", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "real"), { recursive: true });
    await symlink(join(dir, "real"), join(dir, "link"), "dir");

    const source = [
      "```typescript file=./real/demo.ts",
      "const shared = 1;",
      "```",
      "",
      "```typescript file=./link/demo.ts",
      "const shared = 1;",
      "```",
      "",
    ].join("\n");

    const errors = await refusal(extract({ source, outputDir: dir }));

    // Both are reported against the first spelling, which names the one file they share.
    assert.deepEqual(errors, [
      { code: "ambiguous_target", line: 1, path: join(dir, "real/demo.ts") },
      { code: "ambiguous_target", line: 5, path: join(dir, "real/demo.ts") },
    ]);
    assert.deepEqual(await readdir(join(dir, "real")), [], "nothing is written for a refused target");
  });

  test("refuses several whole-file blocks for one file, even identical ones", async () => {
    const dir = await tempDir();
    const whole = (code: string): string => [ "```typescript file=d.ts", code, "```", "" ].join("\n");

    for (const source of [ whole("const first = 1;") + whole("const second = 2;"), whole("const first = 1;") + whole("const first = 1;") ]) {
      const errors = await refusal(extract({ source, outputDir: dir }));

      assert.deepEqual(errors.map(({ code }) => code), [ "ambiguous_target", "ambiguous_target" ]);
    }

    assert.deepEqual(await readdir(dir), []);
  });

  test("names the file and the reason when it refuses to write", async () => {
    const dir = await tempDir();
    const target = await writeSource(dir, "s.ts", "const original = true;\n");

    const result = await extract({
      source: "```typescript file=s.ts\nconst replaced = true;\n```\n",
      outputDir: dir,
    });

    assert.deepEqual(skipped(result), [ target ]);
    assert.deepEqual(result.errors.map(({ code, path }) => ({ code, path })), [{ code: "extract_skipped", path: target }]);
    assert.match(result.errors[0]!.message, /--force/, "the reason must name the way forward");
    assert.equal(result.targets[0]!.reason, result.errors[0]!.message);
  });

  test("writes no target at all while any target is refused", async () => {
    const dir = await tempDir();
    const source = "```ts file=safe.ts\nok\n```\n\n```ts file=new/dir/a.ts region=r\none\n```\n\n```ts file=new/dir/a.ts\ntwo\n```\n";

    await refusal(extract({ source, outputDir: dir }));

    assert.deepEqual(await readdir(dir), [], "neither the safe file nor a directory for the refused one may be created");
  });

  test("adds file= only to anonymous blocks whose file was written", async () => {
    const dir = await tempDir();
    await writeSource(dir, "block-1.sh", "precious\n");
    const source = "```sh\nls\n```\n\n```sh\npwd\n```\n";

    const result = await extract({ source, outputDir: dir, updateSource: true });

    assert.deepEqual(skipped(result), [ join(dir, "block-1.sh") ]);
    assert.equal(result.updatedSource, "```sh\nls\n```\n\n```sh file=block-2.sh\npwd\n```\n");
  });
});
