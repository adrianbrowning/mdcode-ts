/**
 * `mdcode validate` through the built CLI: the readable and JSON reports, the
 * exit code, and that it never writes.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { execCli } from "./test-utils.ts";

const dirs: Array<string> = [];

after(async () => {
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

/** A directory with doc.md, which reads one region twice-declared source and writes out.ts two ways. */
async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-validate-cli-"));
  dirs.push(dir);

  await writeFile(join(dir, "src.js"), "// #region a\n1\n// #endregion a\n// #region a\n2\n// #endregion a\n", "utf-8");
  await writeFile(join(dir, "doc.md"), [
    "```js name=dup file=src.js region=a",
    "x",
    "```",
    "",
    "```ts file=out.ts region=one",
    "1",
    "```",
    "",
    "```ts file=out.ts",
    "2",
    "```",
    "",
    "```sh",
    "echo",
    "```",
    "",
  ].join("\n"), "utf-8");

  return dir;
}

describe("mdcode validate", () => {
  it("checks for update by default, listing every problem with its rule, and exits 1", async () => {
    const dir = await project();
    const { exitCode, stdout, stderr } = await execCli([ "validate", "doc.md" ], { cwd: dir });

    assert.equal(exitCode, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /^✗ line 1 \(dup\): region a appears more than once in src\.js.*\(duplicate_region\)$/m);
    assert.match(stderr, /^✗ line 5: out\.ts does not exist in .*\(read_failed\)$/m);
    assert.match(stderr, /^3 problem\(s\) found; update would refuse them\.$/m);
    assert.deepEqual((await readdir(dir)).sort(), [ "doc.md", "src.js" ], "validate writes nothing");
  });

  it("--for extract --json reports each block and each ambiguous target in one envelope", async () => {
    const dir = await project();
    const { exitCode, stdout, stderr } = await execCli([ "validate", "--for", "extract", "--json", "doc.md" ], { cwd: dir });
    const envelope = JSON.parse(stdout);

    assert.equal(exitCode, 1);
    assert.equal(stderr, "");
    assert.equal(envelope.command, "validate");
    assert.equal(envelope.ok, false);
    assert.equal(envelope.result.operation, "extract");
    assert.deepEqual(envelope.result.documents[0].blocks.map(({ line, path, valid }: { line: number; path: string; valid: boolean; }) => ({ line, path, valid })), [
      { line: 1, path: "src.js", valid: false },
      { line: 5, path: "out.ts", valid: false },
      { line: 9, path: "out.ts", valid: false },
      { line: 13, path: "block-4.sh", valid: true },
    ]);
    assert.deepEqual(envelope.errors.map(({ document, code, line, path }: Record<string, unknown>) => ({ document, code, line, path })), [
      { document: "doc.md", code: "duplicate_region", line: 1, path: "src.js" },
      { document: "doc.md", code: "ambiguous_target", line: 5, path: "out.ts" },
      { document: "doc.md", code: "ambiguous_target", line: 9, path: "out.ts" },
    ]);
  });

  it("--strict refuses blocks without file=, and passes once the selection has none", async () => {
    const dir = await project();
    const strict = await execCli([ "validate", "--for", "extract", "--strict", "--json", "--lang", "sh", "doc.md" ], { cwd: dir });

    assert.equal(strict.exitCode, 1);
    assert.deepEqual(JSON.parse(strict.stdout).errors.map(({ code, line }: Record<string, unknown>) => ({ code, line })), [{ code: "missing_file_metadata", line: 13 }]);

    const clean = await execCli([ "validate", "--for", "extract", "--strict", "--lang", "sh", "--ignore-anonymous", "doc.md" ], { cwd: dir });

    assert.equal(clean.exitCode, 0);
    assert.match(clean.stderr, /^✓ 0 block\(s\) ready for extract\.$/m);
  });

  it("refuses flags that belong to the other operation", async () => {
    const dir = await project();
    const { exitCode, stdout } = await execCli([ "validate", "--dir", "out", "--json", "doc.md" ], { cwd: dir });

    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stdout).errors, [{ code: "invalid_usage", message: "--dir cannot be used with --for update" }]);
  });

  it("extract refuses the same document before writing any file", async () => {
    const dir = await project();
    const { exitCode, stderr } = await execCli([ "extract", "doc.md" ], { cwd: dir });

    assert.equal(exitCode, 1);
    assert.match(stderr, /^Error: line 5: out\.ts: blocks on lines 5, 9 all write this file/m);
    assert.deepEqual((await readdir(dir)).sort(), [ "doc.md", "src.js" ]);
  });

  it("update --apply --continue-on-error leaves a document with a duplicated region byte-identical", async () => {
    const dir = await project();
    const doc = join(dir, "sync.md");
    const markdown = "```js file=src.js region=a\nold\n```\n\n```js file=fresh.js\nold\n```\n";
    await writeFile(join(dir, "fresh.js"), "new\n", "utf-8");
    await writeFile(doc, markdown, "utf-8");

    const { exitCode, stdout } = await execCli([ "update", "--apply", "--continue-on-error", "--json", "sync.md" ], { cwd: dir });
    const envelope = JSON.parse(stdout);

    assert.equal(exitCode, 1);
    assert.deepEqual(envelope.errors.map(({ code, line }: Record<string, unknown>) => ({ code, line })), [{ code: "duplicate_region", line: 1 }]);
    assert.equal(envelope.result.documents[0].written, null);
    assert.equal(await readFile(doc, "utf-8"), markdown, "the fresh block must not land while its neighbour is broken");
  });
});

