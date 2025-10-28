import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {update, defineTransform } from "mdcode";
import type { TransformerMeta} from "mdcode";

describe("update with transformer", () => {
  it("should transform code blocks using custom function", async () => {
    const markdown = `
# Test

\`\`\`js
const x = 1;
\`\`\`

\`\`\`sql
select * from users;
\`\`\`
    `.trim();

    const transformer = defineTransform(({tag, code}) => {
      if (tag === "sql") {
        return code.toUpperCase();
      }
      return code;
    });

    const result = await update({ source: markdown, transformer });

    assert.ok(result.includes("SELECT * FROM USERS;"));
    assert.ok(result.includes("const x = 1;"));
  });

  it("should pass metadata to transformer", async () => {
    const markdown = `
\`\`\`js file=test.js region=main
console.log('hello');
\`\`\`
    `.trim();

    let receivedMeta: TransformerMeta;

    const transformer = defineTransform(({ meta, code}) => {
      receivedMeta = meta;
      return code;
    });

    await update({ source: markdown, transformer });

    assert.deepStrictEqual(receivedMeta!, {
      file: "test.js",
      region: "main",
    });
  });

  it("should handle async transformers", async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`
    `.trim();

    const transformer = defineTransform(async ({code}) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return code.toUpperCase();
    });

    const result = await update({ source: markdown, transformer });

    assert.ok(result.includes("CONST X = 1;"));
  });

  it("should pass undefined for missing metadata", async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`
    `.trim();

    let receivedMeta: TransformerMeta;

    const transformer = defineTransform(({ meta, code}) => {
      receivedMeta = meta;
      return code;
    });

    await update({ source: markdown, transformer });

    assert.deepStrictEqual(receivedMeta!, {
      file: undefined,
      region: undefined,
    });
  });

  it("should work with filters", async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
    `.trim();

    const transformer = defineTransform(({ code}) => code.toUpperCase());

    const result = await update({ source: markdown, transformer, filter: { lang: "js" } });

    // Only JS should be transformed
    assert.ok(result.includes("CONST X = 1;"));
    assert.ok(result.includes("y = 2")); // Python unchanged
  });

  it("should handle transformation based on metadata", async () => {
    const markdown = `
\`\`\`js file=test.spec.js
test('something', () => {});
\`\`\`

\`\`\`js file=app.js
const app = {};
\`\`\`
    `.trim();

    const transformer = defineTransform(({ meta, code}) => {
      if (meta.file?.includes(".spec.") || meta.file?.includes(".test.")) {
        return `// AUTO-GENERATED TEST\n${code}`;
      }
      return code;
    });

    const result = await update({ source: markdown, transformer });

    assert.ok(result.includes("// AUTO-GENERATED TEST"));
    assert.ok(result.includes("test('something'"));
    assert.ok(result.includes("const app = {}"));
    // Count occurrences - only test file should have the comment
    const matches = result.match(/AUTO-GENERATED TEST/g);
    assert.strictEqual(matches?.length, 1);
  });

  it("should handle regions in metadata", async () => {
    const markdown = `
\`\`\`js region=example
const example = true;
\`\`\`

\`\`\`js region=production
const prod = true;
\`\`\`
    `.trim();

    const transformer = defineTransform(({ meta, code}) => {
      if (meta.region === "example") {
        return `/* EXAMPLE */\n${code}`;
      }
      return code;
    });

    const result = await update({ source: markdown, transformer });

    assert.ok(result.includes("/* EXAMPLE */"));
    assert.ok(result.includes("const example = true"));
    assert.ok(result.includes("const prod = true"));
    // Only one example comment
    const matches = result.match(/EXAMPLE/g);
    assert.strictEqual(matches?.length, 1);
  });

  it("should preserve unchanged blocks", async () => {
    const markdown = `
\`\`\`js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`

\`\`\`sql
SELECT * FROM users;
\`\`\`
    `.trim();

    const transformer = defineTransform(({tag, code}) => {
      if (tag === "sql") {
        return code.toUpperCase();
      }
      // Return unchanged for other languages
      return code;
    });

    const result = await update({ source: markdown, transformer });

    // SQL should be uppercase
    assert.ok(result.includes("SELECT * FROM USERS;"));
    // Others should be unchanged
    assert.ok(result.includes("const x = 1;"));
    assert.ok(result.includes("y = 2"));
  });
});
