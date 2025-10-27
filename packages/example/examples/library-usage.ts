/**
 * Library Usage Example
 *
 * This demonstrates how to use mdcode-ts programmatically in your TypeScript/JavaScript projects.
 * Import functions from '@mdcode-ts/mdcode' and use them to parse, transform, and manipulate
 * code blocks in markdown documents.
 */

// In a real project, you would import from '@mdcode-ts/mdcode':
// import mdcode, { parse, walk, update, defineTransform, type Block, type TransformerFunction } from '@mdcode-ts/mdcode';

// For this example, we import from the built dist folder:
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import mdcode, {
  type Block,
  defineTransform,
  parse,
  update,
  walk
} from "../../mdcode/dist/index.js";

// Example markdown document
const markdown = `
# Example Documentation

## Basic Code Block

\`\`\`js file=app.js
const greeting = 'Hello, World!';
console.log(greeting);
\`\`\`

## SQL Query

\`\`\`sql
select * from users where active = true;
\`\`\`

## Test File

\`\`\`js file=app.test.js
test('greeting', () => {
  expect(greeting).toBe('Hello, World!');
});
\`\`\`

## Python Code

\`\`\`python region=example
def factorial(n):
    return 1 if n <= 1 else n * factorial(n - 1)
\`\`\`
`;

// -----------------
// Example 0: Simple Default Export API (Recommended)
// -----------------
console.log("=== Example 0: Simple Default Export API (Recommended) ===\n");

// The simplest way to use mdcode is with the default export
// This reads a file and transforms it in one step
const tempFile = join(tmpdir(), "mdcode-example.md");
await writeFile(tempFile, markdown, "utf-8");

const simpleResult = await mdcode(tempFile, (tag, meta, code) => {
  if (tag === "sql") return code.toUpperCase();
  if (tag === "js" && meta.file?.includes(".test.")) {
    return `// AUTO-GENERATED TEST\n${code}`;
  }
  return code;
});

console.log("Transformed with default export:");
const sqlBlocks1 = parse({ source: simpleResult, filter: { lang: "sql" } });
console.log("SQL block:", sqlBlocks1?.[0]?.code);

const testBlocks1 = parse({ source: simpleResult, filter: { file: "app.test.js" } });
console.log("Test file:", testBlocks1?.[0]?.code.split("\n")[0]); // First line

await unlink(tempFile);

// -----------------
// Example 1: Parse and Extract Code Blocks
// -----------------
console.log("\n\n=== Example 1: Parse and Extract Code Blocks ===\n");

const allBlocks = parse({ source: markdown });
console.log(`Found ${allBlocks.length} code blocks:`);
allBlocks.forEach((block, i) => {
  console.log(`  ${i + 1}. Language: ${block.lang}, File: ${block.meta.file || "none"}`);
});

// Extract only JavaScript blocks
const jsBlocks = parse({ source: markdown, filter: { lang: "js" } });
console.log(`\nFound ${jsBlocks.length} JavaScript blocks:`);
jsBlocks.forEach(block => {
  console.log(`  - File: ${block.meta.file}`);
  console.log(`    Code: ${block.code.substring(0, 50)}...`);
});

// -----------------
// Example 2: Simple Transformation
// -----------------
console.log("\n\n=== Example 2: Simple Transformation ===\n");

const uppercaseTransformer = defineTransform((tag, _meta, code) => {
  if (tag === "sql") {
    return code.toUpperCase();
  }
  return code;
});

const result1 = await update({
  source: markdown,
  transformer: uppercaseTransformer,
});

console.log("SQL blocks have been transformed to uppercase:");
const sqlBlocks = parse({ source: result1, filter: { lang: "sql" } });
console.log(sqlBlocks?.[0]?.code);

// -----------------
// Example 3: Conditional Transformation Based on Metadata
// -----------------
console.log("\n\n=== Example 3: Conditional Transformation ===\n");

const conditionalTransformer = defineTransform((tag, meta, code) => {
  // Add strict mode to JS files
  if (tag === "js" && meta.file && !meta.file.includes(".test.")) {
    return `'use strict';\n\n${code}`;
  }

  // Add auto-generated comment to test files
  if (meta.file?.includes(".test.")) {
    return `// AUTO-GENERATED TEST FILE\n// Do not edit manually\n\n${code}`;
  }

  // Add docstring to Python functions with region metadata
  if (tag === "python" && meta.region) {
    return `"""Example code from region: ${meta.region}"""\n${code}`;
  }

  return code;
});

const result2 = await update({
  source: markdown,
  transformer: conditionalTransformer,
});

console.log("Transformed blocks:");

// Show app.js with strict mode
const appJsBlocks = parse({
  source: result2,
  filter: { lang: "js", file: "app.js" },
});
console.log("\napp.js (with strict mode):");
console.log(appJsBlocks?.[0]?.code);

