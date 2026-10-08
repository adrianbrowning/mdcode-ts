/* eslint-disable @typescript-eslint/no-floating-promises */
/**
 * The check-sync GitHub Action's script (.github/actions/check-sync), run the
 * way action.yml runs it: inputs as environment variables, in the caller's
 * checkout, with mdcode-command pointing at the built CLI.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { after, describe, it } from "node:test";

import { cleanupTempDir, CLI_PATH, createTempDir } from "./test-utils.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "..", ".github", "actions", "check-sync", "check-sync.mjs");
const MANIFEST = join(import.meta.dirname, "..", "..", "mdcode", "package.json");

const dirs: Array<string> = [];

after(async () => {
  await Promise.all(dirs.map(cleanupTempDir));
});

const fence = (info: string, code: string): string => `\`\`\`${info}\n${code}\n\`\`\`\n\n`;

/** A checkout holding these files. */
async function checkout(files: Record<string, string>): Promise<string> {
  const dir = await createTempDir();
  dirs.push(dir);

  for (const [ path, content ] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content, "utf-8");
  }

  return dir;
}

/** Every file in the checkout with its content, to prove the action wrote nothing. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile() && !entry.name.startsWith("action-")).map(entry => join(entry.parentPath, entry.name))
    .sort();
  return Object.fromEntries(await Promise.all(files.map(async file => [ file, await readFile(file, "utf-8") ])));
}

type ActionRun = { code: number | null; stdout: string; summary: string; outputs: string; };

/** Run the action's script in dir with these inputs. */
async function action(dir: string, inputs: Record<string, string>, extraEnv: Record<string, string> = {}): Promise<ActionRun> {
  const summary = join(dir, "action-summary.md");
  const outputs = join(dir, "action-outputs.txt");
  const run = spawnSync(process.execPath, [ SCRIPT ], {
    cwd: dir,
    encoding: "utf-8",
    env: {
      PATH: [ dirname(process.execPath), "/usr/bin", "/bin" ].join(delimiter),
      DIRECTIONS: "update extract",
      IGNORE_ANONYMOUS: "true",
      MDCODE_COMMAND: `"${process.execPath}" "${CLI_PATH}"`,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_OUTPUT: outputs,
      ...inputs,
      ...extraEnv,
    },
  });
  const read = async (file: string): Promise<string> => readFile(file, "utf-8").catch(() => "");

  return { code: run.status, stdout: run.stdout + run.stderr, summary: await read(summary), outputs: await read(outputs) };
}

/** The annotations the run printed, as [file, line, message]. */
function annotations(stdout: string): Array<[ string, string, string ]> {
  return [ ...stdout.matchAll(/^::error file=([^,]*),line=(\d+),[^:]*::(.*)$/gm) ].map(([ , file, line, message ]) => [ file!, line!, message! ]);
}

/** Two documents, one in a directory whose name has a space, linking whole files, regions and an outline. */
const SYNCED = {
  "src/greet.ts": "// #region greet\nexport function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n// #endregion\n\nconsole.log(greet(\"docs\"));\n",
  "src/math.ts": "export const add = (a: number, b: number): number => a + b;\n",
  "README.md": fence("ts file=src/greet.ts region=greet name=greet", "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}")
    + fence("ts file=src/math.ts", "export const add = (a: number, b: number): number => a + b;")
    + fence("ts file=src/greet.ts outline=true", "// #region greet\n// #endregion\n\nconsole.log(greet(\"docs\"));")
    + fence("sh", "npm install"),
  "my docs/hello world.ts": "export const hello = \"world\";\n",
  "my docs/guide.md": fence("ts file=\"hello world.ts\" name=hello", "export const hello = \"world\";"),
};

