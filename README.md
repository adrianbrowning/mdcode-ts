# mdcode-ts

A TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

[![npm version](https://badge.fury.io/js/@gcm%2Fmdcode-ts.svg)](https://www.npmjs.com/package/@mdcode-ts/mdcode)

## Features

- **Extract** code blocks from markdown to files
- **List** code blocks with metadata and previews
- **Update** markdown code blocks from source files OR transform with custom functions
- **Run** shell commands on code blocks
- **Dump** code blocks to tar archives
- Support for metadata in code block info strings
- Filter blocks by language, file, or custom metadata
- Region extraction using special comments

## Installation

```bash
pnpm install
```

## Usage

### List code blocks

```bash
pnpm build
node dist/main.js list examples/sample.md

# Or filter by language
node dist/main.js list --lang=js examples/sample.md
```

### Extract code blocks to files

```bash
node dist/main.js extract examples/sample.md

# Extract to specific directory
node dist/main.js extract -o output examples/sample.md
```

### Update markdown from source files or transform blocks

The `update` command can update code blocks in two ways:

#### 1. Update from source files (default)

Updates code blocks by reading from files specified in the `file` metadata:

```bash
node dist/main.js update examples/sample.md > updated.md
```

#### 2. Transform with custom function (using `--transform` flag)

Transform code blocks using a custom transformer function:

```bash
# Build your transformer to .js first
npx tsc my-transform.ts --outDir dist --module ES2022 --target ES2022
node dist/main.js update --transform dist/my-transform.js examples/sample.md > output.md

# Combine with filters to transform only specific blocks
node dist/main.js update --lang sql --transform dist/uppercase-sql.js examples/sample.md
```

**Creating a transformer:**

```typescript
// my-transform.ts
import { defineTransform } from '@mdcode-ts/mdcode';

export default defineTransform((tag, meta, code) => {
  // tag: language (e.g., 'js', 'sql', 'python')
  // meta: { file?: string, region?: string }
  // code: the code block content

  if (tag === 'sql') {
    return code.toUpperCase();
  }

  if (meta.file?.includes('.test.')) {
    return `// AUTO-GENERATED\n${code}`;
  }

  return code; // return unchanged
});
```

See `examples/transforms/` for more examples including async transformers.

## Library Usage

You can use mdcode-ts programmatically in your Node.js or TypeScript projects:

```bash
pnpm add @mdcode-ts/mdcode
```

### Simple API (Default Export)

The simplest way to use mdcode-ts is with the default export:

```typescript
import mdcode from '@mdcode-ts/mdcode';

// Transform a markdown file
const result = await mdcode('/path/to/file.md', (tag, meta, code) => {
  // Transform SQL to uppercase
  if (tag === 'sql') {
    return code.toUpperCase();
  }

  // Add headers to test files
  if (meta.file?.includes('.test.')) {
    return `// AUTO-GENERATED\n${code}`;
  }

  return code; // unchanged
});

console.log(result); // Transformed markdown
```

With filters:

```typescript
// Transform only SQL blocks
const result = await mdcode(
  '/path/to/file.md',
  (tag, meta, code) => code.toUpperCase(),
  { lang: 'sql' }
);
```

### Named Imports (Advanced API)

For more control, use the named exports:

```typescript
import {
  parse,
  walk,
  update,
  transform,
  transformWithFunction,
  defineTransform,
  type Block,
  type TransformerFunction,
  type FilterOptions,
} from '@mdcode-ts/mdcode';
```

### Parse and Extract Code Blocks

```typescript
import { parse } from '@mdcode-ts/mdcode';

const markdown = `
# Example

\`\`\`js file=app.js
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
`;

// Extract all blocks
const blocks = parse({ source: markdown });
console.log(blocks); // [{ lang: 'js', code: '...', meta: { file: 'app.js' } }, ...]

// Extract with filters
const jsBlocks = parse({
  source: markdown,
  filter: { lang: 'js' }
});
```

### Transform Code Blocks

```typescript
import { update, defineTransform } from '@mdcode-ts/mdcode';

const markdown = `
\`\`\`sql
select * from users;
\`\`\`

\`\`\`js file=test.spec.js
test('example');
\`\`\`
`;

// Create a transformer
const transformer = defineTransform((tag, meta, code) => {
  // Transform SQL to uppercase
  if (tag === 'sql') {
    return code.toUpperCase();
  }

  // Add headers to test files
  if (meta.file?.includes('.spec.')) {
    return `// AUTO-GENERATED TEST\n${code}`;
  }

  return code; // unchanged
});

// Apply transformation
const result = await update({ source: markdown, transformer });
console.log(result); // Transformed markdown
```

### Async Transformers

```typescript
import { update, defineTransform } from '@mdcode-ts/mdcode';