describe("extract across several documents", () => {
  /** A directory holding docs/<name>.md for each entry. */
  async function docs(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "mdcode-shared-target-"));
    dirs.push(dir);
    await mkdir(join(dir, "docs"));

    for (const [ name, markdown ] of Object.entries(files)) {
      await writeFile(join(dir, "docs", `${name}.md`), markdown, "utf-8");
    }

    return dir;
  }

  const fence = (info: string, code: string): string => `\`\`\`${info}\n${code}\n\`\`\`\n\n`;

  it("validate --for extract reports blocks in different documents that write one file, however it is spelled", async () => {
    const dir = await docs({
      a: fence("ts file=src/x.ts", "export const a = 1;"),
      b: fence("ts file=src/y.ts", "export const y = 1;") + fence("ts name=other file=./src/../src/x.ts", "export const b = 2;"),
    });

    const { exitCode, stdout } = await execCli([ "validate", "--for", "extract", "--json", "docs/a.md", "docs/b.md" ], { cwd: dir });
    const envelope = JSON.parse(stdout);

    assert.equal(exitCode, 1);
    assert.deepEqual(envelope.errors.map(({ document, code, line, name }: Record<string, unknown>) => ({ document, code, line, name })), [
      { document: "docs/a.md", code: "ambiguous_target", line: 1, name: undefined },
      { document: "docs/b.md", code: "ambiguous_target", line: 5, name: "other" },
    ]);
    assert.match(envelope.errors[0].message, /^blocks at docs\/a\.md:1, docs\/b\.md:5 all write this file, but not every one declares region=/);
    assert.deepEqual(envelope.result.documents.map(({ blocks }: { blocks: Array<{ valid: boolean; }>; }) => blocks.map(({ valid }) => valid)), [[ false ], [ true, false ]]);
  });

  it("extract writes nothing in any document when two of them write one file", async () => {
    const dir = await docs({
      a: fence("ts file=src/x.ts", "export const a = 1;"),
      b: fence("ts file=src/y.ts", "export const y = 1;") + fence("ts file=src/x.ts", "export const b = 2;"),
    });

    const { exitCode, stderr } = await execCli([ "extract", "docs/a.md", "docs/b.md" ], { cwd: dir });

    assert.equal(exitCode, 1);
    assert.match(stderr, /^Error: docs\/a\.md: line 1: src\/x\.ts: blocks at docs\/a\.md:1, docs\/b\.md:5 all write this file/m);
    assert.match(stderr, /^Error: docs\/b\.md: line 5: src\/x\.ts: blocks at docs\/a\.md:1, docs\/b\.md:5 all write this file/m);
    assert.deepEqual(await readdir(dir), [ "docs" ], "neither src/x.ts nor the unrelated src/y.ts may be written");
  });

  it("extract writes nothing in any document when a later one breaks a rule of its own", async () => {
    const dir = await docs({
      a: fence("ts file=src/a.ts", "export const a = 1;"),
      b: fence("ts file=../outside.ts", "export const b = 2;"),
    });

    const { exitCode, stdout } = await execCli([ "extract", "--json", "docs/a.md", "docs/b.md" ], { cwd: dir });

    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(stdout).errors.map(({ document, code }: Record<string, unknown>) => ({ document, code })), [{ document: "docs/b.md", code: "unsafe_path" }]);
    assert.deepEqual(await readdir(dir), [ "docs" ], "docs/a.md's target must not be written before docs/b.md is refused");
  });

  it("lets documents share a file when each block has its own region= in one language", async () => {
    const dir = await docs({
      a: fence("ts file=src/x.ts region=one", "export const one = 1;"),
      b: fence("ts file=src/x.ts region=two", "export const two = 2;"),
    });

    const checked = await execCli([ "validate", "--for", "extract", "docs/a.md", "docs/b.md" ], { cwd: dir });
    const extracted = await execCli([ "extract", "docs/a.md", "docs/b.md" ], { cwd: dir });
    const written = await readFile(join(dir, "src", "x.ts"), "utf-8");

    assert.equal(checked.exitCode, 0, checked.stderr);
    assert.equal(extracted.exitCode, 0, extracted.stderr);
    assert.match(written, /#region one\nexport const one = 1;\n.*#endregion/s);
    assert.match(written, /#region two\nexport const two = 2;\n.*#endregion/s);
  });

  it("refuses a shared file whose blocks repeat a region= or differ in language", async () => {
    const dir = await docs({
      a: fence("ts file=src/x.ts region=one", "1"),
      b: fence("ts file=src/x.ts region=one", "2"),
      c: fence("ts file=src/y.ts region=one", "1"),
      d: fence("py file=src/y.ts region=two", "2"),
    });

    const { exitCode, stdout } = await execCli([ "validate", "--for", "extract", "--json", "docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md" ], { cwd: dir });
    const messages = JSON.parse(stdout).errors.map(({ document, message }: Record<string, string>) => `${document}: ${message}`);

    assert.equal(exitCode, 1);
    assert.deepEqual(messages, [
      "docs/a.md: blocks at docs/a.md:1, docs/b.md:1 all write this file and repeat a region=; give each block a region= of its own",
      "docs/b.md: blocks at docs/a.md:1, docs/b.md:1 all write this file and repeat a region=; give each block a region= of its own",
      "docs/c.md: blocks at docs/c.md:1, docs/d.md:1 all write this file in different languages (ts, py); blocks that share a file must share its language",
      "docs/d.md: blocks at docs/c.md:1, docs/d.md:1 all write this file in different languages (ts, py); blocks that share a file must share its language",
    ]);
  });
});
