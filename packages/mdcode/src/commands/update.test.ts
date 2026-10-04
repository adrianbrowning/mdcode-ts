/* eslint-disable @typescript-eslint/no-floating-promises */
import * as assert from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";

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

    const result = await update({ source, basePath: dir });

    assert.equal(result.source, source, "an unterminated region must not rewrite the markdown block");
    assert.deepStrictEqual(result.blocks.map(block => block.changed), [ false ]);
    assert.deepStrictEqual(result.errors.map(({ code, line, path }) => ({ code, line, path })), [{ code: "read_failed", line: 1, path: "a.js" }]);
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

    const result = await update({ source, basePath: dir });

    assert.equal(result.source, source, "a missing region must not empty the markdown block");
    assert.deepStrictEqual(result.errors.map(error => error.code), [ "read_failed" ]);
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
    assert.deepStrictEqual(result.blocks, [{ name: null, line: 1, lang: "js", changed: true, read: { file: "a.js", region: "alpha" }, transformed: false }]);
    assert.deepStrictEqual(result.errors, []);
  });
});