const transformer = defineTransform(async (tag, meta, code) => {
  // Fetch from API, read files, etc.
  const formatted = await someAsyncFormatter(code);
  return formatted;
});

const result = await update({ source: markdown, transformer });
```

### Custom Walker for Advanced Processing

```typescript
import { walk, type Block } from '@mdcode-ts/mdcode';

const result = await walk({
  source: markdown,
  walker: async (block: Block) => {
    // Return modified block
    return { ...block, code: block.code.toUpperCase() };

    // Or return null to remove block
    // return null;
  },
  filter: { lang: 'js' }, // Optional filter
});

console.log(result.source);   // Modified markdown
console.log(result.blocks);   // All processed blocks
console.log(result.modified); // true if any changes were made
```

### Filter Options

All functions support filtering:

```typescript
// Filter by language
parse({ source: markdown, filter: { lang: 'js' } });

// Filter by file pattern
parse({ source: markdown, filter: { file: 'app.js' } });

// Filter by custom metadata
parse({ source: markdown, filter: { meta: { region: 'main' } } });

// Combine filters
update({
  source: markdown,
  transformer,
  filter: { lang: 'sql', file: 'queries.sql' }
});
```

### API Reference

#### `parse(options: ParseOptions): Block[]`

Extract code blocks from markdown.

- **options.source** - The markdown source string
- **options.filter** - Optional filter criteria
- **Returns** - Array of Block objects

#### `walk(options: WalkOptions): Promise<WalkResult>`

Walk through and optionally transform code blocks.

- **options.source** - The markdown source string
- **options.walker** - Function called for each block
- **options.filter** - Optional filter criteria
- **Returns** - Promise of WalkResult with source, blocks, and modified flag

#### `update(options: UpdateOptions): Promise<string>`

Update code blocks from files or via transformer.

- **options.source** - The markdown source string
- **options.transformer** - Optional transformer function
- **options.filter** - Optional filter criteria
- **options.basePath** - Base path for file resolution (default: '.')
- **Returns** - Promise of transformed markdown string

#### `transformWithFunction(source: string, transformer: TransformerFunction, filter?: FilterOptions): Promise<string>`

Transform code blocks using a transformer function.

- **source** - The markdown source string
- **transformer** - Transformer function
- **filter** - Optional filter criteria
- **Returns** - Promise of transformed markdown string

#### `defineTransform(fn: TransformerFunction): TransformerFunction`

Helper to define type-safe transformers.

- **fn** - The transformer function `(tag, meta, code) => string | Promise<string>`
- **Returns** - The same function with proper typing

### Run commands on code blocks

```bash
# Run node on JavaScript blocks
node dist/main.js run --lang=js "node {file}" examples/sample.md

# Run python on Python blocks
node dist/main.js run --lang=python "python {file}" examples/sample.md
```

### Create tar archive

```bash
node dist/main.js dump examples/sample.md > code-blocks.tar
```

## Metadata in Code Blocks

Add metadata to code blocks using the info string:

\`\`\`js file=hello.js region=main
console.log('Hello, world!');
\`\`\`

Supported metadata:
- `file`: Output filename for extraction
- `region`: Region name for partial extraction
- Custom key=value pairs

## Development

### Run tests

```bash
pnpm test
```

### Build

```bash
pnpm build
```

### Run directly (Node 20+ with --experimental-strip-types)

Note: This project is configured for Node 22+ but can run on Node 20 with the experimental flag:

```bash
node --experimental-strip-types src/main.ts list examples/sample.md
```

## Project Structure

```
src/
  types.ts           - Core type definitions (includes TransformerFunction)
  parser.ts          - Markdown parsing with unified + remark
  commands/          - Command implementations
    list.ts          - List code blocks
    extract.ts       - Extract to files
    update.ts        - Update from files or transform with custom functions
    run.ts           - Run shell commands
    dump.ts          - Create tar archives
  cli.ts             - CLI setup with commander
  main.ts            - Entry point
examples/
  sample.md          - Example markdown file
  transforms/        - Example transformer functions
    uppercase-sql.ts - Convert SQL to uppercase
    add-comments.ts  - Add file headers
    conditional.ts   - Conditional transformations
    async-example.ts - Async transformation example
tests/
  parser.test.ts     - Parser tests
  transform.test.ts  - Transformer tests
```

## Technology Stack

- **TypeScript** with strict mode and verbatimModuleSyntax
- **Node 22** built-in APIs (util.styleText, fs/promises, readline)
- **unified** + **remark-parse** for markdown parsing
- **commander** for CLI
- **vitest** for testing
- **@std/tar** from Deno std via JSR for tar archives

## License

ISC

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode)
