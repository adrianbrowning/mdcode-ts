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
- **Validate** that blocks map safely onto files before `update` or `extract` writes anything
- **Watch** documents and their sources, reporting drift, or writing it with `--apply`, as you edit
- **Run** shell commands on code blocks with enhanced control
- **Dump** code blocks to tar archives (stdout or file)
- Support for metadata in code block info strings
- Filter blocks by language, file, or custom metadata
- Region extraction using special comments
- Outline extraction for code structure
- Quiet mode for cleaner output
- Short and long flag forms for all options
- Containment for untrusted markdown: `file=` paths stay inside their base, and `run` needs
  `--allow-shell` (see [Security: Untrusted Markdown](#security-untrusted-markdown))

## Why Use mdcode?

### The Problem

Documentation examples often become outdated. You write great examples in your README, but as your code evolves, those examples break. Users copy non-working code, get frustrated, and lose trust in your documentation.

### The Solution

**mdcode** keeps each example in a source or test file and copies it into the Markdown:

1. **Write the example as ordinary code**, marking the part to show with a `#region` if it's only part of a file
2. **Point a code block at it**, for example ```` ```ts file=src/greet.ts region=greet ````
3. **Lint and test the code** with your project's usual tools, like any other file
4. **Copy it into the Markdown** with `mdcode update --apply`, and fail CI with `mdcode update --check` when a block has drifted

The source file stays authoritative. The code block is a copy, so it shows whatever passed your checks.

### Key Benefits

**Keep Examples Fresh**
```bash
# Change the code and check it as usual
nano src/calculator.js
npm test

# Copy the change into the README
mdcode update --apply README.md
```

**Catch Drift in CI**
```bash
npm run lint && npm test            # check the code where it lives
mdcode update --check README.md     # exit 1 if a block has drifted from it
```

**One Copy to Maintain**
- The code lives in one file, which your tools already lint, type-check and test
- The README holds a copy that `mdcode update` refreshes
- A block can show a whole file, one `#region` of it, or an outline of its regions

### Writing Examples in the Markdown

mdcode also works the other way. Write a block in the Markdown, then `extract` it to a file and `run` a command on it:

```bash
# Extract examples from README
mdcode extract README.md -d ./examples

# Run them as tests
mdcode run --allow-shell -l js "node {file}" README.md
```

This suits documentation-driven development:
1. Write your README with examples first
2. Extract code blocks to create skeleton files
3. Implement the functionality
4. Update README from working code

Once the files exist, they become the source and `mdcode update` keeps the README in step. To run Markdown-only blocks in CI, mark them `runnable=true`; see [Validating Runnable Snippets in CI](#validating-runnable-snippets-in-ci).

### mdcode and Snippet Checkers

mdcode copies code between source files and Markdown. It doesn't type-check, lint or compile the code in a fence itself, and it has no editor integration. In the source-first workflow, your project's own tools check the source file before mdcode copies it.

Snippet checkers such as [Kiira](https://github.com/AlemTuzlak/kiira) treat the fence as the source. Kiira extracts TypeScript and JavaScript fences from Markdown and MDX, type-checks them against your project and reports errors on the fence's line, in your editor, on the command line and in CI.

They suit different snippets:

- An example that should be complete, tested code belongs in a source or test file, and mdcode copies it into the docs.
- A fragment that only makes sense in the prose, such as a single call or part of a config, can stay in the Markdown, where a snippet checker type-checks it.

For blocks written in the Markdown, the ready-to-copy [`validate-snippets.mjs`](#validating-runnable-snippets-in-ci) script can run your own type checker. It extracts the `runnable=true` blocks into a temporary workspace with `mdcode extract` and runs a command such as `tsc --noEmit` there. A failure names the block on the command line; nothing shows in your editor.

## Installation

### Global Installation

Install globally to use the `mdcode` command anywhere:

```bash
# Using npm
npm install -g mdcode-ts

# Using pnpm
pnpm install -g mdcode-ts
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
pnpm dlx mdcode-ts list README.md
pnpm dlx mdcode-ts extract --lang js docs/*.md

# Using npx
npx mdcode-ts list README.md
npx mdcode-ts --help
```

### Project Installation

Install as a project dependency to use in scripts or via `pnpm exec`:

```bash
# Using pnpm
pnpm add -D mdcode-ts

# Using npm
npm install --save-dev mdcode-ts
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
    "readme:update": "mdcode update --apply README.md",
    "readme:check": "mdcode update --check README.md",
    "readme:extract": "mdcode extract -d src README.md",
    "readme:list": "mdcode list --json README.md",
    "docs:validate": "mdcode run --allow-shell -l js \"node {file}\" README.md"
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

`--json` prints one JSON envelope. Its `result.blocks` lists every selected block with its name,
fence lines, language, metadata and code:

```bash
# JSON output
mdcode list --json README.md

# With a filter
mdcode list --json -l js docs/API.md
```

See [JSON Contract](#json-contract) for the envelope, an example, and the result of every command.

In the text output, a named block is listed by its name, as in `[1] quick start (js)`.

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

Extract is non-destructive. Before it writes anything, it checks every target (see
[Validate Command](#validate-command)). When any block breaks a rule, nothing is written and `extract`
exits 1 with an error per block:

- **Several blocks write one file** → allowed only when every one declares its own `region=` and all
  are in the same language. Two whole-file blocks for one file, even identical ones, a whole-file
  block beside a region block, a repeated `region=`, or regions in different languages are refused
  as `ambiguous_target`. Two spellings of one file (`./a.ts` and `a.ts`, or a symlinked directory
  inside `--dir`) count as one file.
- **An existing file's markers for a declared region are broken** → a region that is never closed or
  overlaps another is `malformed_region`, one opened more than once is `duplicate_region`, and one
  marked only in another language's comment syntax is `region_language_mismatch`. An invalid
  `region=` name is `malformed_region` too.

When the target file already exists:

- **All blocks for that file declare `region=`** → each region body is spliced in place. Surrounding
  code, and any regions in the file that the markdown doesn't declare, are preserved.
- **A declared region has no matching `#region` marker in the file** → the region is appended at the
  end of the file, wrapped in markers written with the block language's comment syntax (`//`, `#`,
  `<!-- -->`). Existing markers are matched in any of that language's comment styles, so `/* #region
  name */` in a JS file is spliced rather than duplicated.
- **The block has no `region=`** → the file is skipped with a warning, since writing it would replace
  the whole file. Use `--force` to overwrite.

Otherwise, files that don't exist yet are created.

`file=` paths resolve against `--dir` (default: the current directory) and must stay inside it:

- **Relative `file=`** → written inside `--dir`. Two spellings of one file (a symlinked directory
  inside `--dir`, `./a.ts` vs `a.ts`) are treated as one target.
- **Absolute `file=`, or one that leads outside `--dir`** through `..` or through a symlink → refused
  as an `unsafe_path` error. Every target is checked before anything is written, so when any is
  refused, nothing is written and `extract` exits 1. To write into `../../shared-tests`, point
  `--dir` higher and write `file=` relative to it.
- **No `file=`** → written as `block-N.<ext>` directly inside `--dir`. An existing symlink of that
  name that leads out of `--dir` is refused too.

Whenever a file is skipped (an existing file without `--force`, a symlinked target, or a target that is
not valid UTF-8), `extract` prints a summary (even under `--quiet`) and exits with status 2.
With `--update-source` on stdin, the updated markdown is still written to stdout in full first.

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

### Update Source with Generated Filenames

When extracting anonymous blocks (blocks without `file` metadata), automatically add the generated filename back to the markdown source:

```bash
# Extract and update README with file metadata
mdcode extract --update-source README.md

# Extract to custom directory and update source
mdcode extract --update-source -d ./examples README.md

# Quiet mode
mdcode extract --update-source -q -d ./src README.md
```

**Before:**
````markdown
```bash
echo "hello"
```
````
**After:**
````markdown
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

```bash
# Skipped with a warning if src/demo.ts already exists
mdcode extract README.md

# Overwrite it
mdcode extract --force README.md
```

`--force` has no effect on region blocks — those always splice in place.

### Stdin Behavior with Update Source

When using stdin with `--update-source`, the updated markdown is written to stdout:

```bash
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

```bash
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

`--check` reports each drifted block as an `out_of_sync` error. A `file=` that cannot be read, or does
not exist, is a `read_failed` error instead, a `file=` outside the base is `unsafe_path`, a transformer
that throws is `transform_failed`, and a broken `--transform` module is `invalid_transform`. A
`region=` must be opened exactly once in the file, in the block language's comment syntax, and
closed: otherwise the block fails with `missing_region`, `duplicate_region`, `malformed_region` or
`region_language_mismatch`. All of them exit 1; with `--json` the error codes tell them apart (see
[JSON Contract](#json-contract)).

### Where `file=` Is Read From

`file=` paths resolve against the base directory, which defaults to the markdown file's directory
(the current directory when the markdown comes from stdin). The path must stay inside the base: an
absolute path, a `..` that climbs out of it, or a symlink that leads out of it is refused as an
`unsafe_path` error before anything is read. `--base <dir>` picks another base, and `file=` paths
then resolve against that directory instead of the markdown's.

A `docs/README.md` with `file=../src/app.js` therefore fails by default. Run from the repository
root with `--base .` and write the path as `file=src/app.js`:

```bash
mdcode update --check --base . docs/README.md
```

### When a Read or Transform Fails

By default `update` stops at the first block whose `file=` cannot be read (`read_failed`), is refused
(`unsafe_path`), breaks a region rule, or whose transformer throws (`transform_failed`). Nothing is
written and nothing is printed except that error. The command exits 1, and under `--json` the
envelope has `result: null` and that one error. `mdcode validate` lists every such problem at once
without stopping; see [Validate Command](#validate-command).

`--continue-on-error` collects every failure and keeps going. A failed block keeps its previous code,
and a block whose read failed is still transformed from its original code. Every failed block is
reported and the command still exits 1. `--apply` does not write a document in which any block's
`file=` or `region=` failed, so the markdown is never left half in sync with its sources; it still
writes the other blocks of a document where only a transformer threw, and the other documents.

```bash
# Report every broken file= at once instead of stopping at the first
mdcode update --check --continue-on-error README.md
```

### Checking Docs in CI

`--check` exits 1 both when a block has drifted and when mdcode could not check it, for example a
`file=` it cannot read or a missing document. [`check-docs-sync.mjs`](https://github.com/adrianbrowning/mdcode-ts/blob/main/examples/ci/check-docs-sync.mjs)
is a ready-to-copy script that tells the two apart. It runs `mdcode update --check --json
--continue-on-error` on each Markdown file you pass, never writes, and names every document and
block that is out of sync. With a [project configuration](#project-configuration),
`mdcode update --project --check` also checks every listed document in one run, naming each one; the
script remains the way to tell drift from a broken check by exit code.

| Exit | Meaning |
| --- | --- |
| `0` | Every document is in sync |
| `1` | At least one document is out of sync |
| `2` | At least one document could not be checked, `mdcode` is not on `PATH`, or no documents were given |

It needs Node 22+ and mdcode-ts 0.1.0 or later, and runs the `mdcode` on `PATH`. Copy it into your
repository, for example as `scripts/check-docs-sync.mjs`, then add mdcode-ts as a dev dependency and
a script, so `npm ci` installs `mdcode` and `npm run` puts it on `PATH`:

```json
{
  "scripts": {
    "docs:check": "node scripts/check-docs-sync.mjs README.md docs/guide.md"
  },
  "devDependencies": {
    "mdcode-ts": "^0.1.0"
  }
}
```

From a local shell:

```bash
# With mdcode-ts in devDependencies
npm run docs:check

# Without installing it
npx --yes -p mdcode-ts@^0.1.0 node scripts/check-docs-sync.mjs README.md docs/guide.md
```

From GitHub Actions, the same script also annotates each out-of-sync line in the pull request:

```yaml
name: Docs

on: [push, pull_request]

jobs:
  docs-in-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run docs:check
```

### Quiet Mode

```bash
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

```bash
# Transform with a custom function
mdcode update --apply --transform ./transformers/uppercase-sql.js README.md

# Short form, previewing the result as a diff
mdcode update --diff -t ./transformers/add-headers.js README.md

# Transform and output to file
mdcode update -t ./transformers/format-code.js --stdout README.md > output.md
```

**Example Transformer (`uppercase-sql.js`):**
```javascript runnable=true
export default function({tag, meta, code}) {
  if (tag === 'sql') {
    return code.toUpperCase();
  }
  return code;
}
```

**Creating a TypeScript transformer:**
```typescript runnable=true
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

```bash
# Transform only SQL blocks
mdcode update --apply --transform ./uppercase.js --lang sql README.md

# Transform only test files
mdcode update --apply -t ./add-headers.js -f "*.test.js" docs/API.md

# Transform JavaScript blocks in examples
mdcode update --apply -t ./format.js -l js -m type=example docs/API.md
```

### Region Support

Update specific regions of code:

```bash
# Update only 'main' region
mdcode update --apply --meta region=main README.md

# Check only the setup region
mdcode update --check -m region=setup README.md
```

---

## Validate Command

Check how the selected blocks map onto files before `update` or `extract` writes anything. `validate`
reads the markdown and the files it names, writes nothing, and reports every problem at once instead
of stopping at the first. It exits 1 when it finds any.

```bash
# Would `mdcode update README.md` be able to read every file= and region=?
mdcode validate README.md

# Would `mdcode extract -d out README.md` refuse anything?
mdcode validate --for extract -d out README.md

# Also require every selected block to name its file
mdcode validate --strict README.md

# Every document in mdcode.config.json, as JSON
mdcode validate --project --json
```

`--for` picks the command to check for, `update` by default. Each finding names the document, the
block's line and name, the file concerned and the rule, which is the error code:

| Rule | `--for update` | `--for extract` |
|------|----------------|-----------------|
| `unsafe_path` | `file=` is empty or leads outside `--base` | `file=` is empty, or it or a generated `block-N` name leads outside `--dir` |
| `read_failed` | `file=` does not exist or cannot be read | - |
| `missing_region` | `region=` is not in the file, or `outline=true` finds no markers | - (a missing region is appended) |
| `duplicate_region` | `region=` is opened more than once in the file | Same, in an existing target |
| `malformed_region` | invalid `region=` name, or its markers are unclosed or do not nest | Same, or two declared regions overlap |
| `region_language_mismatch` | `region=` is marked only in another language's comment syntax | Same, in an existing target |
| `ambiguous_target` | - | Several blocks write one file, but not each with its own `region=` in one language |
| `missing_file_metadata` | `--strict`: a selected block has no `file=` | Same |

`update` and `extract` enforce every rule here except `--strict`, which only `validate` applies, so a
document `validate` passes is one they will not refuse for these reasons. For `extract`, a region an
existing target lacks is appended, not an error. `extract` can still skip an existing file it would
overwrite whole without `--force`, and a symlinked or non-UTF-8 target it would splice.

```text
$ mdcode validate --for extract doc.md
✗ line 5: out.ts: blocks on lines 5, 9 all write this file, but not every one declares region=; give each block a region= of its own, or a file of its own (ambiguous_target)
✗ line 9: out.ts: blocks on lines 5, 9 all write this file, but not every one declares region=; give each block a region= of its own, or a file of its own (ambiguous_target)
2 problem(s) found; extract would refuse them.
```

---

## Watch Command

Keep a terminal open while you edit, and `watch` tells you which documents and blocks drift from
their sources as soon as you save.

```bash
# Report drift in README.md after each change, without writing
mdcode watch README.md

# Every document in mdcode.config.json; edits to the configuration take effect at the next change
mdcode watch --project

# Write each change into the markdown as it happens
mdcode watch --apply README.md
```

`watch` checks the documents when it starts, then again after each change to a document, to a file a
block's `file=` reads, or to the configuration file. Changes that arrive within `--debounce` (100 ms by
default) of each other are checked once. Each check prints one line per drifted block, failed block
or written document, or a single `✓ N document(s) in sync` line when there is nothing to report:

```text
[14:02:11] Watching 1 document(s) and 2 source file(s). Press Ctrl+C to stop.
[14:02:11] ✓ 1 document(s) in sync
[14:02:30] README.md: ✗ Out of sync: line 12 (greet): js from src/greet.js
```

- **Without `--apply`** nothing is written; run `mdcode update --apply` when you are ready.
- **With `--apply`** each check writes the documents whose blocks drifted, as `update --apply` does,
  and skips a document while one of its blocks' `file=` or `region=` cannot be read. The change event
  of its own write does not start another check.
- **Files it watches** - Each document and every file its selected blocks' `file=` resolve to inside
  the base, worked out again after every check, so a `file=` you add is watched from then on. A file
  that does not exist yet is watched too, so creating it starts a check. With `--project`, a document
  that newly matches `documents` is not watched until then: creating one does not start a check by
  itself, but the next check, started by any other change, picks it up.
- **Errors** - A file that cannot be read, a broken region and an unsafe path are reported for their
  block, and an invalid configuration is reported once; `watch` keeps going and checks again at the
  next change.
- **Starting and stopping** - `watch` exits 1 before watching anything when it has no documents (no
  files and no `--project` or `--config`), bad flags, or a configuration that cannot be used. Ctrl+C
  (`SIGINT`) or `SIGTERM` stops it with exit 0. It has no `--json`.

---

## Run Command

Execute shell commands on each code block.

`run` needs `--allow-shell`. It passes `<command>` to the shell once per selected block, and a
command such as `node {file}` executes the block's code, so running it over markdown you did not
write runs code you did not write. Without the flag, `run` fails with `invalid_usage` before reading
any input. The command always comes from your command line; metadata in the markdown never supplies
one. See [Security: Untrusted Markdown](#security-untrusted-markdown).

### Basic Usage

Use `{file}` as a placeholder for the temporary file path:

```bash
# Run node on JavaScript blocks
mdcode run --allow-shell "node {file}" --lang javascript README.md

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

Select blocks by their `name` metadata. Every command accepts `-n, --name`; see
[Selecting Blocks by Name](#selecting-blocks-by-name).

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

# After the blocks, the command prints "Working directory: <path>"
```

### Combined Examples

```bash
# Run JavaScript tests with all flags
mdcode run --allow-shell -l js -n test -k -d ./temp "node {file}" README.md

# Run Python examples in custom directory
mdcode run --allow-shell -l python -m type=example -d ./examples "python {file}" docs/

# Run and keep files, filter by file metadata
mdcode run --allow-shell -k -f "calculator.py" "python {file}" README.md
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
```

### Validating Runnable Snippets in CI

`run` gives each block its own temporary file, which works for standalone snippets. When snippets
import each other, or your linter or test runner expects a directory, use
[`validate-snippets.mjs`](https://github.com/adrianbrowning/mdcode-ts/blob/main/examples/ci/validate-snippets.mjs).
It is a ready-to-copy script that extracts the snippets into a fresh workspace and runs your command
there.

Only fences marked `runnable=true` are validated. Every other block, including `runnable=false` and
blocks with no `runnable=` at all, is left out. Add `file=` when a snippet needs a particular name,
for example so another snippet can import it. Without it, the file is named `block-N` with an
extension for its language:

````markdown
```js runnable=true name=add file=lib/add.js
export const add = (a, b) => a + b;
```

```js runnable=true name=use-add
import { add } from "./lib/add.js";
console.log(add(1, 2));
```

```js
// Illustration only: not extracted, not run
add(1, 2);
```
````

For each Markdown file, the script:

1. creates an empty workspace with `mkdtemp`, one per document so two documents can use the same
   `file=`
2. runs `mdcode extract --meta runnable=true --dir <workspace>` into it, so every `file=` must stay
   inside the workspace
3. prints which file came from which block, then runs your command with the workspace as its working
   directory
4. removes the workspace afterwards, whether the command passed or failed and when the job is
   cancelled with SIGINT or SIGTERM. It only ever removes the directory it created.

Your command goes after `--` and runs without a shell. If an argument contains `{file}`, the
command runs once per extracted file, with `{file}` replaced by that file's path in the workspace,
and a failure names the block. Otherwise it runs once per document against the whole workspace:

```bash
# Run every snippet as a script; a failure names the block
node scripts/validate-snippets.mjs README.md docs/guide.md -- node {file}

# Run your test runner once per document
node scripts/validate-snippets.mjs README.md -- node --test

# Snippets that import your dependencies need a workspace inside the project (gitignore .mdcode-tmp/)
node scripts/validate-snippets.mjs --tmp-dir .mdcode-tmp README.md -- npx tsc --noEmit --allowJs --checkJs lib/add.js

# Keep the workspace to debug a failure
node scripts/validate-snippets.mjs --keep README.md -- node {file}
```

| Exit | Meaning |
| --- | --- |
| `0` | Every runnable block passed |
| `1` | The command failed for at least one block or document |
| `2` | A document could not be extracted, no document has a `runnable=true` block, the command or `mdcode` was not found, or the arguments are wrong |

It needs Node 22+ and mdcode-ts 0.1.0 or later, with `mdcode` on `PATH`. As with
[Checking Docs in CI](#checking-docs-in-ci), add mdcode-ts to `devDependencies` and call the script
from an npm script:

```json
{
  "scripts": {
    "docs:snippets": "node scripts/validate-snippets.mjs README.md docs/guide.md -- node {file}"
  },
  "devDependencies": {
    "mdcode-ts": "^0.1.0"
  }
}
```

In GitHub Actions, the script also annotates each failing block in the pull request:

```yaml
name: Docs

on: [push, pull_request]

jobs:
  runnable-snippets:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run docs:snippets
```

The command is trusted: it comes from your `package.json` or workflow, never from the Markdown. The
snippets are not. A command that executes them, as `node {file}` does, runs their code with the job's
permissions. Run it only on Markdown you would run as code, and keep secrets out of jobs that run on
pull requests from forks. See [Security: Untrusted Markdown](#security-untrusted-markdown).

---

## Dump Command

Create a tar archive of all code blocks.

A `file=` that would unpack outside the archive's directory (an absolute path, or one that climbs
out with `..`, written with `/` or `\`) is refused as an `unsafe_path` error, and no archive is
produced.

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

### Complex Filtering Scenarios

```bash
# Extract all test files that are JavaScript
mdcode extract -l js -f "*.test.js" -d ./tests docs/

# List Python examples in main region
mdcode list -l python -m type=example -m region=main docs/

# Run tests only for specific component
mdcode run --allow-shell -l js -f "auth.test.js" -n "login-test" "node {file}" README.md

# Update only SQL queries in specific file
mdcode update --apply -l sql -f queries.sql README.md
```

### Selecting Blocks by Name

Give a block a stable name with `name=`, then select it by that name from any command. Names are
unique within one markdown document, so each `--name` picks out at most one block; repeat `--name`
to select several. Elsewhere, the document path plus the name identifies the block.

````markdown
```js name="quick start" file="examples/getting started.js"
console.log('Hello, world!');
```
````

```bash
mdcode list --name "quick start" README.md
mdcode extract -n "quick start" -d ./out README.md
mdcode update --apply --name "quick start" README.md
mdcode update --check -n "quick start" -n setup README.md
mdcode run --allow-shell -n "quick start" "node {file}" README.md
mdcode dump --name "quick start" -o quick-start.tar README.md
```

`update` fails with `invalid_usage` when no selected block has a given name, so a misspelt name
cannot make `--check` pass by checking nothing.

---

## Project Configuration

A repository can list the Markdown documents it keeps in sync, and the defaults for them, in
`mdcode.config.json`. `update` and `extract` read it when you pass `--project`, which looks in the
current directory, or `--config <path>`. Without either flag no configuration is read, and stdin stays
the default input. Configuration needs Node 22.17 or later.

A complete consumer repository:

```text
my-project/
├── mdcode.config.json
├── package.json
├── README.md        # ```ts file=src/greet.ts
├── docs/
│   └── guide.md     # ```ts file=src/add.ts region=main
└── src/
    ├── greet.ts
    └── add.ts
```

The file is plain JSON and is never executed:

```json
{
  "documents": ["README.md", "docs/**/*.md"],
  "sourceRoot": ".",
  "outputRoot": "build/snippets",
  "filter": { "lang": "ts" }
}
```

- `documents` - Markdown paths or globs, in Node's `fs.glob` syntax. Each entry must match at least
  one file. Documents are read in entry order, each glob's matches sorted, and each document once.
  `**` also descends into `node_modules`, so prefer `docs/**/*.md` to `**/*.md`.
- `sourceRoot` - The directory `update` resolves every document's `file=` paths against, in place of
  each markdown file's own directory. Here `.` lets `docs/guide.md` write `file=src/add.ts`.
- `outputRoot` - The directory `extract` writes to, as `--dir` does.
- `filter` - Default `lang`, `file` and `meta` filters, as the flags of the same name take them.
  `name` is refused, because block names belong to one document; pass `--name` instead.

Every path is relative to the configuration file's directory and must stay inside it. An absolute
path, a `..`, or a symlink that leads out is refused as `unsafe_path`.

### Command-Line Precedence

What you pass on the command line replaces the configuration's value for that run. Command-line
paths resolve against the current directory, as without a configuration.

| On the command line | Replaces |
| --- | --- |
| Markdown files | `documents` |
| `--base <dir>` | `sourceRoot` |
| `-d, --dir <dir>` | `outputRoot` |
| `--lang`, `--file`, `--meta` | The matching `filter` field. `--meta` replaces all of `filter.meta` |

### Several Documents

`update` and `extract` work through the documents in order, and with more than one, every line of text
output starts with the document it is about. `--stdout` needs exactly one document.

`update --apply` writes every document or none of them: when one fails, nothing is written. With
`--continue-on-error`, `update` carries on past a failed document and applies the others. `extract`
writes as it goes, so it stops at the first document that fails, after extracting the ones before it.

Under `--json`, `result.documents` holds one entry per document, and each error names its `document`;
see [JSON Contract](#json-contract).

### Invalid Configuration

A missing file, invalid JSON, an unknown field, a value of the wrong type, or a `documents` entry that
matches nothing fails with `invalid_config` before any document is read. The message names the file
and the field:

```text
Error: mdcode.config.json: unknown field "documnets"; expected documents, sourceRoot, outputRoot, filter
Error: mdcode.config.json: documents[1] "guide/*.md" matched no files in /work/my-project
```

### Locally and in CI

```bash
# Plan, check and apply every configured document
mdcode update --project
mdcode update --project --check
mdcode update --project --apply

# One document, with the configured roots and filters
mdcode update --project --diff docs/guide.md

# Extract the configured documents' blocks into outputRoot
mdcode extract --project

# A configuration somewhere else
mdcode update --config config/mdcode.config.json --check
```

Add mdcode-ts and the scripts to `package.json`:

```json
{
  "scripts": {
    "docs:check": "mdcode update --project --check",
    "docs:sync": "mdcode update --project --apply"
  },
  "devDependencies": {
    "mdcode-ts": "^0.1.0"
  }
}
```

Then check the documents on every push and pull request:

```yaml
name: Docs

on: [push, pull_request]

jobs:
  docs-in-sync:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run docs:check
```

---

## CLI Flags Reference

All commands support these common flags:

- `-l, --lang <lang>` - Filter by language
- `-f, --file <file>` - Filter by file metadata pattern
- `-m, --meta <key=value>` - Filter by custom metadata (can specify multiple times)
- `-n, --name <name>` - Select the block with this `name` metadata; repeat to select several
- `--json` - Print one versioned JSON envelope instead of text (every command except `watch`); see
  [JSON Contract](#json-contract)

Additional flags by command:

**extract:**
- `-d, --dir <dir>` - Directory that `file=` paths resolve against and must stay inside (default: the
  configuration's `outputRoot`, else the current directory)
- `-q, --quiet` - Suppress status messages
- `--update-source` - Add file metadata to anonymous code blocks and update source
- `--ignore-anonymous` - Skip blocks without file metadata (mutually exclusive with --update-source)
- `--force` - Overwrite existing files whose blocks have no `region=` (skipped by default)
- `--project` - Load `mdcode.config.json` from the current directory; see
  [Project Configuration](#project-configuration)
- `--config <path>` - Load this configuration file instead

**update:**
- `-q, --quiet` - Suppress status messages
- `-t, --transform <file>` - Path to transformer function
- `--base <dir>` - Directory that `file=` paths resolve against and must stay inside (default: the
  configuration's `sourceRoot`, else the markdown file's directory, or the current directory for
  stdin)
- `--continue-on-error` - Report every failed document, read and transform and keep going, instead of
  stopping at the first
- `--plan` - List the blocks that would change, without writing (default)
- `--apply` - Write the changes to the markdown files in place
- `--diff` - Print a unified diff of the changes, without writing
- `--check` - Exit 1 when a selected block is out of sync, without writing
- `--stdout` - Print the updated markdown of one document, without writing
- `--project` - Load `mdcode.config.json` from the current directory; see
  [Project Configuration](#project-configuration)
- `--config <path>` - Load this configuration file instead

**validate:**
- `--for <command>` - The command to check the documents for: `update` (default) or `extract`
- `--strict` - Require `file=` metadata on every selected block
- `--base <dir>` - With `--for update`: as for `update`
- `-d, --dir <dir>` - With `--for extract`: as for `extract`
- `--ignore-anonymous` - With `--for extract`: skip blocks without `file=`, as `extract` does
- `--project`, `--config <path>` - As for `update` and `extract`

**watch:**
- `--base <dir>` - As for `update`
- `--apply` - Write drifted blocks into the markdown after each change
- `--debounce <ms>` - Wait this long after the last change before checking (default: 100)
- `--project`, `--config <path>` - As for `update`

**run:**
- `--allow-shell` - Confirm that `<command>` may run through the shell once per selected block
  (required)
- `-k, --keep` - Keep temporary directory
- `-d, --dir <dir>` - Custom working directory

**dump:**
- `-o, --out <file>` - Output file (default: stdout; required with `--json`)
- `-q, --quiet` - Suppress status messages

---

## Security: Untrusted Markdown

mdcode is often pointed at markdown it did not write: a pull request, a downloaded README, or a
document an agent produced. It treats the markdown as untrusted and whoever runs it as trusted.

- Untrusted: everything in the markdown, meaning the block code and the info strings with their
  metadata (`file=`, `region=`, `name=` and the rest).
- Trusted: what the caller supplies. That is the command-line flags, the `--base` and `--dir`
  directories, the `--transform` module, and the `<command>` given to `run`.

### Containment

- `update` reads a `file=` only when it resolves inside the base: the markdown file's directory by
  default, the current directory for stdin, or the directory given with `--base`.
- `extract` writes a target only when it resolves inside `--dir`, and that includes the generated
  `block-N.<ext>` names.
- For `update` and `extract`, an absolute `file=`, one that climbs out with `..`, and one that leads
  out through an existing symlink anywhere along the path, the file itself included, are refused as
  `unsafe_path`. The check runs before anything is read or written.
- `dump` adds an entry only when its name stays inside the archive's directory. An absolute name, or
  one that climbs out with `..` using `/` or `\`, is refused as `unsafe_path`.
- `run` takes its command from its argument only. Each block's code is written to a temporary file
  named `block-<index><ext>`, with the extension taken from a fixed table by language, and that path
  is substituted for `{file}`. Metadata never supplies a command or a file name.

The library functions apply the same checks: `update()` against `basePath`, `extract()` against
`outputDir`, and `dump()` against the archive root.

### Failure Policy

A refusal leaves no partial work behind. `extract` checks every target before writing any, and `dump`
checks every entry before building the archive, so one unsafe or ambiguous target fails the whole
command with exit 1. `update` stops at its first failed read, broken region rule, unsafe path or
transform and writes nothing. With `--continue-on-error` it reports every failure instead, `--apply`
writes only the documents whose every `file=` and `region=` could be read, and the command still
exits 1. `validate` reports every problem for a document without writing anything.

### Running Code

`run` passes `<command>` to the shell once per selected block. When the command executes its file, as
`node {file}` does, `run` executes the block's code, so running it over untrusted markdown runs
untrusted code with your permissions. `--allow-shell` is the acknowledgement: without it, `run` fails
with `invalid_usage` before reading any input. The library `run()` function needs no such flag,
because calling it is already explicit.

[`validate-snippets.mjs`](#validating-runnable-snippets-in-ci) follows the same model. Its command
comes only from its own command line, and a command that executes the extracted snippets runs
untrusted code.

### Limits

mdcode is not a sandbox.

- The path checks are check-then-use. A symlink swapped in between the check and the read or write
  is not detected, so containment holds only while nothing else is changing the directory tree.
- A `--transform` module is arbitrary code and runs inside the mdcode process.
- The `run` command is arbitrary shell and is not sandboxed. mdcode does not inspect or validate block
  code.

---

## JSON Contract

Every command except `watch`, which prints a line per change until you stop it, accepts `--json`.
With it, the command prints exactly one JSON object, the envelope, on stdout and nothing else: no
colours and no progress text. Without `--json`, the output is text.

### Envelope

- `version` - The contract version, currently `1`. It changes only when the contract changes
  incompatibly. The library exports it as `CONTRACT_VERSION`.
- `command` - The command that ran: `list`, `extract`, `update`, `validate`, `run` or `dump`.
- `ok` - `true` when `errors` is empty.
- `result` - What the command did, described below. It is `null` when the command failed before doing
  any work: invalid metadata, bad flags, an invalid configuration, unreadable input, a transform
  module that could not be loaded, a refusal from `extract`, an `unsafe_path` refusal from `dump`, or
  `update` stopping at its first failed block. For `extract` and `update`, it is `null` when no document got as
  far as a result.
- `errors` - Everything that went wrong. A command can fail for some blocks and still report a result
  for all of them.

### Errors

Each error has a `code` and a `message`. These fields are added when they apply:

- `document` - The Markdown document concerned, as named on the command line or relative to the
  current directory; left out for stdin
- `line` - The 1-based line of the opening fence of the block concerned
- `name` - The name of the block concerned, when it has one
- `path` - The file concerned: an extract target, a `file=` source, the transform module, or an output
  path

| Code | Meaning |
|------|---------|
| `invalid_metadata` | A block's info string breaks the metadata grammar, or two blocks share a name |
| `invalid_usage` | Bad flags or flag combinations, including unknown options |
| `invalid_config` | `mdcode.config.json` is missing, is not valid JSON, has an unknown field or a value of the wrong type, or a `documents` entry matched nothing |
| `io_error` | Reading the markdown or writing an output failed |
| `invalid_transform` | The `--transform` module could not be loaded or has no default function export |
| `extract_skipped` | `extract` left a target file untouched |
| `read_failed` | `update` could not read a block's `file=` or region |
| `transform_failed` | `update`'s transformer threw for a block |
| `unsafe_path` | A block's `file=` is empty, absolute or leads outside the allowed base, directly or through a symlink; or a configuration path leaves the configuration's directory |
| `ambiguous_target` | Several selected blocks write one `extract` target, but not each with its own `region=` in one language |
| `missing_region` | `update`: a block's `region=` is not in its `file=`, or `outline=true` finds no region markers |
| `duplicate_region` | A block's `region=` is opened more than once in its file |
| `malformed_region` | A block's `region=` is not a valid name, or its markers are never closed, overlap, or do not nest |
| `region_language_mismatch` | A block's `region=` is marked only in another language's comment syntax |
| `missing_file_metadata` | `validate --strict`: a selected block has no `file=` |
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
the fields only it knows about, such as `document`, `written` and `out`.

```typescript
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
  /** The Markdown document concerned; left out for stdin */
  document?: string;
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
  | "invalid_config"
  | "io_error"
  | "invalid_transform"
  | "extract_skipped"
  | "read_failed"
  | "transform_failed"
  | "unsafe_path"
  | "ambiguous_target"
  | "missing_region"
  | "duplicate_region"
  | "malformed_region"
  | "region_language_mismatch"
  | "missing_file_metadata"
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
  /** One entry per document, in the order they were read */
  documents: Array<{
    /** As named on the command line, or relative to the current directory; null for stdin */
    document: string | null;
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
type UpdatedDocument = {
  /** As named on the command line, or relative to the current directory; null for stdin */
  document: string | null;
  blocks: Array<UpdatedBlock>;
};
type UpdateEnvelope = Envelope<{
  /** One entry per document, in the order they were read */
  documents: Array<
    /** Default, --plan and --check */
    | UpdatedDocument
    /** --apply: the markdown file written, or null when no block changed */
    | UpdatedDocument & { written: string | null }
    /** --diff: a unified diff of the markdown, empty when no block changed */
    | UpdatedDocument & { diff: string }
    /** --stdout, one document only: the updated markdown */
    | UpdatedDocument & { source: string }
  >;
}>;

// mdcode validate --json
type ValidateEnvelope = Envelope<{
  operation: "extract" | "update";
  /** One entry per document, in the order they were read */
  documents: Array<{
    /** As named on the command line, or relative to the current directory; null for stdin */
    document: string | null;
    blocks: Array<BlockRef & {
      lang: string;
      /** The target extract would write, or the file= update would read; null for none */
      path: string | null;
      region?: string;
      /** false when an error concerns this block */
      valid: boolean;
    }>;
  }>;
}>;

// mdcode run --allow-shell --json
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
- `extract` - One entry in `documents` per document, each with one entry per target file, in the order
  they were processed. `written` means the file was created or overwritten whole, `spliced` means
  regions were replaced or appended in an existing file, and `skipped` means the file was left
  untouched; `reason` says why, and each skipped target also adds an `extract_skipped` error. With
  `--update-source`, when a block gained `file=`: from stdin, `updatedSource` holds the updated
  markdown; from a file, the file is rewritten and `written` holds its path. A document that fails
  stops the command; the documents before it have their entries.
- `update` - One entry in `documents` per document, each with one entry per selected block, in
  document order. `changed` and `code` are the plan: which blocks would change, and the exact code
  each would get. Only `--apply` writes the markdown; `written` holds its path, or `null` when nothing
  changed and the file was left alone, or a block's `file=` or `region=` failed. `diff` holds the
  unified diff under `--diff`, and `source` the updated markdown under `--stdout`. Under `--check`,
  each changed block adds an `out_of_sync` error,
  with `path` set to its `file=` when it has one. With `--continue-on-error`, a block whose `file=`
  cannot be read keeps its original code, which is still passed to the transformer, a block whose
  transformer throws keeps the code it had before the transform, and a document that fails is
  reported and skipped. Without it, the first such failure stops the command, `--apply` writes
  nothing, and a document that never got a result has no entry.
- `validate` - `operation` is the command the documents were checked for. One entry in `documents` per
  document, each with one entry per selected block, in document order. `path` is the file the block
  maps to: for `extract`, the target joined onto `--dir`, with the generated `block-N` name for a
  block without `file=`; for `update`, its `file=` as written; `null` when it maps to no file. `valid`
  is `false` when an error concerns the block, and each problem adds an error whose code names the
  rule.
- `run` - One entry per selected block, with the command's exit code and output. Each block whose
  command failed adds a `command_failed` error.
- `dump` - `dump --json` needs `--out <file>`. The archive is written to that file and never encoded
  into the JSON. Without `--out`, the command fails with `invalid_usage`.

### Examples

`mdcode list --json guide.md` on this document:

````markdown
# Guide

```js name=hello file=hello.js
console.log("hello");
```

```sh
echo hi
```
````

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

`mdcode run --allow-shell --json "sh {file}" checks.md`, where the second block fails, exits 1:

````markdown
# Checks

```sh name=passes
echo ok
```

```sh
echo "boom" >&2
exit 3
```
````

```json
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

````markdown
# Broken

```js name=setup
let a = 1;
```

```js name=setup file="unterminated.js
let b = 2;
```
````

```json
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

```json
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

```bash
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
| `1` | Any error, including `update --check` finding a block out of sync, `validate` finding a problem, and `extract` refusing a target before writing |
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
- `run` needs `--allow-shell`. Without it, `run` fails with `invalid_usage` before reading any input.
- `update` stops at the first `file=` read, unsafe path or transformer failure, writes nothing and
  reports only that error. It used to report every failure and carry on; pass `--continue-on-error`
  for that.
- `update` resolves `file=` against the markdown file's directory (or `--base <dir>`) and refuses
  paths that lead outside it, including absolute paths and symlinks. `file=../src/app.js` from a
  `docs/` folder used to work; run with `--base .` from the repository root and write
  `file=src/app.js` instead.
- `extract` refuses a `file=` that is absolute or leads outside `--dir`, including through a symlink,
  as `unsafe_path`. A relative `file=` used to be honoured even when it left `--dir`, and an absolute
  one was skipped with exit 2. Now every target is checked first, and when any is refused nothing is
  written and `extract` exits 1.
- `dump` refuses a `file=` that would unpack outside the archive (absolute, or climbing out with
  `..`) as `unsafe_path`, and produces no archive.
- The default export `mdcode(filePath, transformer, filter?)` resolves `file=` against the markdown
  file's directory instead of the current directory, refuses paths that lead outside it, and rejects
  on the first failed read or transform.
- The new `unsafe_path` error code reports these refusals.
- `extract --json` and `update --json` report each document in `result.documents`, so read
  `result.documents[0].targets` and `result.documents[0].blocks` where you read `result.targets` and
  `result.blocks` before. Both commands take several Markdown files, and errors carry the `document`
  they came from.
- `update` and `extract` read `mdcode.config.json` with `--project` or `--config <path>`; see
  [Project Configuration](#project-configuration). The new `invalid_config` error code reports a
  configuration that cannot be used.
- mdcode-ts needs Node 22.17 or later, for `fs.glob`.
- `extract` checks every target before writing any. Blocks that share a file without each declaring
  its own `region=` in one language, and region blocks whose existing file has broken markers, are
  refused as `ambiguous_target`, `malformed_region`, `duplicate_region` or `region_language_mismatch`
  and nothing is written. They used to skip that one file with `extract_skipped` and exit 2. Two
  identical whole-file blocks for one file used to be written once; they are now refused too.
- `update` reports a missing, duplicated, unclosed or wrongly marked `region=` as `missing_region`,
  `duplicate_region`, `malformed_region` or `region_language_mismatch` instead of `read_failed`. A
  region found more than once in its file used to have its bodies joined; it is now refused. An empty
  `region=` used to read the whole file; it is now `malformed_region`. An empty `file=` is now
  `unsafe_path`: `update` used to ignore it, and `extract` aimed it at `--dir` itself.
- The new `validate` command reports every problem `extract` or `update` would refuse, without writing.
- `update --apply --continue-on-error` no longer writes a document in which a block's `file=` or
  `region=` failed; it used to write that document's other blocks. A document where only a
  transformer threw is still written.
- The new `watch` command reports drift after each change to a document or a file its blocks read.

---

## Library Usage

You can use mdcode programmatically in your Node.js or TypeScript projects:

```bash
pnpm add mdcode-ts
```

### Simple API (Default Export)

The simplest way to use mdcode is with the default export:

```typescript
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

Blocks with `file=` are read first, resolved against the markdown file's directory and confined to
it, as `mdcode update` does by default. A `file=` that is absolute or leads outside that directory,
directly or through a symlink, is refused. The promise rejects on the first failed read, unsafe path
or failed transform, with an `Error` whose `errors` array holds that `ResultError`. There is no
opt-out here; to collect every failure, call `update()` with `continueOnError: true`.

With filters:

```typescript
// Transform only SQL blocks
const result = await mdcode(
  '/path/to/file.md',
  ({tag, meta, code}) => code.toUpperCase(),
  { lang: 'sql' }
);
```

### Named Imports (Advanced API)

For more control, use the named exports:

```typescript runnable=true
import {
  parse,
  walk,
  update,
  list,
  extract,
  run,
  dump,
  defineTransform,
  type Block,
  type TransformerFunction,
  type FilterOptions,
} from 'mdcode-ts';
```

### Parse and Extract Code Blocks

```typescript runnable=true
import { parse } from 'mdcode-ts';

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

```typescript runnable=true
import { update, defineTransform } from 'mdcode-ts';

const markdown = `
\`\`\`sql
select * from users;
\`\`\`

\`\`\`js
test('example');
\`\`\`
`;

// Create a transformer
const transformer = defineTransform(({tag, meta, code}) => {
  // Transform SQL to uppercase
  if (tag === 'sql') {
    return code.toUpperCase();
  }

  // Add a header to JavaScript blocks
  if (tag === 'js') {
    return `// AUTO-GENERATED TEST\n${code}`;
  }

  return code; // unchanged
});

// Apply transformation
const { source, blocks, errors } = await update({ source: markdown, transformer });
console.log(source); // Transformed markdown
console.log(blocks); // [{ name: null, line: 2, lang: 'sql', changed: true, transformed: true }, ...]
```

### Async Transformers

```typescript
import { update, defineTransform } from 'mdcode-ts';

const transformer = defineTransform(async ({tag, meta, code}) => {
  // Fetch from API, read files, etc.
  const formatted = await someAsyncFormatter(code);
  return formatted;
});

const { source } = await update({ source: markdown, transformer });
```

### Custom Walker for Advanced Processing

```typescript
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

```typescript
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
- **options.basePath** - Directory that `file=` paths resolve against and must stay inside (default:
  '.'). An absolute `file=`, or one that leads outside through `..` or a symlink, is an `unsafe_path`
  error.
- **options.continueOnError** - Collect every failure in `errors` and keep going, instead of throwing
  at the first
- **options.onBlock** - Optional `(block, errors) => void`, called as each selected block finishes,
  before the next one starts, with the `UpdatedBlock` and the errors it added (only with
  `continueOnError`). It is not called for a block whose failure throws.
- **Returns** - Promise of `{ source, blocks, errors }`: the updated markdown and one `UpdatedBlock`
  per selected block with its resulting `code` and whether it `changed`. `errors` is only filled with
  `continueOnError`: for each failed block, a `read_failed`, `unsafe_path` or `transform_failed`
  error, or the region rule it broke (`missing_region`, `duplicate_region`, `malformed_region` or
  `region_language_mismatch`). The block keeps the code it had before the failing step.
- **Throws** - `MetadataError` when the document's metadata is invalid. Without `continueOnError`,
  the first failed read, broken rule or failed transform throws an `Error` whose `errors` array holds
  that one `ResultError`.

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
- **options.outputDir** - Directory that `file=` paths resolve against and must stay inside (default:
  '.')
- **options.updateSource** - Add `file=` to anonymous blocks
- **options.ignoreAnonymous** - Skip blocks without `file=`
- **options.force** - Overwrite existing files whose blocks have no `region=`
- **Returns** - Promise of `{ targets, updatedSource?, errors }`: one `ExtractTarget` per target file,
  the markdown with `file=` added when `updateSource` added any, and one `extract_skipped` error per
  skipped target. `extract` writes the target files but not the markdown.
- **Throws** - `MetadataError` when the document's metadata is invalid. When any block breaks a
  mapping rule checked by `validate()` for extract, it throws an `Error` whose `errors` array holds
  one `ResultError` per block (`unsafe_path`, `ambiguous_target`, `malformed_region`,
  `duplicate_region` or `region_language_mismatch`), and nothing is written. `updateSource` with
  `ignoreAnonymous` throws an `Error` whose `code` is `invalid_usage`.

#### `validate(options: ValidateOptions): Promise<ValidateResult>`

Check how the selected blocks map onto files for `extract` or `update`. It reads the files the blocks
name, where they exist, but never writes. See [Validate Command](#validate-command) for the rules.

- **options.source** - The markdown source string
- **options.operation** - `"extract"` or `"update"`
- **options.filter** - Optional filter criteria
- **options.base** - `extract`'s `outputDir`, or `update`'s `basePath` (default: '.')
- **options.strict** - Require `file=` on every selected block
- **options.ignoreAnonymous** - For `"extract"`, leave out blocks without `file=`
- **Returns** - Promise of `{ blocks, errors }`: one `ValidatedBlock` (`name`, `line`, `lang`, `path`,
  `region?`, `valid`) per selected block, and one `ResultError` per broken rule, in document order
- **Throws** - `MetadataError` when the document's metadata is invalid

#### `watch(options: WatchOptions): Promise<WatchHandle>`

Run one pass now, then another after each burst of changes to the watched files, until closed. See
[Watch Command](#watch-command).

- **options.resolve** - Called before every pass; returns `{ documents, filter?, extra? }`, where each
  document is `{ file, label, basePath }` and `extra` lists further files whose change starts a pass.
  When the first call rejects, `watch()` rejects; a later rejection is reported and watching goes on.
- **options.apply** - Write each document whose blocks drifted, unless a block's `file=` or `region=`
  failed (default: false)
- **options.debounceMs** - Quiet time after the last change before a pass (default: 100)
- **options.onEvent** - Receives `{ type: "ready" }`, then `{ type: "pass", documents }` after every
  pass (each document with its `changed` blocks, `errors` and whether it was `written`), and
  `{ type: "error", errors }` for a failure watching carried on through
- **options.watchFiles** - Replaces the file watcher, for tests; by default each file is watched
  through its directory with `fs.watch`
- **Returns** - `{ close }`, which stops watching and waits for a running pass to finish

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
- **Throws** - `MetadataError` when the document's metadata is invalid. When any `file=` would
  unpack outside the archive's directory, it throws an `Error` whose `errors` array holds one
  `unsafe_path` `ResultError` per refused entry, and no archive is built.

#### `defineTransform(fn: TransformerFunction): TransformerFunction`

Helper to define type-safe transformers.

- **fn** - The transformer function `({tag, meta, code}) => string | Promise<string>`
- **Returns** - The same function with proper typing

---

## Metadata in Code Blocks

Add metadata to code blocks using the info string:

````markdown
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

```text
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

Use region comments in your source files to extract specific sections. Each region name may be used once per file: `update` refuses a region it finds more than once as `duplicate_region`, rather than guessing which body you meant.

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

Region markers are detected using language-appropriate comment styles (e.g. `//` for JS/TS, `#` for Python/Shell, `<!--` for HTML). Specify the `lang` in the code fence to enable language-aware matching.

Then reference the region in your markdown:

````markdown
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

This TypeScript implementation is a **drop-in replacement** for the original Go-based [szkiba/mdcode](https://github.com/szkiba/mdcode). It keeps the original's commands and flags, with the differences listed under [Command Compatibility](#command-compatibility).

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

All commands take the original's flags, with these differences:

- `update` writes the markdown only with `--apply`, where the original writes it by default.
- `run` needs `--allow-shell`.
- `update` and `extract` refuse a `file=` that leads outside its base, and `dump` refuses an entry
  name that would unpack outside the archive; see
  [Security: Untrusted Markdown](#security-untrusted-markdown).

```bash
# The same in both
mdcode list -l js README.md
mdcode extract -d output -q docs/*.md
mdcode dump -o archive.tar README.md

# This implementation also needs --allow-shell, which the original does not have
mdcode run --allow-shell -l python "python {file}" README.md
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

## Workflow Examples

### Workflow: Extract, Modify, Update

```bash
# 1. Extract code blocks to files
mdcode extract -d ./readme README.md

# 2. Edit the extracted files
nano ./readme/app.js

# 3. Review, then update README with changes
mdcode update --diff README.md
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
