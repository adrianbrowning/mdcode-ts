/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";

import type { ValidateOptions } from "./validate.ts";
import { validate } from "./validate.ts";

const tempDirs: Array<string> = [];

after(async () => {
  await Promise.all(tempDirs.map(async dir => rm(dir, { recursive: true, force: true })));
});

/** A temporary directory holding these files. */
async function project(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mdcode-validate-"));
  tempDirs.push(dir);

  for (const [ path, content ] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content, "utf-8");
  }

  return dir;
}

function block(info: string, code = "x"): string {
  return `\`\`\`${info}\n${code}\n\`\`\`\n\n`;
}

/** The rule each finding names, with the block and path it concerns. */
async function findings(options: ValidateOptions): Promise<Array<{ code: string; line?: number; path?: string; }>> {
  const { errors } = await validate(options);
  return errors.map(({ code, line, path }) => ({ code, line, path }));
}

describe("validate for extract: blocks sharing a target", () => {
  test("allows same-language blocks with distinct regions", async () => {
    const dir = await project();
    const source = block("ts file=a.ts region=one") + block("ts file=a.ts region=two");

    const result = await validate({ source, operation: "extract", base: dir });

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.blocks.map(({ line, path, region, valid }) => ({ line, path, region, valid })), [
      { line: 1, path: join(dir, "a.ts"), region: "one", valid: true },
      { line: 5, path: join(dir, "a.ts"), region: "two", valid: true },
    ]);
  });

  test("refuses every other sharing, naming each block involved", async () => {
    const dir = await project();
    const target = join(dir, "a.ts");
    const cases = {
      "a whole-file block beside a region block": block("ts file=a.ts region=one") + block("ts file=a.ts"),
      "two whole-file blocks, even identical ones": block("ts file=a.ts") + block("ts file=a.ts"),
      "a repeated region": block("ts file=a.ts region=one") + block("ts file=a.ts region=one"),
      "regions in different languages": block("ts file=a.ts region=one") + block("py file=a.ts region=two"),
      "two spellings of one file": block("ts file=a.ts") + block("ts file=./sub/../a.ts"),
    };

    for (const [ name, source ] of Object.entries(cases)) {
      assert.deepEqual(await findings({ source, operation: "extract", base: dir }), [
        { code: "ambiguous_target", line: 1, path: target },
        { code: "ambiguous_target", line: 5, path: target },
      ], name);
    }
  });

  test("counts generated names as targets, unless anonymous blocks are ignored", async () => {
    const dir = await project();
    const source = block("sh") + block("sh file=block-1.sh");

    assert.deepEqual((await findings({ source, operation: "extract", base: dir })).map(({ code }) => code), [ "ambiguous_target", "ambiguous_target" ]);
    assert.deepEqual(await findings({ source, operation: "extract", base: dir, ignoreAnonymous: true }), []);
  });
});

describe("validate for extract: regions and paths", () => {
  test("checks an existing target's markers for every region block", async () => {
    const dir = await project({
      "open.ts": "// #region a\nconst a = 1;\n",
      "twice.ts": "// #region a\n1\n// #endregion a\n// #region a\n2\n// #endregion a\n",
      "python.ts": "# #region a\n1\n# #endregion a\n",
      "fine.ts": "// #region a\n1\n// #endregion a\n",
    });
    const source = [ "open", "twice", "python", "fine" ].map(name => block(`ts file=${name}.ts region=a`)).join("");

    assert.deepEqual(await findings({ source, operation: "extract", base: dir }), [
      { code: "malformed_region", line: 1, path: join(dir, "open.ts") },
      { code: "duplicate_region", line: 5, path: join(dir, "twice.ts") },
      { code: "region_language_mismatch", line: 9, path: join(dir, "python.ts") },
    ]);
  });

  test("leaves a region the existing target lacks to be appended", async () => {
    const dir = await project({ "a.ts": "const keep = 1;\n" });

    assert.deepEqual(await findings({ source: block("ts file=a.ts region=new"), operation: "extract", base: dir }), []);
  });

  test("refuses invalid region names, empty file=, and paths that leave the base", async () => {
    const dir = await project();
    const source = block("ts file=a.ts region=\"a b\"") + block("ts file=../out.ts") + block("ts file=\"\"");

    for (const operation of [ "extract", "update" ] as const) {
      assert.deepEqual((await findings({ source, operation, base: dir })).map(({ code, line }) => ({ code, line })), [
        { code: operation === "extract" ? "malformed_region" : "read_failed", line: 1 },
        { code: "unsafe_path", line: 5 },
        { code: "unsafe_path", line: 9 },
      ], operation);
    }
    assert.deepEqual(await readdir(dir), [], "nothing is written");
  });
});

