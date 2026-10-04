# mdcode CLI Examples

Comprehensive guide to using mdcode from the command line.

## Table of Contents

1. [Installation](#installation)
2. [Global Commands](#global-commands)
3. [List Command](#list-command)
4. [Extract Command](#extract-command)
5. [Update Command](#update-command)
6. [Run Command](#run-command)
7. [Dump Command](#dump-command)
8. [Filtering Examples](#filtering-examples)
9. [Comparison with Original mdcode](#comparison-with-original-mdcode)
10. [Migration Guide](#migration-guide)

---

## Installation

### Global Install (npm)

```bash
npm install -g mdcode-ts
```

After installation, you can run `mdcode` from anywhere:

```bash
mdcode --version
mdcode --help
mdcode list README.md
```

### Global Install (pnpm)

```bash
pnpm install -g mdcode-ts
```

Usage is identical to npm installation:

```bash
mdcode --version
mdcode --help
```

### Run Without Installing (pnpm dlx)

No installation required - run directly:

```bash
pnpm dlx mdcode-ts list README.md
pnpm dlx mdcode-ts extract --lang js docs/*.md
pnpm dlx mdcode-ts update --transform ./my-transformer.js README.md
```

### Run Without Installing (npx)

```bash
npx mdcode-ts list README.md
npx mdcode-ts --help
```

---

## Global Commands

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

Print one JSON envelope whose `result.blocks` lists every selected block:

```bash
# JSON output
mdcode list --json README.md

# Short form
mdcode list --json docs/API.md
```

**JSON Format:**
```json
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

`name` is `null` for a block without `name=` metadata. `line` and `endLine` are the opening and closing
fence lines in this version of the document. Every command accepts `--json`; the package README
documents the full contract.

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

### JSON with Filters

```bash
# JSON output with language filter
mdcode list --json --lang js README.md

# JSON with multiple filters
mdcode list --json -l python -m type=example docs/
```

---

## Extract Command

Extract code blocks to files based on their `file` metadata.

### Existing Files Are Not Overwritten

`extract` never destroys work you did not ask it to touch:

- Blocks with `region=` are **spliced in place** — surrounding code and untouched regions survive.
- Blocks without `region=` describe a whole file. If that file already exists it is **skipped with a
  warning**; pass `--force` to overwrite it.
- A target is also skipped, and left byte-identical, when it is a symlink, is not valid UTF-8, has a
  region the file never closes, or when the blocks for one file mix `region=` with whole-file blocks.
- A target that is absolute or leads outside `--dir`, through `..` or a symlink, is not skipped but
  refused as `unsafe_path`. Every target is checked first, so then nothing at all is written and
  `extract` exits 1.

When anything is skipped, `extract` reports the count even under `--quiet` and exits with a non-zero
status, so a pipeline cannot mistake "wrote nothing" for success.

```bash
# Skipped with a warning if the target already exists
mdcode extract README.md

# Overwrite whole-file targets
mdcode extract --force README.md
```

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

# Extract everything except tests
mdcode extract -d ./src README.md
```

### Reading from stdin

```bash
cat README.md | mdcode extract -d output
curl https://example.com/docs.md | mdcode extract -q
```

---

## Update Command

Update markdown code blocks from source files or transform them with custom functions.

### `file=` Stays Inside Its Base

The markdown is treated as untrusted, so a block's `file=` cannot point anywhere it likes. `update`
resolves `file=` against the base, which is the markdown file's directory by default (the current
directory for stdin), and the path must stay inside it. An absolute path, a `..` that climbs out,
or a symlink that leads out, anywhere along the path, is refused as an `unsafe_path` error before
anything is read.

`--base <dir>` picks another base, and `file=` paths then resolve against that directory instead of
the markdown's. A `docs/README.md` with `file=../src/app.js` fails by default; run from the
repository root with `--base .` and write `file=src/app.js`:

```bash
mdcode update --check --base . docs/README.md
```

By default `update` stops at the first failed read, unsafe path or transform, writes nothing and
reports only that error. `--continue-on-error` reports every failure and keeps going; `--apply` then
writes the blocks that succeeded, and the command still exits 1.

`extract` applies the same rule when it writes: `file=` resolves against `--dir` and must stay inside
it. To write into `../../shared-tests`, point `--dir` higher and write `file=` relative to it.

The check runs before the read or write, so a symlink swapped in between the two is not caught;
mdcode is not a sandbox. A `--transform` module and a `run` command are your own code and run with
your permissions.

### Update from Source Files

Updates code blocks by reading from files specified in the `file` metadata attribute. `update` writes
the markdown only with `--apply`; every other mode leaves it alone:

```bash
# List the blocks that would change (the default; same as --plan)
mdcode update README.md

# Review the changes as a unified diff
mdcode update --diff README.md

# Write the changes to README.md in place
mdcode update --apply README.md

# Exit 1 when README.md is out of sync with its sources (for CI)
mdcode update --check README.md

# Output the updated markdown to stdout
mdcode update --stdout README.md

# Update and save to a new file
mdcode update --stdout README.md > UPDATED.md

# Read from stdin, write to stdout
cat README.md | mdcode update --stdout > UPDATED.md
```

### Quiet Mode

```bash
# Long form
mdcode update --apply --quiet README.md

# Short form
mdcode update --apply -q README.md

# Quiet with stdout
mdcode update -q --stdout README.md > UPDATED.md
```

### Transform Mode (with Custom Function)

Transform code blocks using a custom JavaScript/TypeScript function:

```bash
# Transform with a custom function
mdcode update --apply --transform ./transformers/uppercase-sql.js README.md

# Short form
mdcode update --apply -t ./transformers/add-headers.js README.md

# Transform and output to stdout
mdcode update -t ./transformers/format-code.js --stdout README.md
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

### Transform with Filters

Combine transformers with filters to target specific blocks:

```bash
# Transform only SQL blocks
mdcode update --apply --transform ./uppercase.js --lang sql README.md

# Transform only test files
mdcode update --apply -t ./add-headers.js -f "*.test.js" docs/API.md

# Transform JavaScript blocks in examples
mdcode update --apply -t ./format.js -l js -m type=example docs/API.md
```

### Advanced Transform Examples

```bash
# Transform Python blocks, output quietly
mdcode update --apply -q -t ./format-python.js -l python README.md

# Transform all blocks in specific region
mdcode update --apply -t ./transform.js -m region=main docs/GUIDE.md

# Chain: extract, transform, and save
mdcode extract -q -d temp README.md
mdcode update -t ./transform.js --stdout README.md > TRANSFORMED.md
```

### Region Support

Update specific regions of code:

```bash
# Update only 'main' region
mdcode update --apply --meta region=main README.md

# Update multiple regions
mdcode update --apply -m region=setup README.md
mdcode update --apply -m region=teardown README.md
```

### Outline Support

Extract code structure without implementation details:

```bash
# Update blocks marked with outline=true
mdcode update --apply README.md

# This will extract structure like:
# function foo() { /* ... */ }
# Instead of full implementation
```

---

## Run Command

Execute shell commands on each code block.

`run` needs `--allow-shell`. The command runs through the shell once per selected block, and a
command such as `node {file}` executes the block's code, so running it over markdown you did not
write runs code you did not write. Without the flag, `run` fails with `invalid_usage` before reading
any input. The command always comes from your command line, never from the markdown.

### Basic Usage

Use `{file}` as a placeholder for the temporary file path:

```bash
# Run node on JavaScript blocks
mdcode run --allow-shell "node {file}" README.md

# Run Python scripts
mdcode run --allow-shell "python {file}" --lang python README.md

# Compile and run C code
mdcode run --allow-shell "gcc {file} -o out && ./out" --lang c docs/
```

### Filter by Language

```bash
# Long form
mdcode run --allow-shell --lang js "node {file}" README.md

# Short form
mdcode run --allow-shell -l js "node {file}" README.md

# Multiple languages (run separately)
mdcode run --allow-shell -l python "python {file}" docs/*.md
mdcode run --allow-shell -l js "node {file}" docs/*.md
```

### Filter by Name

Filter blocks by their `name` metadata:

```bash
# Long form
mdcode run --allow-shell --name test-example "node {file}" README.md

# Short form
mdcode run --allow-shell -n calculate "python {file}" docs/API.md

# With language filter
mdcode run --allow-shell -l js -n integration-test "node {file}" tests/
```

### Custom Working Directory

Specify where to save temporary files and run commands:

```bash
# Long form
mdcode run --allow-shell --dir /tmp/mdcode "node {file}" README.md

# Short form
mdcode run --allow-shell -d ./temp "python {file}" docs/

# With filters
mdcode run --allow-shell -l js -d ./build "node {file}" README.md
```

### Keep Temporary Files

Preserve temporary directory after execution (useful for debugging):

```bash
# Long form
mdcode run --allow-shell --keep "node {file}" README.md

# Short form
mdcode run --allow-shell -k "python {file}" docs/

# The command will print the temp directory location
```

### Combined Examples

```bash
# Run JavaScript tests with all flags
mdcode run --allow-shell -l js -n test -k -d ./temp "node {file}" README.md

# Run Python examples in custom directory
mdcode run --allow-shell -l python -m type=example -d ./examples "python {file}" docs/

# Run and keep files, filter by file metadata
mdcode run --allow-shell -k -f "calculator.py" "python {file}" README.md

# Run with multiple filters
mdcode run --allow-shell -l js -f "*.test.js" -n unit "npm test {file}" docs/
```

### Advanced Usage

```bash
# Lint all JavaScript blocks
mdcode run --allow-shell -l js "eslint {file}" README.md

# Format code blocks
mdcode run --allow-shell -l python "black {file}" docs/*.md

# Type check TypeScript blocks
mdcode run --allow-shell -l typescript "tsc --noEmit {file}" API.md

# Run tests with coverage
mdcode run --allow-shell -l js -n test "jest --coverage {file}" docs/

# Compile and analyze
mdcode run --allow-shell -l c "gcc -Wall -Wextra {file} && valgrind ./a.out" examples.md
```

### Without File Placeholder

If you don't use `{file}`, each block is saved but the command runs without a file argument:

```bash
# Run command in directory with code blocks
mdcode run --allow-shell -d ./temp "ls -la" README.md
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

### Combined Examples

```bash
# Dump JavaScript examples quietly
mdcode dump -q -l js -m type=example -o js-examples.tar docs/

# Dump Python files to archive
mdcode dump -l python -o python-code.tar README.md

# Dump specific region
mdcode dump -m region=tests -o tests.tar docs/API.md

# Dump and extract in one command
mdcode dump -l js README.md | tar -xv

# Create dated archive with filters
mdcode dump -q -l typescript -o "ts-$(date +%Y%m%d).tar" docs/
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

# Extract verbose
tar -xvf code-blocks.tar
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
mdcode run --allow-shell -f server.py "python {file}" README.md

# By custom metadata
mdcode list -m region=main README.md
mdcode extract -m type=example docs/
mdcode update --apply -m author=admin API.md
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

### Wildcards and Patterns

```bash
# File patterns
mdcode extract -f "*.test.js" docs/
mdcode list -f "server.*" README.md
mdcode dump -f "**/*.py" -o python.tar docs/

# Metadata patterns (exact match)
mdcode list -m "region=*" README.md
mdcode extract -m type=component docs/
```

### Complex Filtering Scenarios

```bash
# Extract all test files that are JavaScript
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# List Python examples in main region
mdcode list -l python -m type=example -m region=main docs/

# Run tests only for specific component
mdcode run --allow-shell -l js -f "auth.test.js" -n "login-test" "node {file}" README.md

# Dump production code (exclude tests)
mdcode dump -f "src/**/*.js" -o production.tar docs/

# Update only SQL queries in specific file
mdcode update -l sql -f queries.sql --stdout README.md
```

---

## Comparison with Original mdcode

This TypeScript implementation is a near **drop-in replacement** for the original Go-based [szkiba/mdcode](https://github.com/szkiba/mdcode), with one deliberate difference: `extract` refuses to overwrite pre-existing whole-file targets unless `--force` is given, and exits non-zero when it skips anything. See [Existing Files Are Not Overwritten](#existing-files-are-not-overwritten).

### Feature Parity

| Feature | Original (Go) | This Implementation |
|---------|---------------|---------------------|
| `list` command | ✅ | ✅ |
| `extract` command | ✅ | ✅ |
| `update` command | ✅ | ✅ |
| `run` command | ✅ | ✅ |
| `dump` command | ✅ | ✅ |
| Short flags (`-l`, `-f`, `-m`) | ✅ | ✅ |
| Long flags (`--lang`, `--file`) | ✅ | ✅ |
| JSON output (`--json`) | ✅ | ✅ |
| Quiet mode (`-q`, `--quiet`) | ✅ | ✅ |
| Default behavior (list README.md) | ✅ | ✅ |
| Stdin support | ✅ | ✅ |
| Region extraction | ✅ | ✅ |
| Outline support | ✅ | ✅ |
| Transform functions | ❌ | ✅ (Bonus) |
| Library API | ❌ | ✅ (Bonus) |

### Command Compatibility

All commands take the same flags as the original. `update` differs in one way: it writes the markdown
only with `--apply`, where the original writes it by default.

```bash
# Original (Go)
mdcode list -l js README.md
mdcode extract -d output -q docs/*.md
mdcode run --allow-shell -l python "python {file}" README.md
mdcode dump -o archive.tar README.md

# This implementation (TypeScript) - SAME COMMANDS
mdcode list -l js README.md
mdcode extract -d output -q docs/*.md
mdcode run --allow-shell -l python "python {file}" README.md
mdcode dump -o archive.tar README.md
```

### Bonus Features

These features are **not** in the original but are available in this implementation:

1. **Transform Functions** - Apply custom transformations to code blocks
   ```bash
   mdcode update --apply --transform ./uppercase.js -l sql README.md
   ```

2. **Library API** - Use mdcode programmatically in Node.js/TypeScript projects
   ```javascript
   import mdcode from 'mdcode-ts';
   const result = await mdcode('README.md', transformer);
   ```

3. **Enhanced Update** - Update command supports both file-based updates AND transformers

---

## Migration Guide

Switching from the Go version to this TypeScript version is seamless. No changes needed!

### Step 1: Uninstall Original (Optional)

If you have the Go version installed:

```bash
# If installed via go install
rm $(which mdcode)

# If installed via package manager (brew, apt, etc.)
brew uninstall mdcode  # macOS
sudo apt remove mdcode  # Linux
```

### Step 2: Install TypeScript Version

```bash
# Global install
npm install -g mdcode-ts
# or
pnpm install -g mdcode-ts
```

### Step 3: Verify Installation

```bash
mdcode --version
mdcode --help
```

### Step 4: Test Your Existing Commands

All your existing commands will work without modification:

```bash
# If you were using:
mdcode list -l js README.md

# It still works the same way:
mdcode list -l js README.md
```

### Migration Checklist

- ✅ All CLI commands take the same flags; `update` needs `--apply` to write the markdown and `run`
  needs `--allow-shell`
- ✅ All flags (short and long forms) are supported
- ✅ JSON output format is identical
- ✅ Tar archive format is compatible
- ✅ Metadata parsing is the same
- ✅ Region extraction works the same
- ✅ Stdin/stdout behavior is identical
- ⚠️ `extract` skips existing whole-file targets instead of overwriting them — add `--force` to keep
  the original behaviour, and expect exit code 2 when files are skipped
- ⚠️ `update` and `extract` refuse a `file=` that leads outside its base (`update`: the markdown's
  directory or `--base`; `extract`: `--dir`), and `dump` refuses an entry that would unpack outside
  the archive

### Scripts and Automation

If you have scripts using mdcode, add `--allow-shell` to `run` calls; the rest work without changes:

```bash
#!/bin/bash
# The original has no --allow-shell; everything else is the same in both versions

# Extract code blocks
mdcode extract -q -d ./src README.md

# Run tests
mdcode run --allow-shell -l js "npm test {file}" README.md

# Create archive
mdcode dump -o archive.tar README.md
```

### Exploring New Features

Once migrated, you can optionally explore the bonus features:

```bash
# Try transform functionality
mdcode update --diff --transform ./my-transformer.js README.md

# Use as a library in your Node.js projects
npm install mdcode-ts
```

### Getting Help

If you encounter any issues:

1. Check the help output: `mdcode --help`
2. Run with verbose errors (stderr will show details)
3. Compare output with original using `--json` flag
4. Open an issue at: https://github.com/adrianbrowning/mdcode-ts/issues

---

## Additional Examples

### Workflow: Extract, Modify, Update

```bash
# 1. Extract code blocks to files.
#    --force is needed on re-runs: whole-file targets that already exist are
#    skipped by default. Region blocks splice in place and never need it.
mdcode extract --force -d ./src README.md

# 2. Edit the extracted files
vim ./src/app.js

# 3. Update README with changes
mdcode update --apply README.md
```

### Workflow: Test All Code Blocks

```bash
# Extract test files
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# Run all tests
mdcode run --allow-shell -l js -f "*.test.js" "npm test {file}" docs/

# If tests pass, create archive
mdcode dump -l js -f "*.test.js" -o tests.tar docs/
```

### Workflow: Transform and Publish

```bash
# Transform SQL to uppercase
mdcode update --apply -t ./uppercase.js -l sql README.md

# Verify changes
mdcode list --json -l sql README.md

# Extract transformed code
mdcode extract -l sql -d ./queries README.md
```

### Workflow: Document Generation

```bash
# List all code blocks as JSON
mdcode list --json README.md > blocks.json

# Process with jq or other tools
cat blocks.json | jq -r '.result.blocks[].lang' | sort | uniq -c

# Extract examples to documentation
mdcode extract -m type=example -d ./docs/examples README.md
```

### Workflow: CI/CD Integration

```bash
#!/bin/bash
# .github/workflows/validate-docs.sh

set -e

echo "Extracting code blocks..."
# --force so a re-run overwrites the previous run's scratch files rather than
# skipping them and exiting non-zero.
mdcode extract -q --force -d ./temp README.md

echo "Running linter..."
mdcode run --allow-shell -l js "eslint {file}" README.md

echo "Running tests..."
mdcode run --allow-shell -l js -n test "npm test {file}" README.md

echo "Creating archive..."
mdcode dump -q -o artifacts/code-blocks.tar README.md

echo "All checks passed!"
```

---

## Tips and Tricks

### 1. Debugging with `--keep` flag

```bash
# Keep temporary files to inspect them
mdcode run --allow-shell -k -l js "node {file}" README.md
# Output will show: "Temporary directory: /tmp/mdcode-xxx"
# You can then inspect the files
```

### 2. Combining with Other Tools

```bash
# Format code blocks with prettier (--force so re-runs refresh temp/)
mdcode extract -l js --force -d temp README.md && \
  prettier --write temp/**/*.js && \
  mdcode update --apply README.md

# Check for syntax errors
mdcode run --allow-shell -l python "python -m py_compile {file}" docs/*.md
```

### 3. Using Stdin Effectively

```bash
# Download and process
curl https://raw.githubusercontent.com/user/repo/main/README.md | \
  mdcode list -l js

# Filter markdown first
grep -A 10 "## Examples" README.md | \
  mdcode extract -d ./examples
```

### 4. Quick Filtering

```bash
# How many JavaScript blocks?
mdcode list -l js --json README.md | jq '.result.blocks | length'

# What languages are used?
mdcode list --json README.md | jq -r '.result.blocks[].lang' | sort | uniq

# Find blocks with specific metadata
mdcode list --json README.md | jq '.result.blocks[] | select(.meta.region == "main")'
```

### 5. Batch Processing

```bash
# Process multiple files
for file in docs/*.md; do
  echo "Processing $file..."
  mdcode extract -q -d ./output "$file"
done

# Transform all markdown files
find . -name "*.md" -exec mdcode update --apply -t ./transform.js {} \;
```

---

## Summary

mdcode provides a powerful CLI for working with code blocks in Markdown files:

- **5 core commands**: list, extract, update, run, dump
- **Flexible filtering**: by language, file, or custom metadata
- **Multiple output formats**: text, JSON, tar archives
- **Quiet mode**: for clean, scriptable output
- **Short and long flags**: `-l` or `--lang`, your choice
- **Drop-in replacement**: 100% compatible with original mdcode
- **Bonus features**: transform functions and library API

Install globally and start using it today:

```bash
npm install -g mdcode-ts
mdcode list README.md
```

Or try it without installing:

```bash
pnpm dlx mdcode-ts list README.md
```

For more information, visit: https://github.com/adrianbrowning/mdcode-ts
