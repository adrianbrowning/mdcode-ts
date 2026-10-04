/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import type { ProjectConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { CommandError } from "./result.ts";

const dirs: Array<string> = [];

after(async () => {
  await Promise.all(dirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

/** A project directory holding README.md, docs/a.md, docs/b.md and src/. */
async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-config-"));
  dirs.push(dir);
  await mkdir(join(dir, "docs"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "README.md"), "# readme\n", "utf-8");
  await writeFile(join(dir, "docs", "b.md"), "# b\n", "utf-8");
  await writeFile(join(dir, "docs", "a.md"), "# a\n", "utf-8");
  return dir;
}

/** Write a configuration into dir and load it. */
async function load(dir: string, config: unknown): Promise<ProjectConfig> {
  const path = join(dir, "mdcode.config.json");
  await writeFile(path, typeof config === "string" ? config : JSON.stringify(config), "utf-8");
  return loadConfig(path);
}

/** Expect loadConfig to fail with this contract code and a message matching pattern. */
async function rejects(dir: string, config: unknown, code: string, pattern: RegExp): Promise<void> {
  await assert.rejects(load(dir, config), (error: unknown) => {
    assert.ok(error instanceof CommandError, String(error));
    assert.equal(error.code, code);
    assert.match(error.message, pattern);
    return true;
  });
}

describe("loadConfig", () => {
  test("expands documents in entry order, sorting each glob's matches and dropping repeats", async () => {
    const dir = await project();

    const config = await load(dir, { documents: [ "README.md", "docs/*.md", "docs/a.md" ] });

    assert.deepEqual(config.documents, [ join(dir, "README.md"), join(dir, "docs/a.md"), join(dir, "docs/b.md") ]);
  });

  test("resolves roots against the configuration file's directory, not the current one", async () => {
    const dir = await project();

    const config = await load(dir, { sourceRoot: "src", outputRoot: "build/snippets", filter: { lang: "js", file: "a.js", meta: { runnable: "true" } } });

    assert.equal(config.sourceRoot, join(dir, "src"));
    assert.equal(config.outputRoot, join(dir, "build/snippets"), "an output root need not exist yet");
    assert.deepEqual(config.filter, { lang: "js", file: "a.js", meta: { runnable: "true" } });
    assert.deepEqual(config.documents, []);
  });

  test("matches only files, so a glob that finds only directories matches nothing", async () => {
    const dir = await project();

    await rejects(dir, { documents: [ "d*" ] }, "invalid_config", /documents\[0\] "d\*" matched no files/);
  });

  test("names the entry that matched nothing", async () => {
    const dir = await project();

    await rejects(dir, { documents: [ "README.md", "guide/*.md" ] }, "invalid_config", /documents\[1\] "guide\/\*\.md" matched no files/);
  });

  test("refuses documents and roots that leave its directory", async () => {
    const dir = await project();

    await rejects(dir, { documents: [ "../*.md" ] }, "unsafe_path", /documents\[0\] "\.\.\/\*\.md" must stay inside/);
    await rejects(dir, { documents: [ "/etc/*.conf" ] }, "unsafe_path", /documents\[0\] .* must stay inside/);
    await rejects(dir, { sourceRoot: "../elsewhere" }, "unsafe_path", /sourceRoot: .*outside the allowed base/);
    await rejects(dir, { outputRoot: "/tmp/out" }, "unsafe_path", /outputRoot: absolute path/);
  });

  test("refuses a document that leads out through a symlink", async () => {
    const dir = await project();
    const outside = await mkdtemp(join(tmpdir(), "mdcode-config-outside-"));
    dirs.push(outside);
    await writeFile(join(outside, "secret.md"), "# secret\n", "utf-8");
    await symlink(join(outside, "secret.md"), join(dir, "docs", "linked.md"));

    await rejects(dir, { documents: [ "docs/*.md" ] }, "unsafe_path", /documents\[0\]: .*leads through a symlink/);
  });

  test("reports a missing, malformed or misshapen file as invalid_config", async () => {
    const dir = await project();

    await assert.rejects(loadConfig(join(dir, "absent.json")), /absent\.json: not found at .*; create it, or point --config at another file/);
    await rejects(dir, "{ \"documents\": ", "invalid_config", /not valid JSON/);
    await rejects(dir, [ "README.md" ], "invalid_config", /must be a JSON object/);
    await rejects(dir, { documnets: [ "README.md" ] }, "invalid_config", /unknown field "documnets"; expected documents, sourceRoot, outputRoot, filter/);
    await rejects(dir, { documents: [] }, "invalid_config", /documents must be a non-empty array/);
    await rejects(dir, { documents: "README.md" }, "invalid_config", /documents must be a non-empty array/);
    await rejects(dir, { sourceRoot: 3 }, "invalid_config", /sourceRoot must be a directory path/);
  });

  test("validates filters, refusing name, which belongs to one document", async () => {
    const dir = await project();

    await rejects(dir, { filter: [] }, "invalid_config", /filter must be an object/);
    await rejects(dir, { filter: { language: "js" } }, "invalid_config", /unknown field "filter\.language"; expected filter\.lang, filter\.file, filter\.meta/);
    await rejects(dir, { filter: { name: "greet" } }, "invalid_config", /filter\.name is not supported.*--name/);
    await rejects(dir, { filter: { lang: "" } }, "invalid_config", /filter\.lang must be a non-empty string/);
    await rejects(dir, { filter: { meta: { runnable: true } } }, "invalid_config", /filter\.meta must be an object of metadata keys to string values/);
  });
});
