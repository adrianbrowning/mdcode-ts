/* eslint-disable @typescript-eslint/no-floating-promises */
import * as assert from "node:assert";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";

import { BlockFailure } from "../result.ts";
import { defineTransform } from "../types.ts";
import { update } from "./update.ts";

const dirs: Array<string> = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-update-"));
  dirs.push(dir);
  return dir;
}

async function writeSource(dir: string, relative: string, content: string): Promise<string> {
  const target = join(dir, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf-8");
  return target;
}

after(async () => {
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

describe("update from file regions", () => {
  it("leaves the block unchanged and reports when the region is never closed", async () => {
    const dir = await tempDir();
    await writeSource(dir, "a.js", [
      "const keep = 1;",
      "// #region alpha",
      "const inside = 2;",
      "",
    ].join("\n"));

    const source = [
      "```js file=a.js region=alpha",
      "ORIGINAL",
      "```",
      "",
    ].join("\n");

    const result = await update({ source, basePath: dir, continueOnError: true });

    assert.equal(result.source, source, "an unterminated region must not rewrite the markdown block");
    assert.deepStrictEqual(result.blocks.map(block => block.changed), [ false ]);
    assert.deepStrictEqual(result.errors.map(({ code, line, path }) => ({ code, line, path })), [{ code: "malformed_region", line: 1, path: "a.js" }]);
    assert.match(result.errors[0]!.message, /alpha/);
  });

  it("leaves the block unchanged and reports when the region is absent", async () => {
    const dir = await tempDir();
    await writeSource(dir, "a.js", "const keep = 1;\n");

    const source = [
      "```js file=a.js region=missing",
      "ORIGINAL",
      "```",
      "",
    ].join("\n");

    const result = await update({ source, basePath: dir, continueOnError: true });

    assert.equal(result.source, source, "a missing region must not empty the markdown block");
    assert.deepStrictEqual(result.errors.map(error => error.code), [ "missing_region" ]);
  });

  it("refuses a region the file opens twice, rather than joining both bodies", async () => {
    const dir = await tempDir();
    await writeSource(dir, "a.js", "// #region alpha\n1\n// #endregion alpha\n// #region alpha\n2\n// #endregion alpha\n");

    const source = "```js file=a.js region=alpha\nORIGINAL\n```\n";

    await assert.rejects(update({ source, basePath: dir }), (error: unknown) => {
      assert.ok(error instanceof BlockFailure);
      assert.deepStrictEqual(error.errors.map(({ code, path }) => ({ code, path })), [{ code: "duplicate_region", path: "a.js" }]);
      return true;
    });
  });

  it("refuses an empty file=, as validate does, instead of ignoring it", async () => {
    const dir = await tempDir();
    const source = "```js file=\"\"\nORIGINAL\n```\n";

    const result = await update({ source, basePath: dir, continueOnError: true });

    assert.equal(result.source, source);
    assert.deepStrictEqual(result.errors.map(error => error.code), [ "unsafe_path" ]);
  });

  it("still fills the block from a well-formed region", async () => {
    const dir = await tempDir();
    await writeSource(dir, "a.js", [
      "const keep = 1;",
      "// #region alpha",
      "const inside = 2;",
      "// #endregion alpha",
      "",
    ].join("\n"));

    const source = [
      "```js file=a.js region=alpha",
      "ORIGINAL",
      "```",
      "",
    ].join("\n");

    const result = await update({ source, basePath: dir });

    assert.match(result.source, /const inside = 2;/);
    assert.ok(!result.source.includes("ORIGINAL"));
    assert.deepStrictEqual(result.blocks, [{ name: null, line: 1, lang: "js", changed: true, code: "const inside = 2;", read: { file: "a.js", region: "alpha" }, transformed: false }]);
    assert.deepStrictEqual(result.errors, []);
  });

  it("with continueOnError, still transforms the original code when file= cannot be read, and reports the read failure", async () => {
    const dir = await tempDir();
    const source = "```js file=missing.js\nconst x = 1;\n```\n";

    const transformer = defineTransform(({ code }) => code.toUpperCase());
    const result = await update({ source, basePath: dir, transformer, continueOnError: true });

    assert.equal(result.source, "```js file=missing.js\nCONST X = 1;\n```\n");
    assert.deepStrictEqual(result.blocks, [{ name: null, line: 1, lang: "js", changed: true, code: "CONST X = 1;", transformed: true }]);
    assert.deepStrictEqual(result.errors.map(({ code, path }) => ({ code, path })), [{ code: "read_failed", path: "missing.js" }]);
  });

  it("reports a block whose file matches it as unchanged, despite the file's final newline", async () => {
    const dir = await tempDir();
    await writeSource(dir, "a.js", "const a = 1;\r\nconst b = 2;\r\n");
    await writeSource(dir, "b.js", "const c = 3;\n");
    const source = "```js file=a.js\r\nconst a = 1;\r\nconst b = 2;\r\n```\r\n\n```js file=b.js\nconst c = 3;\n```\n";

    const result = await update({ source, basePath: dir });

    assert.equal(result.source, source);
    assert.deepStrictEqual(result.blocks.map(block => block.changed), [ false, false ]);
  });
});

/** The contract errors a rejected update() call threw. */
async function failure(promise: Promise<unknown>): Promise<Array<{ code: string; line?: number; name?: string; path?: string; }>> {
  try {
    await promise;
  }
  catch (error: unknown) {
    assert.ok(error instanceof BlockFailure, `expected a BlockFailure, got ${String(error)}`);
    return error.errors.map(({ code, line, name, path }) => ({ code, line, ...(name === undefined ? {} : { name }), ...(path === undefined ? {} : { path }) }));
  }
  assert.fail("update() should have failed");
}

describe("update failure policy", () => {
  it("stops at the first failed read, before reading or transforming later blocks", async () => {
    const dir = await tempDir();
    await writeSource(dir, "b.js", "const b = 2;\n");
    const source = "```js file=missing.js name=first\nconst a = 1;\n```\n\n```js file=b.js\nOLD\n```\n";
    const seen: Array<string> = [];
    const transformer = defineTransform(({ code }) => {
      seen.push(code);
      return code;
    });

    const errors = await failure(update({ source, basePath: dir, transformer }));

    assert.deepStrictEqual(errors, [{ code: "read_failed", line: 1, name: "first", path: "missing.js" }]);
    assert.deepStrictEqual(seen, [], "no transform may run once a read has failed");
  });

  it("stops at the first transformer that throws", async () => {
    const dir = await tempDir();
    const source = "```js\none\n```\n\n```js\ntwo\n```\n";
    const seen: Array<string> = [];
    const transformer = defineTransform(({ code }) => {
      seen.push(code);
      throw new Error("boom");
    });

    const errors = await failure(update({ source, basePath: dir, transformer }));

    assert.deepStrictEqual(errors, [{ code: "transform_failed", line: 1 }]);
    assert.deepStrictEqual(seen, [ "one" ]);
  });

  it("with continueOnError, reports every failed block and updates the rest", async () => {
    const dir = await tempDir();
    await writeSource(dir, "ok.js", "const ok = 1;\n");
    const source = "```js file=missing.js\nA\n```\n\n```js file=ok.js\nB\n```\n\n```js file=../out.js\nC\n```\n";

    const result = await update({ source, basePath: dir, continueOnError: true });

    assert.deepStrictEqual(result.errors.map(({ code, line }) => ({ code, line })), [
      { code: "read_failed", line: 1 },
      { code: "unsafe_path", line: 9 },
    ]);
    assert.deepStrictEqual(result.blocks.map(block => block.code), [ "A", "const ok = 1;", "C" ]);
  });
});

describe("update keeps file= inside basePath", () => {
  it("reads a file= that wanders but stays inside", async () => {
    const dir = await tempDir();
    await writeSource(dir, "src/a.js", "const a = 1;\n");

    const result = await update({ source: "```js file=lib/../src/a.js\nOLD\n```\n", basePath: dir });

    assert.deepStrictEqual(result.blocks.map(block => block.code), [ "const a = 1;" ]);
  });

  for (const [ label, file ] of [[ "a .. traversal", "../secret.txt" ], [ "a deeper traversal", "src/../../secret.txt" ]] as const) {
    it(`refuses ${label} before reading`, async () => {
      const root = await tempDir();
      const base = join(root, "docs");
      await writeSource(root, "secret.txt", "SECRET\n");
      await mkdir(base);

      const errors = await failure(update({ source: `\`\`\`text file=${file}\nkeep\n\`\`\`\n`, basePath: base }));

      assert.deepStrictEqual(errors, [{ code: "unsafe_path", line: 1, path: file }]);
    });
  }

  it("refuses an absolute file=", async () => {
    const dir = await tempDir();
    const secret = await writeSource(dir, "secret.txt", "SECRET\n");

    const errors = await failure(update({ source: `\`\`\`text file=${secret}\nkeep\n\`\`\`\n`, basePath: join(dir, "docs") }));

    assert.deepStrictEqual(errors, [{ code: "unsafe_path", line: 1, path: secret }]);
  });

  it("refuses a file= that leads out through a symlinked file or directory", async () => {
    const root = await tempDir();
    const base = join(root, "docs");
    await writeSource(root, "outside/secret.txt", "SECRET\n");
    await mkdir(base);
    await symlink(join(root, "outside/secret.txt"), join(base, "link.txt"));
    await symlink(join(root, "outside"), join(base, "linkdir"));

    for (const file of [ "link.txt", "linkdir/secret.txt" ]) {
      const errors = await failure(update({ source: `\`\`\`text file=${file}\nkeep\n\`\`\`\n`, basePath: base }));

      assert.deepStrictEqual(errors, [{ code: "unsafe_path", line: 1, path: file }]);
    }
  });

  it("follows a symlink that stays inside", async () => {
    const base = await tempDir();
    await writeSource(base, "real/a.js", "const a = 1;\n");
    await symlink(join(base, "real"), join(base, "alias"));

    const result = await update({ source: "```js file=alias/a.js\nOLD\n```\n", basePath: base });

    assert.deepStrictEqual(result.blocks.map(block => block.code), [ "const a = 1;" ]);
  });
});
