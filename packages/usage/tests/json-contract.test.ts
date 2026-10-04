/**
 * The --json contract: every command prints exactly one versioned envelope on
 * stdout, nothing on stderr, and exits 0, 1, or (extract skips) 2.
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
        targets: [
          { path: join(dir, "greet.js"), action: "written", blocks: [{ name: "greet", line: 3 }], regions: [] },
          { path: join(dir, "block-2.sh"), action: "written", blocks: [{ name: null, line: 7 }], regions: [] },
        ],
      });
      assert.equal(await readFile(join(dir, "greet.js"), "utf-8"), "console.log('hi');");
    });

    it("reports a refused target with exit code 2 and leaves the file alone", async () => {
      const dir = await tempDir();
      await writeFile(join(dir, "greet.js"), "precious\n", "utf-8");

      const { exitCode, envelope } = await runJson("extract", [ "-d", dir, "-n", "greet" ], { stdin: DOC });

      assert.equal(exitCode, 2);
      assert.equal(envelope.result.targets[0].action, "skipped");
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

      assert.match(fromStdin.envelope.result.updatedSource, /```sh file=block-2\.sh/);

      const doc = join(dir, "doc.md");
      await writeFile(doc, DOC, "utf-8");
      const fromFile = await runJson("extract", [ "-d", join(dir, "out"), "--update-source", doc ]);

      assert.equal(fromFile.envelope.result.written, doc);
      assert.equal(fromFile.envelope.result.updatedSource, undefined, "the markdown went to the file, not the result");
      assert.match(await readFile(doc, "utf-8"), /```sh file=block-2\.sh/);
    });

    it("reports conflicting flags as invalid_usage before reading input", async () => {
      const { envelope } = await runJson("extract", [ "--update-source", "--ignore-anonymous" ], { stdin: DOC });

      assert.deepEqual(envelope.errors.map(error => error.code), [ "invalid_usage" ]);
      assert.equal(envelope.result, null);
    });
  });

  describe("update", () => {
    it("reports what each block read and writes the file in place", async () => {
      const dir = await tempDir();
      const doc = join(dir, "doc.md");
      await writeFile(join(dir, "greet.js"), "console.log('fresh');\n", "utf-8");
      await writeFile(doc, DOC, "utf-8");

      const { envelope } = await runJson("update", [ doc ]);

      assert.deepEqual(envelope.result, {
        blocks: [
          { name: "greet", line: 3, lang: "js", changed: true, read: { file: "greet.js" }, transformed: false },
          { name: null, line: 7, lang: "sh", changed: false, transformed: false },
        ],
        written: doc,
      });
      assert.match(await readFile(doc, "utf-8"), /console\.log\('fresh'\);/);
    });

    it("returns the markdown in the result when it would otherwise go to stdout", async () => {
      const dir = await tempDir();
      await writeFile(join(dir, "greet.js"), "console.log('fresh');\n", "utf-8");

      const { envelope } = await runJson("update", [], { stdin: DOC, cwd: dir });

      assert.match(envelope.result.source, /console\.log\('fresh'\);/);
      assert.equal(envelope.result.written, undefined);
    });

    it("fails with read_failed for a missing file= and keeps the block", async () => {
      const dir = await tempDir();
      const { exitCode, envelope } = await runJson("update", [], { stdin: DOC, cwd: dir });

      assert.equal(exitCode, 1);
      assert.deepEqual(envelope.errors.map(({ code, line, name, path }) => ({ code, line, name, path })), [
        { code: "read_failed", line: 3, name: "greet", path: "greet.js" },
      ]);
      assert.equal(envelope.result.source, DOC);
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
    it("returns each block's exit code and output", async () => {
      const dir = await tempDir();
      const { envelope } = await runJson("run", [ "cat {file}", "-d", dir ], { stdin: DOC });

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
      const { exitCode, envelope } = await runJson("run", [ "sh {file}", "-d", dir, "-l", "sh" ], { stdin: "```sh\necho out; echo err >&2; exit 3\n```\n" });

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
  });

  for (const [ command, args ] of [
    [ "extract", []],
    [ "update", []],
    [ "run", [ "cat {file}" ]],
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
    const { exitCode, stdout } = await execCli([ "run", "sh {file}", "-d", dir ], { stdin: "```sh\nexit 4\n```\n" });

    assert.equal(exitCode, 1);
    assert.match(stdout, /Failed \(exit code 4\)/);
  });

  it("update exits 1 when a file= cannot be read, and still prints the markdown", async () => {
    const dir = await tempDir();
    const { exitCode, stdout, stderr } = await execCli([ "update" ], { stdin: DOC, cwd: dir });

    assert.equal(exitCode, 1);
    assert.match(stderr, /Failed to read greet\.js/);
    assert.equal(stdout, DOC);
  });
});
