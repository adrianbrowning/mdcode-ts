/**
 * The --json contract: every command prints exactly one versioned envelope on
 * stdout, nothing on stderr, and exits 0, 1, or (extract skips) 2.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import type { CommandName, Envelope } from "mdcode";

import { execCli } from "./test-utils.ts";

const dirs: Array<string> = [];

after(async () => {
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-json-"));
  dirs.push(dir);
  return dir;
}

// Envelope results are untyped JSON here; tests index into them by the documented shapes.
type AnyEnvelope = Envelope<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Run a command with --json and check the invariants every invocation must hold. */
async function runJson(
  command: CommandName,
  args: Array<string>,
  options?: { stdin?: string; cwd?: string; }
): Promise<{ exitCode: number | null; envelope: AnyEnvelope; }> {
  const { stdout, stderr, exitCode } = await execCli([ command, ...args, "--json" ], options);

  assert.equal(stderr, "", "--json prints nothing on stderr");
  assert.ok(!stdout.includes("\x1b"), "--json output has no terminal colours");
  assert.equal(stdout.trimEnd().split("\n").length, 1, "--json prints exactly one document");

  const envelope = JSON.parse(stdout) as AnyEnvelope;

  assert.equal(envelope.version, 1);
  assert.equal(envelope.command, command);
  assert.equal(envelope.ok, envelope.errors.length === 0, "ok means no errors");
  assert.equal(exitCode === 0, envelope.ok, "the exit code agrees with ok");

  return { exitCode, envelope };
}

/** The result for the one document an extract or update read. */
function onlyDocument(envelope: AnyEnvelope): AnyEnvelope["result"] {
  assert.equal(envelope.result.documents.length, 1, "exactly one document");
  return envelope.result.documents[0];
}

const DOC = [
  "# Doc",
  "",
  "```js name=greet file=greet.js",
  "console.log('hi');",
  "```",
  "",
  "```sh",
  "echo plain",
  "```",
  "",
].join("\n");

const DUPLICATED = "```js name=a\n1\n```\n\n```js name=a\n2\n```\n";

