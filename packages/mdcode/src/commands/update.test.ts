/* eslint-disable @typescript-eslint/no-floating-promises */
import * as assert from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it, mock } from "node:test";

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

/**
 * Capture console.error for the duration of one test; update.ts reports region
 * failures there. `mock.restoreAll()` in a `finally` keeps the stub from leaking
 * into sibling tests even when an assertion throws.
 */
async function captureStderr(run: () => Promise<string>): Promise<{ result: string; stderr: string; }> {
  const lines: Array<string> = [];
  mock.method(console, "error", (...args: Array<unknown>) => {
    lines.push(args.map(String).join(" "));
  });

  try {
    return { result: await run(), stderr: lines.join("\n") };
  }
  finally {
    mock.restoreAll();
  }
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

    const { result, stderr } = await captureStderr(async () => update({ source, basePath: dir, quiet: true }));

    assert.equal(result, source, "an unterminated region must not rewrite the markdown block");
    assert.match(stderr, /Failed to read a\.js/);
    assert.match(stderr, /alpha/);
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

    const { result, stderr } = await captureStderr(async () => update({ source, basePath: dir, quiet: true }));

    assert.equal(result, source, "a missing region must not empty the markdown block");
    assert.match(stderr, /Failed to read a\.js/);
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

    const result = await update({ source, basePath: dir, quiet: true });

    assert.match(result, /const inside = 2;/);
    assert.ok(!result.includes("ORIGINAL"));
  });
});
