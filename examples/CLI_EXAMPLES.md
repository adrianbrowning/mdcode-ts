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
npm install -g mdcode
```

After installation, you can run `mdcode` from anywhere:

```bash
mdcode --version
mdcode --help
mdcode list README.md
```

### Global Install (pnpm)

```bash
pnpm install -g mdcode
```

Usage is identical to npm installation:

```bash
mdcode --version
mdcode --help
```

### Run Without Installing (pnpm dlx)

No installation required - run directly:

```bash
pnpm dlx mdcode list README.md
pnpm dlx mdcode extract --lang js docs/*.md
pnpm dlx mdcode update --transform ./my-transformer.js README.md
```

### Run Without Installing (npx)

```bash
npx mdcode list README.md
npx mdcode --help
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

### Update from Source Files (Default Mode)

Updates code blocks by reading from files specified in the `file` metadata attribute:

```bash
# Update README.md in-place
mdcode update README.md

# Output to stdout instead of updating in-place
mdcode update --stdout README.md

# Update and save to a new file
mdcode update --stdout README.md > UPDATED.md

# Read from stdin, write to stdout
cat README.md | mdcode update --stdout > UPDATED.md
```

### Quiet Mode

```bash
# Long form
mdcode update --quiet README.md

# Short form
mdcode update -q README.md

# Quiet with stdout
mdcode update -q --stdout README.md > UPDATED.md
```

### Transform Mode (with Custom Function)

Transform code blocks using a custom JavaScript/TypeScript function:

```bash
# Transform with a custom function
mdcode update --transform ./transformers/uppercase-sql.js README.md

# Short form
mdcode update -t ./transformers/add-headers.js README.md

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
mdcode update --transform ./uppercase.js --lang sql README.md

# Transform only test files
mdcode update -t ./add-headers.js -f "*.test.js" docs/API.md

# Transform JavaScript blocks in examples
mdcode update -t ./format.js -l js -m type=example docs/
```

### Advanced Transform Examples

```bash
# Transform Python blocks, output quietly
mdcode update -q -t ./format-python.js -l python README.md

# Transform all blocks in specific region
mdcode update -t ./transform.js -m region=main docs/GUIDE.md

# Chain: extract, transform, and save
mdcode extract -q -d temp README.md
mdcode update -t ./transform.js --stdout README.md > TRANSFORMED.md
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

### Outline Support

Extract code structure without implementation details:

```bash
# Update blocks marked with outline=true
mdcode update README.md

# This will extract structure like:
# function foo() { /* ... */ }
# Instead of full implementation
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

# Run with multiple filters
mdcode run -l js -f "*.test.js" -n unit "npm test {file}" docs/
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

# Compile and analyze
mdcode run -l c "gcc -Wall -Wextra {file} && valgrind ./a.out" examples.md
```

### Without File Placeholder

If you don't use `{file}`, each block is saved but the command runs without a file argument:

```bash
# Run command in directory with code blocks
mdcode run -d ./temp "ls -la" README.md
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
mdcode run -l js -f "auth.test.js" -n "login-test" "node {file}" README.md

# Dump production code (exclude tests)
mdcode dump -f "src/**/*.js" -o production.tar docs/

# Update only SQL queries in specific file
mdcode update -l sql -f queries.sql --stdout README.md
```

---

## Comparison with Original mdcode

This TypeScript implementation is a **drop-in replacement** for the original Go-based [szkiba/mdcode](https://github.com/szkiba/mdcode). It maintains 100% CLI compatibility.

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
   import mdcode from 'mdcode';
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
npm install -g mdcode
# or
pnpm install -g mdcode
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

- ✅ All CLI commands work identically
- ✅ All flags (short and long forms) are supported
- ✅ JSON output format is identical
- ✅ Tar archive format is compatible
- ✅ Metadata parsing is the same
- ✅ Region extraction works the same
- ✅ Stdin/stdout behavior is identical
- ✅ Exit codes match original behavior

### Scripts and Automation

If you have scripts using mdcode, they will work without changes:

```bash
#!/bin/bash
# This script works with both versions

# Extract code blocks
mdcode extract -q -d ./src README.md

# Run tests
mdcode run -l js "npm test {file}" README.md

# Create archive
mdcode dump -o archive.tar README.md
```

### Exploring New Features

Once migrated, you can optionally explore the bonus features:

```bash
# Try transform functionality
mdcode update --transform ./my-transformer.js README.md

# Use as a library in your Node.js projects
npm install mdcode
```

### Getting Help

If you encounter any issues:

1. Check the help output: `mdcode --help`
2. Run with verbose errors (stderr will show details)
3. Compare output with original using `--json` flag
4. Open an issue at: https://github.com/adrianbrowning/mdcode/issues

---

## Additional Examples

### Workflow: Extract, Modify, Update

```bash
# 1. Extract code blocks to files
mdcode extract -d ./src README.md

# 2. Edit the extracted files
vim ./src/app.js

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

### Workflow: Document Generation

```bash
# List all code blocks as JSON
mdcode list --json README.md > blocks.json

# Process with jq or other tools
cat blocks.json | jq -r '.lang' | sort | uniq -c

# Extract examples to documentation
mdcode extract -m type=example -d ./docs/examples README.md
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

## Tips and Tricks

### 1. Debugging with `--keep` flag

```bash
# Keep temporary files to inspect them
mdcode run -k -l js "node {file}" README.md
# Output will show: "Temporary directory: /tmp/mdcode-xxx"
# You can then inspect the files
```

### 2. Combining with Other Tools

```bash
# Format code blocks with prettier
mdcode extract -l js -d temp README.md && \
  prettier --write temp/**/*.js && \
  mdcode update README.md

# Check for syntax errors
mdcode run -l python "python -m py_compile {file}" docs/*.md
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
mdcode list -l js --json README.md | wc -l

# What languages are used?
mdcode list --json README.md | jq -r .lang | sort | uniq

# Find blocks with specific metadata
mdcode list --json README.md | jq 'select(.region == "main")'
```

### 5. Batch Processing

```bash
# Process multiple files
for file in docs/*.md; do
  echo "Processing $file..."
  mdcode extract -q -d ./output "$file"
done

# Transform all markdown files
find . -name "*.md" -exec mdcode update -t ./transform.js {} \;
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
npm install -g mdcode
mdcode list README.md
```

Or try it without installing:

```bash
pnpm dlx mdcode list README.md
```

For more information, visit: https://github.com/adrianbrowning/mdcode
