import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { type CiRun, CI_EXAMPLES, cleanupTempDir, createTempDir, installMdcodeShim, runCiExample } from "./test-utils.ts";

// Two runnable blocks, a plain block and a runnable=false block. Running the
// plain or runnable=false block would throw, so passing proves they were skipped.
const GUIDE = [
  "# Guide",
  "",
  "```js runnable=true name=hello",
  "console.log('hello from a snippet');",
  "```",
  "",
  "```js",
  "throw new Error('not marked runnable');",
  "```",
  "",
  "```js runnable=false file=off.js",
  "throw new Error('runnable=false');",
  "```",
  "",
  "```js runnable=true file=lib/add.js",
  "console.log(1 + 2);",
  "```",
  "",
].join("\n");

const FAILING = "# Failing\n\n```js runnable=true name=ok\nconsole.log('ok');\n```\n\n```js runnable=true name=boom file=boom.js\nprocess.exit(3);\n```\n";

// Prints the workspace's files, so a test can see exactly what was extracted.
const LIST_FILES = [ "node", "-e", "console.log('files:', require('fs').readdirSync('.', { recursive: true }).sort().join(' '))" ];

describe("examples/ci/validate-snippets.mjs", () => {
  let dir: string;
  let path: string;
  let tmp: string;

  beforeEach(async () => {
    dir = await createTempDir();
    path = await installMdcodeShim(dir);
    tmp = join(dir, "tmp");
    await mkdir(tmp);
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  const docs = async (files: Record<string, string>): Promise<void> => {
    for (const [ name, content ] of Object.entries(files)) {
      await writeFile(join(dir, name), content, "utf-8");
    }
  };

  const validate = (args: Array<string>, env: Record<string, string> = {}): CiRun =>
    runCiExample("validate-snippets.mjs", [ "--tmp-dir", tmp, ...args ], { cwd: dir, env: { PATH: path, ...env } });

  const leftovers = async (): Promise<Array<string>> => readdir(tmp);

  it("extracts only runnable=true blocks into the workspace", async () => {
    await docs({ "guide.md": GUIDE });

    const run = validate([ "guide.md", "--", ...LIST_FILES ]);

    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /^files: block-1\.js lib lib\/add\.js$/m);
    assert.match(run.stdout, /block-1\.js {2}← line 3 \(hello\)/);
    assert.match(run.stdout, /lib\/add\.js {2}← line 15/);
    assert.match(run.stdout, /2 runnable block\(s\) passed/);
  });

  it("runs the command once per extracted file when it contains {file}", async () => {
    await docs({ "guide.md": GUIDE });

    const run = validate([ "guide.md", "--", "node", "{file}" ]);

    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /hello from a snippet/);
    assert.match(run.stdout, /^3$/m);
    assert.match(run.stdout, /✓ guide\.md line 3 \(hello\): block-1\.js/);
    assert.match(run.stdout, /✓ guide\.md line 15: lib\/add\.js/);
  });

  it("exits 1 and names the failing block, then keeps validating", async () => {
    await docs({ "failing.md": FAILING, "guide.md": GUIDE });

    const run = validate([ "failing.md", "guide.md", "--", "node", "{file}" ]);

    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stderr, /✗ failing\.md line 7 \(boom\): boom\.js: `node boom\.js` exited 3/);
    assert.match(run.stdout, /✓ failing\.md line 3 \(ok\): block-1\.js/);
    assert.match(run.stdout, /✓ guide\.md line 15: lib\/add\.js/);
    assert.match(run.stderr, /1 validation\(s\) failed/);
  });

  it("exits 1 and lists the document's blocks when a workspace command fails", async () => {
    await docs({ "failing.md": FAILING });

    const run = validate([ "failing.md", "--", "node", "-e", "process.exit(4)" ]);

    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stderr, /✗ failing\.md: `node -e process\.exit\(4\)` exited 4\n {4}block-1\.js {2}← line 3 \(ok\)\n {4}boom\.js {2}← line 7 \(boom\)/);
  });

  it("gives each document its own workspace", async () => {
    const one = "```js runnable=true file=same.js\nconsole.log('one');\n```\n";
    const two = "```js runnable=true file=same.js\nconsole.log('two');\n```\n";
    await docs({ "one.md": one, "two.md": two });

    const run = validate([ "one.md", "two.md", "--", "node", "{file}" ]);

    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /^one\n[^]*^two$/m);
  });

  it("removes the workspace after success and after failure", async () => {
    await docs({ "failing.md": FAILING, "guide.md": GUIDE });

    assert.equal(validate([ "guide.md", "--", "node", "{file}" ]).code, 0);
    assert.deepEqual(await leftovers(), []);

    assert.equal(validate([ "failing.md", "--", "node", "{file}" ]).code, 1);
    assert.deepEqual(await leftovers(), []);
  });

  it("keeps the workspace with --keep and says where it is", async () => {
    await docs({ "guide.md": GUIDE });

    const run = validate([ "--keep", "guide.md", "--", "node", "{file}" ]);

    assert.equal(run.code, 0, run.stderr);
    const kept = await leftovers();
    assert.equal(kept.length, 1);
    assert.ok(kept[0]!.startsWith("mdcode-snippets-"));
    assert.ok(run.stdout.includes(`Workspace kept at ${join(tmp, kept[0]!)}\n`), run.stdout);
  });

  it("removes the workspace when the job is cancelled", async () => {
    await docs({ "guide.md": GUIDE });

    // The command says when it has started, then stays alive until stdin closes.
    const child = spawn(process.execPath, [ join(CI_EXAMPLES, "validate-snippets.mjs"), "--tmp-dir", tmp, "guide.md", "--", "node", "-e", "console.log('started'); process.stdin.resume()" ], {
      cwd: dir,
      env: { PATH: path },
    });
    const closed = new Promise(resolve => child.once("close", resolve));

    for await (const chunk of child.stdout) {
      if (String(chunk).includes("started")) {
        break;
      }
    }
    assert.equal((await leftovers()).length, 1);

    child.kill("SIGTERM");

    assert.equal(await closed, 143);
    assert.deepEqual(await leftovers(), []);
  });

  it("exits 2 when a document cannot be extracted, without running anything for it", async () => {
    await docs({ "guide.md": GUIDE, "escape.md": "```js runnable=true file=../outside.js\nx\n```\n" });

    const run = validate([ "escape.md", "absent.md", "guide.md", "--", "node", "{file}" ]);

    assert.equal(run.code, 2, run.stderr);
    assert.match(run.stderr, /! escape\.md: could not be validated\n {4}line 1: unsafe_path: /);
    assert.match(run.stderr, /! absent\.md: could not be validated\n {4}io_error: /);
    assert.match(run.stdout, /✓ guide\.md line 3 \(hello\)/);
    assert.deepEqual(await leftovers(), []);
  });

  it("exits 2 when no document has a runnable=true block", async () => {
    await docs({ "plain.md": "```js\nconsole.log('x');\n```\n" });

    const run = validate([ "plain.md", "--", "node", "{file}" ]);

    assert.equal(run.code, 2, run.stderr);
    assert.match(run.stdout, /- plain\.md: no runnable=true blocks/);
    assert.match(run.stderr, /No runnable=true blocks to validate/);
  });

  it("exits 2 when the command cannot be started", async () => {
    await docs({ "guide.md": GUIDE });

    const run = validate([ "guide.md", "--", "no-such-validator" ]);

    assert.equal(run.code, 2, run.stderr);
    assert.match(run.stderr, /! guide\.md: `no-such-validator` could not start: spawn no-such-validator ENOENT/);
  });

  it("exits 2 with usage when the command or documents are missing", () => {
    for (const args of [[ "guide.md" ], [ "--", "node" ], [ "--bogus", "guide.md", "--", "node" ]]) {
      const run = validate(args);

      assert.equal(run.code, 2, args.join(" "));
      assert.match(run.stderr, /Usage: node validate-snippets\.mjs/);
    }
  });

  it("annotates the failing block in GitHub Actions", async () => {
    await docs({ "failing.md": FAILING });

    const run = validate([ "failing.md", "--", "node", "{file}" ], { GITHUB_ACTIONS: "true" });

    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stdout, /^::error file=failing\.md,line=7,title=Snippet failed::boom\.js: `node boom\.js` exited 3$/m);
  });
});