describe("--json contract", () => {
  describe("list", () => {
    it("returns every block with identity, metadata, code and location", async () => {
      const { envelope } = await runJson("list", [], { stdin: DOC });

      assert.deepEqual(envelope, {
        version: 1,
        command: "list",
        ok: true,
        result: {
          blocks: [
            { name: "greet", line: 3, endLine: 5, lang: "js", meta: { name: "greet", file: "greet.js" }, code: "console.log('hi');" },
            { name: null, line: 7, endLine: 9, lang: "sh", meta: {}, code: "echo plain" },
          ],
        },
        errors: [],
      });
    });

    it("reports invalid metadata per problem, with no result", async () => {
      const { exitCode, envelope } = await runJson("list", [], { stdin: DUPLICATED });

      assert.equal(exitCode, 1);
      assert.equal(envelope.result, null);
      assert.deepEqual(envelope.errors, [
        { code: "invalid_metadata", message: "duplicate name \"a\" on lines 1, 5; names must be unique within a document", line: 1 },
      ]);
    });

    it("reports an unreadable markdown file as io_error", async () => {
      const dir = await tempDir();
      const { envelope } = await runJson("list", [ join(dir, "missing.md") ]);

      assert.deepEqual(envelope.errors.map(error => error.code), [ "io_error" ]);
    });

    it("reports a bad flag as invalid_usage instead of printing help text", async () => {
      const { exitCode, envelope } = await runJson("list", [ "--bogus" ], { stdin: DOC });

      assert.equal(exitCode, 1);
      assert.deepEqual(envelope.errors, [{ code: "invalid_usage", message: "unknown option '--bogus'" }]);
    });
  });

  describe("extract", () => {
    it("reports each target it wrote", async () => {
      const dir = await tempDir();
      const { envelope } = await runJson("extract", [ "-d", dir ], { stdin: DOC });

      assert.deepEqual(envelope.result, {
        documents: [{
          document: null,
          targets: [
            { path: join(dir, "greet.js"), action: "written", blocks: [{ name: "greet", line: 3 }], regions: [] },
            { path: join(dir, "block-2.sh"), action: "written", blocks: [{ name: null, line: 7 }], regions: [] },
          ],
        }],
      });
      assert.equal(await readFile(join(dir, "greet.js"), "utf-8"), "console.log('hi');");
    });

    it("reports a refused target with exit code 2 and leaves the file alone", async () => {
      const dir = await tempDir();
      await writeFile(join(dir, "greet.js"), "precious\n", "utf-8");

      const { exitCode, envelope } = await runJson("extract", [ "-d", dir, "-n", "greet" ], { stdin: DOC });

      assert.equal(exitCode, 2);
      assert.equal(onlyDocument(envelope).targets[0].action, "skipped");
      assert.deepEqual(envelope.errors, [{
        code: "extract_skipped",
        message: "exists and has block(s) without region=. Use --force to overwrite.",
        path: join(dir, "greet.js"),
      }]);
      assert.equal(await readFile(join(dir, "greet.js"), "utf-8"), "precious\n");
    });

    it("returns the rewritten markdown from stdin, and the path when it rewrites a file", async () => {
      const dir = await tempDir();
      const fromStdin = await runJson("extract", [ "-d", dir, "--update-source" ], { stdin: DOC });

      assert.match(onlyDocument(fromStdin.envelope).updatedSource, /```sh file=block-2\.sh/);

      const doc = join(dir, "doc.md");
      await writeFile(doc, DOC, "utf-8");
      const fromFile = await runJson("extract", [ "-d", join(dir, "out"), "--update-source", doc ]);

      assert.equal(onlyDocument(fromFile.envelope).written, doc);
      assert.equal(onlyDocument(fromFile.envelope).updatedSource, undefined, "the markdown went to the file, not the result");
      assert.match(await readFile(doc, "utf-8"), /```sh file=block-2\.sh/);
    });

    it("reports conflicting flags as invalid_usage before reading input", async () => {
      const { envelope } = await runJson("extract", [ "--update-source", "--ignore-anonymous" ], { stdin: DOC });

      assert.deepEqual(envelope.errors.map(error => error.code), [ "invalid_usage" ]);
      assert.equal(envelope.result, null);
    });
  });

  describe("update", () => {
    /** A markdown file whose greet block is behind greet.js. */
    async function staleDoc(): Promise<{ dir: string; doc: string; }> {
      const dir = await tempDir();
      const doc = join(dir, "doc.md");
      await writeFile(join(dir, "greet.js"), "console.log('fresh');\n", "utf-8");
      await writeFile(doc, DOC, "utf-8");
      return { dir, doc };
    }

    it("plans by default: reports each block's resulting code and writes nothing", async () => {
      const { doc } = await staleDoc();

      for (const args of [[ doc ], [ "--plan", doc ]]) {
        const { envelope } = await runJson("update", args);

        assert.deepEqual(envelope.result, {
          documents: [{
            document: doc,
            blocks: [
              { name: "greet", line: 3, lang: "js", changed: true, code: "console.log('fresh');", read: { file: "greet.js" }, transformed: false },
              { name: null, line: 7, lang: "sh", changed: false, code: "echo plain", transformed: false },
            ],
          }],
        });
      }

      assert.equal(await readFile(doc, "utf-8"), DOC);
    });

    it("--apply writes the file in place, and leaves an in-sync file untouched", async () => {
      const { doc } = await staleDoc();

      const applied = await runJson("update", [ "--apply", doc ]);

      assert.equal(onlyDocument(applied.envelope).written, doc);
      assert.deepEqual(onlyDocument(applied.envelope).blocks.map(({ changed }: { changed: boolean; }) => changed), [ true, false ]);
      assert.equal(await readFile(doc, "utf-8"), DOC.replace("console.log('hi');", "console.log('fresh');"));

      const before = await stat(doc);
      const again = await runJson("update", [ "--apply", doc ]);

      assert.equal(onlyDocument(again.envelope).written, null);
      assert.deepEqual(onlyDocument(again.envelope).blocks.map(({ changed }: { changed: boolean; }) => changed), [ false, false ]);
      assert.equal((await stat(doc)).mtimeMs, before.mtimeMs, "a no-op apply must not rewrite the file");
    });

    it("--diff returns a unified diff of the markdown and writes nothing", async () => {
      const { doc } = await staleDoc();

      const { envelope } = await runJson("update", [ "--diff", doc ]);

      assert.equal(onlyDocument(envelope).diff, [
        `--- ${doc}`,
        `+++ ${doc}`,
        "@@ -1,8 +1,8 @@",
        " # Doc",
        " ",
        " ```js name=greet file=greet.js",
        "-console.log('hi');",
        "+console.log('fresh');",
        " ```",
        " ",
        " ```sh",
        " echo plain",
        "",
      ].join("\n"));
      assert.equal(await readFile(doc, "utf-8"), DOC);

      await runJson("update", [ "--apply", doc ]);
      const none = await runJson("update", [ "--diff", doc ]);

      assert.equal(onlyDocument(none.envelope).diff, "", "no changes, no diff");
    });

    it("--check fails with out_of_sync for each drifted block, writes nothing, and passes once in sync", async () => {
      const { doc } = await staleDoc();

      const drifted = await runJson("update", [ "--check", doc ]);

      assert.equal(drifted.exitCode, 1);
      assert.deepEqual(drifted.envelope.errors, [{ document: doc, code: "out_of_sync", message: "out of sync with greet.js", line: 3, name: "greet", path: "greet.js" }]);
      assert.equal(await readFile(doc, "utf-8"), DOC);

      await runJson("update", [ "--apply", doc ]);
      const synced = await runJson("update", [ "--check", doc ]);

      assert.equal(synced.exitCode, 0);
      assert.deepEqual(synced.envelope.errors, []);
    });

    it("--check reports an unreadable file= as read_failed, not as drift, even when the transform changes the block", async () => {
      const dir = await tempDir();
      const doc = join(dir, "doc.md");
      await writeFile(doc, DOC, "utf-8");
      await writeFile(join(dir, "upper.mjs"), "export default ({ code }) => code.toUpperCase();\n", "utf-8");

      const { exitCode, envelope } = await runJson("update", [ "--check", "--continue-on-error", "-n", "greet", "-t", "upper.mjs", doc ], { cwd: dir });

      assert.equal(exitCode, 1);
      assert.equal(onlyDocument(envelope).blocks[0].changed, true);
      assert.deepEqual(envelope.errors.map(({ code, line, path }) => ({ code, line, path })), [{ code: "read_failed", line: 3, path: "greet.js" }]);
    });

    it("--name limits every mode to the named blocks", async () => {
      const dir = await tempDir();
      const doc = join(dir, "doc.md");
      const named = "```js name=one file=one.js\n1\n```\n\n```js name=two file=two.js\n2\n```\n\n```js name=three file=three.js\n3\n```\n";
      await writeFile(join(dir, "one.js"), "1\n", "utf-8");
      await writeFile(join(dir, "two.js"), "22\n", "utf-8");
      await writeFile(join(dir, "three.js"), "33\n", "utf-8");
      await writeFile(doc, named, "utf-8");

      const names = (envelope: AnyEnvelope): Array<string> => onlyDocument(envelope).blocks.map(({ name }: { name: string; }) => name);

      assert.deepEqual(names((await runJson("update", [ "-n", "two", "-n", "one", doc ])).envelope), [ "one", "two" ]);
      assert.equal((await runJson("update", [ "--check", "-n", "one", doc ])).exitCode, 0, "drift outside the selection is ignored");
      assert.doesNotMatch(onlyDocument((await runJson("update", [ "--diff", "-n", "two", doc ])).envelope).diff, /33/);

      await runJson("update", [ "--apply", "--name", "two", doc ]);

      assert.equal(await readFile(doc, "utf-8"), named.replace("\n2\n", "\n22\n"));
    });

    it("rejects an unknown --name, conflicting modes and --apply on stdin as invalid_usage, writing nothing", async () => {
      const { doc } = await staleDoc();

      for (const [ args, stdin ] of [
        [[ "--check", "-n", "greet", "-n", "gret", doc ]],
        [[ "--apply", "--diff", doc ]],
        [[ "--apply" ], DOC ],
      ] as const) {
        const { exitCode, envelope } = await runJson("update", [ ...args ], { stdin });

        assert.equal(exitCode, 1);
        assert.equal(envelope.result, null);
        assert.deepEqual(envelope.errors.map(error => error.code), [ "invalid_usage" ], envelope.errors[0]?.message);
      }

      assert.equal(await readFile(doc, "utf-8"), DOC);
    });

    it("--stdout returns the markdown in the result and writes nothing", async () => {
      const { dir, doc } = await staleDoc();

      for (const [ args, stdin ] of [[[ "--stdout", doc ]], [[ "--stdout" ], DOC ]] as const) {
        const { envelope } = await runJson("update", [ ...args ], { stdin, cwd: dir });

        assert.match(onlyDocument(envelope).source, /console\.log\('fresh'\);/);
        assert.equal(onlyDocument(envelope).written, undefined);
      }

      assert.equal(await readFile(doc, "utf-8"), DOC);
    });

    it("stops with read_failed at a missing file=, returning no result", async () => {
      const dir = await tempDir();
      const { exitCode, envelope } = await runJson("update", [ "--stdout" ], { stdin: DOC, cwd: dir });

      assert.equal(exitCode, 1);
      assert.equal(envelope.result, null);
      assert.deepEqual(envelope.errors.map(({ code, line, name, path }) => ({ code, line, name, path })), [
        { code: "read_failed", line: 3, name: "greet", path: "greet.js" },
      ]);
    });

    it("with --continue-on-error, reports every failed block, still fails, and --apply leaves a document with a broken file= unwritten", async () => {
      const dir = await tempDir();
      const doc = join(dir, "doc.md");
      const markdown = "```js file=missing.js\nA\n```\n\n```js file=ok.js\nB\n```\n\n```js file=../escape.js\nC\n```\n";
      await writeFile(join(dir, "ok.js"), "fresh\n", "utf-8");
      await writeFile(doc, markdown, "utf-8");

      const { exitCode, envelope } = await runJson("update", [ "--apply", "--continue-on-error", doc ]);

      assert.equal(exitCode, 1);
      assert.deepEqual(envelope.errors.map(({ code, line, path }) => ({ code, line, path })), [
        { code: "read_failed", line: 1, path: "missing.js" },
        { code: "unsafe_path", line: 9, path: "../escape.js" },
      ]);
      assert.equal(onlyDocument(envelope).written, null);
      assert.deepEqual(onlyDocument(envelope).blocks.map(({ line, changed }: { line: number; changed: boolean; }) => ({ line, changed })), [
        { line: 1, changed: false },
        { line: 5, changed: true },
        { line: 9, changed: false },
      ], "the plan still shows what would change");
      assert.equal(await readFile(doc, "utf-8"), markdown, "a partial sync would hide the broken blocks");
    });

    it("--apply --continue-on-error writes the other blocks when only a transform fails", async () => {
      const dir = await tempDir();
      const doc = join(dir, "doc.md");
      const transform = join(dir, "t.mjs");
      await writeFile(transform, "export default ({ code }) => { if (code === 'boom') throw new Error('no'); return code.toUpperCase(); };\n", "utf-8");
      await writeFile(doc, "```js\nboom\n```\n\n```js\nok\n```\n", "utf-8");

      const { exitCode, envelope } = await runJson("update", [ "--apply", "--continue-on-error", "--transform", transform, doc ]);

      assert.equal(exitCode, 1);
      assert.deepEqual(envelope.errors.map(({ code, line }) => ({ code, line })), [{ code: "transform_failed", line: 1 }]);
      assert.equal(onlyDocument(envelope).written, doc);
      assert.equal(await readFile(doc, "utf-8"), "```js\nboom\n```\n\n```js\nOK\n```\n");
    });

    it("confines file= to the markdown's directory, and --base selects another", async () => {
      const dir = await tempDir();
      const docs = join(dir, "docs");
      await mkdir(docs);
      await writeFile(join(dir, "src.js"), "fresh\n", "utf-8");
      await writeFile(join(docs, "a.md"), "```js file=../src.js\nOLD\n```\n", "utf-8");
      await writeFile(join(docs, "b.md"), "```js file=src.js\nOLD\n```\n", "utf-8");

      const refused = await runJson("update", [ join(docs, "a.md") ]);

      assert.equal(refused.exitCode, 1);
      assert.deepEqual(refused.envelope.errors.map(({ code, line, path }) => ({ code, line, path })), [{ code: "unsafe_path", line: 1, path: "../src.js" }]);

      const based = await runJson("update", [ "--stdout", "--base", dir, join(docs, "b.md") ]);

      assert.equal(onlyDocument(based.envelope).source, "```js file=src.js\nfresh\n```\n");
    });

    it("fails with transform_failed when the transformer throws, and invalid_transform when it cannot load", async () => {
      const dir = await tempDir();
      await writeFile(join(dir, "boom.mjs"), "export default () => { throw new Error('boom'); };\n", "utf-8");
      await writeFile(join(dir, "empty.mjs"), "export const nothing = 1;\n", "utf-8");

      const thrown = await runJson("update", [ "-l", "sh", "-t", "boom.mjs" ], { stdin: DOC, cwd: dir });

      assert.deepEqual(thrown.envelope.errors, [{ code: "transform_failed", message: "boom", line: 7 }]);

      const unloadable = await runJson("update", [ "-t", "empty.mjs" ], { stdin: DOC, cwd: dir });

      assert.equal(unloadable.envelope.result, null);
      assert.deepEqual(unloadable.envelope.errors, [{ code: "invalid_transform", message: "Transform file must export a default function", path: "empty.mjs" }]);
    });
  });

  describe("run", () => {
    it("refuses to run without --allow-shell, before doing anything", async () => {
      const dir = await tempDir();
      const { exitCode, envelope } = await runJson("run", [ "touch ran", "-d", dir ], { stdin: DOC, cwd: dir });

      assert.equal(exitCode, 1);
      assert.equal(envelope.result, null);
      assert.deepEqual(envelope.errors.map(error => error.code), [ "invalid_usage" ]);
      assert.deepEqual(await readdir(dir), []);
    });

    it("returns each block's exit code and output", async () => {
      const dir = await tempDir();
      const { envelope } = await runJson("run", [ "--allow-shell", "cat {file}", "-d", dir ], { stdin: DOC });

      assert.deepEqual(envelope.result, {
        workingDir: dir,
        blocks: [
          { name: "greet", line: 3, lang: "js", exitCode: 0, stdout: "console.log('hi');", stderr: "" },
          { name: null, line: 7, lang: "sh", exitCode: 0, stdout: "echo plain", stderr: "" },
        ],
      });
    });

    it("fails with command_failed for each block whose command fails", async () => {
      const dir = await tempDir();
      const { exitCode, envelope } = await runJson("run", [ "--allow-shell", "sh {file}", "-d", dir, "-l", "sh" ], { stdin: "```sh\necho out; echo err >&2; exit 3\n```\n" });

      assert.equal(exitCode, 1);
      assert.deepEqual(envelope.result.blocks, [{ name: null, line: 1, lang: "sh", exitCode: 3, stdout: "out\n", stderr: "err\n" }]);
      assert.deepEqual(envelope.errors, [{ code: "command_failed", message: "command exited with code 3", line: 1 }]);
    });
  });

  describe("dump", () => {
    it("writes the archive to --out and returns its manifest", async () => {
      const dir = await tempDir();
      const out = join(dir, "blocks.tar");
      const { envelope } = await runJson("dump", [ "-o", out ], { stdin: DOC });

      assert.deepEqual(envelope.result, {
        out,
        files: [
          { name: "greet", line: 3, path: "greet.js", size: 18 },
          { name: null, line: 7, path: "block-2.sh", size: 10 },
        ],
      });

      const archive = await readFile(out, "latin1");
      assert.ok(archive.includes("greet.js") && archive.includes("console.log('hi');"), "the archive holds the blocks");
    });

    it("requires --out, and writes nothing without it", async () => {
      const dir = await tempDir();
      const { exitCode, envelope } = await runJson("dump", [], { stdin: DOC, cwd: dir });

      assert.equal(exitCode, 1);
      assert.equal(envelope.result, null);
      assert.deepEqual(envelope.errors.map(error => error.code), [ "invalid_usage" ]);
      assert.deepEqual(await readdir(dir), []);
    });

    it("refuses entries that would unpack outside the archive, writing no archive", async () => {
      const dir = await tempDir();
      const { exitCode, envelope } = await runJson("dump", [ "-o", "out.tar" ], { stdin: "```sh file=../../.bashrc\nevil\n```\n", cwd: dir });

      assert.equal(exitCode, 1);
      assert.deepEqual(envelope.errors.map(({ code, line, path }) => ({ code, line, path })), [{ code: "unsafe_path", line: 1, path: "../../.bashrc" }]);
      assert.deepEqual(await readdir(dir), []);
    });
  });

  for (const [ command, args ] of [
    [ "extract", []],
    [ "update", []],
    [ "run", [ "--allow-shell", "cat {file}" ]],
    [ "dump", [ "-o", "out.tar" ]],
  ] as const) {
    it(`${command} reports invalid metadata before doing any work`, async () => {
      const dir = await tempDir();
      const { envelope } = await runJson(command, [ ...args ], { stdin: DUPLICATED, cwd: dir });

      assert.equal(envelope.result, null);
      assert.deepEqual(envelope.errors.map(({ code, line }) => ({ code, line })), [{ code: "invalid_metadata", line: 1 }]);
      assert.deepEqual(await readdir(dir), [], "nothing may be written");
    });
  }
});

