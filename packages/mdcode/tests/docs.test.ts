/* eslint-disable @typescript-eslint/no-floating-promises */
/**
 * The READMEs list every command and error code by hand. These tests fail when
 * a command or code is added, renamed or removed without the docs following.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "node:test";

import { COMMAND_NAMES, ERROR_CODES } from "../src/result.ts";

const packageReadme = await readFile(join(import.meta.dirname, "../README.md"), "utf-8");
const rootReadme = await readFile(join(import.meta.dirname, "../../../README.md"), "utf-8");

/** The first capture of every match, in order. */
function captures(text: string, pattern: RegExp): Array<string> {
  return [ ...text.matchAll(pattern) ].map(match => match[1]!);
}

/** The lines from `start` up to the first blank line after it. */
function blockAt(text: string, start: string): string {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `README has no ${JSON.stringify(start)}`);
  const end = text.indexOf("\n\n", from);
  return text.slice(from, end === -1 ? undefined : end);
}

describe("package README", () => {
  test("has a section for every command", () => {
    const headings = captures(packageReadme, /^## (\w+) Command$/gm).map(name => name.toLowerCase());

    assert.deepEqual(headings.sort(), [ ...COMMAND_NAMES ].sort());
  });

  test("its error-code table lists exactly the codes in result.ts", () => {
    const table = blockAt(packageReadme, "| Code | Meaning |");

    assert.deepEqual(captures(table, /^\| `(\w+)` \|/gm).sort(), [ ...ERROR_CODES ].sort());
  });

  test("its ErrorCode type lists exactly the codes in result.ts", () => {
    const union = blockAt(packageReadme, "type ErrorCode =");

    assert.deepEqual(captures(union, /^ {2}\| "(\w+)"/gm), [ ...ERROR_CODES ]);
  });
});

test("root README's command table lists every command", () => {
  const table = blockAt(rootReadme, "| Command |");

  assert.deepEqual(captures(table, /^\| `(\w+)` \|/gm).sort(), [ ...COMMAND_NAMES ].sort());
});
