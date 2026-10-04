import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";

import { cleanupTempDir, createTempDir } from "./test-utils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../../../examples/ci/check-docs-sync.mjs");
const CLI_PATH = join(__dirname, "../../mdcode/dist/main.js");

const SYNCED = "```js file=greet.js name=greet\nconsole.log('hello');\n```\n";
const DRIFTED = "# Guide\n\n```js file=greet.js name=greet\nconsole.log('old');\n```\n";
const BROKEN = "```js file=missing.js\nx\n```\n";

type Run = { code: number | null; stdout: string; stderr: string };

describe("examples/ci/check-docs-sync.mjs", () => {
  let dir: string;
  let binDir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    binDir = join(dir, "bin");
    await writeFile(join(dir, "greet.js"), "console.log('hello');\n", "utf-8");
    // The script runs whatever `mdcode` is on PATH; point that at the built CLI.
    await mkdir(binDir);
    const shim = join(binDir, "mdcode");
    await writeFile(shim, `#!/bin/sh\nexec "${process.execPath}" "${CLI_PATH}" "$@"\n`, "utf-8");
    await chmod(shim, 0o755);
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  const docs = async (files: Record<string, string>): Promise<void> => {
    for (const [ name, content ] of Object.entries(files)) {
      await writeFile(join(dir, name), content, "utf-8");
    }
  };

  const check = (args: Array<string>, env: Record<string, string> = {}): Run => {
    const run = spawnSync(process.execPath, [ SCRIPT, ...args ], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: `${binDir}${delimiter}/usr/bin${delimiter}/bin`, ...env },
    });
    return { code: run.status, stdout: run.stdout, stderr: run.stderr };
  };

  it("exits 0 when every document is in sync", async () => {
    await docs({ "a.md": SYNCED, "b.md": SYNCED });

    const run = check([ "a.md", "b.md" ]);

    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /✓ a\.md/);
    assert.match(run.stdout, /✓ b\.md/);
    assert.match(run.stdout, /2 document\(s\) in sync/);
  });

  it("exits 1 and names the drifted block, without changing the document", async () => {
    await docs({ "guide.md": DRIFTED });

    const run = check([ "guide.md" ]);

    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stderr, /✗ guide\.md: out of sync/);
    assert.match(run.stderr, /line 3 \(greet\): out of sync with greet\.js/);
    assert.match(run.stderr, /mdcode update --apply guide\.md/);
    assert.equal(await readFile(join(dir, "guide.md"), "utf-8"), DRIFTED);
  });

  it("checks every document and reports each one that drifted", async () => {
    await docs({ "one.md": DRIFTED, "ok.md": SYNCED, "two.md": DRIFTED });

    const run = check([ "one.md", "ok.md", "two.md" ]);

    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stderr, /✗ one\.md: out of sync/);
    assert.match(run.stderr, /✗ two\.md: out of sync/);
    assert.match(run.stdout, /✓ ok\.md/);
    assert.match(run.stderr, /2 of 3 document\(s\) out of sync/);
  });

  it("exits 2 when a document cannot be checked, even if another drifted", async () => {
    await docs({ "drift.md": DRIFTED, "broken.md": BROKEN });

    const run = check([ "drift.md", "broken.md", "absent.md" ]);

    assert.equal(run.code, 2, run.stderr);
    assert.match(run.stderr, /✗ drift\.md: out of sync/);
    assert.match(run.stderr, /! broken\.md: could not be checked\n {4}line 1: read_failed: /);
    assert.match(run.stderr, /! absent\.md: could not be checked\n {4}io_error: /);
    assert.match(run.stderr, /2 of 3 document\(s\) could not be checked, 1 out of sync/);
  });

  it("exits 2 when mdcode is not installed", async () => {
    await docs({ "a.md": SYNCED });

    const run = check([ "a.md" ], { PATH: "/nonexistent" });

    assert.equal(run.code, 2);
    assert.match(run.stderr, /could not run mdcode: .*ENOENT.*Install mdcode-ts/);
  });

  it("exits 2 with usage when given no documents", () => {
    const run = check([]);

    assert.equal(run.code, 2);
    assert.match(run.stderr, /Usage: node check-docs-sync\.mjs <markdown-file>\.\.\./);
  });

  it("annotates the drifted line in GitHub Actions", async () => {
    await docs({ "guide.md": DRIFTED, "broken.md": BROKEN });

    const run = check([ "guide.md", "broken.md" ], { GITHUB_ACTIONS: "true" });

    assert.equal(run.code, 2, run.stderr);
    assert.match(run.stdout, /^::error file=guide\.md,line=3,title=Out of sync::out of sync with greet\.js$/m);
    assert.match(run.stdout, /^::error file=broken\.md,line=1,title=Could not check::ENOENT/m);
  });
});