describe("validate for update", () => {
  test("checks every file= and region= the blocks read", async () => {
    const dir = await project({
      "src.js": [
        "// #region ok",
        "1",
        "// #endregion ok",
        "// #region twice",
        "2",
        "// #endregion twice",
        "// #region twice",
        "3",
        "// #endregion twice",
        "# #region hashed",
        "4",
        "# #endregion hashed",
        "// #region open",
        "",
      ].join("\n"),
    });
    const source = [
      "js file=src.js region=ok",
      "js file=missing.js",
      "js file=src.js region=absent",
      "js file=src.js region=twice",
      "js file=src.js region=hashed",
      "js file=src.js region=open",
      "js file=../escape.js",
    ].map(info => block(info)).join("");

    assert.deepEqual(await findings({ source, operation: "update", base: dir }), [
      { code: "read_failed", line: 5, path: "missing.js" },
      { code: "missing_region", line: 9, path: "src.js" },
      { code: "duplicate_region", line: 13, path: "src.js" },
      { code: "region_language_mismatch", line: 17, path: "src.js" },
      { code: "malformed_region", line: 21, path: "src.js" },
      { code: "unsafe_path", line: 25, path: "../escape.js" },
    ]);
  });

  test("lets several blocks read one file, and ignores blocks without file=", async () => {
    const dir = await project({ "a.js": "// #region one\n1\n// #endregion one\n" });
    const source = block("js file=a.js") + block("js file=a.js region=one") + block("js");

    const result = await validate({ source, operation: "update", base: dir });

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.blocks.map(({ path }) => path), [ "a.js", "a.js", null ]);
  });

  test("refuses outline=true on a file without well-formed markers", async () => {
    const dir = await project({ "plain.js": "const a = 1;\n", "open.js": "// #region a\n1\n" });
    const source = block("js file=plain.js outline=true") + block("js file=open.js outline=true");

    assert.deepEqual((await findings({ source, operation: "update", base: dir })).map(({ code }) => code), [ "missing_region", "malformed_region" ]);
  });
});

describe("validate --strict", () => {
  test("refuses every selected block without file=, for either operation", async () => {
    const dir = await project({ "a.js": "1\n" });
    const source = block("js file=a.js") + block("js") + block("sh");

    for (const operation of [ "extract", "update" ] as const) {
      const result = await validate({ source, operation, base: dir, strict: true, filter: { lang: "js" } });

      assert.deepEqual(result.errors.map(({ code, line }) => ({ code, line })), [{ code: "missing_file_metadata", line: 5 }], operation);
      assert.deepEqual(result.blocks.map(({ valid }) => valid), [ true, false ]);
    }
  });
});

test("validate writes nothing", async () => {
  const dir = await project({ "a.ts": "// #region a\nold\n// #endregion a\n" });

  await validate({ source: block("ts file=a.ts region=a") + block("ts file=new.ts"), operation: "extract", base: dir });

  assert.deepEqual(await readdir(dir), [ "a.ts" ]);
  assert.equal(await readFile(join(dir, "a.ts"), "utf-8"), "// #region a\nold\n// #endregion a\n");
});
