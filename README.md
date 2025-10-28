# mdcode

A TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

[![npm version](https://badge.fury.io/js/@gcm%2Fmdcode-ts.svg)](https://www.npmjs.com/package/@mdcode/mdcode)

## Drop-in Replacement

This TypeScript implementation is designed as a **drop-in replacement** for the original Go-based [szkiba/mdcode](https://github.com/szkiba/mdcode). It maintains full CLI compatibility, including all commands, flags, and output formats, while adding bonus features like transform functions and a library API.

## Features

- **Extract** code blocks from markdown to files
- **List** code blocks with metadata and previews (text or JSON format)
- **Update** markdown code blocks from source files OR transform with custom functions
- **Run** shell commands on code blocks with enhanced control
- **Dump** code blocks to tar archives (stdout or file)
- Support for metadata in code block info strings
- Filter blocks by language, file, or custom metadata
- Region extraction using special comments
- Outline extraction for code structure
- Quiet mode for cleaner output
- Short and long flag forms for all options

## Installation

### Global Installation

Install globally to use the `mdcode` command anywhere:

```bash
# Using npm
npm install -g @mdcode/mdcode

# Using pnpm
pnpm install -g @mdcode/mdcode
```

### Run Without Installing

```bash
# Using pnpm dlx
pnpm dlx @mdcode/mdcode list README.md

# Using npx
npx @mdcode/mdcode list README.md
```

### Local Development

```bash
pnpm install
pnpm build
```

## CLI Usage

### Default Behavior

Running `mdcode` with no arguments lists code blocks from `README.md`:

```bash
mdcode
# Same as: mdcode list README.md
```

### List code blocks

```bash
# List all blocks
mdcode list README.md

# Filter by language (short form)
mdcode list -l js README.md

# Filter by language (long form)
mdcode list --lang js README.md

# Filter by file metadata
mdcode list -f app.js README.md

# Filter by custom metadata
mdcode list -m region=main README.md

# Output as JSON (one object per line)
mdcode list --json README.md
```

**JSON Output Format:**

```json
{"lang": "js", "file": "app.js", "region": "main"}
{"lang": "python", "file": "script.py"}
{"lang": "sql"}
```

### Extract code blocks to files

```bash
# Extract to current directory
mdcode extract README.md

# Extract to specific directory (short form)
mdcode extract -d output README.md

# Extract to specific directory (long form)
mdcode extract --dir output README.md

# Extract with filters
mdcode extract -l js -f "*.test.js" README.md

# Quiet mode (suppress status messages)
mdcode extract -q README.md
```

### Update markdown from source files or transform blocks

The `update` command can update code blocks in two ways:

#### 1. Update from source files (default)

Updates code blocks by reading from files specified in the `file` metadata:

```bash
# Update and output to stdout
mdcode update README.md > updated.md

# Update with specific working directory
mdcode update -d src README.md

# Quiet mode
mdcode update -q README.md > updated.md

# Filter which blocks to update
mdcode update -l js README.md
```

#### 2. Transform with custom function (using `--transform` flag)

Transform code blocks using a custom transformer function:

```bash
# Build your transformer to .js first
npx tsc my-transform.ts --outDir dist --module ES2022 --target ES2022
mdcode update --transform dist/my-transform.js README.md > output.md

# Combine with filters to transform only specific blocks
mdcode update -l sql --transform dist/uppercase-sql.js README.md
```

**Creating a transformer:**

```typescript
// my-transform.ts
import { defineTransform } from '@mdcode/mdcode';

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

### Run commands on code blocks

```bash
# Run node on JavaScript blocks
mdcode run -l js "node {file}" README.md

# Run python on Python blocks
mdcode run -l python "python {file}" README.md

# Filter by block name
mdcode run -n myfunction "node {file}" README.md

# Keep temporary directory after execution
mdcode run -k -l js "node {file}" README.md

# Use custom working directory instead of temp
mdcode run -d ./workspace -l js "node {file}" README.md

# Combine multiple options
mdcode run -l js -n factorial -k "node {file}" README.md
```

**CLI Flags for Run Command:**

- `-l, --lang <lang>` - Filter by language
- `-f, --file <file>` - Filter by file metadata
- `-m, --meta <key=value>` - Filter by custom metadata
- `-n, --name <name>` - Filter by block name
- `-k, --keep` - Keep temporary directory after execution
- `-d, --dir <dir>` - Use custom working directory

### Create tar archive

```bash
# Output to stdout (pipe to file)
mdcode dump README.md > code-blocks.tar

# Output to specific file (short form)
mdcode dump -o code-blocks.tar README.md

# Output to specific file (long form)
mdcode dump --out code-blocks.tar README.md

# Dump with filters
mdcode dump -l js README.md > js-blocks.tar

# Quiet mode
mdcode dump -q -o output.tar README.md
```

### CLI Flags Reference

All commands support these common filtering flags:

- `-l, --lang <lang>` - Filter by language
- `-f, --file <file>` - Filter by file metadata pattern
- `-m, --meta <key=value>` - Filter by custom metadata (can specify multiple times)

Additional flags by command:

**list:**
- `--json` - Output as JSON (one object per line)

**extract:**
- `-d, --dir <dir>` - Output directory (default: current directory)
- `-q, --quiet` - Suppress status messages

**update:**
- `-d, --dir <dir>` - Working directory for file resolution
- `-q, --quiet` - Suppress status messages
- `--transform <file>` - Path to transformer function

**run:**
- `-n, --name <name>` - Filter by block name
- `-k, --keep` - Keep temporary directory
- `-d, --dir <dir>` - Custom working directory

**dump:**
- `-o, --out <file>` - Output file (default: stdout)
- `-q, --quiet` - Suppress status messages

## Library Usage

You can use mdcode programmatically in your Node.js or TypeScript projects:

```bash
pnpm add @mdcode/mdcode
```

### Simple API (Default Export)

The simplest way to use mdcode is with the default export:

```typescript
import mdcode from '@mdcode/mdcode';

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
} from '@mdcode/mdcode';
```

### Parse and Extract Code Blocks

```typescript
import { parse } from '@mdcode/mdcode';

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
import { update, defineTransform } from '@mdcode/mdcode';

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
import { update, defineTransform } from '@mdcode/mdcode';

const transformer = defineTransform(async (tag, meta, code) => {
  // Fetch from API, read files, etc.
  const formatted = await someAsyncFormatter(code);
  return formatted;
});

const result = await update({ source: markdown, transformer });
```

### Custom Walker for Advanced Processing

```typescript
import { walk, type Block } from '@mdcode/mdcode';

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

## Metadata in Code Blocks

Add metadata to code blocks using the info string:

\`\`\`js file=hello.js region=main
console.log('Hello, world!');
\`\`\`

Supported metadata:
- `file`: Output filename for extraction
- `region`: Region name for partial extraction (using `#region`/`#endregion` comments)
- `outline`: Extract only the structure without implementation details
- `name`: Custom name for the block (useful with run command)
- Custom key=value pairs for filtering

### Region Extraction

Use region comments in your source files to extract specific sections:

```javascript
// #region factorial
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
// #endregion

// #region helper
function helper() { /* ... */ }
// #endregion
```

Then reference the region in your markdown:

\`\`\`js file=math.js region=factorial
\`\`\`

### Outline Extraction

Use `outline=true` to extract code structure without implementation details:

\`\`\`js file=calculator.js outline=true
\`\`\`

When updating from source, this will preserve the region markers and structure but remove the implementation:

```javascript
// #region add
// #endregion

// #region subtract
// #endregion
```

This is useful for documentation that shows structure without implementation details.

## Comparison with Original mdcode

This TypeScript implementation maintains full compatibility with [szkiba/mdcode](https://github.com/szkiba/mdcode) while adding bonus features:

### ✅ Full Parity Features
- All 5 commands: list, extract, update, run, dump
- Short and long flag forms: `-l`/`--lang`, `-f`/`--file`, `-m`/`--meta`, etc.
- JSON output for list command: `--json`
- Quiet mode: `-q`/`--quiet`
- Enhanced run command: `-n`/`--name`, `-k`/`--keep`, `-d`/`--dir`
- Dump to file: `-o`/`--out`
- Default behavior: `mdcode` lists README.md
- Region extraction with `#region`/`#endregion`
- Outline metadata support

### ⭐ Bonus Features (Not in Original)
- **Transform API**: Custom transformer functions for code block manipulation
- **Library API**: Use mdcode programmatically in Node.js/TypeScript projects
- **Async transformers**: Support for async operations in transformers
- **Enhanced filtering**: More flexible metadata filtering

### Migration from Go Version

Simply replace the binary:

```bash
# Before (Go version)
go install github.com/szkiba/mdcode/cmd/mdcode@latest

# After (TypeScript version)
npm install -g @mdcode/mdcode
```

All existing commands and scripts will work identically.

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
- **unified** + **remark-parse** + **remark-stringify** for markdown parsing/generation
- **commander** for CLI argument parsing
- **vitest** for testing
- **@std/tar** from Deno std via JSR for tar archives
- **zshy** for TypeScript compilation and bundling

## License

ISC

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode)
