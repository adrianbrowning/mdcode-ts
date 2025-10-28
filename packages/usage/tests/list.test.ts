import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Import list function from command file
import { list } from "../../mdcode/src/commands/list.ts";

describe("list command", () => {
  describe("default text output", () => {
    it("should display blocks with metadata and preview", () => {
      const markdown = `
# Test

\`\`\`js file=app.js region=main
console.log('hello');
const x = 1;
const y = 2;
const z = 3;
\`\`\`

\`\`\`python file=script.py
print('world')
\`\`\`
      `.trim();

      const output = list({ source: markdown });

      // Verify output contains block info
      assert.ok(output.includes("Found 2 code block(s)"));
      assert.ok(output.includes("[1] js"));
      assert.ok(output.includes("[2] python"));
      assert.ok(output.includes("file=app.js"));
      assert.ok(output.includes("region=main"));
      assert.ok(output.includes("file=script.py"));
      assert.ok(output.includes("console.log('hello')"));
      assert.ok(output.includes("print('world')"));
    });

    it("should handle empty markdown", () => {
      const markdown = "# No code blocks here";
      const output = list({ source: markdown });
      assert.ok(output.includes("No code blocks found"));
    });

    it("should filter by language", () => {
      const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
      `.trim();

      const output = list({ source: markdown, filter: { lang: "js" } });

      assert.ok(output.includes("Found 1 code block(s)"));
      assert.ok(output.includes("const x = 1"));
      assert.ok(!output.includes("y = 2"));
    });
  });

  describe("JSON output", () => {
    it("should output JSON with lang and metadata", () => {
      const markdown = `
\`\`\`js file=app.js region=main
console.log('hello');
\`\`\`

\`\`\`python file=script.py
print('world')
\`\`\`
      `.trim();

      const output = list({ source: markdown, json: true });
      const lines = output.split("\n");

      assert.strictEqual(lines.length, 2);

      const block1 = JSON.parse(lines[0] || "{}");
      const block2 = JSON.parse(lines[1] || "{}");

      assert.deepStrictEqual(block1, {
        lang: "js",
        file: "app.js",
        region: "main",
      });

      assert.deepStrictEqual(block2, {
        lang: "python",
        file: "script.py",
      });
    });

    it("should output JSON with only lang when no metadata", () => {
      const markdown = `
\`\`\`sql
SELECT * FROM users;
\`\`\`
      `.trim();

      const output = list({ source: markdown, json: true });
      const parsed = JSON.parse(output);

      assert.deepStrictEqual(parsed, { lang: "sql" });
    });

    it("should output empty string for no blocks", () => {
      const markdown = "# No code blocks";
      const output = list({ source: markdown, json: true });

      assert.strictEqual(output, "");
    });

    it("should filter blocks in JSON output", () => {
      const markdown = `
\`\`\`js file=app.js
const x = 1;
\`\`\`

\`\`\`python file=script.py
y = 2
\`\`\`

\`\`\`js file=test.js
const z = 3;
\`\`\`
      `.trim();

      const output = list({
        source: markdown,
        json: true,
        filter: { lang: "js" },
      });
      const lines = output.split("\n");

      assert.strictEqual(lines.length, 2);

      const block1 = JSON.parse(lines[0] || "{}");
      const block2 = JSON.parse(lines[1] || "{}");

      assert.strictEqual(block1.lang, "js");
      assert.strictEqual(block1.file, "app.js");
      assert.strictEqual(block2.lang, "js");
      assert.strictEqual(block2.file, "test.js");
    });

    it("should handle blocks without language tag", () => {
      const markdown = "```\nplain code\n```";
      const output = list({ source: markdown, json: true });
      const parsed = JSON.parse(output);

      assert.deepStrictEqual(parsed, { lang: "" });
    });
  });
});