// Show test file with auto-generated comment
const testBlocks = parse({
  source: result2,
  filter: { file: "app.test.js" },
});
console.log("\napp.test.js (with auto-generated comment):");
console.log(testBlocks?.[0]?.code);

// Show Python with docstring
const pythonBlocks = parse({
  source: result2,
  filter: { lang: "python" },
});
console.log("\nPython (with docstring):");
console.log(pythonBlocks?.[0]?.code);

// -----------------
// Example 4: Async Transformation
// -----------------
console.log("\n\n=== Example 4: Async Transformation ===\n");

// Simulate an async operation (e.g., calling a formatter API)
async function formatCode(code: string, lang: string): Promise<string> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Simple formatting simulation
  if (lang === "js") {
    return code.replace(/;/g, ";\n").trim();
  }
  return code;
}

const asyncTransformer = defineTransform(async (tag, _meta, code) => {
  if (tag === "js") {
    return formatCode(code, tag);
  }
  return code;
});

const result3 = await update({
  source: markdown,
  transformer: asyncTransformer,
  filter: { lang: "js" },
});

console.log("JavaScript code has been formatted (async):");
const formattedJsBlocks = parse({ source: result3, filter: { lang: "js" } });
console.log(formattedJsBlocks?.[0]?.code);

// -----------------
// Example 5: Custom Walker for Advanced Processing
// -----------------
console.log("\n\n=== Example 5: Custom Walker ===\n");

const stats = {
  totalBlocks: 0,
  byLanguage: {} as Record<string, number>,
  withMetadata: 0,
};

await walk({
  source: markdown,
  walker: async (block: Block) => {
    stats.totalBlocks++;
    stats.byLanguage[block.lang] = (stats.byLanguage[block.lang] || 0) + 1;

    if (Object.keys(block.meta).length > 0) {
      stats.withMetadata++;
    }

    // Return block unchanged (just collecting stats)
    return block;
  },
});

console.log("Code block statistics:");
console.log(`  Total blocks: ${stats.totalBlocks}`);
console.log(`  Blocks with metadata: ${stats.withMetadata}`);
console.log("  By language:");
Object.entries(stats.byLanguage).forEach(([ lang, count ]) => {
  console.log(`    ${lang}: ${count}`);
});

// -----------------
// Example 6: Removing Blocks
// -----------------
console.log("\n\n=== Example 6: Removing Blocks ===\n");

const result4 = await walk({
  source: markdown,
  walker: async (block: Block) => {
    // Remove all test files
    if (block.meta.file?.includes(".test.")) {
      return null; // null = remove block
    }
    return block;
  },
});

const remainingBlocks = parse({ source: result4.source });
console.log(`Original blocks: ${allBlocks.length}`);
console.log(`Remaining blocks after removing tests: ${remainingBlocks.length}`);
console.log("Modified:", result4.modified);

// -----------------
// Example 7: Chaining Multiple Transformations
// -----------------
console.log("\n\n=== Example 7: Chaining Transformations ===\n");

// First transformer: Add comments
const addCommentsTransformer = defineTransform((tag, _meta, code) => `// Language: ${tag}\n${code}`);

// Second transformer: Add line numbers
const addLineNumbersTransformer = defineTransform((_tag,_meta, code) => {
  const lines = code.split("\n");
  const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
  return numbered;
});

// Apply first transformation
let chainedResult = await update({
  source: markdown,
  transformer: addCommentsTransformer,
  filter: { lang: "js" },
});

// Apply second transformation
chainedResult = await update({
  source: chainedResult,
  transformer: addLineNumbersTransformer,
  filter: { lang: "js" },
});

console.log("Chained transformation result (first JS block):");
const chainedBlocks = parse({ source: chainedResult, filter: { lang: "js" } });
console.log(chainedBlocks?.[0]?.code);

// -----------------
// Example 8: Real-World Use Case - Documentation Generator
// -----------------
console.log("\n\n=== Example 8: Documentation Generator ===\n");

/**
 * Generate a table of contents for all code blocks in a markdown document
 */
function generateCodeBlockTOC(source: string): string {
  const blocks = parse({ source });

  let toc = "## Code Blocks Table of Contents\n\n";

  blocks.forEach((block, i) => {
    const lang = block.lang || "text";
    const file = block.meta.file || "inline";
    const region = block.meta.region ? ` (${block.meta.region})` : "";
    const lines = block.code.split("\n").length;

    toc += `${i + 1}. **${lang}** - ${file}${region} (${lines} lines)\n`;
  });

  return toc;
}

const toc = generateCodeBlockTOC(markdown);
console.log("Generated Table of Contents:");
console.log(toc);

console.log("\n=== All Examples Complete ===\n");