describe("check-sync action", () => {
  it("passes on a synchronised checkout, in both directions, and leaves every file as it was", async () => {
    const dir = await checkout(SYNCED);
    const before = await snapshot(dir);

    const run = await action(dir, { DOCUMENTS: "README.md\nmy docs/*.md" });

    assert.equal(run.code, 0, run.stdout);
    assert.match(run.stdout, /✓ 2 document\(s\) in sync: files → Markdown \(update\) and Markdown → files \(extract\)\./);
    assert.match(run.summary, /^## mdcode: in sync/);
    assert.match(run.outputs, /^problems=0$/m);
    assert.deepEqual(await snapshot(dir), before);
  });

  it("reports a changed source in both directions, naming the document, line, block and file", async () => {
    const dir = await checkout({ ...SYNCED, "my docs/hello world.ts": "export const hello = \"there\";\n" });
    const before = await snapshot(dir);

    const run = await action(dir, { DOCUMENTS: "README.md\nmy docs/guide.md" });

    assert.equal(run.code, 1);
    assert.deepEqual(annotations(run.stdout), [[
      "my docs/guide.md",
      "1",
      "both directions: out of sync with hello world.ts; my docs/hello world.ts differs from this block; extract would overwrite it (hello)",
    ]]);
    assert.match(run.summary, /\| both \| my docs\/guide\.md \| 1 \| hello \| hello world\.ts \| out_of_sync: /);
    assert.match(run.outputs, /^problems=1$/m);
    assert.deepEqual(await snapshot(dir), before, "a failing check writes nothing either");
  });

  it("reports drift that only one direction can see", async () => {
    const dir = await checkout({
      ...SYNCED,
      // update shows a file's last newlines as one; extract would remove the extra ones.
      "src/math.ts": "export const add = (a: number, b: number): number => a + b;\n\n\n",
      // extract writes nothing for an outline, so only update sees the stale one.
      "src/greet.ts": SYNCED["src/greet.ts"].replace("console.log(greet(\"docs\"));", "console.log(greet(\"you\"));"),
    });

    const run = await action(dir, { DOCUMENTS: "README.md" });

    assert.equal(run.code, 1);
    assert.deepEqual(annotations(run.stdout).map(([ , line, message ]) => [ line, message.split(":")[0] ]), [
      [ "11", "files → Markdown (update)" ],
      [ "7", "Markdown → files (extract)" ],
    ]);
    assert.match(annotations(run.stdout)[1]![2], /only trailing newlines differ/);
  });

  it("reports a region the source lost as unreadable for update and as missing for extract", async () => {
    const dir = await checkout({ ...SYNCED, "src/greet.ts": "export function greet() {}\n" });

    const run = await action(dir, { DOCUMENTS: "README.md" });

    assert.equal(run.code, 1);
    assert.deepEqual(annotations(run.stdout).map(([ , line, message ]) => [ line, message.replace(/:.*/, "") ]), [
      [ "1", "files → Markdown (update)" ],
      [ "11", "files → Markdown (update)" ],
      [ "1", "Markdown → files (extract)" ],
    ]);
    assert.match(run.stdout, /title=mdcode missing_region::files → Markdown \(update\): region greet not found in src\/greet\.ts/);
    assert.match(run.stdout, /region greet is not in src\/greet\.ts; extract would append it/);
  });

  it("checks only the directions asked for", async () => {
    const dir = await checkout({ ...SYNCED, "src/math.ts": `${SYNCED["src/math.ts"]}\n\n` });

    assert.equal((await action(dir, { DOCUMENTS: "README.md", DIRECTIONS: "update" })).code, 0, "update cannot see extra trailing newlines");
    assert.equal((await action(dir, { DOCUMENTS: "README.md", DIRECTIONS: "extract" })).code, 1);
  });

  it("resolves both directions against base when it is given", async () => {
    const dir = await checkout({
      "src/a.ts": "export const a = 1;\n",
      "docs/a.md": fence("ts file=src/a.ts", "export const a = 1;"),
    });

    assert.equal((await action(dir, { DOCUMENTS: "docs/a.md" })).code, 1, "docs/src/a.ts does not exist");
    assert.equal((await action(dir, { DOCUMENTS: "docs/a.md", BASE: "." })).code, 0);
  });

  it("fails as misconfigured when a document is missing, a pattern matches nothing or directions are unknown", async () => {
    const dir = await checkout(SYNCED);

    for (const [ inputs, message ] of [
      [{ DOCUMENTS: "NOPE.md" }, "document NOPE.md does not exist" ],
      [{ DOCUMENTS: "docs/*.md" }, "documents pattern docs/*.md matched no files" ],
      [{ DOCUMENTS: "README.md", DIRECTIONS: "sideways" }, "directions must list update, extract or both" ],
      [{ DOCUMENTS: "" }, "documents is empty" ],
    ] as const) {
      const run = await action(dir, inputs);

      assert.equal(run.code, 2, message);
      assert.match(run.stdout, new RegExp(`^::error title=mdcode check-sync::${message.replaceAll("*", "\\*")}`, "m"));
    }
  });

  it("runs the mdcode-ts release this action belongs to when mdcode-command is empty", async () => {
    const dir = await checkout(SYNCED);
    const bin = join(dir, "action-bin");
    const calls = join(dir, "action-npx-calls.txt");
    await mkdir(bin);
    // A stand-in npx: record how it was called, then run the built CLI with the arguments after the package.
    await writeFile(join(bin, "npx"), `#!/bin/sh\necho "$1 $2" >> "${calls}"\nshift 2\nexec "${process.execPath}" "${CLI_PATH}" "$@"\n`, "utf-8");
    await chmod(join(bin, "npx"), 0o755);
    const { version } = JSON.parse(await readFile(MANIFEST, "utf-8")) as { version: string; };

    const run = await action(dir, { DOCUMENTS: "README.md", MDCODE_COMMAND: "" }, { PATH: [ bin, dirname(process.execPath), "/usr/bin", "/bin" ].join(delimiter) });

    assert.equal(run.code, 0, run.stdout);
    assert.deepEqual((await readFile(calls, "utf-8")).trim().split("\n"), [ `--yes mdcode-ts@${version}`, `--yes mdcode-ts@${version}` ]);
  });
});
