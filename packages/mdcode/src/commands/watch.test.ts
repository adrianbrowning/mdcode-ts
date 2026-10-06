/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import type { WatchEvent, WatchFiles, WatchHandle, WatchTarget } from "./watch.ts";
import { watch } from "./watch.ts";

const dirs: Array<string> = [];
const handles: Array<WatchHandle> = [];

after(async () => {
  await Promise.all(handles.map(async handle => handle.close()));
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

const STALE = "```js file=greet.js\nconsole.log('old');\n```\n";

/** A project whose doc.md reads greet.js, plus a watcher the test fires by hand. */
async function setup(options: { apply?: boolean; resolve?: (target: WatchTarget) => Promise<WatchTarget>; } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-watch-"));
  dirs.push(dir);

  const doc = join(dir, "doc.md");
  await writeFile(doc, STALE, "utf-8");
  await writeFile(join(dir, "greet.js"), "console.log('old');\n", "utf-8");

  const events: Array<WatchEvent> = [];
  const watching: Array<ReadonlySet<string>> = [];
  let fire: (path: string) => void = () => {};

  const watchFiles: WatchFiles = async (paths, onChange) => {
    watching.push(paths);
    fire = onChange;
    return { close: () => {} };
  };

  const target: WatchTarget = { documents: [{ file: doc, label: "doc.md", basePath: dir }] };
  const handle = await watch({
    resolve: async () => options.resolve ? options.resolve(target) : target,
    apply: options.apply,
    debounceMs: 20,
    onEvent: event => events.push(event),
    watchFiles,
  });
  handles.push(handle);

  const passes = (): Array<Extract<WatchEvent, { type: "pass"; }>> => events.filter(event => event.type === "pass");

  /** Fire these changes and wait until the pass count reaches `count`, or fail after a second. */
  const change = async (paths: Array<string>, count: number): Promise<void> => {
    for (const path of paths) fire(path);
    for (let waited = 0; passes().length < count; waited += 10) {
      if (waited > 1000) assert.fail(`expected ${count} passes, saw ${passes().length}`);
      await sleep(10);
    }
  };

  /** Let the debounce window pass with no further pass expected. */
  const settle = async (): Promise<void> => sleep(80);

  return { dir, doc, events, watching, passes, change, settle };
}

describe("watch", () => {
  test("reports the first pass, watching the document and the files its blocks read", async () => {
    const { dir, doc, events, watching, passes } = await setup();

    assert.equal(events[0]!.type, "ready");
    assert.deepEqual(passes()[0]!.documents.map(({ document, changed, errors, written }) => ({ document, changed: changed.length, errors, written })), [
      { document: "doc.md", changed: 0, errors: [], written: false },
    ]);
    assert.deepEqual([ ...watching[0]! ], [ doc, join(dir, "greet.js") ]);
  });

  test("runs one pass per burst of changes, and writes nothing without apply", async () => {
    const { dir, doc, passes, change, settle } = await setup();
    await writeFile(join(dir, "greet.js"), "console.log('new');\n", "utf-8");

    await change([ join(dir, "greet.js"), join(dir, "greet.js"), doc ], 2);
    await settle();

    assert.equal(passes().length, 2, "three events inside the debounce window make one pass");
    assert.deepEqual(passes()[1]!.documents[0]!.changed.map(block => block.code), [ "console.log('new');" ]);
    assert.equal(await readFile(doc, "utf-8"), STALE, "the default never writes");
  });

  test("with apply, writes the drift and ignores the change event of its own write", async () => {
    const { dir, doc, passes, change, settle } = await setup({ apply: true });
    await writeFile(join(dir, "greet.js"), "console.log('new');\n", "utf-8");

    await change([ join(dir, "greet.js") ], 2);

    assert.equal(passes()[1]!.documents[0]!.written, true);
    assert.match(await readFile(doc, "utf-8"), /console\.log\('new'\);/);

    await change([ doc ], 2);
    await settle();

    assert.equal(passes().length, 2, "its own write must not start another pass");
  });

  test("with apply, leaves a document alone while one of its blocks cannot be read", async () => {
    const { doc, passes, change } = await setup({ apply: true });
    const broken = STALE.replace("console.log('old');", "console.log('stale');") + "\n```js file=missing.js\nx\n```\n";
    await writeFile(doc, broken, "utf-8");

    await change([ doc ], 2);

    const [ document ] = passes()[1]!.documents;
    assert.deepEqual(document!.errors.map(error => error.code), [ "read_failed" ]);
    assert.equal(document!.written, false);
    assert.equal(await readFile(doc, "utf-8"), broken);
  });

  test("with apply, a failed write does not hide a later edit that matches it", { skip: process.getuid?.() === 0 && "root ignores directory permissions" }, async () => {
    const { dir, doc, passes, change } = await setup({ apply: true });
    await writeFile(join(dir, "greet.js"), "console.log('new');\n", "utf-8");
    // The temp file for the atomic write cannot be created in a read-only directory.
    await chmod(dir, 0o555);

    try {
      await change([ join(dir, "greet.js") ], 2);
    }
    finally {
      await chmod(dir, 0o755);
    }

    assert.equal(passes()[1]!.documents[0]!.written, false);
    assert.equal(passes()[1]!.documents[0]!.errors.length, 1);

    // Someone else writes exactly what the failed write would have.
    await writeFile(doc, STALE.replace("'old'", "'new'"), "utf-8");
    await change([ doc ], 3);
  });

  test("starts watching a file= that a later edit adds", async () => {
    const { dir, doc, watching, change } = await setup();
    await writeFile(doc, STALE + "\n```js file=other.js\nx\n```\n", "utf-8");

    await change([ doc ], 2);

    assert.ok(watching.at(-1)!.has(join(dir, "other.js")), "a missing file is watched so creating it starts a pass");
  });

  test("keeps watching after the target cannot be worked out", async () => {
    let fail = false;
    const { doc, events, passes, change } = await setup({
      resolve: async target => {
        if (fail) throw new Error("mdcode.config.json is not valid JSON");
        return target;
      },
    });

    fail = true;
    await change([ doc ], 1);
    for (let waited = 0; !events.some(event => event.type === "error"); waited += 10) {
      if (waited > 1000) assert.fail("expected an error event");
      await sleep(10);
    }

    fail = false;
    await change([ doc ], 2);

    assert.equal(passes().length, 2, "a later change recovers");
  });

  test("reports a document that cannot be read as a finding, not a failure to start", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mdcode-watch-"));
    dirs.push(dir);
    const events: Array<WatchEvent> = [];

    const handle = await watch({
      resolve: async () => ({ documents: [{ file: join(dir, "gone.md"), label: "gone.md", basePath: dir }] }),
      onEvent: event => events.push(event),
      watchFiles: async () => ({ close: () => {} }),
    });
    handles.push(handle);

    const pass = events.find(event => event.type === "pass");
    assert.ok(pass?.type === "pass");
    assert.deepEqual(pass.documents[0]!.errors.map(error => error.code), [ "io_error" ]);
  });

  test("rejects when the first target cannot be worked out", async () => {
    await assert.rejects(watch({
      resolve: async () => {
        throw new Error("no configuration");
      },
      onEvent: () => {},
      watchFiles: async () => ({ close: () => {} }),
    }), /no configuration/);
  });

  test("reports ready only once every file is being watched", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mdcode-watch-"));
    dirs.push(dir);
    await writeFile(join(dir, "doc.md"), "x\n", "utf-8");

    const order: Array<string> = [];
    const handle = await watch({
      resolve: async () => ({ documents: [{ file: join(dir, "doc.md"), label: "doc.md", basePath: dir }] }),
      onEvent: event => order.push(event.type),
      watchFiles: async () => {
        // Installing a real watcher takes a while; ready must wait for it.
        await sleep(30);
        order.push("watching");
        return { close: () => {} };
      },
    });
    handles.push(handle);

    assert.deepEqual(order, [ "watching", "ready", "pass" ]);
  });
});
