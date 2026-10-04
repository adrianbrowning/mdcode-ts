# mdcode

A TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode) - a Markdown code block authoring tool for extracting, updating, and managing code blocks within markdown documents.

[![npm version](https://badge.fury.io/js/mdcode-ts.svg)](https://www.npmjs.com/package/mdcode-ts)

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

## Why Use mdcode?

### The Problem

Documentation examples often become outdated. You write great examples in your README, but as your code evolves, those examples break. Users copy non-working code, get frustrated, and lose trust in your documentation.

### The Solution

**mdcode** solves this by making your documentation executable and testable:

1. **Write code examples directly in your markdown** with metadata
2. **Extract them to files** for testing and development
3. **Run them as part of your test suite** to ensure they actually work
4. **Update your markdown** when the code changes

### Key Benefits

**Test Your Documentation**
```bash file=block-1.sh
# Extract examples from README
mdcode extract README.md -d ./examples

# Run them as tests
mdcode run -l js "node {file}" README.md

# They work? Great! They fail? Fix them before users see broken examples.
```

**Keep Examples Fresh**
```bash file=tests/examples/base-1.sh
# Update your source code
nano src/calculator.js

# Sync changes back to README
mdcode update README.md
```

**Single Source of Truth**
- Write examples once in your README
- Extract to files for actual implementation
- Bidirectional sync keeps everything in sync
- No duplicate code to maintain

**Documentation-Driven Development**
1. Write your README with examples first (TDD for docs)
2. Extract code blocks to create skeleton files
3. Implement the functionality
4. Update README from working code
5. Your docs are always accurate because they **are** the code

If your README examples don't work, the build fails. Simple.

## Installation

### Global Installation

Install globally to use the `mdcode` command anywhere:

```bash file=block-3.sh
# Using npm
npm install -g mdcode-ts

# Using pnpm
pnpm install -g mdcode-ts
```

After installation, you can run `mdcode` from anywhere:

```bash file=block-4.sh
mdcode --version
mdcode --help
mdcode list README.md
```

### Run Without Installing

No installation required - run directly:

```bash file=block-5.sh
# Using pnpm dlx
pnpm dlx mdcode-ts list README.md
pnpm dlx mdcode-ts extract --lang js docs/*.md

# Using npx
npx mdcode-ts list README.md
npx mdcode-ts --help
```

### Project Installation

Install as a project dependency to use in scripts or via `pnpm exec`:

```bash file=block-6.sh
# Using pnpm
pnpm add -D mdcode-ts

# Using npm
npm install --save-dev mdcode-ts
```

After installation, run via `pnpm exec`:

```bash file=block-7.sh
pnpm exec mdcode list README.md
pnpm exec mdcode extract --lang js docs/*.md
```

Or add scripts to your `package.json`:

```json file=block-8.json
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

```bash file=block-9.sh
pnpm readme:update
pnpm readme:extract
```

### Local Development

```bash file=block-10.sh
pnpm install
pnpm build
```

## CLI Usage

### Default Behavior

Running `mdcode` without any subcommand defaults to listing code blocks from `README.md`:

```bash file=block-11.sh
# These are equivalent:
mdcode
mdcode list README.md
```

If you provide a filename without a command, it will list blocks from that file:

```bash file=block-12.sh
# These are equivalent:
mdcode docs/API.md
mdcode list docs/API.md
```

### Get Help

```bash file=block-13.sh
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

```bash file=block-14.sh
mdcode --version
mdcode -V
```

---

## List Command

Display code blocks with their metadata and a preview of the content.

### Basic Usage

```bash file=block-15.sh
# List all code blocks from README.md (default)
mdcode list

# List blocks from a specific file
mdcode list docs/GUIDE.md

# Read from stdin
cat README.md | mdcode list
```

### JSON Output

Output blocks as JSON (one JSON object per line):

```bash file=block-16.sh
# JSON output
mdcode list --json README.md

# Short form
mdcode list --json docs/API.md
```

**JSON Format:**
```json file=block-17.json
{"lang":"js","name":"quick start","file":"app.js","region":"main"}
{"lang":"python","file":"script.py"}
{"lang":"sql"}
```

A block's `name` comes right after `lang` when it has one. In the text output, a named block is listed by
its name, as in `[1] quick start (js)`.

### Filter by Language

```bash file=block-18.sh
# Long form
mdcode list --lang js README.md
mdcode list --lang python docs/*.md

# Short form
mdcode list -l js README.md
mdcode list -l sql API.md
```

### Filter by File Metadata

```bash file=block-19.sh
# Long form
mdcode list --file app.js README.md
mdcode list --file "*.test.js" docs/

# Short form
mdcode list -f app.js README.md
mdcode list -f server.py docs/
```

### Filter by Custom Metadata

```bash file=block-20.sh
# Long form
mdcode list --meta region=main README.md
mdcode list --meta type=example docs/

# Short form
mdcode list -m region=main README.md
mdcode list -m type=test API.md
```

### Multiple Filters

Combine filters to narrow results:

```bash file=block-21.sh
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

Extract is non-destructive. When the target file already exists:

- **All blocks for that file declare `region=`** → each region body is spliced in place. Surrounding
  code, and any regions in the file that the markdown doesn't declare, are preserved.
- **A declared region has no matching `#region` marker in the file** → the region is appended at the
  end of the file, wrapped in markers written with the block language's comment syntax (`//`, `#`,
  `<!-- -->`). Existing markers are matched in any of that language's comment styles, so `/* #region
  name */` in a JS file is spliced rather than duplicated.
- **Any block for that file has no `region=`** → the file is skipped with a warning, since writing it
  would replace the whole file. Use `--force` to overwrite.
- **Two blocks for that file declare the same `region=`** → the file is skipped with a warning
  rather than keeping only one body. This also applies when the file doesn't exist yet.

Otherwise, files that don't exist yet are created.

`file=` paths resolve against `--dir` (default: the current directory):

- **Relative `file=`** → honoured as written, even when it leaves `--dir`, so
  `file=../../shared-tests/where.ts` splices into that file. Two spellings of one file (a symlinked
  directory, `./a.ts` vs `a.ts`, `..` traversal) are treated as one target.
- **Absolute `file=`** → skipped with a warning.
- **No `file=`** → written as `block-N.<ext>` directly inside `--dir`.

Whenever a file is skipped, `extract` prints a summary (even under `--quiet`) and exits with status 2.
With `--update-source` on stdin, the updated markdown is still written to stdout in full first.

### Basic Usage

```bash file=block-22.sh
# Extract to current directory
mdcode extract README.md

# Extract from multiple files
mdcode extract docs/*.md
```

### Custom Output Directory

```bash file=block-23.sh
# Long form
mdcode extract --dir output README.md
mdcode extract --dir ./extracted docs/API.md

# Short form
mdcode extract -d output README.md
mdcode extract -d ./build docs/
```

### Quiet Mode

Suppress status messages (only show errors):

```bash file=block-24.sh
# Long form
mdcode extract --quiet README.md

# Short form
mdcode extract -q README.md

# Quiet with custom directory
mdcode extract -q -d output README.md
```

### Filter What to Extract

```bash file=block-25.sh
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

```bash file=block-26.sh
# Extract JavaScript files to src/ directory, quietly
mdcode extract -q -l js -d ./src README.md

# Extract Python examples to examples/ directory
mdcode extract -l python -m type=example -d ./examples docs/TUTORIAL.md
```

### Update Source with Generated Filenames

When extracting anonymous blocks (blocks without `file` metadata), automatically add the generated filename back to the markdown source:

```bash file=block-27.sh
# Extract and update README with file metadata
mdcode extract --update-source README.md

# Extract to custom directory and update source
mdcode extract --update-source -d ./examples README.md

# Quiet mode
mdcode extract --update-source -q -d ./src README.md
```

**Before:**
````markdown file=block-28.md
```bash
echo "hello"
```
````
**After:**
````markdown file=block-29.md
```bash file=block-1.sh
echo "hello"
```
````


This enables bidirectional sync workflow:
1. Extract blocks: `mdcode extract --update-source README.md`
2. Modify extracted files: `nano block-1.sh`
3. Update markdown: `mdcode update README.md`

### Skip Anonymous Blocks

Only extract blocks that have explicit `file` metadata, ignoring anonymous blocks:

```bash
# Only extract blocks with file= attribute
mdcode extract --ignore-anonymous README.md

# With filters and custom directory
mdcode extract --ignore-anonymous -l js -d ./src docs/API.md
```

**Note:** The flags `--update-source` and `--ignore-anonymous` are mutually exclusive. Using both will result in an error.

### Force Overwrite

Blocks without `region=` describe a whole file, so extracting one over an existing file replaces it.
Those files are skipped by default; `--force` overwrites them:

```bash file=block-force.sh
# Skipped with a warning if src/demo.ts already exists
mdcode extract README.md

# Overwrite it
mdcode extract --force README.md
```

`--force` has no effect on region blocks — those always splice in place.

### Stdin Behavior with Update Source

When using stdin with `--update-source`, the updated markdown is written to stdout:

```bash file=block-31.sh
# Read from stdin, output updated markdown to stdout
cat README.md | mdcode extract --update-source > updated.md

# Extract files normally, no source update
cat README.md | mdcode extract -d ./examples
```

---

## Update Command

Update markdown code blocks from source files or transform them with custom functions.

### Update from Source Files (Default Mode)

Updates code blocks by reading from files specified in the `file` metadata attribute:

```bash file=block-32.sh
# Update README.md in-place (default)
mdcode update README.md

# Output to stdout instead
mdcode update --stdout README.md

# Output to a new file
mdcode update --stdout README.md > UPDATED.md

# Read from stdin, write to stdout
cat README.md | mdcode update --stdout > UPDATED.md
```

### Quiet Mode

```bash file=block-33.sh
# Long form
mdcode update --quiet README.md

# Short form
mdcode update -q README.md

# Quiet with output redirection
mdcode update -q --stdout README.md > UPDATED.md
```

### Transform Mode (with Custom Function)

Transform code blocks using a custom JavaScript/TypeScript function:

```bash file=block-34.sh
# Transform with a custom function
mdcode update --transform ./transformers/uppercase-sql.js README.md

# Short form
mdcode update -t ./transformers/add-headers.js README.md

# Transform and output to file
mdcode update -t ./transformers/format-code.js --stdout README.md > output.md
```

**Example Transformer (`uppercase-sql.js`):**
```javascript file=tests/examples/uppercase-sql.js region=func
export default function({tag, meta, code}) {
  if (tag === 'sql') {
    return code.toUpperCase();
  }
  return code;
}
```

**Creating a TypeScript transformer:**
```typescript file=tests/examples/transformer.js
// my-transform.ts
import { defineTransform } from 'mdcode-ts';

export default defineTransform(({tag, meta, code}) => {
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

```bash file=block-37.sh
# Transform only SQL blocks
mdcode update --transform ./uppercase.js --lang sql README.md

# Transform only test files
mdcode update -t ./add-headers.js -f "*.test.js" docs/API.md

# Transform JavaScript blocks in examples
mdcode update -t ./format.js -l js -m type=example docs/
```

### Region Support

Update specific regions of code:

```bash file=block-38.sh
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

```bash file=block-39.sh
# Run node on JavaScript blocks
mdcode run "node {file}" --lang javascript README.md

# Run Python scripts
mdcode run "python {file}" --lang python README.md

# Compile and run C code
mdcode run "gcc {file} -o out && ./out" --lang c docs/
```

### Filter by Language

```bash file=block-40.sh
# Long form
mdcode run --lang js "node {file}" README.md

# Short form
mdcode run -l js "node {file}" README.md

# Multiple languages (run separately)
mdcode run -l python "python {file}" docs/*.md
mdcode run -l js "node {file}" docs/*.md
```

### Filter by Name

Select blocks by their `name` metadata. Every command accepts `-n, --name`; see
[Selecting Blocks by Name](#selecting-blocks-by-name).

```bash file=block-41.sh
# Long form
mdcode run --name test-example "node {file}" README.md

# Short form
mdcode run -n calculate "python {file}" docs/API.md

# With language filter
mdcode run -l js -n integration-test "node {file}" tests/
```

### Custom Working Directory

Specify where to save temporary files and run commands:

```bash file=block-42.sh
# Long form
mdcode run --dir /tmp/mdcode "node {file}" README.md

# Short form
mdcode run -d ./temp "python {file}" docs/

# With filters
mdcode run -l js -d ./build "node {file}" README.md
```

### Keep Temporary Files

Preserve temporary directory after execution (useful for debugging):

```bash file=block-43.sh
# Long form
mdcode run --keep "node {file}" README.md

# Short form
mdcode run -k "python {file}" docs/

# The command will print the temp directory location
```

### Combined Examples

```bash file=block-44.sh
# Run JavaScript tests with all flags
mdcode run -l js -n test -k -d ./temp "node {file}" README.md

# Run Python examples in custom directory
mdcode run -l python -m type=example -d ./examples "python {file}" docs/

# Run and keep files, filter by file metadata
mdcode run -k -f "calculator.py" "python {file}" README.md
```

### Advanced Usage

```bash file=block-45.sh
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

```bash file=block-46.sh
# Dump to stdout
mdcode dump README.md > code-blocks.tar

# Pipe to tar command
mdcode dump docs/*.md | tar -x
```

### Output to File

```bash file=block-47.sh
# Long form
mdcode dump --out archive.tar README.md

# Short form
mdcode dump -o archive.tar docs/API.md

# With custom name
mdcode dump -o examples-$(date +%Y%m%d).tar README.md
```

### Quiet Mode

```bash file=block-48.sh
# Long form
mdcode dump --quiet --out archive.tar README.md

# Short form
mdcode dump -q -o archive.tar docs/

# Quiet to stdout
mdcode dump -q README.md > archive.tar
```

### Filter What to Dump

```bash file=block-49.sh
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

```bash file=block-50.sh
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

```bash file=block-51.sh
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

```bash file=block-52.sh
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

```bash file=block-53.sh
# Extract all test files that are JavaScript
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# List Python examples in main region
mdcode list -l python -m type=example -m region=main docs/

# Run tests only for specific component
mdcode run -l js -f "auth.test.js" -n "login-test" "node {file}" README.md

# Update only SQL queries in specific file
mdcode update -l sql -f queries.sql README.md
```

### Selecting Blocks by Name

Give a block a stable name with `name=`, then select it by that name from any command. Names are
unique within one markdown document, so `--name` picks out exactly one block. Elsewhere, the
document path plus the name identifies the block.

````markdown file=block-93.md
```js name="quick start" file="examples/getting started.js"
console.log('Hello, world!');
```
````

```bash file=block-94.sh
mdcode list --name "quick start" README.md
mdcode extract -n "quick start" -d ./out README.md
mdcode update --name "quick start" README.md
mdcode run -n "quick start" "node {file}" README.md
mdcode dump --name "quick start" -o quick-start.tar README.md
```

---

## CLI Flags Reference

All commands support these common filtering flags:

- `-l, --lang <lang>` - Filter by language
- `-f, --file <file>` - Filter by file metadata pattern
- `-m, --meta <key=value>` - Filter by custom metadata (can specify multiple times)
- `-n, --name <name>` - Select the block with this `name` metadata

Additional flags by command:

**list:**
- `--json` - Output as JSON (one object per line)

**extract:**
- `-d, --dir <dir>` - Output directory (default: current directory)
- `-q, --quiet` - Suppress status messages
- `--update-source` - Add file metadata to anonymous code blocks and update source
- `--ignore-anonymous` - Skip blocks without file metadata (mutually exclusive with --update-source)
- `--force` - Overwrite existing files whose blocks have no `region=` (skipped by default)

**update:**
- `-d, --dir <dir>` - Working directory for file resolution
- `-q, --quiet` - Suppress status messages
- `--transform <file>` - Path to transformer function
- `--stdout` - Output to stdout instead of updating in-place

**run:**
- `-k, --keep` - Keep temporary directory
- `-d, --dir <dir>` - Custom working directory

**dump:**
- `-o, --out <file>` - Output file (default: stdout)
- `-q, --quiet` - Suppress status messages

---

## Library Usage

You can use mdcode programmatically in your Node.js or TypeScript projects:

```bash file=block-54.sh
pnpm add mdcode-ts
```

### Simple API (Default Export)

The simplest way to use mdcode is with the default export:

```typescript file=block-55.ts
import mdcode from 'mdcode-ts';

// Transform a markdown file
const result = await mdcode('/path/to/file.md', ({tag, meta, code}) => {
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

```typescript file=block-56.ts
// Transform only SQL blocks
const result = await mdcode(
  '/path/to/file.md',
  ({tag, meta, code}) => code.toUpperCase(),
  { lang: 'sql' }
);
```

### Named Imports (Advanced API)

For more control, use the named exports:

```typescript file=block-57.ts
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
} from 'mdcode-ts';
```

### Parse and Extract Code Blocks

````typescript file=block-58.ts
import { parse } from 'mdcode-ts';

const markdown = `
# Example

```js file=app.js
const x = 1;
```

```python file=block-59.ts
y = 2
```
`;

// Extract all blocks
const blocks = parse({ source: markdown });
console.log(blocks); // [{ lang: 'js', code: '...', meta: { file: 'app.js' } }, ...]

// Extract with filters
const jsBlocks = parse({
  source: markdown,
  filter: { lang: 'js' }
});
````

### Transform Code Blocks

````typescript file=block-60.ts
import { update, defineTransform } from 'mdcode-ts';

const markdown = `
```sql
select * from users;
```

```js file=block-61.ts
test('example');
```
`;

// Create a transformer
const transformer = defineTransform(({tag, meta, code}) => {
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
````

### Async Transformers

```typescript file=block-62.ts
import { update, defineTransform } from 'mdcode-ts';

const transformer = defineTransform(async ({tag, meta, code}) => {
  // Fetch from API, read files, etc.
  const formatted = await someAsyncFormatter(code);
  return formatted;
});

const result = await update({ source: markdown, transformer });
```

### Custom Walker for Advanced Processing

```typescript file=block-63.md
import { walk, type Block } from 'mdcode-ts';

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

```typescript file=block-64.js
// Filter by language
parse({ source: markdown, filter: { lang: 'js' } });

// Filter by file pattern
parse({ source: markdown, filter: { file: 'app.js' } });

// Filter by custom metadata
parse({ source: markdown, filter: { meta: { region: 'main' } } });

// Select a block by name
parse({ source: markdown, filter: { name: 'quick start' } });

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
- **Returns** - Array of Block objects. A named block also has `name` set.
- **Throws** - `MetadataError` when any block's metadata is malformed or two blocks share a name. Its
  `problems` array lists each problem with the line of the block's opening fence.

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

- **fn** - The transformer function `({tag, meta, code}) => string | Promise<string>`
- **Returns** - The same function with proper typing

---

## Metadata in Code Blocks

Add metadata to code blocks using the info string:

````markdown file=block-65.md
```js file=hello.js region=main
console.log('Hello, world!');
```
````

Supported metadata:
- `file`: Output filename for extraction
- `region`: Region name for partial extraction (using `#region`/`#endregion` comments)
- `outline`: Extract only the structure without implementation details
- `name`: The block's stable identifier, used with `--name`. Optional, but it must be non-empty and
  unique within the document.
- Custom key=value pairs for filtering

### Metadata Syntax

The first word of the info string is the language. Each `key=value` after it is metadata:

- **Unquoted:** `file=app.js`. The value runs to the next space and is taken as written, backslashes
  included.
- **Quoted:** `file="examples/getting started.ts"`. Use quotes for values with spaces. Inside quotes,
  `\"` is a quote and `\\` is a backslash.
- Words without `=` are ignored.

mdcode refuses to process a document with broken metadata, and it reports every problem with the
line of the block's opening fence:

```text file=block-95.txt
Error: Invalid code block metadata:
  line 12: unterminated quoted value for "file"; add the closing "
  line 30: duplicate name "quick start" on lines 30, 41; names must be unique within a document
```

The other errors are an invalid escape (any backslash in quotes other than `\"` or `\\`), text right
after a closing quote, a key used twice in one block, and an empty `name=`.

### Code Fences

mdcode follows CommonMark's fenced-code-block rules, with one exception for indentation:

- **Opening fence:** three or more backticks (`` ``` ``) or tildes (`~~~`), then the info string. A
  backtick fence's info string can't contain a backtick, since CommonMark reads that line as inline
  code. Tilde fences have no such limit.
- **Indentation:** an opening fence may be indented by any amount, so fences inside nested list items
  are found. (CommonMark allows at most three spaces outside a list.) Code is taken verbatim; its
  indentation is not stripped.
- **Closing fence:** the same character, at least as many of them as the opener, indented at most
  three spaces more than the opener, and followed only by spaces or tabs. Anything else, such as
  `` ``` `` inside a `~~~` block or a shorter run, is part of the code. That's how to show a fenced
  block inside another: use a longer fence, or the other character, on the outside.
- **Unclosed fence:** yields no block. Everything after it is treated as its content, the way Markdown
  renderers display it, so mdcode never rewrites that part of the document.

When `extract --update-source` adds `file=` to a block, the opening fence's indentation, character
and length are kept as written.

### Region Extraction

Use region comments in your source files to extract specific sections. If the same region name appears multiple times, all occurrences are joined together:

```javascript file=block-66.md
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

Region markers are detected using language-appropriate comment styles (e.g. `//` for JS/TS, `#` for Python/Shell, `<!--` for HTML). Specify the `lang` in the code fence to enable language-aware matching.

Then reference the region in your markdown:

````markdown file=block-67.js
```js file=math.js region=factorial
```
````

### Outline Extraction

Use `outline=true` to extract code structure without implementation details:

````markdown
```js file=calculator.js outline=true
```
````

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

```bash file=block-70.js
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
   ```bash file=block-71.md
   mdcode update --transform ./uppercase.js -l sql README.md
   ```

2. **Library API** - Use mdcode programmatically in Node.js/TypeScript projects
   ```javascript file=block-72.sh
   import mdcode from 'mdcode-ts';
   const result = await mdcode('README.md', transformer);
   ```

3. **Enhanced Update** - Update command supports both file-based updates AND transformers

---

## Workflow Examples

### Workflow: Extract, Modify, Update

```bash file=block-90.sh
# 1. Extract code blocks to files
mdcode extract -d ./readme README.md

# 2. Edit the extracted files
nano ./readme/app.js

# 3. Update README with changes
mdcode update README.md
```

### Workflow: Test All Code Blocks

```bash file=block-91.sh
# Extract test files
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# Run all tests
mdcode run -l js -f "*.test.js" "npm test {file}" docs/

# If tests pass, create archive
mdcode dump -l js -f "*.test.js" -o tests.tar docs/
```

### Workflow: Transform and Publish

```bash file=block-92.sh
# Transform SQL to uppercase
mdcode update -t ./uppercase.js -l sql README.md

# Verify changes
mdcode list --json -l sql README.md

# Extract transformed code
mdcode extract -l sql -d ./queries README.md
```

## Development

### Run tests

```bash
# All tests (unit + E2E)
pnpm test:all

# Unit tests only
pnpm test
```

### Build

```bash
pnpm build
```

### Run directly (Node 22+)

```bash
node packages/mdcode/src/main.ts list README.md
```


## License

MIT

## Credits

Original Go implementation by [szkiba](https://github.com/szkiba/mdcode)
