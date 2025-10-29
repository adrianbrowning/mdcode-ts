# mdcode

A TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

[![npm version](https://badge.fury.io/js/@mdcode%2Fmdcode.svg)](https://www.npmjs.com/package/@mdcode/mdcode)

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

After installation, you can run `mdcode` from anywhere:

```bash
mdcode --version
mdcode --help
mdcode list README.md
```

### Run Without Installing

No installation required - run directly:

```bash
# Using pnpm dlx
pnpm dlx @mdcode/mdcode list README.md
pnpm dlx @mdcode/mdcode extract --lang js docs/*.md

# Using npx
npx @mdcode/mdcode list README.md
npx @mdcode/mdcode --help
```

### Project Installation

Install as a project dependency to use in scripts or via `pnpm exec`:

```bash
# Using pnpm
pnpm add -D @mdcode/mdcode

# Using npm
npm install --save-dev @mdcode/mdcode
```

After installation, run via `pnpm exec`:

```bash
pnpm exec mdcode list README.md
pnpm exec mdcode extract --lang js docs/*.md
```

Or add scripts to your `package.json`:

```json
{
  "scripts": {
    "readme:update": "mdcode update README.md",
    "readme:extract": "mdcode extract -d src README.md",
    "readme:list": "mdcode list --json README.md",
    "docs:validate": "mdcode run -l js \"node {file}\" README.md"
  }
}
```

Then run with:

```bash
pnpm readme:update
pnpm readme:extract
```

### Local Development

```bash
pnpm install
pnpm build
```

## CLI Usage

### Default Behavior

Running `mdcode` without any subcommand defaults to listing code blocks from `README.md`:

```bash
# These are equivalent:
mdcode
mdcode list README.md
```

If you provide a filename without a command, it will list blocks from that file:

```bash
# These are equivalent:
mdcode docs/API.md
mdcode list docs/API.md
```

### Get Help

```bash
# General help
mdcode --help
mdcode -h

# Command-specific help
mdcode list --help
mdcode extract --help
mdcode update --help
mdcode run --help
mdcode dump --help
```

### Check Version

```bash
mdcode --version
mdcode -V
```

---

## List Command

Display code blocks with their metadata and a preview of the content.

### Basic Usage

```bash
# List all code blocks from README.md (default)
mdcode list

# List blocks from a specific file
mdcode list docs/GUIDE.md

# Read from stdin
cat README.md | mdcode list
```

### JSON Output

Output blocks as JSON (one JSON object per line):

```bash
# JSON output
mdcode list --json README.md

# Short form
mdcode list --json docs/API.md
```

**JSON Format:**
```json
{"lang":"js","file":"app.js","region":"main"}
{"lang":"python","file":"script.py"}
{"lang":"sql"}
```

### Filter by Language

```bash
# Long form
mdcode list --lang js README.md
mdcode list --lang python docs/*.md

# Short form
mdcode list -l js README.md
mdcode list -l sql API.md
```

### Filter by File Metadata

```bash
# Long form
mdcode list --file app.js README.md
mdcode list --file "*.test.js" docs/

# Short form
mdcode list -f app.js README.md
mdcode list -f server.py docs/
```

### Filter by Custom Metadata

```bash
# Long form
mdcode list --meta region=main README.md
mdcode list --meta type=example docs/

# Short form
mdcode list -m region=main README.md
mdcode list -m type=test API.md
```

### Multiple Filters

Combine filters to narrow results:

```bash
# All filters together
mdcode list --lang js --file app.js --meta region=main README.md

# Short forms
mdcode list -l js -f app.js -m region=main README.md

# Filter JavaScript test files
mdcode list -l js -f "*.test.js" docs/
```

---

## Extract Command

Extract code blocks to files based on their `file` metadata.

### Basic Usage

```bash
# Extract to current directory
mdcode extract README.md

# Extract from multiple files
mdcode extract docs/*.md
```

### Custom Output Directory

```bash
# Long form
mdcode extract --dir output README.md
mdcode extract --dir ./extracted docs/API.md

# Short form
mdcode extract -d output README.md
mdcode extract -d ./build docs/
```

### Quiet Mode

Suppress status messages (only show errors):

```bash
# Long form
mdcode extract --quiet README.md

# Short form
mdcode extract -q README.md

# Quiet with custom directory
mdcode extract -q -d output README.md
```

### Filter What to Extract

```bash
# Extract only JavaScript files
mdcode extract --lang js README.md
mdcode extract -l js -d ./src docs/*.md

# Extract specific file
mdcode extract --file app.js README.md
mdcode extract -f server.py -d ./src docs/

# Extract with metadata filter
mdcode extract --meta type=component README.md
mdcode extract -m region=main -d ./lib docs/
```

### Combined Examples

```bash
# Extract JavaScript files to src/ directory, quietly
mdcode extract -q -l js -d ./src README.md

# Extract Python examples to examples/ directory
mdcode extract -l python -m type=example -d ./examples docs/TUTORIAL.md
```

---

## Update Command

Update markdown code blocks from source files or transform them with custom functions.

### Update from Source Files (Default Mode)

Updates code blocks by reading from files specified in the `file` metadata attribute:

```bash
# Update README.md and output to stdout
mdcode update README.md

# Update and save to a new file
mdcode update README.md > UPDATED.md

# Read from stdin, write to stdout
cat README.md | mdcode update > UPDATED.md
```

### Quiet Mode

```bash
# Long form
mdcode update --quiet README.md

# Short form
mdcode update -q README.md

# Quiet with output redirection
mdcode update -q README.md > UPDATED.md
```

### Transform Mode (with Custom Function)

Transform code blocks using a custom JavaScript/TypeScript function:

```bash
# Transform with a custom function
mdcode update --transform ./transformers/uppercase-sql.js README.md

# Short form
mdcode update -t ./transformers/add-headers.js README.md

# Transform and output to file
mdcode update -t ./transformers/format-code.js README.md > output.md
```

**Example Transformer (`uppercase-sql.js`):**
```javascript
export default function(tag, meta, code) {
  if (tag === 'sql') {
    return code.toUpperCase();
  }
  return code;
}
```

**Creating a TypeScript transformer:**
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

### Transform with Filters

Combine transformers with filters to target specific blocks:

```bash
# Transform only SQL blocks
mdcode update --transform ./uppercase.js --lang sql README.md

# Transform only test files
mdcode update -t ./add-headers.js -f "*.test.js" docs/API.md

# Transform JavaScript blocks in examples
mdcode update -t ./format.js -l js -m type=example docs/
```

### Region Support

Update specific regions of code:

```bash
# Update only 'main' region
mdcode update --meta region=main README.md

# Update multiple regions
mdcode update -m region=setup README.md
mdcode update -m region=teardown README.md
```

---

## Run Command

Execute shell commands on each code block.

### Basic Usage

Use `{file}` as a placeholder for the temporary file path:

```bash
# Run node on JavaScript blocks
mdcode run "node {file}" README.md

# Run Python scripts
mdcode run "python {file}" --lang python README.md

# Compile and run C code
mdcode run "gcc {file} -o out && ./out" --lang c docs/
```

### Filter by Language

```bash
# Long form
mdcode run --lang js "node {file}" README.md

# Short form
mdcode run -l js "node {file}" README.md

# Multiple languages (run separately)
mdcode run -l python "python {file}" docs/*.md
mdcode run -l js "node {file}" docs/*.md
```

### Filter by Name

Filter blocks by their `name` metadata:

```bash
# Long form
mdcode run --name test-example "node {file}" README.md

# Short form
mdcode run -n calculate "python {file}" docs/API.md

# With language filter
mdcode run -l js -n integration-test "node {file}" tests/
```

### Custom Working Directory

Specify where to save temporary files and run commands:

```bash
# Long form
mdcode run --dir /tmp/mdcode "node {file}" README.md

# Short form
mdcode run -d ./temp "python {file}" docs/

# With filters
mdcode run -l js -d ./build "node {file}" README.md
```

### Keep Temporary Files

Preserve temporary directory after execution (useful for debugging):

```bash
# Long form
mdcode run --keep "node {file}" README.md

# Short form
mdcode run -k "python {file}" docs/

# The command will print the temp directory location
```

### Combined Examples

```bash
# Run JavaScript tests with all flags
mdcode run -l js -n test -k -d ./temp "node {file}" README.md

# Run Python examples in custom directory
mdcode run -l python -m type=example -d ./examples "python {file}" docs/

# Run and keep files, filter by file metadata
mdcode run -k -f "calculator.py" "python {file}" README.md
```

### Advanced Usage

```bash
# Lint all JavaScript blocks
mdcode run -l js "eslint {file}" README.md

# Format code blocks
mdcode run -l python "black {file}" docs/*.md

# Type check TypeScript blocks
mdcode run -l typescript "tsc --noEmit {file}" API.md

# Run tests with coverage
mdcode run -l js -n test "jest --coverage {file}" docs/
```

---

## Dump Command

Create a tar archive of all code blocks.

### Basic Usage (Output to stdout)

```bash
# Dump to stdout
mdcode dump README.md > code-blocks.tar

# Pipe to tar command
mdcode dump docs/*.md | tar -x
```

### Output to File

```bash
# Long form
mdcode dump --out archive.tar README.md

# Short form
mdcode dump -o archive.tar docs/API.md

# With custom name
mdcode dump -o examples-$(date +%Y%m%d).tar README.md
```

### Quiet Mode

```bash
# Long form
mdcode dump --quiet --out archive.tar README.md

# Short form
mdcode dump -q -o archive.tar docs/

# Quiet to stdout
mdcode dump -q README.md > archive.tar
```

### Filter What to Dump

```bash
# Dump only JavaScript files
mdcode dump --lang js -o js-blocks.tar README.md
mdcode dump -l js -o javascript.tar docs/*.md

# Dump specific file patterns
mdcode dump --file "*.py" -o python.tar docs/
mdcode dump -f server.js -o server.tar README.md

# Dump by metadata
mdcode dump --meta type=example -o examples.tar docs/
mdcode dump -m region=main -o main.tar API.md
```

### Extract Tar Archive

After creating a tar archive, you can extract it:

```bash
# Standard tar extraction
tar -xf code-blocks.tar

# Extract to specific directory
tar -xf code-blocks.tar -C ./extracted

# List contents without extracting
tar -tf code-blocks.tar
```

---

## Filtering Examples

All commands support the same filtering options. Here are comprehensive filtering examples:

### Single Filters

```bash
# By language
mdcode list -l js README.md
mdcode extract -l python docs/*.md
mdcode dump -l sql -o queries.tar API.md

# By file metadata
mdcode list -f app.js README.md
mdcode extract -f "*.test.js" docs/
mdcode run -f server.py "python {file}" README.md

# By custom metadata
mdcode list -m region=main README.md
mdcode extract -m type=example docs/
mdcode update -m author=admin API.md
```

### Multiple Filters (AND Logic)

When you combine filters, ALL filters must match:

```bash
# Language AND file
mdcode list -l js -f app.js README.md

# Language AND metadata
mdcode extract -l python -m type=example docs/

# File AND metadata
mdcode dump -f server.js -m region=main -o server.tar README.md

# All three filters
mdcode list -l js -f app.js -m region=main README.md
```

### Complex Filtering Scenarios

```bash
# Extract all test files that are JavaScript
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# List Python examples in main region
mdcode list -l python -m type=example -m region=main docs/

# Run tests only for specific component
mdcode run -l js -f "auth.test.js" -n "login-test" "node {file}" README.md

# Update only SQL queries in specific file
mdcode update -l sql -f queries.sql README.md
```

---

## CLI Flags Reference

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
- `--stdout` - Output to stdout instead of updating in-place

**run:**
- `-n, --name <name>` - Filter by block name
- `-k, --keep` - Keep temporary directory
- `-d, --dir <dir>` - Custom working directory

**dump:**
- `-o, --out <file>` - Output file (default: stdout)
- `-q, --quiet` - Suppress status messages

---

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

---

## Metadata in Code Blocks

Add metadata to code blocks using the info string:

```markdown
\`\`\`js file=hello.js region=main
console.log('Hello, world!');
\`\`\`
```

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

```markdown
\`\`\`js file=math.js region=factorial
\`\`\`
```

### Outline Extraction

Use `outline=true` to extract code structure without implementation details:

```markdown
\`\`\`js file=calculator.js outline=true
\`\`\`
```

When updating from source, this will preserve the region markers and structure but remove the implementation:

```javascript
// #region add
// #endregion

// #region subtract
// #endregion
```

This is useful for documentation that shows structure without implementation details.

---

## Comparison with Original mdcode

This TypeScript implementation is a **drop-in replacement** for the original Go-based [szkiba/mdcode](https://github.com/szkiba/mdcode). It maintains 100% CLI compatibility.

### Feature Parity

| Feature | Original (Go) | This Implementation |
|---------|---------------|---------------------|
| `list` command |  |  |
| `extract` command |  |  |
| `update` command |  |  |
| `run` command |  |  |
| `dump` command |  |  |
| Short flags (`-l`, `-f`, `-m`) |  |  |
| Long flags (`--lang`, `--file`) |  |  |
| JSON output (`--json`) |  |  |
| Quiet mode (`-q`, `--quiet`) |  |  |
| Default behavior (list README.md) |  |  |
| Stdin support |  |  |
| Region extraction |  |  |
| Outline support |  |  |
| Transform functions | L |  (Bonus) |
| Library API | L |  (Bonus) |

### Command Compatibility

All commands work identically:

```bash
# Original (Go)
mdcode list -l js README.md
mdcode extract -d output -q docs/*.md
mdcode run -l python "python {file}" README.md
mdcode dump -o archive.tar README.md

# This implementation (TypeScript) - SAME COMMANDS
mdcode list -l js README.md
mdcode extract -d output -q docs/*.md
mdcode run -l python "python {file}" README.md
mdcode dump -o archive.tar README.md
```

### Bonus Features

These features are **not** in the original but are available in this implementation:

1. **Transform Functions** - Apply custom transformations to code blocks
   ```bash
   mdcode update --transform ./uppercase.js -l sql README.md
   ```

2. **Library API** - Use mdcode programmatically in Node.js/TypeScript projects
   ```javascript
   import mdcode from '@mdcode/mdcode';
   const result = await mdcode('README.md', transformer);
   ```

3. **Enhanced Update** - Update command supports both file-based updates AND transformers

---

## Workflow Examples

### Workflow: Extract, Modify, Update

```bash
# 1. Extract code blocks to files
mdcode extract -d ./readme README.md

# 2. Edit the extracted files
nano ./readme/app.js

# 3. Update README with changes
mdcode update README.md
```

### Workflow: Test All Code Blocks

```bash
# Extract test files
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# Run all tests
mdcode run -l js -f "*.test.js" "npm test {file}" docs/

# If tests pass, create archive
mdcode dump -l js -f "*.test.js" -o tests.tar docs/
```

### Workflow: Transform and Publish

```bash
# Transform SQL to uppercase
mdcode update -t ./uppercase.js -l sql README.md

# Verify changes
mdcode list --json -l sql README.md

# Extract transformed code
mdcode extract -l sql -d ./queries README.md
```

### Workflow: CI/CD Integration

```bash
#!/bin/bash
# .github/workflows/validate-docs.sh

set -e

echo "Extracting code blocks..."
mdcode extract -q -d ./temp README.md

echo "Running linter..."
mdcode run -l js "eslint {file}" README.md

echo "Running tests..."
mdcode run -l js -n test "npm test {file}" README.md

echo "Creating archive..."
mdcode dump -q -o artifacts/code-blocks.tar README.md

echo "All checks passed!"
```

---

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


## License

MIT

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode)
