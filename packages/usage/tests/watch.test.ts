/**
 * `mdcode watch` through the built CLI, with the real file watcher: startup,
 * reporting drift after a change, --apply, and stopping on SIGINT.
 */
import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { CLI_PATH, execCli } from "./test-utils.ts";

const dirs: Array<string> = [];
const children: Array<ChildProcessWithoutNullStreams> = [];

after(async () => {
  for (const child of children) child.kill("SIGKILL");
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

const DOC = "```js name=greet file=greet.js\nconsole.log('old');\n```\n";

async function project(): Promise<string> {
  // realpath: macOS reports /private/var for /var, and fs.watch names the real path.
  const dir = await realpath(await mkdtemp(join(tmpdir(), "mdcode-watch-cli-")));
  dirs.push(dir);
  await writeFile(join(dir, "doc.md"), DOC, "utf-8");
  await writeFile(join(dir, "greet.js"), "console.log('old');\n", "utf-8");
  return dir;
}

/** Start `mdcode watch`, collecting its output, with a helper that waits for a pattern to appear. */
function start(args: Array<string>, cwd: string) {
  const child = spawn("node", [ CLI_PATH, "watch", "--debounce", "50", ...args ], { cwd });
  children.push(child);

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data: Buffer) => stdout += data.toString());
  child.stderr.on("data", (data: Buffer) => stderr += data.toString());

  const exited = new Promise<number | null>(resolve => child.on("close", resolve));

  const waitFor = async (pattern: RegExp): Promise<void> => {
    for (let waited = 0; !pattern.test(stdout); waited += 25) {
      if (waited > 5000) assert.fail(`timed out waiting for ${pattern}; stdout: ${stdout}; stderr: ${stderr}`);
      await sleep(25);
    }
  };

  return { child, exited, waitFor, output: () => stdout };
}

describe("mdcode watch", () => {
  it("reports drift after a source change, writes nothing, and exits 0 on SIGINT", async () => {
    const dir = await project();
    const watcher = start([ "doc.md" ], dir);

    await watcher.waitFor(/Watching 1 document\(s\) and 1 source file\(s\)\. Press Ctrl\+C to stop\./);
    await watcher.waitFor(/✓ 1 document\(s\) in sync/);

    await writeFile(join(dir, "greet.js"), "console.log('new');\n", "utf-8");
    await watcher.waitFor(/doc\.md: ✗ Out of sync: line 1 \(greet\): js from greet\.js/);

    watcher.child.kill("SIGINT");

    assert.equal(await watcher.exited, 0);
    assert.match(watcher.output(), /Stopped watching\./);
    assert.equal(await readFile(join(dir, "doc.md"), "utf-8"), DOC);
  });

  it("--apply writes the change once, without looping on its own write", async () => {
    const dir = await project();
    const watcher = start([ "--apply", "doc.md" ], dir);

    await watcher.waitFor(/writing changes/);
    await watcher.waitFor(/in sync/);

    await writeFile(join(dir, "greet.js"), "console.log('new');\n", "utf-8");
    await watcher.waitFor(/doc\.md: ✓ Updated 1 block\(s\)/);
    // Long enough for a write loop to show itself as a second pass.
    await sleep(500);

    watcher.child.kill("SIGINT");
    await watcher.exited;

    assert.equal(watcher.output().match(/Updated 1 block/g)?.length, 1);
    assert.doesNotMatch(watcher.output().split("Updated 1 block")[1]!, /in sync|Out of sync/, "no pass may follow its own write");
    assert.match(await readFile(join(dir, "doc.md"), "utf-8"), /console\.log\('new'\);/);
  });

  it("fails to start without documents, or with an invalid configuration", async () => {
    const dir = await project();

    const bare = await execCli([ "watch" ], { cwd: dir });
    assert.equal(bare.exitCode, 1);
    assert.match(bare.stderr, /watch needs Markdown files to watch, or --project or --config/);

    await writeFile(join(dir, "mdcode.config.json"), "{", "utf-8");
    const broken = await execCli([ "watch", "--project" ], { cwd: dir });
    assert.equal(broken.exitCode, 1);
    assert.match(broken.stderr, /not valid JSON/);
  });
});