describe("exit codes without --json", () => {
  it("run exits 1 when a block's command fails", async () => {
    const dir = await tempDir();
    const { exitCode, stdout } = await execCli([ "run", "--allow-shell", "sh {file}", "-d", dir ], { stdin: "```sh\nexit 4\n```\n" });

    assert.equal(exitCode, 1);
    assert.match(stdout, /Failed \(exit code 4\)/);
  });

  it("update stops at a file= that cannot be read, naming the block, and prints no markdown", async () => {
    const dir = await tempDir();
    const { exitCode, stdout, stderr } = await execCli([ "update", "--stdout" ], { stdin: DOC, cwd: dir });

    assert.equal(exitCode, 1);
    assert.match(stderr, /line 3 \(greet\): .*greet\.js/);
    assert.equal(stdout, "");

    const continued = await execCli([ "update", "--stdout", "--continue-on-error" ], { stdin: DOC, cwd: dir });

    assert.equal(continued.exitCode, 1);
    assert.match(continued.stderr, /Failed to read greet\.js/);
    assert.equal(continued.stdout, DOC);
  });

  it("update prints a plan by default, --diff a patch, and --check exits 1 on drift, all without writing", async () => {
    const dir = await tempDir();
    const doc = join(dir, "doc.md");
    await writeFile(join(dir, "greet.js"), "console.log('fresh');\n", "utf-8");
    await writeFile(doc, DOC, "utf-8");

    const plan = await execCli([ "update", "-q", doc ]);

    assert.equal(plan.exitCode, 0);
    assert.equal(plan.stdout, `Would update 1 block(s) in ${doc}:\n  line 3 (greet): js from greet.js\nRun with --apply to write the changes, or --diff to review them.\n`);

    const diff = await execCli([ "update", "-q", "--diff", doc ]);

    assert.equal(diff.exitCode, 0);
    assert.match(diff.stdout, /^-console\.log\('hi'\);\n\+console\.log\('fresh'\);$/m);

    const check = await execCli([ "update", "-q", "--check", doc ]);

    assert.equal(check.exitCode, 1);
    assert.match(check.stderr, /Out of sync: line 3 \(greet\): js from greet\.js/, "a failing check says why even under --quiet");
    assert.equal(await readFile(doc, "utf-8"), DOC);
  });
});
