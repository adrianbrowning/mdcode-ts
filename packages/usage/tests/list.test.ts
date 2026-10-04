import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { list } from "../../mdcode/src/commands/list.ts";

describe("list command", () => {
  const markdown = [
    "# Doc",
    "",
    "```js name=greet file=app.js region=main",
    "console.log('hello');",
    "const x = 1;",
    "```",
    "",
    "```python file=script.py",
    "print('world')",
    "```",
    "",
    "```",
    "plain",
    "```",
    "",
  ].join("\n");

  it("returns every block with its identity, metadata, code and fence lines", () => {
    assert.deepStrictEqual(list({ source: markdown }).blocks, [
      { name: "greet", line: 3, endLine: 6, lang: "js", meta: { name: "greet", file: "app.js", region: "main" }, code: "console.log('hello');\nconst x = 1;" },
      { name: null, line: 8, endLine: 10, lang: "python", meta: { file: "script.py" }, code: "print('world')" },
      { name: null, line: 12, endLine: 14, lang: "", meta: {}, code: "plain" },
    ]);
  });

  it("applies the filter", () => {
    assert.deepStrictEqual(list({ source: markdown, filter: { lang: "python" } }).blocks.map(block => block.line), [ 8 ]);
    assert.deepStrictEqual(list({ source: markdown, filter: { name: "greet" } }).blocks.map(block => block.line), [ 3 ]);
  });

  it("returns no blocks for markdown without code", () => {
    assert.deepStrictEqual(list({ source: "# No code blocks here" }), { blocks: [] });
  });

  it("counts lines the same way with CRLF line endings", () => {
    const [ block ] = list({ source: markdown.replace(/\n/g, "\r\n") }).blocks;

    assert.equal(block?.line, 3);
    assert.equal(block?.endLine, 6);
  });
});
