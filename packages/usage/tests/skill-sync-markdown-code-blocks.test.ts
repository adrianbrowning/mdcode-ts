/* eslint-disable @typescript-eslint/no-floating-promises */
/**
 * Task check for the shipped sync-markdown-code-blocks skill
 * (packages/mdcode/skills/sync-markdown-code-blocks). The task is in
 * tests/skills/sync-markdown-code-blocks/task.md; the grader below decides
 * whether a working directory completes it.
 *
 * By default the grader runs against the skill's recommended solution and
 * against the mistakes the skill warns about. Set SKILL_TASK_DIR to grade a
 * consumer agent's attempt instead.
 */
import assert from "node:assert/strict";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { parse } from "mdcode";

import { cleanupTempDir, createTempDir, execCli } from "./test-utils.ts";

const TASK = join(import.meta.dirname, "skills", "sync-markdown-code-blocks");
const FIXTURE = join(TASK, "fixture");
const DOCUMENTS = [ "README.md", "docs/usage.md" ];

/** The document with every code block emptied, so prose edits show up and code edits don't. */
function prose(markdown: string): string {
  let result = "";
  let from = 0;

  for (const { position } of parse({ source: markdown })) {
    result += markdown.slice(from, position!.start);
    from = position!.end;
  }

  return result + markdown.slice(from);
}

/** Throw unless dir completes the task: docs in sync, source untouched, prose untouched. */
async function grade(dir: string): Promise<void> {
  const check = await execCli([ "update", "--check", "--project" ], { cwd: dir });
  assert.equal(check.exitCode, 0, `mdcode update --check --project must pass:\n${check.stderr}`);

  const source = await readFile(join(dir, "src", "greet.ts"), "utf-8");
  assert.equal(source, await readFile(join(FIXTURE, "src", "greet.ts"), "utf-8"), "src/greet.ts is the source of truth and must not change");

  for (const document of DOCUMENTS) {
    const before = await readFile(join(FIXTURE, document), "utf-8");
    const now = await readFile(join(dir, document), "utf-8");
    assert.equal(prose(now), prose(before), `${document}: only code blocks may change`);
  }
}

const graded = process.env.SKILL_TASK_DIR;

if (graded) {
  it(`completes the sync-markdown-code-blocks task in ${graded}`, async () => {
    await grade(graded);
  });
}
else {
  describe("sync-markdown-code-blocks skill task", () => {
    const dirs: Array<string> = [];

    after(async () => {
      await Promise.all(dirs.map(cleanupTempDir));
    });

    /** A fresh copy of the fixture, after running each command in it. */
    async function attempt(...commands: Array<Array<string>>): Promise<string> {
      const dir = await createTempDir();
      dirs.push(dir);
      await cp(FIXTURE, dir, { recursive: true });

      for (const args of commands) {
        await execCli(args, { cwd: dir });
      }

      return dir;
    }

    it("accepts the skill's solution: update --apply with the project configuration", async () => {
      await grade(await attempt([ "update", "--apply", "--project" ]));
    });

    it("rejects running only the plan, which writes nothing", async () => {
      await assert.rejects(grade(await attempt([ "update", "--project" ])), /must pass/);
    });

    it("rejects updating the documents without the configuration's sourceRoot", async () => {
      await assert.rejects(grade(await attempt([ "update", "--apply", ...DOCUMENTS ])), /must pass/);
    });

    it("rejects making the source match the docs instead", async () => {
      const dir = await attempt();
      const source = await readFile(join(dir, "src", "greet.ts"), "utf-8");
      await writeFile(join(dir, "src", "greet.ts"), source.replace("name: string, punctuation = \"!\"", "name: string").replace("${punctuation}", "!"), "utf-8");

      await assert.rejects(grade(dir), /src\/greet\.ts is the source of truth/);
    });
  });
}
