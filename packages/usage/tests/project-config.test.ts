/**
 * mdcode.config.json through the CLI: --project discovery, --config, glob
 * expansion, command-line precedence, multi-document results and validation.
 */
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { cleanupTempDir, createTempDir, execCli } from "./test-utils.ts";

const STALE = "# Readme\n\n```js name=greet file=greet.js\nconsole.log('old');\n```\n\n```sh name=shell file=hello.sh\necho hi\n```\n";
const IN_SYNC = "```js file=add.js\nexport const add = 1;\n```\n";
const NOTES = "# Notes\n\n```js runnable=true kind=demo file=demo.js\nconsole.log('demo');\n```\n";

const CONFIG = {
  documents: [ "README.md", "docs/*.md" ],
  sourceRoot: "src",
  outputRoot: "out",
  filter: { lang: "js" },
};

// Envelope results are untyped JSON here; tests index into them by the documented shapes.
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("project configuration", () => {
  let dir: string;

  beforeEach(async () => {
    // The real path, as the CLI's working directory reports it (macOS links /var to /private/var).
    dir = await realpath(await createTempDir());
    await mkdir(join(dir, "src"));
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "src", "greet.js"), "console.log('fresh');\n", "utf-8");
    await writeFile(join(dir, "src", "add.js"), "export const add = 1;\n", "utf-8");
    await writeFile(join(dir, "src", "demo.js"), "console.log('demo');\n", "utf-8");
    await writeFile(join(dir, "src", "hello.sh"), "echo hello\n", "utf-8");
    await writeFile(join(dir, "README.md"), STALE, "utf-8");
    await writeFile(join(dir, "docs", "notes.md"), NOTES, "utf-8");
    await writeFile(join(dir, "docs", "guide.md"), IN_SYNC, "utf-8");
    await writeConfig(CONFIG);
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  async function writeConfig(config: unknown, name = "mdcode.config.json"): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, JSON.stringify(config), "utf-8");
    return path;
  }

  async function json(args: Array<string>, options: { cwd?: string; stdin?: string; } = {}): Promise<{ exitCode: number | null; envelope: Json; }> {
    const { stdout, stderr, exitCode } = await execCli([ ...args, "--json" ], { cwd: dir, ...options });
    assert.equal(stderr, "", "--json prints nothing on stderr");
    return { exitCode, envelope: JSON.parse(stdout) };
  }

  const documents = (envelope: Json): Array<string | null> => envelope.result.documents.map(({ document }: Json) => document);

  it("--project checks every document mdcode.config.json lists, naming the one that drifted", async () => {
    const { exitCode, envelope } = await json([ "update", "--project", "--check" ]);

    assert.equal(exitCode, 1);
    assert.deepEqual(documents(envelope), [ "README.md", "docs/guide.md", "docs/notes.md" ], "entries in order, each glob's matches sorted");
    assert.deepEqual(envelope.errors, [{ document: "README.md", code: "out_of_sync", message: "out of sync with greet.js", line: 3, name: "greet", path: "greet.js" }]);
    assert.deepEqual(envelope.result.documents[0].blocks.map(({ name }: Json) => name), [ "greet" ], "the configured lang filter leaves out the sh block");
    assert.equal(await readFile(join(dir, "README.md"), "utf-8"), STALE);
  });

  it("names each document in the text output when there are several", async () => {
    const { exitCode, stderr } = await execCli([ "update", "--project", "--check" ], { cwd: dir });

    assert.equal(exitCode, 1);
    assert.match(stderr, /^README\.md: ✗ Out of sync: line 3 \(greet\): js from greet\.js$/m);
    assert.match(stderr, /^docs\/guide\.md: ✓ 1 block\(s\) in sync\.$/m);
  });

  it("reads no configuration without --project or --config, so stdin stays the default", async () => {
    const { exitCode, envelope } = await json([ "update" ], { stdin: STALE });

    assert.equal(exitCode, 1, "file= resolves against the current directory, where greet.js is missing");
    assert.equal(envelope.result, null);
    assert.deepEqual(envelope.errors.map(({ code, path }: Json) => ({ code, path })), [{ code: "read_failed", path: "greet.js" }]);
  });

  it("--config loads a file from anywhere, resolving its paths against its own directory", async () => {
    const elsewhere = await realpath(await createTempDir());

    try {
      const config = await writeConfig(CONFIG, "docs.config.json");
      const { envelope } = await json([ "update", "--config", config, "--check" ], { cwd: elsewhere });

      assert.deepEqual(documents(envelope), [ "README.md", "docs/guide.md", "docs/notes.md" ].map(path => relative(elsewhere, join(dir, path))));
      assert.deepEqual(envelope.errors.map(({ code, path }: Json) => ({ code, path })), [{ code: "out_of_sync", path: "greet.js" }], "sourceRoot is relative to the configuration file");
    }
    finally {
      await cleanupTempDir(elsewhere);
    }
  });

  it("documents and filters given on the command line replace the configuration's", async () => {
    const one = await json([ "update", "--project", "--check", "docs/guide.md" ]);

    assert.equal(one.exitCode, 0);
    assert.deepEqual(documents(one.envelope), [ "docs/guide.md" ]);

    const sh = await json([ "update", "--project", "--check", "--lang", "sh", "README.md" ]);

    assert.deepEqual(sh.envelope.result.documents[0].blocks.map(({ name }: Json) => name), [ "shell" ], "--lang replaces filter.lang");
    assert.deepEqual(sh.envelope.errors.map(({ code, path }: Json) => ({ code, path })), [{ code: "out_of_sync", path: "hello.sh" }]);
  });

  it("--base replaces sourceRoot, and --dir replaces outputRoot", async () => {
    await mkdir(join(dir, "other"));
    await writeFile(join(dir, "other", "greet.js"), "console.log('old');\n", "utf-8");

    const based = await json([ "update", "--project", "--check", "--base", "other", "README.md" ]);

    assert.equal(based.exitCode, 0, "greet.js under other/ matches the block");

    const extracted = await json([ "extract", "--project", "--dir", "elsewhere", "README.md" ]);

    assert.equal(extracted.exitCode, 0);
    assert.deepEqual(await readdir(join(dir, "elsewhere")), [ "greet.js" ]);
    assert.ok(!(await readdir(dir)).includes("out"), "outputRoot was not used");
  });

  it("extract writes each document's blocks under outputRoot, applying the default filters", async () => {
    await writeConfig({ documents: [ "docs/*.md" ], outputRoot: "out", filter: { meta: { runnable: "true" } } });

    const { exitCode, envelope } = await json([ "extract", "--project" ]);

    assert.equal(exitCode, 0);
    assert.deepEqual(envelope.result.documents.map(({ document, targets }: Json) => ({ document, targets: targets.map(({ path }: Json) => path) })), [
      { document: "docs/guide.md", targets: [] },
      { document: "docs/notes.md", targets: [ join(dir, "out", "demo.js") ] },
    ]);

    const byMeta = await json([ "extract", "--project", "--meta", "kind=other" ]);

    assert.deepEqual(byMeta.envelope.result.documents.flatMap(({ targets }: Json) => targets), [], "--meta replaces filter.meta rather than adding to it");
  });

  it("--apply writes every document or none, unless --continue-on-error", async () => {
    await writeFile(join(dir, "docs", "broken.md"), "```js file=missing.js\nx\n```\n", "utf-8");

    const stopped = await json([ "update", "--project", "--apply" ]);

    assert.equal(stopped.exitCode, 1);
    assert.equal(stopped.envelope.result, null, "nothing was written, so no document has a result");
    assert.deepEqual(stopped.envelope.errors.map(({ document, code }: Json) => ({ document, code })), [{ document: "docs/broken.md", code: "read_failed" }]);
    assert.equal(await readFile(join(dir, "README.md"), "utf-8"), STALE, "README.md was worked out but not written");

    const continued = await json([ "update", "--project", "--apply", "--continue-on-error" ]);

    assert.equal(continued.exitCode, 1);
    assert.deepEqual(continued.envelope.result.documents.map(({ document, written }: Json) => ({ document, written })), [
      { document: "README.md", written: "README.md" },
      { document: "docs/broken.md", written: null },
      { document: "docs/guide.md", written: null },
      { document: "docs/notes.md", written: null },
    ]);
    assert.match(await readFile(join(dir, "README.md"), "utf-8"), /console\.log\('fresh'\);/);
  });

  it("refuses --stdout across several documents", async () => {
    const { exitCode, envelope } = await json([ "update", "--project", "--stdout" ]);

    assert.equal(exitCode, 1);
    assert.equal(envelope.result, null);
    assert.match(envelope.errors[0].message, /--stdout prints one document, but 3 are selected/);
  });

  it("fails before reading any document when the configuration is missing or invalid", async () => {
    const missing = await execCli([ "update", "--project", "--check" ], { cwd: join(dir, "docs") });

    assert.equal(missing.exitCode, 1);
    assert.match(missing.stderr, /mdcode\.config\.json: not found at .*docs\/mdcode\.config\.json; create it, or point --config at another file/);

    await writeConfig({ documents: [ "README.md" ], sourceRoot: "../outside" });
    const unsafe = await json([ "update", "--project" ]);

    assert.equal(unsafe.exitCode, 1);
    assert.equal(unsafe.envelope.result, null);
    assert.deepEqual(unsafe.envelope.errors.map(({ code, path }: Json) => ({ code, path })), [{ code: "unsafe_path", path: "mdcode.config.json" }]);

    await writeConfig({ filter: { lang: "js" } });
    const empty = await json([ "extract", "--project" ]);

    assert.deepEqual(empty.envelope.errors, [{
      code: "invalid_config",
      message: "mdcode.config.json lists no documents; add \"documents\" or pass a Markdown file",
      path: "mdcode.config.json",
    }]);
  });
});
