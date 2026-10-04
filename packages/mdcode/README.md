# mdcode

[![npm version](https://img.shields.io/npm/v/mdcode-ts)](https://www.npmjs.com/package/mdcode-ts)

mdcode keeps the code blocks in your Markdown docs in sync with real source files. Point a code block at a file, or a `#region` inside it, and `mdcode update` copies the current code into the document. `extract` writes blocks out to files, `list` shows them with their metadata, `run` runs a command against each block, and `dump` packs them into a tar archive.

```bash
npm install --save-dev mdcode-ts
```

The package installs the `mdcode` command and a library API. It is a TypeScript port of [szkiba/mdcode](https://github.com/szkiba/mdcode). New to mdcode? Start with the [quick start](https://github.com/adrianbrowning/mdcode-ts#quick-start).

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
mdcode update --apply README.md
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
    "readme:update": "mdcode update --apply README.md",
    "readme:check": "mdcode update --check README.md",
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

`--json` prints one JSON envelope. Its `result.blocks` lists every selected block with its name,
fence lines, language, metadata and code:

```bash file=block-16.sh
# JSON output
mdcode list --json README.md

# With a filter
mdcode list --json -l js docs/API.md
```

See [JSON Contract](#json-contract) for the envelope, an example, and the result of every command.

In the text output, a named block is listed by its name, as in `[1] quick start (js)`.

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
3. Update markdown: `mdcode update --apply README.md`

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

`update` never writes the markdown unless you pass `--apply`. Without it, `update` works out what
would change and reports it, so you (or an agent) can review the change before anything is written.

### Plan, Diff, Apply and Check

Each block with `file=` metadata is read from that file. Pick one mode:

| Mode | What it does | Writes the markdown |
|------|--------------|---------------------|
| `--plan` (default) | Lists the blocks that would change, and where their new code comes from | No |
| `--diff` | Prints a unified diff of the markdown changes | No |
| `--check` | Exits 1 when a selected block is out of sync with its source | No |
| `--stdout` | Prints the updated markdown | No |
| `--apply` | Writes the changes to the markdown file in place | Yes |

```bash file=block-32.sh
# What would change?
mdcode update README.md

# Review the changes as a patch
mdcode update --diff README.md

# Write them
mdcode update --apply README.md

# Fail CI when README.md has drifted from its sources
mdcode update --check README.md

# Print the updated markdown, or pipe it through
mdcode update --stdout README.md > UPDATED.md
cat README.md | mdcode update --stdout > UPDATED.md
```

The modes cannot be combined. `--apply` needs a markdown file: with stdin, use `--stdout`. When no
block changes, `--apply` leaves the file untouched. The diff labels both sides with the markdown path,
so `patch -p0 < changes.diff` applies it.

`--check` reports each drifted block as an `out_of_sync` error. A `file=` that cannot be read is a
`read_failed` error instead, and a broken `--transform` module is `invalid_transform`. All of them
exit 1; with `--json` the error codes tell them apart (see [JSON Contract](#json-contract)).

### Quiet Mode

```bash file=block-33.sh
# Long form
mdcode update --apply --quiet README.md

# Short form
mdcode update --apply -q README.md

# Quiet with output redirection
mdcode update -q --stdout README.md > UPDATED.md
```

`--check` still reports the blocks that are out of sync under `--quiet`.

### Transform Mode (with Custom Function)

Transform code blocks using a custom JavaScript/TypeScript function:

```bash file=block-34.sh
# Transform with a custom function
mdcode update --apply --transform ./transformers/uppercase-sql.js README.md

# Short form, previewing the result as a diff
mdcode update --diff -t ./transformers/add-headers.js README.md

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
mdcode update --apply --transform ./uppercase.js --lang sql README.md

# Transform only test files
mdcode update --apply -t ./add-headers.js -f "*.test.js" docs/API.md

# Transform JavaScript blocks in examples
mdcode update --apply -t ./format.js -l js -m type=example docs/API.md
```

### Region Support

Update specific regions of code:

```bash file=block-38.sh
# Update only 'main' region
mdcode update --apply --meta region=main README.md

# Check only the setup region
mdcode update --check -m region=setup README.md
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

# After the blocks, the command prints "Working directory: <path>"
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
mdcode update --apply -m author=admin API.md
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
mdcode update --apply -l sql -f queries.sql README.md
```

### Selecting Blocks by Name

Give a block a stable name with `name=`, then select it by that name from any command. Names are
unique within one markdown document, so `--name` picks out exactly one block. Repeat `--name` to
select several. Elsewhere, the document path plus the name identifies the block.

````markdown file=block-93.md
```js name="quick start" file="examples/getting started.js"
console.log('Hello, world!');
```
````

```bash file=block-94.sh
mdcode list --name "quick start" README.md
mdcode extract -n "quick start" -d ./out README.md
mdcode update --apply --name "quick start" README.md
mdcode update --check -n "quick start" -n setup README.md
mdcode run -n "quick start" "node {file}" README.md
mdcode dump --name "quick start" -o quick-start.tar README.md
```

`update` fails with `invalid_usage` when no selected block has a given name, so a misspelt name
cannot make `--check` pass by checking nothing.

---

## CLI Flags Reference

All commands support these common flags:

- `-l, --lang <lang>` - Filter by language
- `-f, --file <file>` - Filter by file metadata pattern
- `-m, --meta <key=value>` - Filter by custom metadata (can specify multiple times)
- `-n, --name <name>` - Select the block with this `name` metadata; repeat to select several
- `--json` - Print one versioned JSON envelope instead of text; see [JSON Contract](#json-contract)

Additional flags by command:

**extract:**
- `-d, --dir <dir>` - Output directory (default: current directory)
- `-q, --quiet` - Suppress status messages
- `--update-source` - Add file metadata to anonymous code blocks and update source
- `--ignore-anonymous` - Skip blocks without file metadata (mutually exclusive with --update-source)
- `--force` - Overwrite existing files whose blocks have no `region=` (skipped by default)

**update:**
- `-q, --quiet` - Suppress status messages
- `-t, --transform <file>` - Path to transformer function
- `--plan` - List the blocks that would change, without writing (default)
- `--apply` - Write the changes to the markdown file in place
- `--diff` - Print a unified diff of the changes, without writing
- `--check` - Exit 1 when a selected block is out of sync, without writing
- `--stdout` - Print the updated markdown, without writing

**run:**
- `-k, --keep` - Keep temporary directory
- `-d, --dir <dir>` - Custom working directory

**dump:**
- `-o, --out <file>` - Output file (default: stdout; required with `--json`)
- `-q, --quiet` - Suppress status messages

---

## JSON Contract

Every command accepts `--json`. With it, the command prints exactly one JSON object, the envelope, on
stdout and nothing else: no colours and no progress text. Without `--json`, the output is text.

### Envelope

- `version` - The contract version, currently `1`. It changes only when the contract changes
  incompatibly. The library exports it as `CONTRACT_VERSION`.
- `command` - The command that ran: `list`, `extract`, `update`, `run` or `dump`.
- `ok` - `true` when `errors` is empty.
- `result` - What the command did, described below. It is `null` when the command failed before doing
  any work: invalid metadata, bad flags, unreadable input, or a transform module that could not be
  loaded.
- `errors` - Everything that went wrong. A command can fail for some blocks and still report a result
  for all of them.

### Errors

Each error has a `code` and a `message`. These fields are added when they apply:

- `line` - The 1-based line of the opening fence of the block concerned
- `name` - The name of the block concerned, when it has one
- `path` - The file concerned: an extract target, a `file=` source, the transform module, or an output
  path

| Code | Meaning |
|------|---------|
| `invalid_metadata` | A block's info string breaks the metadata grammar, or two blocks share a name |
| `invalid_usage` | Bad flags or flag combinations, including unknown options |
| `io_error` | Reading the markdown or writing an output failed |
| `invalid_transform` | The `--transform` module could not be loaded or has no default function export |
| `extract_skipped` | `extract` left a target file untouched |
| `read_failed` | `update` could not read a block's `file=` or region |
| `transform_failed` | `update`'s transformer threw for a block |
| `out_of_sync` | `update --check` found a selected block that differs from its source |
| `command_failed` | `run`'s command exited non-zero for a block |
| `unexpected_error` | Anything else |

### Block References

Results and errors point at a block with `name` and `line`:

- `name` is the block's stable identifier, taken from its `name=` metadata. It is unique within a
  document and does not change when other parts of the document are edited. It is `null` for an
  unnamed block, and errors leave it out.
- `line` is the 1-based line of the block's opening fence. It locates the block in this version of
  the document only. Any edit above the block moves it, so it is not an identifier.

mdcode does not generate IDs or derive them from positions. To refer to a block durably, give it a
`name=`.

### Schema

The schema below is written out from the types the library exports (`Envelope`, `ResultError`,
`ErrorCode`, `BlockRef`, `ListedBlock`, `ExtractTarget`, `UpdatedBlock`, `RunBlockResult` and
`DumpedFile`). Under `--json`, `errors` moves from a command's result to the envelope, and the CLI adds
the fields only it knows about, such as `written` and `out`.

```typescript file=block-96.ts
interface Envelope<R> {
  version: 1;
  command: "list" | "extract" | "update" | "run" | "dump";
  ok: boolean;
  /** null when the command failed before doing any work */
  result: R | null;
  errors: Array<ResultError>;
}

interface ResultError {
  code: ErrorCode;
  message: string;
  /** 1-based line of the opening fence of the block concerned */
  line?: number;
  /** Name of the block concerned, when it has one */
  name?: string;
  /** An extract target, a file= source, the transform module, an output path */
  path?: string;
}

type ErrorCode =
  | "invalid_metadata"
  | "invalid_usage"
  | "io_error"
  | "invalid_transform"
  | "extract_skipped"
  | "read_failed"
  | "transform_failed"
  | "out_of_sync"
  | "command_failed"
  | "unexpected_error";

interface BlockRef {
  /** The block's name= metadata; null for an unnamed block */
  name: string | null;
  /** 1-based line of the opening fence */
  line: number;
}

// mdcode list --json
type ListEnvelope = Envelope<{
  blocks: Array<BlockRef & {
    /** 1-based line of the closing fence */
    endLine: number;
    lang: string;
    meta: Record<string, string>;
    code: string;
  }>;
}>;

// mdcode extract --json
type ExtractEnvelope = Envelope<{
  targets: Array<{
    path: string;
    action: "written" | "spliced" | "skipped";
    /** The blocks that target this file, in document order */
    blocks: Array<BlockRef>;
    /** The region= names written */
    regions: Array<string>;
    /** Why the target was skipped */
    reason?: string;
  }>;
  /** --update-source on stdin: the updated markdown */
  updatedSource?: string;
  /** --update-source on a file: the markdown file that was rewritten */
  written?: string;
}>;

// mdcode update --json
type UpdatedBlock = BlockRef & {
  lang: string;
  /** Whether the block's code is different in the resulting markdown */
  changed: boolean;
  /** The block's code in the resulting markdown */
  code: string;
  /** Set when the block's code was read from its file= */
  read?: { file: string; region?: string; outline?: true };
  /** Whether the transformer changed the code */
  transformed: boolean;
};
type UpdateEnvelope = Envelope<
  /** Default, --plan and --check */
  | { blocks: Array<UpdatedBlock> }
  /** --apply: the markdown file written, or null when no block changed */
  | { blocks: Array<UpdatedBlock>; written: string | null }
  /** --diff: a unified diff of the markdown, empty when no block changed */
  | { blocks: Array<UpdatedBlock>; diff: string }
  /** --stdout: the updated markdown */
  | { blocks: Array<UpdatedBlock>; source: string }
>;

// mdcode run --json
type RunEnvelope = Envelope<{
  /** Where block files were written; removed afterwards unless --keep or --dir was given */
  workingDir: string;
  blocks: Array<BlockRef & {
    lang: string;
    /** 0 on success; a command killed by the timeout reports 1 */
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}>;

// mdcode dump --json --out <file>
type DumpEnvelope = Envelope<{
  /** The archive path given with --out */
  out: string;
  files: Array<BlockRef & {
    /** The entry's path inside the archive: the block's file=, or a generated block-N name */
    path: string;
    /** Size of the entry in bytes */
    size: number;
  }>;
}>;
```

### Results by Command

- `list` - One entry per selected block. `endLine` is the line of the closing fence, and `meta` holds
  every metadata key, including `name` and `file`.
- `extract` - One entry per target file, in the order they were processed. `written` means the file
  was created or overwritten whole, `spliced` means regions were replaced or appended in an existing
  file, and `skipped` means the file was left untouched; `reason` says why, and each skipped target
  also adds an `extract_skipped` error. With `--update-source`, when a block gained `file=`: from
  stdin, `updatedSource` holds the updated markdown; from a file, the file is rewritten and `written`
  holds its path.
- `update` - One entry per selected block, in document order. `changed` and `code` are the plan:
  which blocks would change, and the exact code each would get. Only `--apply` writes the markdown;
  `written` holds its path, or `null` when nothing changed and the file was left alone. `diff` holds
  the unified diff under `--diff`, and `source` the updated markdown under `--stdout`. Under
  `--check`, each changed block adds an `out_of_sync` error, with `path` set to its `file=` when it
  has one. When a block's `file=` cannot be read, its original code is kept and still passed to the
  transformer. When the transformer throws, the block keeps the code it had before the transform.
- `run` - One entry per selected block, with the command's exit code and output. Each block whose
  command failed adds a `command_failed` error.
- `dump` - `dump --json` needs `--out <file>`. The archive is written to that file and never encoded
  into the JSON. Without `--out`, the command fails with `invalid_usage`.

### Examples

`mdcode list --json guide.md` on this document:

````markdown file=block-97.md
# Guide

```js name=hello file=hello.js
console.log("hello");
```

```sh
echo hi
```
````

```json file=block-98.json
{
  "version": 1,
  "command": "list",
  "ok": true,
  "result": {
    "blocks": [
      {
        "name": "hello",
        "line": 3,
        "endLine": 5,
        "lang": "js",
        "meta": {
          "name": "hello",
          "file": "hello.js"
        },
        "code": "console.log(\"hello\");"
      },
      {
        "name": null,
        "line": 7,
        "endLine": 9,
        "lang": "sh",
        "meta": {},
        "code": "echo hi"
      }
    ]
  },
  "errors": []
}
```

`mdcode run --json "sh {file}" checks.md`, where the second block fails, exits 1:

````markdown file=block-99.md
# Checks

```sh name=passes
echo ok
```

```sh
echo "boom" >&2
exit 3
```
````

```json file=block-100.json
{
  "version": 1,
  "command": "run",
  "ok": false,
  "result": {
    "workingDir": "/work/.mdcode-tmp",
    "blocks": [
      {
        "name": "passes",
        "line": 3,
        "lang": "sh",
        "exitCode": 0,
        "stdout": "ok\n",
        "stderr": ""
      },
      {
        "name": null,
        "line": 7,
        "lang": "sh",
        "exitCode": 3,
        "stdout": "",
        "stderr": "boom\n"
      }
    ]
  },
  "errors": [
    {
      "code": "command_failed",
      "message": "command exited with code 3",
      "line": 7
    }
  ]
}
```

`mdcode list --json broken.md`, where two blocks share a name and one has an unterminated quote,
fails before doing any work, so `result` is `null`:

````markdown file=block-101.md
# Broken

```js name=setup
let a = 1;
```

```js name=setup file="unterminated.js
let b = 2;
```
````

```json file=block-102.json
{
  "version": 1,
  "command": "list",
  "ok": false,
  "result": null,
  "errors": [
    {
      "code": "invalid_metadata",
      "message": "duplicate name \"setup\" on lines 3, 7; names must be unique within a document",
      "line": 3
    },
    {
      "code": "invalid_metadata",
      "message": "unterminated quoted value for \"file\"; add the closing \"",
      "line": 7
    }
  ]
}
```

`mdcode dump --json guide.md`, without `--out`:

```json file=block-103.json
{
  "version": 1,
  "command": "dump",
  "ok": false,
  "result": null,
  "errors": [
    {
      "code": "invalid_usage",
      "message": "dump --json needs --out <file> for the archive"
    }
  ]
}
```

The envelope works with `jq`:

```bash file=block-104.sh
# Languages used in a document
mdcode list --json README.md | jq -r '.result.blocks[].lang' | sort | uniq -c

# Blocks in the main region
mdcode list --json README.md | jq '.result.blocks[] | select(.meta.region == "main")'
```

### Exit Codes

Exit codes are the same with and without `--json`:

| Code | Meaning |
|------|---------|
| `0` | Success; for `update --check`, every selected block is in sync |
| `1` | Any error, including `update --check` finding a block out of sync |
| `2` | `extract` skipped one or more targets |

### Changes from Earlier Versions

- `list --json` used to print one JSON object per block (NDJSON). It now prints the envelope; read the
  blocks from `result.blocks`.
- `run` exits 1 when any block's command fails. It used to exit 0.
- `update` exits 1 when a `file=` read or the transformer fails. It used to exit 0.
- `update` no longer writes the markdown file by default. It prints a plan; pass `--apply` to write.
  Under `--json`, the default result no longer has `written`, and every block carries its `code`.
- `run --keep` prints `Working directory: <path>` after the blocks instead of before them.
- A transform module that cannot be loaded is reported as `could not load transform file: ...`.
- The library functions return structured results and print nothing; see
  [API Reference](#api-reference).

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
  list,
  extract,
  run,
  dump,
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
const { source, blocks, errors } = await update({ source: markdown, transformer });
console.log(source); // Transformed markdown
console.log(blocks); // [{ name: null, line: 2, lang: 'sql', changed: true, transformed: true }, ...]
````

### Async Transformers

```typescript file=block-62.ts
import { update, defineTransform } from 'mdcode-ts';

const transformer = defineTransform(async ({tag, meta, code}) => {
  // Fetch from API, read files, etc.
  const formatted = await someAsyncFormatter(code);
  return formatted;
});

const { source } = await update({ source: markdown, transformer });
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
- **Returns** - Array of Block objects. A named block also has `name` set. Each block's `position`
  includes `line` and `endLine`, the 1-based lines of its opening and closing fences.
- **Throws** - `MetadataError` when any block's metadata is malformed or two blocks share a name. Its
  `problems` array lists each problem with the line of the block's opening fence.

#### `walk(options: WalkOptions): Promise<WalkResult>`

Walk through and optionally transform code blocks.

- **options.source** - The markdown source string
- **options.walker** - Function called for each block
- **options.filter** - Optional filter criteria
- **Returns** - Promise of WalkResult with source, blocks, and modified flag

#### `update(options: UpdateOptions): Promise<UpdateResult>`

Work out the updated markdown from files or via transformer. It never writes; the caller decides
what to do with the result.

- **options.source** - The markdown source string
- **options.transformer** - Optional transformer function
- **options.filter** - Optional filter criteria
- **options.basePath** - Base path for file resolution (default: '.')
- **Returns** - Promise of `{ source, blocks, errors }`: the updated markdown, one `UpdatedBlock` per
  selected block with its resulting `code` and whether it `changed`, and a `read_failed` or
  `transform_failed` error for each block whose `file=` read or transformer failed. A failed block
  keeps the code it had before the failing step.
- **Throws** - `MetadataError` when the document's metadata is invalid

#### `list(options: ListOptions): ListResult`

List code blocks with their metadata, code, and location.

- **options.source** - The markdown source string
- **options.filter** - Optional filter criteria
- **Returns** - `{ blocks }`, one `ListedBlock` (`name`, `line`, `endLine`, `lang`, `meta`, `code`) per
  selected block. This is the `result` that `mdcode list --json` prints.
- **Throws** - `MetadataError` when the document's metadata is invalid

#### `extract(options: ExtractOptions): Promise<ExtractResult>`

Write code blocks to files based on their `file` metadata.

- **options.source** - The markdown source string
- **options.filter** - Optional filter criteria
- **options.outputDir** - Directory that relative `file=` paths resolve against (default: '.')
- **options.updateSource** - Add `file=` to anonymous blocks
- **options.ignoreAnonymous** - Skip blocks without `file=`
- **options.force** - Overwrite existing files whose blocks have no `region=`
- **Returns** - Promise of `{ targets, updatedSource?, errors }`: one `ExtractTarget` per target file,
  the markdown with `file=` added when `updateSource` added any, and one `extract_skipped` error per
  skipped target. `extract` writes the target files but not the markdown.

#### `run(options: RunOptions): Promise<RunResult>`

Run a shell command on each code block.

- **options.source** - The markdown source string
- **options.command** - Command to run, with `{file}` as the placeholder for the block's file
- **options.filter** - Optional filter criteria
- **options.keep** - Keep the working directory afterwards
- **options.dir** - Working directory (default: `.mdcode-tmp` in the current directory)
- **options.onBlock** - Optional `(block, index, total) => void`, called as each block finishes
- **Returns** - Promise of `{ workingDir, blocks, errors }`: one `RunBlockResult` per selected block,
  and one `command_failed` error per block whose command failed. Nothing is printed.

#### `dump(options: DumpOptions): Promise<DumpResult>`

Create a tar archive of code blocks.

- **options.source** - The markdown source string
- **options.filter** - Optional filter criteria
- **Returns** - Promise of `{ files, archive }`: one `DumpedFile` (`name`, `line`, `path`, `size`) per
  selected block, and the tar archive as a `Uint8Array` (zero bytes when no block was selected)

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

All commands take the same flags as the original. `update` differs in one way: it writes the
markdown only with `--apply`, where the original writes it by default.

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
   mdcode update --apply --transform ./uppercase.js -l sql README.md
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

# 3. Review, then update README with changes
mdcode update --diff README.md
mdcode update --apply README.md
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
mdcode update --apply -t ./uppercase.js -l sql README.md

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
